"""적월의 코드B(10445) 메커니즘 가드 — 흡혈(아군 전체 부여) 중심. 데미지 절대값이 아닌 구조·비율만 본다.

정체성(XXL·불·보조): 필살(CD 3) = 아군 전체에 '데미지를 줄 때 데미지의 18%(도장 27%)만큼 자신 HP 회복'(1턴) 부여 후 2타.
파4 = 보통 공격 시 50%로 같은 흡혈 20%(2턴) 부여 · 아군 전체 HP≦50% 받는 치료량 +30% · HP≧90% ATK +18%.
파2 = 방어 시 【사냥의 달】(2턴) → 【수확자】 동안 공격 시 60% · 필살기 시 아군 전체 ATK +18%.

흡혈 규칙(해석 기록 mining/autonomy/interpretations/10445.json):
  · 흡혈률은 유닛 속성 하나로 합산(게임 TBonusProperty.LifeStealRate) — 필살 27% + 파4 20% = 47%      [data]
  · 같은 줄 재부여는 갱신(최대 중첩 1 = parms[7])                                                    [data]
  · 필살 묶음 순서 = 흡혈 부여(53686) → 2타 → 필살 자기 타격부터 흡혈                                 [data]
  · 직접 hit 만(지속 틱·열상 고정 데미지 제외) — 무명 흡혈과 같은 범위                                [precedent]
  · 받는 치료량%가 곱해진다 — 이 동료 킷의 유일한 회복이 흡혈이고 같은 킷에 '받는 치료량 +30%'가 있음 [precedent]
  · 최대 HP 에서 멈추고, 회복 공적은 흡혈을 부여한 동료 몫                                           [precedent]
"""
from __future__ import annotations

import pytest

from woofia_sim import kit as kit_mod
from woofia_sim.effects import BUFF, STAT_EX_EFFECT, STAT_HEAL_RECV, STAT_LIFESTEAL, TRIGGER
from woofia_sim.harness import CharSpec, run_team
from woofia_sim.kit import resolve_kit
from woofia_sim.stats import Investment

CRB = 10445
SHIN = 10402            # 신리랑 — CD 3 전사(흡혈·HP 조건과 무관한 받는 쪽 표본)
MUMYEONG = 10443        # 무명 — 자해 후 HP 게이트(≦75/50/30%)로 강해지는 동료
CODEB = 10306           # 코드B — 열상(받은 데미지마다 고정 데미지, _record_hit 을 거치지 않음)
P2 = "혈화 속 은신"
P4 = "혈족의 유희"
DEF_BEFORE_ULT = "평평방궁|평방궁"   # 기본 리듬 4·7·10 필살 + 바로 앞 턴 방어


def _run(team, **kw):
    kw.setdefault("n_dummies", 1)
    kw.setdefault("max_turn", 8)
    kw.setdefault("seed", 0)
    kw.setdefault("never_proc", not kw.get("force_proc", False))
    return run_team(team, **kw)


def _steals(res, actor=None):
    return [ev for ev in res.state.log if ev.detail and ev.detail.get("act") == "흡혈"
            and (actor is None or ev.actor == actor)]


def _walk(effects):
    for e in effects:
        yield e
        yield from _walk(e.sub_effects)


def _kit():
    return resolve_kit(CRB, Investment(level=60, evo=5), 10, True)


# ── 파싱 ────────────────────────────────────────────────────────────────────
def test_lifesteal_grants_parse_as_timed_ally_buffs():
    k = _kit()
    ult = [e for e in _walk(k.fatal.effects) if e.kind == BUFF and e.stat == STAT_LIFESTEAL]
    assert [(e.magnitude, e.duration, e.target) for e in ult] == [(27.0, 1, "self")], "도장 필살 27%·1턴"
    assert k.fatal.effects[0].condition == "grant_allies", "아군 전체에 부여 — 받은 동료 자신이 회복"
    p4 = next(p for p in k.passives if p.slot == "passive4")
    steal = [e for e in _walk(p4.effects) if e.kind == BUFF and e.stat == STAT_LIFESTEAL]
    assert [(e.magnitude, e.duration) for e in steal] == [(20.0, 2)]
    trig = p4.effects[0]
    assert (trig.condition, trig.chance) == ("on_basic_attack", 50.0)
    conds = sorted(e.condition for e in _walk(p4.effects) if e.kind == BUFF and e.condition)
    assert conds == ["self_hp:ge:90", "self_hp:le:50"], "HP 조건 두 줄 모두 라이브 판정"


def test_no_unparsed_lines():
    k = _kit()
    for sl in [k.basic, k.fatal, *k.passives]:
        assert not [e.raw for e in _walk(sl.effects) if e.kind == "UNPARSED"], sl.slot


