"""Merge 몽규 (10440, Mengkui) into the sim data files from sectionhunk.moe.

Source = the 5 raw language dumps cached under ``data/raw/10440_{en,kr,jp,cn,tw}.json``
(sectionhunk is the sim's canonical data source — see [[woofia-sim-project]]).

Language mapping (verified 2026-08-20)::

    en -> name_en / desc_en      (English; the parser's real input)
    kr -> name_kr / desc_kr      (Korean)
    jp -> name_ja / desc_ja      (Japanese: "ATKの…")
    tw -> name_cn / desc_cn      (Traditional Chinese: 攻擊力·夥伴)
    cn -> name_sc / desc_sc      (Simplified Chinese: 攻击力·伙伴)

Descriptions keep the site's native ``${argN}`` placeholders + a shared ``params``
dict (English params are language-independent); the engine substitutes them via
``parse_skill_level`` / ``resolve_placeholders`` exactly like the 10401-10436 entries.

Writes ``data/chars.json`` and ``data/skills.json`` in place, backing up the
previous versions to ``*.bak10440`` first. Idempotent: re-running just re-merges.

Run:  python tools/merge_10440.py
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

CID = 10440
DATA = Path(__file__).resolve().parents[1] / "data"
RAW = DATA / "raw"

# (site lang code, chars.json name suffix, skills.json desc suffix)
LANGS = [("en", "en", "en"), ("kr", "kr", "kr"), ("jp", "ja", "ja"),
         ("tw", "cn", "cn"), ("cn", "sc", "sc")]

SLOTS = ("basicAtk", "ultimate", "sigil",
         "passive0", "passive1", "passive2", "passive3", "passive4")


def _load_lang(code: str) -> dict:
    p = RAW / f"{CID}_{code}.json"
    if not p.exists():
        raise SystemExit(f"missing raw dump: {p} (run the fetch step first)")
    return json.loads(p.read_text(encoding="utf-8"))


def build_char(raw: dict[str, dict]) -> dict:
    en_info = raw["en"].get("info", {})
    entry = {
        "id": CID,
        "name_en": raw["en"]["info"].get("name", ""),
        "name_kr": raw["kr"]["info"].get("name", ""),
        "feature": en_info.get("feature", ""),
        "rarity": en_info.get("rarity"),
        "class": en_info.get("class"),
        "element": en_info.get("element"),
        "baseATK": en_info.get("baseATK"),
        "baseHP": en_info.get("baseHP"),
        "hasRune": bool(en_info.get("hasRune")),
        "name_cn": raw["tw"]["info"].get("name", ""),
        "name_sc": raw["cn"]["info"].get("name", ""),
        "name_ja": raw["jp"]["info"].get("name", ""),
        "feature_cn": raw["tw"]["info"].get("feature", ""),
        "feature_sc": raw["cn"]["info"].get("feature", ""),
        "feature_ja": raw["jp"]["info"].get("feature", ""),
    }
    return entry


def build_skills(raw: dict[str, dict]) -> dict:
    en_skills = raw["en"].get("skills", {})
    out: dict[str, dict] = {}
    for slot in SLOTS:
        en_slot = en_skills.get(slot)
        if not en_slot:
            continue
        slot_out: dict = {}
        for code, name_sfx, _ in LANGS:
            s = (raw[code].get("skills", {}) or {}).get(slot, {}) or {}
            slot_out[f"name_{name_sfx}"] = s.get("name", "")
        levels: dict[str, dict] = {}
        for lv_key, en_lv in (en_slot.get("levels", {}) or {}).items():
            entry = {"params": en_lv.get("params", {}) or {},
                     "cd": en_lv.get("cd", 0)}
            for code, _, desc_sfx in LANGS:
                lv = ((raw[code].get("skills", {}) or {}).get(slot, {}) or {}) \
                    .get("levels", {}).get(lv_key, {}) or {}
                entry[f"desc_{desc_sfx}"] = lv.get("description", "")
            levels[lv_key] = entry
        slot_out["levels"] = levels
        out[slot] = slot_out
    return out


def main() -> None:
    raw = {code: _load_lang(code) for code, _, _ in LANGS}
    char_entry = build_char(raw)
    skills_entry = build_skills(raw)

    chars_path = DATA / "chars.json"
    skills_path = DATA / "skills.json"
    shutil.copy(chars_path, chars_path.with_suffix(".json.bak10440"))
    shutil.copy(skills_path, skills_path.with_suffix(".json.bak10440"))

    chars = json.loads(chars_path.read_text(encoding="utf-8"))
    skills = json.loads(skills_path.read_text(encoding="utf-8"))
    chars[str(CID)] = char_entry
    skills[str(CID)] = skills_entry
    chars_path.write_text(json.dumps(chars, ensure_ascii=False, indent=1), encoding="utf-8")
    skills_path.write_text(json.dumps(skills, ensure_ascii=False), encoding="utf-8")

    # ── completeness report ──
    print(f"캐릭터: {char_entry['name_kr']} / {char_entry['name_en']} "
          f"/ {char_entry['name_cn']} / {char_entry['name_sc']} / {char_entry['name_ja']}")
    print(f"class={char_entry['class']}(치유) element={char_entry['element']}(나무) "
          f"★{char_entry['rarity']} ATK{char_entry['baseATK']} HP{char_entry['baseHP']} "
          f"rune={char_entry['hasRune']}")
    print(f"슬롯 {len(skills_entry)}개: {list(skills_entry.keys())}")
    missing, residue = [], []
    import re
    ph = re.compile(r"\$\{arg\d+\}")
    for slot, sd in skills_entry.items():
        for _, sfx, _ in LANGS:
            if not sd.get(f"name_{sfx}"):
                missing.append(f"{slot}.name_{sfx}")
        for lv, entry in sd["levels"].items():
            params = entry.get("params", {})
            for _, _, dsfx in LANGS:
                t = entry.get(f"desc_{dsfx}", "")
                if not t:
                    missing.append(f"{slot}.lv{lv}.desc_{dsfx}")
                    continue
                for m in ph.findall(t):
                    key = m[2:-1]
                    if key not in params:
                        residue.append(f"{slot}.lv{lv}.desc_{dsfx}: {m} (param 없음)")
    print(f"검증: 누락 {len(missing)} | 미치환(param 결손) {len(residue)}")
    for x in missing[:10]:
        print("  [누락]", x)
    for x in residue[:10]:
        print("  [미치환]", x)
    if not missing and not residue:
        print("  [OK] 전 슬롯·전 레벨·5언어 완전 · 모든 placeholder에 param 존재")


if __name__ == "__main__":
    main()
