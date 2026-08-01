"""회귀 테스트 — `tools/snapshot.py` 의 골든 조합을 pytest 로 실행한다.

CLI(`python tools/snapshot.py`)와 같은 계측을 쓰되, 조합별로 테스트 케이스가 분리되어
어느 조합이 깨졌는지 실패 목록에 바로 드러난다.

    pytest tests/ -q                 # 전체
    pytest tests/ -q -k taeho        # 이태호 관련 조합만
    pytest tests/ -q -k solo_10439

골든을 의도적으로 바꿨다면 `python tools/snapshot.py --update` 로 재기록한 뒤 다시 돌린다.
`boss_sim/` 은 동결된 별도 포크라 이 스위트의 대상이 아니다.
"""
from __future__ import annotations

import pytest

import snapshot as snap

COMBOS = snap.all_combos()
COMBO_IDS = [c.name for c in COMBOS]

# 결정론 확인은 전 조합을 두 번 돌릴 필요가 없다. 확률·타겟 무작위·다중 아군 큐를 모두
# 태우는 대표 조합만 골라 두 번 돌린다.
_DETERMINISM_SAMPLE = (
    "team_barrier_channels",      # enemy_aoe + 피격 반응 2-패스
    "team_repeat_stacks",         # 스택 수만큼 반복 발동
    "team_fed_carry_double_ult",  # 추가 행동 큐 삽입
)


@pytest.mark.parametrize("combo", COMBOS, ids=COMBO_IDS)
def test_matches_golden(combo: snap.Combo) -> None:
    """조합의 수치가 기록된 골든과 일치해야 한다 (로그 문구 변화는 실패로 보지 않음)."""
    golden = snap.load_golden(combo.name)
    if golden is None:
        pytest.skip(f"골든 없음 — `python tools/snapshot.py --update -f {combo.name}`")
    verdict = snap.compare(combo, golden, snap.measure(combo), tol=0.0)
    if verdict.status == "config":
        pytest.skip("조합 정의가 골든과 다름 — --update 로 재기록 필요")
    assert verdict.status != "fail", "\n".join(verdict.fail_lines)


@pytest.mark.parametrize("name", _DETERMINISM_SAMPLE)
def test_deterministic(name: str) -> None:
    """같은 설정을 두 번 돌리면 완전히 같은 결과가 나와야 한다 (골든의 전제)."""
    combo = next(c for c in COMBOS if c.name == name)
    assert snap.measure(combo) == snap.measure(combo)


def test_no_unparsed_effects() -> None:
    """전 캐릭터 스킬이 빠짐없이 파싱되어야 한다 (UNPARSED = 미구현 효과)."""
    from woofia_sim.effects import UNPARSED
    from woofia_sim.kit import resolve_kit

    def count(effects: list) -> int:
        return sum((e.kind == UNPARSED) + count(e.sub_effects) for e in effects)

    unparsed: dict[str, int] = {}
    for char_id in snap.load_char_ids():
        for rune in (True, False):
            kit = resolve_kit(char_id, None, 10, rune=rune)
            total = sum(count(s.effects) for s in [kit.basic, kit.fatal, *kit.passives])
            if total:
                unparsed[f"{char_id}{'(도장)' if rune else ''}"] = total
    assert not unparsed, f"미파싱 효과: {unparsed}"