# ── 흡혈 계산 ────────────────────────────────────────────────────────────────
def test_every_lifesteal_heal_follows_own_direct_hit():
    """흡혈 이벤트마다 바로 앞에 같은 동료의 직접 피해가 있고, 회복 = 피해 × 흡혈률 × (1 + 받는 치료량%)."""
    res = _run([CharSpec(CRB, position=1), CharSpec(SHIN, position=2), CharSpec(CODEB, position=3)],
               force_proc=True, enemy_hits=1, incoming_hp_pct=30)
    log = res.state.log
    steals = _steals(res)
    assert steals
    for ev in steals:
        i = log.index(ev)
        # 바로 앞의 흡혈이 아닌 이벤트 = 그 피해(코드B 10306 의 상시 흡혈 60% 줄이 사이에 낄 수 있다)
        prev = next(e for e in reversed(log[:i]) if not (e.detail and e.detail.get("act") == "흡혈"))
        assert prev.actor == ev.actor and prev.detail and prev.detail.get("atkTotal") is not None, ev.text
        assert prev.amount == pytest.approx(ev.detail["baseTotal"])
        d = ev.detail
        want = round(d["baseTotal"] * d["skillPct"] / 100 * max(0.0, 1 + d["healRecv"] / 100), 2)
        assert d["final"] == pytest.approx(want)


def test_ult_and_p4_rates_add():
    """보통 공격(T1~3, 파4 100%)으로 20%(2턴) → T4 도장 필살 27% 부여 → 그 턴 47%."""
    res = _run([CharSpec(CRB, position=1), CharSpec(SHIN, position=2)], force_proc=True)
    t4 = {ev.detail["skillPct"] for ev in _steals(res) if ev.turn == 4}
    assert t4 == {47.0}
    assert {ev.detail["skillPct"] for ev in _steals(res) if ev.turn in (2, 3)} == {20.0}


def test_ult_lifesteal_lasts_one_turn():
    """확률 0%(파4 없음): 흡혈은 필살 턴(4·7)에만, 비율 27%."""
    res = _run([CharSpec(CRB, position=1), CharSpec(SHIN, position=2)], never_proc=True)
    assert sorted({ev.turn for ev in _steals(res)}) == [4, 7]
    assert {ev.detail["skillPct"] for ev in _steals(res)} == {27.0}


def test_ult_own_hits_already_steal():
    """필살 묶음은 흡혈 부여가 먼저 — 코드B 자신의 필살 2타도 흡혈한다."""
    res = _run([CharSpec(CRB, position=1)], never_proc=True, enemy_hits=1, incoming_hp_pct=10)
    me = res.state.allies[0].name
    ult_hits = [ev for ev in res.state.log if ev.turn == 4 and ev.actor == me and ev.detail
                and ev.detail.get("act") == "필살"]
    assert len(ult_hits) == 2
    assert len([ev for ev in _steals(res, me) if ev.turn == 4]) >= 2


def test_heal_recv_only_at_or_below_half_hp():
    res = _run([CharSpec(CRB, position=1), CharSpec(SHIN, position=2)], never_proc=True,
               enemy_hits=1, incoming_hp_pct=30)
    by_name = {u.name: u for u in res.state.allies}
    seen = set()
    for ev in _steals(res):
        hp_before = float(ev.text.split("HP ")[1].split("→")[0].replace(",", ""))
        low = hp_before / by_name[ev.actor].max_hp * 100 <= 50
        assert ev.detail["healRecv"] == (30.0 if low else 0.0), ev.text
        seen.add(low)
    assert seen == {True, False}, "두 경우 모두 나와야 의미 있는 검사"


def test_hp_ge90_atk_buff_is_live():
    """파4 '아군 전체 HP≧90% ATK +18%': 풀 HP 타격엔 들어가고, HP 가 90% 아래인 타격엔 빠진다."""
    res = _run([CharSpec(CRB, position=1), CharSpec(SHIN, position=2)], never_proc=True,
               enemy_hits=1, incoming_hp_pct=30)
    shin = next(u for u in res.state.allies if u.name != res.state.allies[0].name)
    hits = [ev for ev in res.state.log if ev.actor == shin.name and ev.detail and ev.detail.get("atk") is not None]
    has = [any(c.get("cond") == "HP≧90%" and c["v"] == 18 for c in ev.detail["atk"]) for ev in hits]
    assert has[0] is True, "T1 첫 타격(풀 HP)"
    assert False in has, "피격 뒤 HP 90% 미만 타격"


