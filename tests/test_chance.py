"""이벤트 없는 '확률로 …' 한 줄 효과가 실제로 확률 판정을 받는가.

트리거(구독)는 발동 시점에 확률을 굴리지만, 이벤트 없이 한 줄로 쓰인
"N% 확률로 …"(탐랑 필살 수면 40%)은 판정 없이 **확정 발동**하고 있었다.
확률 100% 모드에서는 종전대로 항상 발동해야 한다(결정론 스냅샷 불변).
"""
from __future__ import annotations

import re

from woofia_sim.harness import CharSpec, run_team

TAMRANG = 10408          # 필살 「선향욕기」 — 적 전체 40% 확률 수면(2턴, 받뎀 +75%)
_APPLY = re.compile(r"→ .*수면 \d+턴")
_ULT = re.compile(r"^필살 → 더미\d+ [\d,.]+ =")


def _rates(seeds: int, force: bool) -> tuple[int, int]:
    ults = sleeps = 0
    for sd in range(seeds):
        res = run_team([CharSpec(TAMRANG)], max_turn=12, force_proc=force, seed=sd)
        turns = set()
        for ev in res.state.log:
            text = getattr(ev, "text", "") or ""
            if _ULT.match(text):
                turns.add(ev.turn)
            if _APPLY.search(text):
                sleeps += 1
        ults += len(turns)
    return ults, sleeps


def test_sleep_respects_its_chance() -> None:
    """확률 모드에서는 명시된 40% 근처로 발동해야 한다."""
    ults, sleeps = _rates(120, force=False)
    assert ults > 0
    rate = sleeps / ults * 100
    assert 25 <= rate <= 55, f"수면 발동률 {rate:.1f}% (기대 40% 근처)"


def test_force_proc_still_always_applies() -> None:
    """확률 100% 모드는 종전대로 확정 발동 — 결정론 스냅샷이 흔들리면 안 된다."""
    ults, sleeps = _rates(20, force=True)
    assert ults > 0 and sleeps == ults, f"필살 {ults}턴 / 수면 {sleeps}회"
