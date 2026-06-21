"""Resolve a character into a battle-ready kit.

Combines scraped data (``data/chars.json`` + ``data/skills.json``) with the
stat-scaling formula and the effect parser to produce a :class:`ResolvedKit`:
final ATK/HP for a chosen investment, plus parsed effects per skill slot at a
chosen skill level, with the rune (도장) toggle selecting ultimate vs sigil.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from .effects import MARKER, Effect, parse_skill_level
from .stats import Investment, scale_atk_hp

_DATA_DIR = Path(__file__).resolve().parents[1] / "data"
DISPLAY_LANG = os.environ.get("WOOFIA_LANG", "tw").lower().replace("-", "_")

PASSIVE_SLOTS = ("passive0", "passive1", "passive2", "passive3", "passive4")
MAX_SKILL_LEVEL = 10


@lru_cache(maxsize=1)
def _load() -> tuple[dict, dict]:
    chars = json.loads((_DATA_DIR / "chars.json").read_text(encoding="utf-8"))
    skills = json.loads((_DATA_DIR / "skills.json").read_text(encoding="utf-8"))
    return chars, skills


def _lang(obj: dict, base: str, fallback: str = "") -> str:
    for lang in (DISPLAY_LANG, "kr", "en"):
        val = obj.get(f"{base}_{lang}")
        if val:
            return val
    return fallback


@dataclass
class ResolvedSkill:
    """One skill slot resolved at a specific level."""

    slot: str
    name: str
    cd: int
    effects: list[Effect]


@dataclass
class ResolvedKit:
    """A character fully resolved for battle."""

    char_id: int
    name: str
    atk: int
    hp: int
    rarity: int
    kind: int          # ERoleKind (class): 1 Atk .. 5 Debuff
    element: int       # EProp: 1 Fire 2 Water 3 Wood 4 Light 5 Dark
    rune: bool
    skill_level: int
    basic: ResolvedSkill
    fatal: ResolvedSkill                       # ultimate, or sigil when rune on
    passives: list[ResolvedSkill] = field(default_factory=list)


def _tag(effects: list[Effect], owner: int, skill_name: str) -> None:
    """Stamp each effect recursively with its source character and display skill name."""
    for e in effects:
        e.owner = owner
        e.src_skill = skill_name
        _tag(e.sub_effects, owner, skill_name)


def _resolve_slot(slot: str, slot_data: dict, level: int, owner: int = 0) -> ResolvedSkill:
    idx = max(0, min(level, MAX_SKILL_LEVEL) - 1)
    levels = slot_data.get("levels", {})
    entry = levels.get(str(idx)) or levels.get(str(len(levels) - 1)) or {}
    effects = parse_skill_level(entry.get("desc_en", ""), entry.get("params", {}))
    skill_name = _lang(slot_data, "name", slot)
    _tag(effects, owner, skill_name)
    return ResolvedSkill(
        slot=slot,
        name=skill_name,
        cd=int(entry.get("cd", 0)),
        effects=effects,
    )


def resolve_kit(
    char_id: int,
    investment: Investment | None = None,
    skill_level: int = MAX_SKILL_LEVEL,
    rune: bool = False,
    atk_override: int | None = None,
    hp_override: int | None = None,
) -> ResolvedKit:
    """Build a battle-ready kit for one character.

    investment   : level/evo/compat etc.; defaults to Lv60 max-level.
    skill_level  : 1..10 applied to every slot.
    rune (도장)  : when True, the fatal slot uses ``sigil`` (룬필살기) if present.
    *_override   : force final ATK/HP (e.g. the in-game displayed value).
    """
    chars, skills = _load()
    key = str(char_id)
    if key not in chars:
        raise KeyError(f"character {char_id} not in chars.json")
    meta = chars[key]
    char_skills = skills.get(key, {})

    inv = (investment or Investment(level=60)).normalized()
    atk, hp = scale_atk_hp(meta["baseATK"], meta["baseHP"], meta["rarity"], inv)
    if atk_override is not None:
        atk = atk_override
    if hp_override is not None:
        hp = hp_override

    basic = _resolve_slot("basicAtk", char_skills.get("basicAtk", {}), skill_level, char_id)
    fatal_slot = "sigil" if (rune and char_skills.get("sigil")) else "ultimate"
    fatal = _resolve_slot(fatal_slot, char_skills.get(fatal_slot, {}), skill_level, char_id)
    passives = [
        _resolve_slot(s, char_skills[s], skill_level, char_id)
        for s in PASSIVE_SLOTS
        if char_skills.get(s)
    ]

    # The sigil holds an always-on "Sigil Passive:" section after its active
    # part; when rune is on, split it out and install it as a passive.
    if fatal_slot == "sigil":
        active: list[Effect] = []
        sigil_passive: list[Effect] = []
        seen_marker = False
        for eff in fatal.effects:
            if eff.kind == MARKER and (eff.raw or "").startswith("Sigil Passive"):
                seen_marker = True
                continue
            (sigil_passive if seen_marker else active).append(eff)
        fatal.effects = active
        if sigil_passive:
            passives.append(ResolvedSkill("sigilPassive", "Sigil Passive", 0, sigil_passive))

    return ResolvedKit(
        char_id=char_id,
        name=_lang(meta, "name", key),
        atk=atk,
        hp=hp,
        rarity=meta["rarity"],
        kind=meta.get("class") or 0,
        element=meta.get("element") or 0,
        rune=rune,
        skill_level=skill_level,
        basic=basic,
        fatal=fatal,
        passives=passives,
    )
