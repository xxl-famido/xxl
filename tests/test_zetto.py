"""제토(10441) 메커니즘 가드 — 스탯(placeholder) 무관, 구조적 회귀 방지.

레드팀 검토가 요구한 안전망: 이 검사들은 절대 데미지값이 아니라 '턴 타이밍·채널·게이트'만 보므로
baseATK/HP·element가 최종 확정값으로 바뀌어도 그대로 유효하다.
"""
from __future__ import annotations

from woofia_sim.engine import STAT_EX_EFFECT
from woofia_sim.harness import CharSpec, run_team

ZETTO = 10441
HOLD = "평" * 26 + "궁|평"   # 26평 램프 후 27턴 필살, 이후 평


def _fatal_turns(res, cid=ZETTO):
    return sorted({ev.turn for ev in res.state.log
                   if ev.actor_id == cid and ev.action_kind == "필살기"})


def test_hold_rotation_fires_late_not_turn1():
    """홀드 로테이션이면 필살은 램프 뒤(27턴)에 한 번만 — 절대 1턴이 아니어야."""
    res = run_team([CharSpec(ZETTO, position=1, rotation=HOLD)],
                   n_dummies=1, max_turn=30, enemy_hits=0, force_proc=True, seed=0)
    ft = _fatal_turns(res)
    assert ft == [27], f"필살 타이밍 이상: {ft}"
    assert 1 not in ft, "필살이 1턴에 발동됨(램프 0) — 홀드 실패"


def test_ex_effect_ramps_near_cap_at_ult():
    """필살 hit의 EX효과 채널이 캡 근처(>1000%)까지 쌓여 필살에 적용돼야."""
    res = run_team([CharSpec(ZETTO, position=1, rotation=HOLD)],
                   n_dummies=1, max_turn=30, enemy_hits=0, force_proc=True, seed=0)
    ult = [ev for ev in res.state.log if ev.actor_id == ZETTO
           and ev.action_kind == "필살기" and (ev.detail or {}).get("effLabel") == "EX효과"]
    assert ult, "필살 hit에 EX효과 채널이 없음"
    ex = sum(c["v"] for c in ult[0].detail.get("eff", []))
    assert ex > 1000, f"EX효과 램프 미달: {ex}% (캡 근처 기대)"


def test_ex_effect_monotonic_non_decreasing():
    """무지속 램프 스택이라 EX효과 _sum은 평타를 거치며 절대 감소하지 않아야."""
    prev = -1
    for n in range(2, 15):
        res = run_team([CharSpec(ZETTO, position=1, rotation=HOLD)],
                       n_dummies=1, max_turn=n, enemy_hits=0, force_proc=True, seed=0)
        cur = res.state.allies[0]._sum(STAT_EX_EFFECT)
        assert cur >= prev, f"EX효과가 감소함(T{n}): {prev} -> {cur}"
        prev = cur


def test_cd_immune_blocks_feeder_and_holds():
    """임부언(CD 피더) 동반이어도 제토는 fed-carry로 강제 필살되지 않고 홀드 유지."""
    res = run_team([CharSpec(ZETTO, position=1, rotation=HOLD), CharSpec(10410, position=2)],
                   n_dummies=1, max_turn=30, enemy_hits=0, force_proc=True, seed=0)
    ft = _fatal_turns(res)
    assert ft == [27], f"cd_immune 실패 — 필살 타이밍: {ft}"
    assert res.state.allies[0].cd_immune is True


def test_self_cd_minus30_still_works():
    """cd_immune이어도 passive1의 '1턴 자기 CD-30'은 허용 → 원하면 1턴에도 사용 가능."""
    res = run_team([CharSpec(ZETTO, position=1, rotation="궁|평")],
                   n_dummies=1, max_turn=5, enemy_hits=0, force_proc=True, seed=0)
    assert 1 in _fatal_turns(res), "자기 CD-30이 막혀 1턴 필살 불가"


def test_type_advantage_amplifies_only_on_advantage():
    """속성상성 추가뎀(+30%)은 우위일 때만: 중립 더미=1.0, 우위 더미=1.65(=1+0.5*1.3)."""
    def last_elem(dummy_el):
        res = run_team([CharSpec(ZETTO, position=1, rotation="평" * 10 + "|평")],
                       n_dummies=1, max_turn=12, enemy_hits=0, force_proc=True, seed=0,
                       dummy_element=dummy_el)
        hits = [ev for ev in res.state.log if ev.actor_id == ZETTO
                and (ev.detail or {}).get("elemMult") is not None and ev.amount > 0]
        return hits[-1].detail["elemMult"] if hits else None
    assert last_elem(0) == 1.0, "중립 더미에 상성 추가뎀이 새어나옴"
    # 제토=수속성(2) → 불(1) 상대 우위(×1.5). Spotlight≥2면 상성 보너스(+50%)에 +30%p → ×1.8.
    assert abs(last_elem(1) - 1.8) < 1e-6, "상성 우위 시 +30%p 가산이 안 됨"


def test_post_ult_followup_is_basic_not_ex_channel():
    """passive4 40% 추가타는 평타 채널이어야(EX효과 아님) — 채널 누수 시 딜 폭증."""
    res = run_team([CharSpec(ZETTO, position=1, rotation=HOLD)],
                   n_dummies=1, max_turn=30, enemy_hits=0, force_proc=True, seed=0)
    # 필살(27) 이후 제토 데미지 hit 중 EX효과 라벨이 붙은 평타/발동이 없어야
    for ev in res.state.log:
        if ev.actor_id == ZETTO and ev.turn > 27 and ev.detail and ev.amount > 0:
            if ev.action_kind != "필살기":
                assert ev.detail.get("effLabel") != "EX효과", \
                    f"T{ev.turn} 추가타에 EX효과 누수: {ev.detail.get('effLabel')}"
