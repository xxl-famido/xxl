"""이세계의 검 무명(10443) 메커니즘 가드 — 데미지 절대값이 아닌 '자해·HP게이트·스택·방어반복'만 본다.

정체성: 필살 자해(현재HP 40% 실뎀)로 저체력에 진입 → HP≦75/50/30% 글래스캐논 효과 순차 개방.
불굴(Fearless)·봉망(Sharpness) 두 스택(평타+1, 최대5)을 방어로 소모해 다단힐/다단히트.
"""
from __future__ import annotations

from woofia_sim.harness import CharSpec, run_team

MUMEI = 10443


def _txt(ev):
    return getattr(ev, "text", "") or getattr(ev, "msg", "")


def _run(rotation=None, turns=12, **kw):
    kw.setdefault("n_dummies", 1)
    kw.setdefault("enemy_hits", 0)
    kw.setdefault("force_proc", True)
    kw.setdefault("seed", 0)
    return run_team([CharSpec(MUMEI, position=1, rotation=rotation)], max_turn=turns, **kw)


def test_ult_self_damage_lowers_hp_bypassing_barrier():
    """필살 자해 = 현재HP 40% 실뎀. 배리어를 우회해 HP를 직접 깎아야(T1 필살 후 정확히 60%)."""
    res = _run(rotation="궁|평", turns=1)
    u = res.state.allies[0]
    assert abs(u.hp / u.max_hp - 0.60) < 1e-6, f"자해 후 HP {u.hp / u.max_hp:.3f} (0.60 기대)"
    assert any("실제 데미지" in _txt(ev) for ev in res.state.log if ev.actor_id == MUMEI), "자해 로그 없음"
    # 자해 이벤트는 차트 데미지 집계에서 제외되도록 kind 태그 + amount 0
    ev = next(ev for ev in res.state.log if (ev.detail or {}).get("kind") == "selfdmg")
    assert ev.amount == 0


def test_hp_gates_open_in_order():
    """자동 로테(궁 1·5·9): 60%→36%→21.6%. ≦50%에서 평타뎀+30%, ≦30%에서 흡혈이 순서대로 열려야."""
    res = _run(turns=11)
    basics = [ev for ev in res.state.log if ev.actor_id == MUMEI and ev.action_kind == "보통공격"
              and (ev.detail or {}).get("skillName") == "참격세" and ev.amount > 0]
    def basic_eff(turn):
        ev = next(e for e in basics if e.turn == turn)
        return [c["v"] for c in (ev.detail or {}).get("eff", [])]
    assert 30.0 not in basic_eff(2), "HP 60%인데 ≦50% 평타뎀+30%가 열림"
    assert 30.0 in basic_eff(6), "HP 36%인데 ≦50% 평타뎀+30%가 안 열림"
    steals = [ev for ev in res.state.log if ev.actor_id == MUMEI and "흡혈" in _txt(ev)]
    assert steals and min(ev.turn for ev in steals) >= 9, "흡혈이 HP≦30%(T9 이후) 전에 발동"
    assert all(ev.turn <= 10 for ev in steals), "회복으로 30%를 넘긴 뒤에도 흡혈이 계속됨(라이브 게이트 실패)"


def test_stacks_cap_at_five():
    res = _run(rotation="평|평", turns=8)
    u = res.state.allies[0]
    assert u.stacks.get("Fearless", 0) == 5 and u.stacks.get("Sharpness", 0) == 5


def test_defend_repeats_by_stacks_and_consumes():
    """불굴5·봉망2로 방어 → 75%ATK 힐 ×5 + 불굴 제거, 40% 히트 ×2 + 봉망 제거, 행동 회복(불굴=5)."""
    res = _run(rotation="궁평평방|평", turns=4)
    t4 = [ev for ev in res.state.log if ev.actor_id == MUMEI and ev.turn == 4]
    heals = [ev for ev in t4 if "힐 →" in _txt(ev) and ev.action_kind == "방어"]
    hits = [ev for ev in t4 if ev.action_kind == "방어" and ev.amount > 0 and "힐" not in _txt(ev)
            and (ev.detail or {}).get("skillPct") == 40.0]
    assert len(heals) == 5, f"불굴 5중첩 방어 힐이 {len(heals)}회"
    assert len(hits) == 2, f"봉망 2중첩 방어 히트가 {len(hits)}회"
    assert any("불굴 제거" in _txt(ev) for ev in t4) and any("봉망 제거" in _txt(ev) for ev in t4)
    assert any("추가 행동 +1" in _txt(ev) for ev in t4), "불굴=5 방어 시 행동 회복이 없음"
    assert any(ev.action_kind == "보통공격" for ev in t4), "회복한 행동(평타)이 같은 턴에 실행되지 않음"
    u = res.state.allies[0]
    assert u.stacks.get("Fearless", 0) < 5 and u.stacks.get("Sharpness", 0) < 2


def test_fearless_raises_own_damage_taken_per_stack():
    """피격모드: 불굴 1중첩당 받뎀 +7% (표시·배율 모두)."""
    res = _run(rotation="평|평", turns=3, enemy_hits=1, incoming_hp_pct=10)
    inc = [ev for ev in res.state.log if (ev.detail or {}).get("kind") == "incoming"]
    assert len(inc) == 3
    for n, ev in enumerate(inc, start=1):
        d = ev.detail
        assert abs(d["dmg"] / d["raw"] - (1 + 0.07 * n)) < 1e-6, f"T{n} 받뎀 배율 {d['dmg'] / d['raw']:.3f}"
        assert any(c.get("cond") == f"불굴×{n}" and c.get("v") == 7.0 * n for c in d["taken"])
