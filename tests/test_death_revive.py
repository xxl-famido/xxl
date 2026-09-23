"""전투불능(사망/이탈) + 기리안(10415) 도장 부활 — v1.8.1.

규칙(사용자 확정): 피격/턴 피해로 HP 0 = 전투불능·이탈(하한 제거, allow_death 기본 True).
사망 시 버프·배리어·스택·조롱 초기화(구독=고유 패시브는 유지 → 부활 후 기능 복귀).
기리안 도장: 필살 발동 시 X% 확률로 사망한 랜덤 아군 1명 부활 + 최대HP 25% 회복.
allow_death=False면 종전대로 HP 1 하한(사망 없음) — 회귀 골든 호환.
"""
from __future__ import annotations

from woofia_sim.harness import CharSpec, run_team

MUMEI, KYRIAN, KARAT, DARAWAN = 10443, 10415, 10425, 10428


def _kinds(res, kind):
    return [ev for ev in res.state.log if (getattr(ev, "detail", None) or {}).get("kind") == kind]


def test_turn_damage_kills_when_hp_exhausted():
    """턴 피해 40%/턴이면 힐 없는 아군은 HP 0으로 전투불능 → 이탈(이후 행동 없음)."""
    td = [40.0] * 12
    res = run_team([CharSpec(KARAT, position=1)], n_dummies=1, max_turn=12, seed=1,
                   force_proc=True, turn_damage=td, allow_death=True)
    u = res.state.allies[0]
    assert not u.alive and u.hp == 0.0 and u.died, "HP 소진했는데 사망 안 함"
    assert _kinds(res, "death"), "전투불능 로그 없음"


def test_allow_death_false_keeps_floor_of_one():
    """allow_death=False면 종전대로 HP 1 하한 — 죽지 않고 계속 행동(회귀 골든 호환)."""
    td = [40.0] * 12
    res = run_team([CharSpec(KARAT, position=1)], n_dummies=1, max_turn=12, seed=1,
                   force_proc=True, turn_damage=td, allow_death=False)
    u = res.state.allies[0]
    assert u.alive and u.hp >= 1.0, f"1 하한이 깨짐 (hp={u.hp})"
    assert not _kinds(res, "death"), "사망 비활성인데 전투불능 발생"


def test_death_clears_buffs_and_barrier():
    """사망하면 배리어·버프·스택이 비워진다(임시 전투 상태 제거)."""
    td = [45.0] * 10
    res = run_team([CharSpec(DARAWAN, position=1)], n_dummies=1, max_turn=10, seed=2,
                   force_proc=True, turn_damage=td, allow_death=True)
    u = res.state.allies[0]
    if not u.alive:
        assert u.barrier == 0 and not u.buffs and not u.stacks, "사망 후 상태가 남아 있음"


def test_kyrian_revives_dead_ally_at_ceiling():
    """force_proc(천장)면 기리안 필살이 사망 아군을 부활시키고 HP 25%로 복귀."""
    td = [30.0] * 15
    res = run_team([CharSpec(MUMEI, position=1), CharSpec(KYRIAN, position=2),
                    CharSpec(KARAT, position=3), CharSpec(DARAWAN, position=4)],
                   n_dummies=1, max_turn=15, seed=3, force_proc=True,
                   turn_damage=td, allow_death=True)
    revives = [ev for ev in _kinds(res, "revive") if not (getattr(ev, "detail", None) or {}).get("noTarget")]
    assert revives, "천장인데 부활이 한 번도 안 일어남"
    d = revives[0].detail
    assert abs(d["hpPct"] - 25.0) < 1e-6, f"부활 HP% {d['hpPct']} (25 기대)"


def test_no_revive_at_floor():
    """never_proc(바닥)면 기리안 부활(확률 50%)은 절대 안 터진다."""
    td = [30.0] * 15
    res = run_team([CharSpec(MUMEI, position=1), CharSpec(KYRIAN, position=2),
                    CharSpec(KARAT, position=3), CharSpec(DARAWAN, position=4)],
                   n_dummies=1, max_turn=15, seed=3, never_proc=True,
                   turn_damage=td, allow_death=True)
    revives = [ev for ev in _kinds(res, "revive") if not (getattr(ev, "detail", None) or {}).get("noTarget")]
    assert not revives, "바닥값인데 부활이 발생"


def test_revive_resets_died_flag_for_redeath():
    """부활 뒤 다시 죽으면 died가 재설정돼 재사망도 집계된다(부활>1회 = 재사망 발생)."""
    td = [30.0] * 15
    res = run_team([CharSpec(MUMEI, position=1), CharSpec(KYRIAN, position=2),
                    CharSpec(KARAT, position=3), CharSpec(DARAWAN, position=4)],
                   n_dummies=1, max_turn=15, seed=3, force_proc=True,
                   turn_damage=td, allow_death=True)
    deaths = _kinds(res, "death")
    revives = [ev for ev in _kinds(res, "revive") if not (getattr(ev, "detail", None) or {}).get("noTarget")]
    # 부활이 여러 번 = 같은 자리를 되살리고 또 죽였다는 뜻 → 재사망 로그도 여러 번
    if len(revives) >= 2:
        assert len(deaths) >= 2, "재부활은 있는데 재사망 집계가 없음(died 리셋 실패)"
