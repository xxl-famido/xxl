"""Classify every damage-dealing attack by action channel (평타 / EX / 발동).

Effect-amplification buffs only boost attacks in their own channel:
  - 평타 효과 buff (attackEffBonus)  -> basic-attack damage
  - EX 효과 buff (skillEffBonus)      -> fatal/ultimate damage
  - 발동 효과 buff (triggerEffBonus)  -> damage dealt from a trigger

This answers: "when a unit receives a 발동/EX/평타 효과 buff, which of its
attacks actually benefit?" -> the attacks listed under that channel.

Writes ``docs/공격_액션분류_목록.md``.
Run:  python -m woofia_sim.extract.gen_attack_classes
"""
from __future__ import annotations

import json
from pathlib import Path

from ..effects import DAMAGE, TRIGGER, parse_skill_level

_ROOT = Path(__file__).resolve().parents[2]

SLOT_KR = {
    "basicAtk": "평타", "ultimate": "필살기", "sigil": "룬필살기",
    "passive0": "패시브0", "passive1": "패시브1", "passive2": "패시브2",
    "passive3": "패시브3", "passive4": "패시브4",
}
SLOT_WHEN = {
    "basicAtk": "평타 사용 시", "ultimate": "필살 사용 시", "sigil": "룬필살 사용 시",
}
COND_KR = {
    "on_attack": "공격 시", "on_basic_attack": "평타 시", "on_ex": "필살 시",
    "on_attacked": "피격 시", "on_defend": "방어 시", "on_turn": "특정 턴",
    "every_turn": "N턴마다", "on_battle_start": "전투 시작", "grant_allies": "아군 부여",
    "on_take_basic": "평타 피격", "position_periodic": "위치+매턴",
}
TARGET_KR = {
    "target": "단일", "all_enemies": "전체", "self": "자신", "allies": "아군",
}
SECTION_TITLE = {
    "발동": "발동(트리거) 데미지 — **'발동 스킬 효과 +X%' 버프가 증폭**",
    "EX": "EX(필살) 데미지 — **'EX 스킬 효과 +X%' 버프가 증폭**",
    "평타": "평타 데미지 — **'평타 데미지 +X%' 버프가 증폭**",
}


def _cond_label(effect) -> str:
    c = effect.condition or ""
    if c.endswith(tuple("0123456789")) or ">=" in c:
        return f"스택≥{effect.max_stacks}"
    return COND_KR.get(c, c)


def _collect(effect, slot, under_trigger, cond):
    """Yield (channel, magnitude, target, condition) for each DAMAGE leaf."""
    out = []
    if effect.kind == DAMAGE:
        if under_trigger:
            channel, when = "발동", cond
        elif slot == "basicAtk":
            channel, when = "평타", SLOT_WHEN.get(slot, "상시")
        elif slot in ("ultimate", "sigil"):
            channel, when = "EX", SLOT_WHEN.get(slot, "상시")
        else:
            channel, when = "발동", cond  # passive non-trigger damage -> treat as triggered
        out.append((channel, effect.magnitude, effect.target, when))
    if effect.kind == TRIGGER:
        label = _cond_label(effect)
        for sub in effect.sub_effects:
            out.extend(_collect(sub, slot, True, label))
    else:
        for sub in effect.sub_effects:
            out.extend(_collect(sub, slot, under_trigger, cond))
    return out


def generate() -> str:
    chars = json.loads((_ROOT / "data" / "chars.json").read_text(encoding="utf-8"))
    skills = json.loads((_ROOT / "data" / "skills.json").read_text(encoding="utf-8"))
    rows: dict[str, list] = {"발동": [], "EX": [], "평타": []}

    for cid, slots in skills.items():
        name = chars[cid]["name_kr"]
        for slot in SLOT_KR:
            sd = slots.get(slot)
            if not sd:
                continue
            skname = sd.get("name_kr") or sd.get("name_en") or slot
            found: dict[tuple, dict] = {}
            for level_key in ("0", "9"):
                entry = sd.get("levels", {}).get(level_key, {})
                for eff in parse_skill_level(entry.get("desc_en", ""), entry.get("params", {})):
                    for chan, mag, tgt, cond in _collect(eff, slot, False, "상시"):
                        found.setdefault((chan, tgt, cond), {})[level_key] = mag
            for (chan, tgt, cond), mags in found.items():
                rows[chan].append((
                    name, SLOT_KR[slot], skname,
                    mags.get("0", "?"), mags.get("9", "?"),
                    TARGET_KR.get(tgt, tgt), cond,
                ))

    lines = [
        "# XXL WOOFIA — 공격 액션 분류 (어떤 공격이 어떤 효과버프를 받나)",
        "",
        "각 캐릭터의 **데미지 공격**을 액션 채널로 분류. 효과 증폭 버프는 **같은 채널 공격만** 증폭한다:",
        "",
        "| 받은 버프 | 증폭되는 공격 |",
        "|---|---|",
        "| 평타 데미지 +X% | 아래 **평타** 공격 |",
        "| EX 스킬 효과 +X% | 아래 **EX(필살)** 공격 |",
        "| 발동 스킬 효과 +X% | 아래 **발동(트리거)** 공격 |",
        "",
        "> 예) 제트블랙 '고요한 호흡'이 아군전체에 **발동효과 +30%**를 주면, 그 3턴 동안 "
        "각 아군의 **발동(트리거) 데미지**(아래 목록)가 ×1.30 된다. 평타·필살은 영향 없음.",
        "",
        "- 수치: 데미지 % (스킬 레벨 1 → 10), ATK 대비",
        "- 출처: sectionhunk.moe 추출 데이터",
        "",
    ]
    for chan in ("발동", "EX", "평타"):
        lines.append(f"## {SECTION_TITLE[chan]}")
        lines.append("")
        if not rows[chan]:
            lines.extend(["_해당 없음_", ""])
            continue
        lines.append("| 캐릭터 | 슬롯 | 스킬명 | 데미지%(Lv1→10) | 대상 | 발동조건 |")
        lines.append("|---|---|---|---|---|---|")
        for name, slot, skname, m1, m10, tgt, cond in sorted(
                rows[chan], key=lambda r: (r[0], r[1], r[2], str(r[6]))):
            lines.append(f"| {name} | {slot} | {skname} | {m1}→{m10}% | {tgt} | {cond} |")
        lines.extend(["", f"소계: {len(rows[chan])}건", ""])

    total = sum(len(v) for v in rows.values())
    lines.append("---")
    lines.append(f"합계: 발동 {len(rows['발동'])} · EX {len(rows['EX'])} · "
                 f"평타 {len(rows['평타'])} = **{total}건**")
    return "\n".join(lines)


def main() -> None:
    out_path = _ROOT / "docs" / "공격_액션분류_목록.md"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(generate(), encoding="utf-8")
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
