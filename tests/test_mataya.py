"""오야마다 마타야(10442) 메커니즘 가드 — 데미지 절대값이 아닌 '스택/채널/타이밍/게이트'만 본다.

마타야 정체성: 목표물 '파세'(Kuzushi) 디버프를 쌓아(평타+1·반격+2·도장+3, 최대 7) 필살기 효과를
그 중첩 수에 비례해(+20.25%/중첩) 증폭 → 필살 폭발. 방어 시 '반격 자세'(조롱+피격 반격).
스탯/속성이 확정값이라 값 자체가 흔들려도 아래 구조 검사는 유효하다.
"""
from __future__ import annotations

from woofia_sim.harness import CharSpec, run_team

MATAYA = 10442


def _dummy(res):
    return res.state.enemies[0]


def _hits(res, kind=None):
    return [ev for ev in res.state.log
            if ev.actor_id == MATAYA and ev.amount > 0
            and (kind is None or ev.action_kind == kind)]


def test_kuzushi_never_exceeds_cap():
    """파세는 최대 7중첩 — 평타(+1)를 오래 쌓아도 절대 7을 넘지 않아야."""
    res = run_team([CharSpec(MATAYA, position=1, rotation="평|평")],
                   n_dummies=1, max_turn=15, enemy_hits=0, force_proc=True, seed=0)
    # 매 턴 스냅샷이 없으므로 최종값으로 대표 검사(평타만 하면 단조 증가 후 7에서 고정)
    assert _dummy(res).stacks.get("Kuzushi", 0) <= 7


def test_ult_ex_effect_scales_with_target_kuzushi():
    """필살 hit의 EX효과 채널이 목표물 파세 중첩수에 비례(7중첩 ≈ 141.75%)로 실려야."""
    res = run_team([CharSpec(MATAYA, position=1, rotation="평" * 7 + "궁|평")],
                   n_dummies=1, max_turn=8, enemy_hits=0, force_proc=True, seed=0)
    ult = [ev for ev in _hits(res, "필살기")
           if (ev.detail or {}).get("effLabel") == "EX효과"]
    assert ult, "필살에 EX효과 채널이 없음"
    exsum = sum(c["v"] for c in ult[0].detail.get("eff", []))
    assert exsum > 100, f"목표물 파세 기반 EX효과 미달: {exsum}% (7중첩≈141.75 기대)"


def test_ult_scales_more_with_more_kuzushi():
    """파세를 더 쌓고 친 필살이 덜 쌓고 친 필살보다 커야(목표물 스택 스케일 단조성)."""
    def ult_dmg(ramp):
        res = run_team([CharSpec(MATAYA, position=1, rotation="평" * ramp + "궁|평")],
                       n_dummies=1, max_turn=ramp + 2, enemy_hits=0, force_proc=True, seed=0)
        u = _hits(res, "필살기")
        return u[0].amount if u else 0.0
    assert ult_dmg(6) > ult_dmg(2) > 0, "파세 중첩이 많을수록 필살이 커지지 않음"


def test_ult_removes_kuzushi():
    """필살(한판승)은 목표물 파세를 제거 → 필살 직후엔 램프 정점보다 크게 줄어야."""
    res = run_team([CharSpec(MATAYA, position=1, rotation="평" * 7 + "궁|평")],
                   n_dummies=1, max_turn=8, enemy_hits=0, force_proc=True, seed=0)
    # 7턴 평타로 7까지 올린 뒤 8턴 필살로 제거 → 도장(+3) 있으면 3, 없으면 0. 어느 쪽이든 <7.
    assert _dummy(res).stacks.get("Kuzushi", 0) < 7, "필살 후 파세가 제거되지 않음"


def test_deukse_gates_on_three_target_stacks():
    """득세(주는딜+20%)는 목표물 파세≧3에서만 — 3중첩 이후 평타가 그 전보다 세야(같은 채널 증가)."""
    res = run_team([CharSpec(MATAYA, position=1, rotation="평|평")],
                   n_dummies=1, max_turn=6, enemy_hits=0, force_proc=True, seed=0)
    basics = _hits(res, "보통공격")
    # 파세는 평타마다 +1: T1=1,T2=2,T3=3(이때부터 득세)... 초반(파세<3) < 후반(파세≥3)
    assert basics[0].amount < basics[-1].amount, "득세 게이트(파세≥3)가 주는딜을 올리지 않음"
    # 득세는 목표물 조건이라 분해표시(dealt)에 조건 라벨이 실려야
    assert any(d.get("cond") for d in (basics[-1].detail or {}).get("dealt", [])), \
        "득세가 목표물 조건부(COND_DMG)로 실리지 않음"


