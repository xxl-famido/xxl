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


# ── 턴 피해 대상 수(hits) + HP% 우선 타게팅 (v1.8.2) ──

def _td_hit_counts(res, pct):
    from collections import defaultdict
    per = defaultdict(list)
    for ev in res.state.log:
        if (getattr(ev, "text", "") or "") == f"턴 피해 {pct:g}%":
            per[ev.turn].append(ev.actor)
    return per


def test_turn_damage_hits_all_by_default():
    """hits=0(기본)이면 생존 아군 전체가 매 턴 맞는다."""
    team = [CharSpec(KARAT, position=1), CharSpec(DARAWAN, position=2), CharSpec(10421, position=3)]
    res = run_team(team, n_dummies=1, max_turn=4, seed=1, force_proc=True,
                   turn_damage=[15] * 4, turn_damage_hits=0, allow_death=True)
    per = _td_hit_counts(res, 15)
    assert per and all(len(v) == 3 for v in per.values()), f"전체 타격 아님: {[len(v) for v in per.values()]}"


def test_turn_damage_hits_limits_count():
    """hits=N이면 매 턴 정확히 N명만 맞는다."""
    team = [CharSpec(KARAT, position=1), CharSpec(DARAWAN, position=2),
            CharSpec(10421, position=3), CharSpec(10425, position=4)]
    for n in (1, 2):
        res = run_team(team, n_dummies=1, max_turn=4, seed=1, force_proc=True,
                       turn_damage=[15] * 4, turn_damage_hits=n, allow_death=True)
        per = _td_hit_counts(res, 15)
        assert per and all(len(v) == n for v in per.values()), f"hits={n} 인데 타격 수 {[len(v) for v in per.values()]}"


def test_turn_damage_targets_highest_hp_pct_first():
    """hits<전체면 현재 HP% 높은 아군 우선 — 자해로 최저 HP%인 무명은 hits=1에서 안 맞는다."""
    team = [CharSpec(MUMEI, position=1, rotation="궁궁궁궁궁궁"),
            CharSpec(KARAT, position=2), CharSpec(DARAWAN, position=3)]
    res = run_team(team, n_dummies=1, max_turn=6, seed=1, force_proc=True,
                   turn_damage=[15] * 6, turn_damage_hits=1, allow_death=True)
    per = _td_hit_counts(res, 15)
    hit_mumei = sum(1 for tgts in per.values() for a in tgts if a == res.state.allies[0].name)
    assert hit_mumei == 0, f"자해로 최저 HP%인 무명이 hits=1에서 {hit_mumei}회 맞음(0 기대)"
