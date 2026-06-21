"""English stack/status names -> Traditional Chinese, for display.

The parser captures stack names from the English skill text (desc_en); this map
(extracted from localized text, then curated) renders them in Traditional
Chinese for logs. Unmapped names fall through unchanged.
"""
from __future__ import annotations

STACK_ZH: dict[str, str] = {
    "Arcane Focus": "魔導集中",
    "Battle Spirit": "戰意",
    "Blackey": "黑狗",
    "Whitey": "白狗",
    "Afterglow": "餘暉",
    "Divine Rune": "聖印",
    "Blazing Stride": "烈火疾步",
    "Bloodthirst Mark": "嗜血標記",
    "Chisel Marks": "刻痕",
    "Command Callout": "戰術號令",
    "Discount Coupon": "折扣券",
    "Dragon's Ire": "龍之憤怒",
    "Dragonforce": "龍族威壓",
    "Energy Charge": "體力凝聚",
    "Five-Peak Myriad": "五峰萬象",
    "Gale Breath": "嵐之氣息",
    "Gunpowder": "火藥",
    "Hellhound": "地獄獵犬",
    "Holy Wrath": "聖怒",
    "Hooked": "上鉤",
    "Judgment": "審判",
    "Lunar Pounce": "月之虎飛",
    "Pursuit": "追擊",
    "Qi Surge: Tiger": "內氣混身·虎",
    "Reduced Damage Output": "造成傷害降低",
    "Secret Spices": "祕傳香辛料",
    "Slow Cook": "文火慢燉",
    "Solar Flight": "日之御天",
    "Splashing Blessing": "水花祝福",
    "Stir-Fry": "猛火快炒",
    "Strategic Insight": "戰術判讀",
    "Taunt": "嘲諷",
    "Tidefang": "海潮尖牙",
    "Water Bullet": "鯊魚水彈",
}


def kr(name: str | None) -> str:
    """Return the localized stack name, or the original if unmapped/empty."""
    if not name:
        return name or ""
    return STACK_ZH.get(name, name)


# buff stat channel -> short localized label
STAT_ZH_LABEL: dict[str, str] = {
    "base_atk_pct": "基礎ATK",
    "atk_pct": "ATK",
    "atk_flat": "固定ATK",
    "max_hp_pct": "最大HP",
    "base_max_hp_pct": "基礎最大HP",
    "dmg_dealt_pct": "造成傷害",
    "basic_eff_pct": "普攻傷害",
    "ex_eff_pct": "EX效果",
    "trigger_eff_pct": "觸發效果",
    "dmg_taken_pct": "受到傷害",
    "dot_taken_pct": "受到持續傷害",
    "dot_dealt_pct": "持續傷害增加",
}


def stat_kr(stat: str | None) -> str:
    return STAT_ZH_LABEL.get(stat or "", stat or "?")
