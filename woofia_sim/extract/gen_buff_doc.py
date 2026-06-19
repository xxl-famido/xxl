"""Generate a markdown list of skills granting action-effect amplification buffs.

Scans all characters for buffs in the triggered / EX / basic action-effect
channels (game `TBonusProperty` triggerEff / skillEff / attackEff), and writes
``docs/효과증폭버프_목록.md`` listing who grants what, with Lv1->Lv10 values,
target, duration and activation condition.

Run:  python -m woofia_sim.extract.gen_buff_doc
"""
from __future__ import annotations

import json
from pathlib import Path

from ..effects import (
    BUFF, TRIGGER, STAT_TRIGGERED_EFFECT, STAT_EX_EFFECT, STAT_BASIC_DMG_DEALT,
    parse_skill_level,
)

_ROOT = Path(__file__).resolve().parents[2]

SLOT_KR = {
    "basicAtk": "평타", "ultimate": "필살기", "sigil": "룬필살기",
    "passive0": "패시브0", "passive1": "패시브1", "passive2": "패시브2",
    "passive3": "패시브3", "passive4": "패시브4",
}
# default activation condition by slot (when the buff is a direct skill effect)
SLOT_WHEN = {
    "basicAtk": "평타 사용 시", "ultimate": "필살 사용 시", "sigil": "룬필살 사용 시",
    "passive0": "상시", "passive1": "상시", "passive2": "상시",
    "passive3": "상시", "passive4": "상시",
}
COND_KR = {
    "on_attack": "공격 시", "on_basic_attack": "평타 시", "on_ex": "필살 시",
    "on_attacked": "피격 시", "on_defend": "방어 시", "on_turn": "특정 턴",
    "every_turn": "N턴마다", "on_battle_start": "전투 시작", "grant_allies": "아군 부여",
    "on_take_basic": "평타 피격", "position_periodic": "위치+매턴",
}
CHANNELS = {STAT_TRIGGERED_EFFECT: "발동", STAT_EX_EFFECT: "EX", STAT_BASIC_DMG_DEALT: "평타"}
TARGET_KR = {
    "self": "자신", "allies": "아군전체", "allies_fighter": "파이터 아군",
    "allies_vandal": "반달 아군", "target": "대상",
}
SECTION_TITLE = {
    "발동": "발동 스킬 효과 +X% (트리거 데미지 증폭 — triggerEffBonus)",
    "EX": "EX 스킬 효과 +X% (필살 데미지 증폭 — skillEffBonus)",
    "평타": "평타 데미지 +X% (평타 증폭 — attackEffBonus)",
}


def _walk(effect, condition: str):
    """Yield (channel, magnitude, target, duration, condition) for amp buffs."""
    out = []
    if effect.kind == BUFF and effect.stat in CHANNELS:
        out.append((CHANNELS[effect.stat], effect.magnitude, effect.target,
                    effect.duration, condition))
    if effect.kind == TRIGGER:
        c = effect.condition or ""
        if c.endswith(tuple("0123456789")) or ">=" in c:
            label = f"스택≥{effect.max_stacks}"
        else:
            label = COND_KR.get(c, c)
        for sub in effect.sub_effects:
            out.extend(_walk(sub, label))
    else:
        for sub in effect.sub_effects:
            out.extend(_walk(sub, condition))
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
                    for chan, mag, tgt, dur, cond in _walk(eff, SLOT_WHEN[slot]):
                        found.setdefault((chan, tgt, dur, cond), {})[level_key] = mag
            for (chan, tgt, dur, cond), mags in found.items():
                rows[chan].append((
                    name, SLOT_KR[slot], skname,
                    mags.get("0", "?"), mags.get("9", "?"),
                    TARGET_KR.get(tgt, tgt), dur, cond,
                ))

    lines = [
        "# XXL WOOFIA — 효과 증폭 버프 보유 스킬 목록",
        "",
        "스킬 데미지를 증폭하는 **액션별 효과 버프**. 게임 바이너리 `TBonusProperty`의 "
        "액션 채널(평타=attackEff / EX=skillEff / 발동=triggerEff)에 대응하며, "
        "**각 채널은 해당 액션 데미지에만** 적용된다(채널끼리 곱).",
        "",
        "- 수치: **스킬 레벨 1 → 10** (레벨 비례 증가)",
        "- 발동조건: 패시브=상시 / 평타·필살·룬필살=해당 스킬 사용 시 / 그 외=트리거",
        "- 출처: sectionhunk.moe 추출 데이터 (`data/skills.json`)",
        "",
    ]
    for chan in ("발동", "EX", "평타"):
        lines.append(f"## {SECTION_TITLE[chan]}")
        lines.append("")
        if not rows[chan]:
            lines.extend(["_해당 없음_", ""])
            continue
        lines.append("| 캐릭터 | 슬롯 | 스킬명 | 수치(Lv1→10) | 대상 | 지속 | 발동조건 |")
        lines.append("|---|---|---|---|---|---|---|")
        for name, slot, skname, m1, m10, tgt, dur, cond in sorted(rows[chan]):
            dur_s = "영구" if dur == -1 else f"{dur}턴"
            lines.append(f"| {name} | {slot} | {skname} | {m1}→{m10}% | {tgt} | {dur_s} | {cond} |")
        lines.extend(["", f"소계: {len(rows[chan])}건", ""])

    total = sum(len(v) for v in rows.values())
    lines.append("---")
    lines.append(f"합계: 발동 {len(rows['발동'])} · EX {len(rows['EX'])} · "
                 f"평타 {len(rows['평타'])} = **{total}건**")
    return "\n".join(lines)


def main() -> None:
    doc = generate()
    out_path = _ROOT / "docs" / "효과증폭버프_목록.md"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(doc, encoding="utf-8")
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
