"""Scrape XXL-grade character stats and skills from sectionhunk.moe.

The site exposes clean JSON endpoints (no HTML parsing needed)::

    /data/{lang}/character/chardata/{charid}.json   per-character data
    /data/levelup.json                              level exp/money table
    /data/levelbreak.json                           breakthrough table

We fetch English + Korean variants for the 34 XXL ally characters (104xx),
cache the raw responses, then normalize into two project data files:

    data/chars.json   id -> base stats + metadata
    data/skills.json  id -> {slot -> {name, icon, type, levels}}

Run:  python -m woofia_sim.extract.scrape
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = "https://sectionhunk.moe"
USER_AGENT = "woofia-sim/0.1 (research; contact via repo)"
REQUEST_TIMEOUT = 30  # seconds
RATE_LIMIT_DELAY = 1.0  # seconds between requests (polite)
MAX_RETRIES = 3

# 34 XXL-grade ally characters (104xx). 10420 and 10434 do not exist.
XXL_CHAR_IDS: tuple[int, ...] = (
    *range(10401, 10420),  # 10401..10419
    *range(10421, 10434),  # 10421..10433
    10435,
    10436,
)

LANGS = ("en", "kr")
SKILL_SLOTS = (
    "basicAtk",
    "ultimate",
    "passive0",
    "passive1",
    "passive2",
    "passive3",
    "passive4",
    "sigil",
)

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_DATA_DIR = _PROJECT_ROOT / "data"
_RAW_DIR = _DATA_DIR / "raw"


def _fetch(url: str) -> bytes:
    """GET a URL with retries and a polite delay. Raises on final failure."""
    last_err: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                return resp.read()
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as err:
            last_err = err
            if isinstance(err, urllib.error.HTTPError) and err.code == 404:
                raise  # don't retry a definitive 404
            time.sleep(RATE_LIMIT_DELAY * attempt)
    raise RuntimeError(f"failed to fetch {url}: {last_err}")


def _fetch_json(url: str, cache_path: Path) -> dict | list:
    """Fetch JSON, caching the raw bytes to disk. Reuses cache if present."""
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))
    raw = _fetch(url)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_bytes(raw)
    time.sleep(RATE_LIMIT_DELAY)
    return json.loads(raw.decode("utf-8"))


def fetch_chardata(char_id: int, lang: str) -> dict:
    """Fetch one character's data in one language (cached)."""
    url = f"{BASE_URL}/data/{lang}/character/chardata/{char_id}.json"
    cache = _RAW_DIR / f"{char_id}_{lang}.json"
    data = _fetch_json(url, cache)
    if not isinstance(data, dict):
        raise ValueError(f"unexpected chardata shape for {char_id}/{lang}")
    return data


def _normalize_skill_levels(slot_data: dict, kr_slot: dict | None) -> dict:
    """Merge en/kr level entries into {level_index: {params, cd, desc_en, desc_kr}}."""
    levels: dict[str, dict] = {}
    en_levels = slot_data.get("levels", {}) or {}
    kr_levels = (kr_slot or {}).get("levels", {}) or {}
    for lv_key, lv in en_levels.items():
        kr_lv = kr_levels.get(lv_key, {})
        levels[lv_key] = {
            "params": lv.get("params", {}),
            "cd": lv.get("cd", 0),
            "desc_en": lv.get("description", ""),
            "desc_kr": kr_lv.get("description", ""),
        }
    return levels


def _normalize_char(en: dict, kr: dict) -> tuple[dict, dict]:
    """Return (char_meta, char_skills) normalized records for one character."""
    info = en.get("info", {})
    kr_info = kr.get("info", {})
    char_id = info.get("id")
    meta = {
        "id": char_id,
        "name_en": info.get("name", ""),
        "name_kr": kr_info.get("name", ""),
        "feature": info.get("feature", ""),
        "rarity": info.get("rarity"),
        "class": info.get("class"),
        "element": info.get("element"),
        "baseATK": info.get("baseATK"),
        "baseHP": info.get("baseHP"),
        "hasRune": info.get("hasRune", False),
    }
    en_skills = en.get("skills", {}) or {}
    kr_skills = kr.get("skills", {}) or {}
    skills: dict[str, dict] = {}
    for slot in SKILL_SLOTS:
        sd = en_skills.get(slot)
        if not sd:
            continue
        skills[slot] = {
            "name_en": sd.get("name", ""),
            "name_kr": (kr_skills.get(slot, {}) or {}).get("name", ""),
            "icon": sd.get("icon"),
            "type": sd.get("type"),
            "levels": _normalize_skill_levels(sd, kr_skills.get(slot)),
        }
    return meta, skills


def scrape_all() -> tuple[dict, dict]:
    """Scrape all XXL characters; write chars.json + skills.json. Returns both."""
    chars: dict[str, dict] = {}
    skills: dict[str, dict] = {}
    missing: list[int] = []
    for char_id in XXL_CHAR_IDS:
        try:
            en = fetch_chardata(char_id, "en")
            kr = fetch_chardata(char_id, "kr")
        except urllib.error.HTTPError as err:
            if err.code == 404:
                missing.append(char_id)
                print(f"[skip] {char_id}: 404 not found")
                continue
            raise
        meta, char_skills = _normalize_char(en, kr)
        chars[str(char_id)] = meta
        skills[str(char_id)] = char_skills
        print(f"[ok]   {char_id}: {meta['name_en']} / {meta['name_kr']} "
              f"(ATK {meta['baseATK']}, HP {meta['baseHP']}, slots {len(char_skills)})")

    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    (_DATA_DIR / "chars.json").write_text(
        json.dumps(chars, ensure_ascii=False, indent=1), encoding="utf-8")
    (_DATA_DIR / "skills.json").write_text(
        json.dumps(skills, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"\nwrote {len(chars)} characters to data/chars.json + data/skills.json")
    if missing:
        print(f"missing ids: {missing}")
    return chars, skills


if __name__ == "__main__":
    scrape_all()
