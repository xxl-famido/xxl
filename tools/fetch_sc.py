# -*- coding: utf-8 -*-
"""Add Simplified Chinese (lang 'cn') to chars.json / skills.json.

Additive: injects name_sc / feature_sc into chars.json and
name_sc (per slot) + levels[*].desc_sc into skills.json.
Mirrors tools/fetch_cn.py (which used 'tw' -> name_cn/desc_cn = Traditional).

Run:  python tools/fetch_sc.py
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = "https://sectionhunk.moe"
LANG = "cn"  # Simplified Chinese (tw = Traditional)
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
            sc = fetch_char(cid)
        except Exception as e:  # noqa: BLE001
            missing.append(cid)
            print(f"[skip] {cid}: {e}")
            continue
        info = sc.get("info", {})
        chars[cid]["name_sc"] = info.get("name", "")
        chars[cid]["feature_sc"] = info.get("feature", "")
        sc_skills = sc.get("skills", {}) or {}
        for slot, sd in skills.get(cid, {}).items():
            ssd = sc_skills.get(slot) or {}
            sd["name_sc"] = ssd.get("name", "")
            sc_levels = (ssd.get("levels", {}) or {})
            for lv_key, lv in (sd.get("levels", {}) or {}).items():
                lv["desc_sc"] = (sc_levels.get(lv_key, {}) or {}).get("description", "")
        print(f"[ok]   {cid}: +{len(skills.get(cid, {}))} slots")

    (DATA / "chars.json").write_text(
        json.dumps(chars, ensure_ascii=False, indent=1), encoding="utf-8")
    (DATA / "skills.json").write_text(
        json.dumps(skills, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nadded name_sc/desc_sc to {len(chars) - len(missing)} characters")
    if missing:
        print(f"missing: {missing}")


if __name__ == "__main__":
    main()