def test_counter_only_in_jigotai_and_once_per_defend():
    """반격 자세: 방어한 턴에만 피격 시 반격 1회. 비방어 턴엔 반격 없음."""
    res = run_team([CharSpec(MATAYA, position=1, rotation="평방평|평")],
                   n_dummies=1, max_turn=3, enemy_hits=1, incoming_hp_pct=30,
                   force_proc=True, seed=0)
    def counters_on(turn):
        # 피격 시 반격 = actor 마타야, action_kind 발동/피격의 데미지 hit
        return [ev for ev in res.state.log
                if ev.actor_id == MATAYA and ev.turn == turn and ev.amount > 0
                and ev.action_kind not in ("보통공격", "필살기")]
    assert not counters_on(1), "방어하지 않은 T1에 반격이 발동함"
    assert counters_on(2), "방어한 T2에 반격이 발동하지 않음"
    assert len(counters_on(2)) == 1, "반격이 방어 1회당 1번을 넘어 발동함(자세 해제 실패)"


def test_jigotai_taunt_clears_with_counter():
    """반격 자세는 한 대 맞으면 해제되고, 그 안의 조롱도 함께 꺼져야 한다(반격딜도 1회로 끝).
    같은 방어 턴에 '조롱 부여'와 '조롱 해제'가 모두 로그에 남는지로 검사(피격이 자세를 끝냄)."""
    res = run_team([CharSpec(MATAYA, position=1, rotation="방|평"), CharSpec(10421, position=2)],
                   n_dummies=1, max_turn=1, enemy_hits=3, incoming_hp_pct=20, force_proc=True, seed=1)
    def txt(ev):
        return getattr(ev, "text", "") or getattr(ev, "msg", "")
    t1 = [ev for ev in res.state.log if ev.turn == 1 and ev.actor_id == MATAYA]
    assert any("조롱" in txt(ev) and "해제" not in txt(ev) for ev in t1), "방어 시 조롱 부여 로그 없음"
    assert any("조롱 해제" in txt(ev) for ev in t1), "피격 후 조롱이 해제되지 않음(자세만 꺼지고 도발이 남음)"
    # 반격 데미지는 방어 1회당 1번만
    counters = [ev for ev in t1 if ev.amount > 0 and ev.action_kind not in ("보통공격", "필살기")]
    assert len(counters) == 1, f"반격이 1회를 넘어 발동: {len(counters)}"
    assert res.state.allies[0].taunt_turns == 0, "턴 종료 시 조롱이 남아있음"


def test_defend_grants_taunt():
    """방어 시 반격 자세 진입 = 조롱 부여(적 어그로 유도). 1턴 조롱이라 종료 시점엔 이미
    소진되므로 taunt_turns 대신 방어 턴에 조롱 부여 로그가 남는지로 검사한다."""
    res = run_team([CharSpec(MATAYA, position=1, rotation="방|평")],
                   n_dummies=1, max_turn=2, enemy_hits=0, force_proc=True, seed=0)
    granted = [ev for ev in res.state.log if ev.actor_id == MATAYA and ev.turn == 1
               and "조롱" in (getattr(ev, "text", "") or getattr(ev, "msg", ""))]
    assert granted, "방어 시 조롱이 부여되지 않음"


def test_base_atk_passive_raises_atk():
    """고강도 훈련(기초 ATK+15%)이 실제 유효 ATK에 반영돼야(기초 ATK 채널)."""
    from woofia_sim.kit import resolve_kit
    from woofia_sim.stats import Investment
    inv = Investment(level=60, evo=5, pevo=0, compat=5)
    k = resolve_kit(MATAYA, investment=inv, rune=True)
    # passive3 미포함(가상) 대비는 어려우니, 기초ATK% 버프가 킷에 존재하는지 구조로 확인
    from woofia_sim.effects import STAT_BASE_ATK
    p3 = next(p for p in k.passives if p.slot == "passive3")
    assert any(e.stat == STAT_BASE_ATK and e.magnitude > 0 for e in p3.effects), \
        "고강도 훈련 성과의 기초 ATK% 버프가 없음"
