"""English stack/status names -> Korean, for display.

The parser captures stack names from the English skill text (desc_en); this map
(extracted from the aligned Korean text, then curated) renders them in Korean
for logs. Unmapped names fall through unchanged.
"""
from __future__ import annotations

STACK_KR: dict[str, str] = {
    "Arcane Focus": "마도 집중",
    "Battle Spirit": "전의",
    "Blackey": "흑구",
    "Whitey": "백구",
    "Afterglow": "추말",
    "Divine Rune": "서인",
    "Blazing Stride": "열화질보",
    "Bloodthirst Mark": "호혈표지",
    "Chisel Marks": "각흔",
    "Command Callout": "전술 호령",
    "Discount Coupon": "할인 쿠폰",
    "Divine Rune": "서인",
    "Dragon's Ire": "용의 분노",
    "Dragonforce": "용족의 위압",
    "Energy Charge": "체력응축",
    "Five-Peak Myriad": "오봉만상",
    "Wavetime": "파도 체이싱",
    "Gale Breath": "란의 기운",
    "Gunpowder": "화약",
    "Hellhound": "지옥의 사냥개",
    "Holy Wrath": "성노",
    "Hooked": "입질",
    "Judgment": "심판",
    "Lunar Pounce": "월지호비",
    "Pursuit": "추격",
    "Qi Surge: Tiger": "내기혼신·호",
    "Reduced Damage Output": "주는 데미지 감소",
    "Secret Spices": "비법 향신료",
    "Slow Cook": "약한 불에 끓이기",
    "Solar Flight": "일지어천",
    "Splashing Blessing": "물보라의 축복",
    "Stir-Fry": "센 불에 볶기",
    "Strategic Insight": "전술 판독",
    "Taunt": "조롱",
    "Sleep": "수면",
    "Tidefang": "해일의 송곳니",
    "Water Bullet": "상어 수탄",
}


def kr(name: str | None) -> str:
    """Return the Korean stack name, or the original if unmapped/empty."""
    if not name:
        return name or ""
    return STACK_KR.get(name, name)


# buff stat channel -> short Korean label (for buff-based "stacks" e.g. 쿼터백)
STAT_KR_LABEL: dict[str, str] = {
    "base_atk_pct": "기초ATK",
    "atk_pct": "ATK",
    "atk_flat": "고정ATK",
    "max_hp_pct": "최대HP",
    "base_max_hp_pct": "기초최대HP",
    "dmg_dealt_pct": "주는딜",
    "basic_eff_pct": "평타뎀",
    "ex_eff_pct": "EX효과",
    "trigger_eff_pct": "발동효과",
    "dmg_taken_pct": "받는딜",
    "dot_taken_pct": "받는 지속딜",
    "dot_dealt_pct": "지속딜 증가",
}


def stat_kr(stat: str | None) -> str:
    return STAT_KR_LABEL.get(stat or "", stat or "?")
