"""dashboard/spec.js 대조용 골든값 생성 (파이썬이 정답).

    python tools/statgolden.py [출력경로]     # 기본 tools/statgolden.json
    node tools/statcheck.js [골든경로]        # JS 이식본과 대조

평소에는 ``tests/test_spec_js.py`` 가 임시 파일로 만들어 돌리므로 산출물을
저장소에 두지 않는다(전 캐릭 × 전 격자는 수 MB). CLI는 수동 확인용이다.

경계를 일부러 밟는다: 시길 문턱(15/20/…/60)과 그 직전 레벨, 성급별 진화 상한,
희귀도 3/4 분기 — 상한·계수 분기가 전부 걸리게 하려는 것.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from woofia_sim.kit import PASSIVE_SLOTS                          # noqa: E402
from woofia_sim.stats import (                                    # noqa: E402
    MAX_EVO,
    Investment,
    can_unlock_rune,
    levelable_passives,
    pevo_cap,
    scale_atk_hp,
    unlocked_passives,
)

LEVELS = (1, 14, 15, 29, 30, 44, 45, 59, 60)
COMPATS = (0, 3, 5)
SIGILS = (0, 1, 10)
SLOTS = ("basicAtk", "ultimate", "sigil", *PASSIVE_SLOTS)


def slot_state(slot: str, evo: int) -> str:
    """UI가 슬롯을 어떻게 그려야 하는지: 렙업 가능 / 1레벨 고정 / 미해방."""
    if slot in ("basicAtk", "ultimate"):
        return "open"
    if slot == "sigil":
        return "open" if can_unlock_rune(evo) else "locked"
    idx = int(slot[-1])
    if idx >= unlocked_passives(evo):
        return "locked"
    return "open" if idx < levelable_passives(evo) else "pinned"


def _load_chars() -> list[dict]:
    raw = json.loads((ROOT / "data" / "chars.json").read_text(encoding="utf-8"))
    return raw if isinstance(raw, list) else list(raw.values())


def _sample(chars: list[dict]) -> list[dict]:
    """전 격자를 돌릴 대표 캐릭터: 희귀도별 + baseATK 최소/최대.

    공식은 기본값에 선형이지만 floor()가 걸려 있어 값이 다르면 끝자리가 갈린다.
    대표군으로 격자를 훑고, 나머지 캐릭터는 아래에서 가볍게 한 번씩 본다.
    """
    picked = {}
    for rar in sorted({c["rarity"] for c in chars}):
        same = [c for c in chars if c["rarity"] == rar]
        picked[min(same, key=lambda c: c["baseATK"])["id"]] = None
        picked[max(same, key=lambda c: c["baseATK"])["id"]] = None
    return [c for c in chars if c["id"] in picked]


def build_golden() -> dict:
    chars = _load_chars()
    stats: list[dict] = []

    def add(c: dict, inv: Investment) -> None:
        atk, hp = scale_atk_hp(c["baseATK"], c["baseHP"], c["rarity"], inv)
        stats.append({
            "id": c["id"], "baseATK": c["baseATK"], "baseHP": c["baseHP"],
            "rarity": c["rarity"],
            "inv": {"level": inv.level, "evo": inv.evo, "pevo": inv.pevo,
                    "sigil": inv.sigil, "compat": inv.compat},
            "atk": atk, "hp": hp,
        })

    for c in _sample(chars):                       # 대표군 × 전 격자
        for level in LEVELS:
            for evo in range(MAX_EVO + 1):
                for pevo in sorted({0, pevo_cap(evo)}):
                    for compat in COMPATS:
                        for sigil in SIGILS:
                            add(c, Investment(level=level, evo=evo, pevo=pevo,
                                              sigil=sigil, compat=compat))

    for c in chars:                                # 전 캐릭터 × 요지 3종
        add(c, Investment(level=60, evo=5, compat=5))          # 기본(풀육성)
        add(c, Investment(level=1, evo=0, compat=0))           # 최소
        add(c, Investment(level=45, evo=3, pevo=19, sigil=10, compat=3))

    return {
        "gating": [{"evo": e, "unlocked": unlocked_passives(e),
                    "levelable": levelable_passives(e),
                    "rune": can_unlock_rune(e), "pevoCap": pevo_cap(e)}
                   for e in range(MAX_EVO + 1)],
        "slotStates": [{"slot": s, "evo": e, "state": slot_state(s, e)}
                       for s in SLOTS for e in range(MAX_EVO + 1)],
        "stats": stats,
    }


def main(argv: list[str]) -> int:
    dest = Path(argv[1]) if len(argv) > 1 else Path(__file__).with_name("statgolden.json")
    data = build_golden()
    dest.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"{dest}: 스탯 {len(data['stats'])}조합 · 슬롯상태 {len(data['slotStates'])}건")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
