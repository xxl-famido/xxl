"""Add Traditional Chinese (lang code 'tw') to chars.json / skills.json.

Additive only: keeps existing structure/order, just injects
  chars.json : name_cn, feature_cn
  skills.json: name_cn (per slot), levels[*].desc_cn

Source: same sectionhunk.moe endpoint used by scrape.py, lang='tw'.
Run:  python tools/fetch_cn.py
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = "https://sectionhunk.moe"
LANG = "tw"  # Traditional Chinese (cn = Simplified)
UA = "woofia-sim/0.1 (research; contact via repo)"
ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RAW = DATA / "raw"


def fetch_char(cid: str) -> dict:
    cache = RAW / f"{cid}_{LANG}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    url = f"{BASE_URL}/data/{LANG}/character/chardata/{cid}.json"
    for attempt in range(1, 4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read()
            break
        except (urllib.error.URLError, TimeoutError) as err:
            if isinstance(err, urllib.error.HTTPError) and err.code == 404:
                raise
            time.sleep(attempt)
    else:
        raise RuntimeError(f"failed: {url}")
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_bytes(raw)
    time.sleep(1.0)
    return json.loads(raw.decode("utf-8"))


def main() -> None:
    chars = json.loads((DATA / "chars.json").read_text(encoding="utf-8"))
    skills = json.loads((DATA / "skills.json").read_text(encoding="utf-8"))

    missing: list[str] = []
    for cid in list(chars.keys()):
        try:
            tw = fetch_char(cid)
        except Exception as e:  # noqa: BLE001 - report and skip
            missing.append(cid)
            print(f"[skip] {cid}: {e}")
            continue
        info = tw.get("info", {})
        chars[cid]["name_cn"] = info.get("name", "")
        chars[cid]["feature_cn"] = info.get("feature", "")
        tw_skills = tw.get("skills", {}) or {}
        for slot, sd in skills.get(cid, {}).items():
            tsd = tw_skills.get(slot) or {}
            sd["name_cn"] = tsd.get("name", "")
            tw_levels = (tsd.get("levels", {}) or {})
            for lv_key, lv in (sd.get("levels", {}) or {}).items():
                lv["desc_cn"] = (tw_levels.get(lv_key, {}) or {}).get("description", "")
        print(f"[ok]   {cid}: +{len(skills.get(cid, {}))} slots")

    (DATA / "chars.json").write_text(
        json.dumps(chars, ensure_ascii=False, indent=1), encoding="utf-8")
    (DATA / "skills.json").write_text(
        json.dumps(skills, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nadded name_cn/desc_cn to {len(chars) - len(missing)} characters")
    if missing:
        print(f"missing: {missing}")


if __name__ == "__main__":
    main()
