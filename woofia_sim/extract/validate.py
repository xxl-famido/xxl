"""Cross-validate scraped site data against the offline game-extracted dump.

Compares, per character / skill slot / skill level:
  - base ATK/HP
  - skill damage multipliers and buff magnitudes

Site source (this project):  data/chars.json, data/skills.json
Offline source (authoritative game memory dump, mining project):
  ../mining/skills_clean.txt, skillgrps.json, chars.json

Run:  python -m woofia_sim.extract.validate
"""
from __future__ import annotations

import json
import re
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_SITE_DIR = _PROJECT_ROOT / "data"
_OFFLINE_DIR = _PROJECT_ROOT.parent / "mining"

# site skill slot -> offline skillgrp category
SLOT_TO_CATEGORY = {
    "basicAtk": "attack",
    "ultimate": "fatal",
    "sigil": "runeFatal",
    "passive0": ("passive", 0),
    "passive1": ("passive", 1),
    "passive2": ("passive", 2),
    "passive3": ("passive", 3),
    "passive4": ("passive", 4),
}


def _load_offline() -> tuple[dict, dict, dict]:
    skills: dict[int, dict] = {}
    with (_OFFLINE_DIR / "skills_clean.txt").open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rec = json.loads(line)
                skills[rec["id"]] = rec
    grps = json.loads((_OFFLINE_DIR / "skillgrps.json").read_text(encoding="utf-8"))
    chars = json.loads((_OFFLINE_DIR / "chars.json").read_text(encoding="utf-8"))
    return skills, grps, chars


def offline_leaves(
    skills: dict[int, dict], sid: int, depth: int = 0, seen: set[int] | None = None
) -> list[tuple[int, float, int]]:
    """Flatten a skill into (eff, magnitude=parms[0]/100, duration=parms[6]) leaves.

    Composite skills (eff 255) recurse into their sub-skill ids; other effects
    are leaves. Guards against cycles and runaway depth.
    """
    seen = seen if seen is not None else set()
    rec = skills.get(sid)
    if rec is None or sid in seen or depth > 12:
        return []
    seen.add(sid)
    eff = rec["eff"]
    parms = rec["parms"]
    if eff == 255:
        out: list[tuple[int, float, int]] = []
        for sub in parms:
            if sub:
                out.extend(offline_leaves(skills, sub, depth + 1, seen))
        return out
    dur = parms[6] if len(parms) > 6 else 0
    return [(eff, parms[0] / 100, dur)]


def _offline_skill_id(grps: dict, skill_grp: int, slot: str, level_idx: int) -> int | None:
    grp = grps.get(str(skill_grp))
    if not grp:
        return None
    cat = SLOT_TO_CATEGORY.get(slot)
    if cat is None:
        return None
    if isinstance(cat, tuple):
        sets = grp.get(cat[0], [])
        ids = sets[cat[1]] if cat[1] < len(sets) else []
    else:
        ids = grp.get(cat, [])
    if not ids:
        return None
    return ids[level_idx] if level_idx < len(ids) else ids[-1]


def _site_damage_pct(level_entry: dict) -> list[float]:
    """Param values referenced by 'Deal damage ${argN}%' in the description."""
    desc = level_entry.get("desc_en", "")
    params = level_entry.get("params", {})
    out: list[float] = []
    for m in re.finditer(r"[Dd]eal damage \$\{(\w+)\}%", desc):
        val = params.get(m.group(1))
        if val is not None:
            out.append(float(val))
    return out


def validate_char(
    cid: str, site_chars: dict, site_skills: dict,
    off_skills: dict, off_grps: dict, off_chars: dict,
) -> None:
    sc = site_chars[cid]
    oc = off_chars.get(cid, {})
    print(f"\n{'='*70}\n{cid}  {sc['name_kr']} / {sc['name_en']}\n{'='*70}")

    # base stats
    print(f"base ATK: site {sc['baseATK']} | offline {oc.get('atk')} "
          f"{'OK' if sc['baseATK'] == oc.get('atk') else 'DIFF'}")
    print(f"base HP : site {sc['baseHP']} | offline {oc.get('hp')} "
          f"{'OK' if sc['baseHP'] == oc.get('hp') else 'DIFF'}")
    grp = oc.get("skillGrp")

    sk = site_skills[cid]
    for slot in ("basicAtk", "ultimate", "sigil"):
        if slot not in sk:
            continue
        print(f"\n--- {slot} (offline {SLOT_TO_CATEGORY[slot]}) ---")
        for lv in (0, 9):  # level 1 and level 10
            entry = sk[slot]["levels"].get(str(lv))
            if not entry:
                continue
            site_dmg = _site_damage_pct(entry)
            site_params = list(entry["params"].values())
            off_id = _offline_skill_id(off_grps, grp, slot, lv)
            leaves = offline_leaves(off_skills, off_id) if off_id else []
            off_dmg = [mag for eff, mag, _ in leaves if eff == 101]
            off_all = [round(mag, 2) for _, mag, _ in leaves]
            cd_site = entry["cd"]
            cd_off = off_skills.get(off_id, {}).get("cd") if off_id else None
            dmg_ok = "OK" if sorted(site_dmg) == sorted(off_dmg) else "DIFF"
            print(f"  Lv{lv+1:>2}: site params={site_params} cd={cd_site} | "
                  f"site_dmg={site_dmg} vs offline_dmg(eff101)={off_dmg} [{dmg_ok}]")
            print(f"        offline id={off_id} cd={cd_off} all_leaf_mags={off_all}")


def main() -> None:
    site_chars = json.loads((_SITE_DIR / "chars.json").read_text(encoding="utf-8"))
    site_skills = json.loads((_SITE_DIR / "skills.json").read_text(encoding="utf-8"))
    off_skills, off_grps, off_chars = _load_offline()
    for cid in ("10421", "10423", "10428", "10418"):
        validate_char(cid, site_chars, site_skills, off_skills, off_grps, off_chars)


if __name__ == "__main__":
    main()