def test_heal_capped_and_credited_to_grantor():
    res = _run([CharSpec(CRB, position=1), CharSpec(SHIN, position=2)], force_proc=True,
               enemy_hits=1, incoming_hp_pct=20)
    crb, shin = res.state.allies[0], res.state.allies[1]
    assert crb.healing_done > 0
    assert shin.healing_done == 0, "신리랑의 흡혈 회복 공적은 부여자(적월의 코드B) 몫"
    for u in res.state.allies:
        assert u.hp <= u.max_hp + 1e-6
    for ev in _steals(res):
        after = float(ev.text.split("→")[-1].rstrip(")").replace(",", ""))
        assert after <= max(u.max_hp for u in res.state.allies) + 1e-6


def test_laceration_flat_damage_does_not_steal():
    """코드B 열상 고정 데미지는 _record_hit 을 거치지 않는다 → 흡혈 이벤트 수 = 흡혈률이 있는 직접 hit 수."""
    res = _run([CharSpec(CRB, position=1), CharSpec(CODEB, position=2), CharSpec(SHIN, position=3)], force_proc=True)
    log = res.state.log
    lacer = [i for i, ev in enumerate(log) if "(고정 데미지)" in ev.text]
    assert lacer, "열상이 실제로 터진 시나리오여야 한다"
    for i in lacer:
        nxt = log[i + 1] if i + 1 < len(log) else None
        assert not (nxt and nxt.detail and nxt.detail.get("act") == "흡혈"
                    and nxt.detail["baseTotal"] == pytest.approx(log[i].amount)), log[i].text


# ── 수확자(파2) ─────────────────────────────────────────────────────────────
def test_reaper_only_after_defend():
    res = _run([CharSpec(CRB, position=1, rotation=DEF_BEFORE_ULT)], never_proc=True)
    me = res.state.allies[0].name
    reaper = [ev.turn for ev in res.state.log if ev.actor == me and ev.detail
              and ev.detail.get("skillName") == P2 and ev.detail.get("skillPct") == 60]
    assert reaper == [4, 7], "방어 3·6턴 → 사냥의 달(2턴) 안의 4·7턴 필살에서 1회씩"
    plain = _run([CharSpec(CRB, position=1)], never_proc=True)
    assert not [ev for ev in plain.state.log if ev.detail and ev.detail.get("skillName") == P2
                and ev.detail.get("skillPct") == 60], "방어하지 않으면 수확자 없음"


def test_reaper_ex_effect_clause_not_applied_by_default():
    """해석 10445-P2-reaper-data: 설명의 '필살기 효과 +20.7%'는 원본 트리에서 고아 노드 → 계산하지 않는다."""
    k = _kit()
    p2 = next(p for p in k.passives if p.slot == "passive2")
    assert not [e for e in _walk(p2.effects) if e.kind == BUFF and e.stat == STAT_EX_EFFECT]
    on_ex = [e for e in p2.effects if e.kind == TRIGGER and e.condition == "on_ex"]
    assert len(on_ex) == 1 and on_ex[0].stack_name == "Hunter's Moon"


def test_reaper_text_switch(monkeypatch):
    monkeypatch.setattr(kit_mod, "FOLLOW_DATA_TREE", False)
    p2 = next(p for p in _kit().passives if p.slot == "passive2")
    ex = [e for e in _walk(p2.effects) if e.kind == BUFF and e.stat == STAT_EX_EFFECT]
    assert [e.magnitude for e in ex] == [20.7], "스위치를 끄면 설명문 그대로"


# ── 동료 상호작용 ───────────────────────────────────────────────────────────
def test_mumyeong_hp_refilled_by_lifesteal():
    """안티: 무명은 자해 후 낮은 HP 에서 강해지는데, 흡혈이 HP 를 다시 채운다 → 무명 타격 시점 평균 HP% 가 오른다."""
    def avg_hp_pct(partner):
        res = _run([CharSpec(MUMYEONG, position=1), CharSpec(partner, position=2)], force_proc=True, max_turn=10)
        mu = res.state.allies[0]
        vals = []
        for ev in res.state.log:
            if ev.actor == mu.name and ev.detail and ev.detail.get("kind") == "selfdmg":
                vals.append(ev.detail["hpPct"])
        return mu.hp / mu.max_hp, vals
    with_crb, _ = avg_hp_pct(CRB)
    without, _ = avg_hp_pct(SHIN)
    assert with_crb > without


def test_heal_recv_stat_is_live_condition_not_permanent():
    res = _run([CharSpec(CRB, position=1), CharSpec(SHIN, position=2)], never_proc=True)
    shin = res.state.allies[1]
    assert shin.hp == shin.max_hp
    assert shin._sum(STAT_HEAL_RECV) == 0, "풀 HP 에서는 받는 치료량 증가 꺼짐"
