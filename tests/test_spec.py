"""성급별 해금 규칙과 슬롯별 스킬 레벨 회귀.

게이팅 값은 게임 ``TCharacterStarData`` 구조(UnlockPassiveSkillCount /
UnlockPassiveSkillLevelUpCount / CanUnlockRune)에서 왔고, 실제 수치는 인게임
확인(카라트 10409)으로 확정한 것이다. 표가 바뀌면 여기서 먼저 깨진다.
"""
from __future__ import annotations

import pytest

from woofia_sim.harness import CharSpec, run_team
from woofia_sim.kit import resolve_kit
from woofia_sim.stats import (
    Investment,
    can_unlock_rune,
    levelable_passives,
    pevo_cap,
    unlocked_passives,
)

KARAT = 10409       # 공격강화IV / 상어 사냥 추격 / 분노의 해류 / 고강도 훈련 / 피의 공명
CHOI = 10303        # 최유희 — 로스터 유일의 ★3(starUpId=301). 표는 ★4와 같다(인게임 확인)

# (성급, 해방 패시브, 레벨업 가능, 도장)
STAR_TABLE = [(0, 2, 1, False), (1, 2, 1, False), (2, 2, 2, False),
              (3, 3, 3, True), (4, 4, 4, True), (5, 5, 5, True)]


@pytest.mark.parametrize("evo,n_open,n_lv,rune", STAR_TABLE)
def test_star_table(evo: int, n_open: int, n_lv: int, rune: bool) -> None:
    assert unlocked_passives(evo) == n_open
    assert levelable_passives(evo) == n_lv
    assert can_unlock_rune(evo) is rune


@pytest.mark.parametrize("cid", [KARAT, CHOI])
@pytest.mark.parametrize("evo,n_open,n_lv,rune", STAR_TABLE)
def test_kit_respects_star_gating(cid, evo, n_open, n_lv, rune) -> None:
    """희귀도가 달라도 같은 표를 쓴다 — ★3인 최유희도 ★5에서 마지막 패시브가 열린다."""
    kit = resolve_kit(cid, Investment(level=60, evo=evo), 10, True)
    # 도장을 켜 달라고 해도 ★3 미만이면 일반 필살기
    assert kit.fatal.slot == ("sigil" if rune else "ultimate")
    got = [p.slot for p in kit.passives if p.slot.startswith("passive")]
    assert got == [f"passive{i}" for i in range(n_open)]
    # 도장이 잠긴 성급에서는 sigilPassive 가 절대 붙으면 안 된다.
    # (붙는지 여부는 캐릭터마다 다르다 — 'Sigil Passive:' 절이 있는 도장만 갈라져 나온다)
    if not rune:
        assert "sigilPassive" not in [p.slot for p in kit.passives]


def test_locked_passive_is_pinned_to_level_1() -> None:
    """★1에서는 p1 레벨을 올려 달라고 해도 무시돼야 한다 (★2부터 가능)."""
    def dmg(evo: int, p1: int) -> float:
        spec = CharSpec(KARAT, evo=evo, skill_levels={"passive1": p1})
        return run_team([spec], max_turn=6, force_proc=True, seed=0).total_damage

    assert dmg(1, 1) == dmg(1, 10)      # 레벨업 잠김 → 요청이 무시됨
    assert dmg(2, 1) != dmg(2, 10)      # 해금 → 요청이 반영됨


def test_per_slot_skill_level_applies() -> None:
    full = run_team([CharSpec(KARAT)], max_turn=6, force_proc=True, seed=0)
    weak = run_team([CharSpec(KARAT, skill_levels={"sigil": 1})],
                    max_turn=6, force_proc=True, seed=0)
    assert weak.total_damage < full.total_damage


def test_defaults_match_legacy_full_investment() -> None:
    """기본 CharSpec = 기존 하드코딩(Lv60·★5·Bond5·전 슬롯 10·도장 ON)."""
    legacy = resolve_kit(KARAT, Investment(level=60, evo=5, compat=5), 10, True)
    now = resolve_kit(KARAT, CharSpec(KARAT).investment(), CharSpec(KARAT).levels(), True)
    assert (now.atk, now.hp) == (legacy.atk, legacy.hp)
    assert [p.slot for p in now.passives] == [p.slot for p in legacy.passives]


def test_sigil_passive_appears_only_with_rune() -> None:
    """'Sigil Passive:' 절이 있는 캐릭터는 도장을 켰을 때만 그 패시브를 얻는다."""
    on = resolve_kit(KARAT, Investment(level=60, evo=5), 10, True)
    off = resolve_kit(KARAT, Investment(level=60, evo=5), 10, False)
    assert "sigilPassive" in [p.slot for p in on.passives]
    assert "sigilPassive" not in [p.slot for p in off.passives]


def test_auto_rotation_always_basic_attacks() -> None:
    """자동 로테의 반복 구간에는 평타가 있어야 한다.

    cd1 + 데미지 없는 필살기(이태호 도장 미해제)면 로테가 '궁궁|궁'이 되어 평타를
    한 번도 안 하는데, 그의 딜은 전부 '평타 시 발동' 조건이라 0딜이 됐다.
    """
    from woofia_sim.harness import auto_rotation
    from woofia_sim.kit import resolve_kit as rk

    inv = Investment(level=60, evo=5, compat=5)
    for cid in (KARAT, CHOI, 10423, 10421, 10417, 10410):
        for rune in (True, False):
            loop = auto_rotation(rk(cid, inv, 10, rune)).split("|")[-1]
            assert "평" in loop, f"{cid} rune={rune}: 반복 구간에 평타 없음 ({loop})"


def test_nondamaging_ult_char_deals_damage_on_auto() -> None:
    """이태호는 도장이 없어도 자동 설정만으로 딜이 나와야 한다."""
    auto = run_team([CharSpec(10423, evo=5, rune=False)],
                    max_turn=12, force_proc=True, seed=0).total_damage
    assert auto > 0
    # 필살기만 반복하면 여전히 0 — 위 값이 우연이 아님을 같이 못박는다
    spam = run_team([CharSpec(10423, evo=5, rune=False, rotation="궁궁|궁")],
                    max_turn=12, force_proc=True, seed=0).total_damage
    assert spam == 0


def test_pevo_cap_follows_star() -> None:
    assert [pevo_cap(e) for e in range(6)] == [4, 9, 14, 19, 24, 0]
    # 상한을 넘겨 요청해도 잘린다
    assert Investment(level=60, evo=2, pevo=99).normalized().pevo == 14
