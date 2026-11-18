"""델라크로이(10448) 메커니즘 가드 — 방화선 → 필살기 시 받는 배리어·치료 · 용의 숨결 가호 · 배리어 비례 반격 · 수호 3명 큰 피격 감소.
데미지 절대값이 아닌 구조·비율만 본다. 가드 값은 원문(Lv10)에서 손으로 계산했다.

정체성(XXL·불·수호): 필살(CD 3) = 아군 전체 배리어(최대 HP 15% / 도장 20%) + 공격받을 시 자기 배리어 12% 반격.
해석 기록 mining/autonomy/interpretations/10448.json:
  · 방화선 = 보통 공격마다 +1(최대 10) · 불속성 3명 이상이면 다른 아군의 공격마다 델라크로이에게 +1                [data]
  · 필살기 시 '중첩 수만큼' = 필살기 시작 때 방화선 수(같은 필살기의 '제거' 줄보다 먼저 센다)                     [precedent]
  · 받는 배리어·치료 +3% = 중첩마다 개별 3턴, 그 필살기 자체 배리어엔 안 붙음(본문 먼저)                            [precedent]
  · 용의 숨결 가호(4턴) 동안: 필살기 시 방화선 5중첩(제거 뒤) · 매 턴 시작 아군 전체 배리어 12%(1턴)                [data/precedent]
  · 반격 = 공격받은 아군 자신의 배리어(피격 흡수 뒤) 12%, 공적 = 그 아군                                             [precedent]
  · 수호 3명 이상: 이번 피격 데미지 > 자신 최대 HP 10% 이면 −20%(다른 받는 데미지와 별도 곱)                        [data/assumed]
"""
from __future__ import annotations

from woofia_sim.effects import BUFF, STAT_BAR_RECV, STAT_DMG_TAKEN_BIG, STAT_HEAL_RECV, TRIGGER
from woofia_sim.harness import CharSpec, run_team
from woofia_sim.kit import resolve_kit
from woofia_sim.stats import Investment

DELA = 10448
BARD = 10413       # 바드 — 불·전사(불속성 수 채우기)
DARAWAN = 10438    # 다라완 — 불·수호
OREM = 10419       # 오렘 — 물·수호
CROC = 10435       # 크로크라인 — 불·치유(치료 → 생명 방어선 배리어)
IMBUEON = 10410    # 임부언 — 1번 자리 캐리 필살 CD −3 + 추가 행동(fed carry)
NAME = "델라크로이"
P1 = "전선 지원"
P2 = "화룡의 역린"
P4 = "생명 방어선"
ULT = "철벽 방어선"


def _walk(effects):
    for e in effects:
        yield e
        yield from _walk(e.sub_effects)


def _kit(rune: bool = True):
    return resolve_kit(DELA, Investment(level=60, evo=5), 10, rune)


def _run(team, **kw):
    kw.setdefault("n_dummies", 1)
    kw.setdefault("max_turn", 4)
    kw.setdefault("seed", 0)
    kw.setdefault("never_proc", True)    # 이 동료의 확률은 전부 100% — 결정론
    return run_team(team, **kw)


def _team(*ids, rune=True):
    return [CharSpec(c, position=i + 1, rune=rune) for i, c in enumerate(ids)]


def _dela(res):
    return next(u for u in res.state.allies if u.name == NAME)


def _recv(unit, stat):
    return sorted(b.value for b in unit.buffs if b.stat == stat)


def _barriers(res, skill, turn=None, target=None):
    return [ev for ev in res.state.log if ev.detail and ev.detail.get("kind") == "barrier"
            and ev.detail.get("skillName") == skill and (turn is None or ev.turn == turn)
            and (target is None or ev.detail.get("target") == target)]


def _hits(res, actor=NAME, turn=None):
    return [ev for ev in res.state.log if ev.detail and ev.detail.get("skillPct") is not None
            and ev.detail.get("kind") is None and ev.actor == actor and (turn is None or ev.turn == turn)]


# ── 파싱 ────────────────────────────────────────────────────────────────────
def test_no_unparsed_lines_rune_on_and_off():
    for rune in (True, False):
        k = _kit(rune)
        for sl in [k.basic, k.fatal, *k.passives]:
            assert not [e.raw for e in _walk(sl.effects) if e.kind == "UNPARSED"], (rune, sl.slot)


def test_gates_parse_onto_their_triggers():
    k = _kit()
    p2 = next(p for p in k.passives if p.slot == "passive2")
    timed = next(e for e in p2.effects if e.condition == "every_turn")
    assert (timed.stack_name, timed.max_stacks, timed.trigger_param) == ("Aegis", 1, 1), "가호 게이트 = 매 턴 구독 자체에"
    p4 = next(p for p in k.passives if p.slot == "passive4")
    gate = next(e for e in _walk(p4.effects) if (e.condition or "").startswith("team_kind_gate:"))
    cut = gate.sub_effects[0]
    assert gate.condition == "team_kind_gate:tank:3"
    assert (cut.kind, cut.stat, cut.magnitude, cut.big_hit_pct) == (BUFF, STAT_DMG_TAKEN_BIG, -20.0, 10.0)
    p1 = next(p for p in k.passives if p.slot == "passive1")
    reps = [e for e in _walk(p1.effects) if e.kind == TRIGGER and e.condition == "repeat"]
    assert [(r.repeat_stack, r.sub_effects[0].stat, r.sub_effects[0].max_stacks) for r in reps] == [
        ("own:Fireline", STAT_BAR_RECV, 10), ("own:Fireline", STAT_HEAL_RECV, 10)]


# ── 방화선 → 필살기 시 받는 배리어·치료 (핵심 특징 1) ───────────────────────
def test_fireline_counted_before_its_removal_on_ex():
    """[precedent: 10448-P1-count-before-remove] 1~3턴 보통 공격 3회 → 4턴 필살기: 받는 배리어·치료 +3% × 3, 방화선 0."""
    res = _run(_team(DELA), max_turn=4)
    d = _dela(res)
    assert _recv(d, STAT_BAR_RECV) == [3.0, 3.0, 3.0]
    assert _recv(d, STAT_HEAL_RECV) == [3.0, 3.0, 3.0]
    assert d.stacks.get("Fireline", 0) == 0, "첫 필살기: 제거 뒤 가호가 아직 없어 5중첩 없음"


def test_recv_buff_skips_same_ex_barrier_and_lasts_three_turns():
    """[precedent: 10448-P1-recv-after-body] 4턴 필살기 배리어는 증폭 없음 · 5턴 가호 배리어는 +9% · 7턴 가호 배리어는 만료로 증폭 없음."""
    res = _run(_team(DELA), max_turn=7)
    ult4 = _barriers(res, ULT, turn=4)
    assert ult4 and all(ev.detail["barRecv"] == 0 for ev in ult4)
    hp = _dela(res).max_hp_eff()
    aeg5 = _barriers(res, P2, turn=5)
    assert len(aeg5) == 1 and aeg5[0].detail["barRecv"] == 9.0
    assert abs(aeg5[0].detail["final"] - hp * 0.12 * 1.09) < 1.0
    aeg7 = _barriers(res, P2, turn=7)
    assert len(aeg7) == 1 and aeg7[0].detail["barRecv"] == 0


def test_fire_allies_feed_fireline_only_with_three_fire():
    """불속성 3명(델라크로이 포함) → 다른 아군의 공격마다 +1. 2명이면 없음."""
    fire3 = _run(_team(DELA, BARD, DARAWAN), max_turn=1)
    assert _dela(fire3).stacks.get("Fireline") == 3, "자기 보통 공격 1 + 바드 1 + 다라완 1"
    fire2 = _run(_team(DELA, BARD, OREM), max_turn=1)
    assert _dela(fire2).stacks.get("Fireline") == 1
    capped = _run(_team(DELA, BARD, DARAWAN, CROC), max_turn=3)
    assert _dela(capped).stacks.get("Fireline") == 10, "최대 10중첩"
    full = _run(_team(DELA, BARD, DARAWAN, CROC), max_turn=4)
    assert _recv(_dela(full), STAT_BAR_RECV) == [3.0] * 10, "10중첩 → 받는 배리어 +3% × 10(최대 10)"


# ── 용의 숨결 가호 (핵심 특징 2) ─────────────────────────────────────────────
def test_aegis_gives_five_fireline_from_second_ex_and_turn_barrier():
    res = _run(_team(DELA), max_turn=10)
    turns = sorted({ev.turn for ev in _barriers(res, P2)})
    assert turns == [5, 6, 7, 8, 9, 10], "4턴 첫 필살기 뒤 매 턴 시작(가호 4턴, 7·10턴 필살기로 갱신)"
    gains = [ev.turn for ev in res.state.log if ev.actor == NAME and "방화선 +5중첩" in ev.text]
    assert gains == [7, 10], "가호 = 1 인 필살기(두 번째부터)만"
    d = _dela(res)
    assert _recv(d, STAT_BAR_RECV) == [3.0] * 7, "10턴 필살기: 5(7턴 가호분) + 보통 공격 2"


def test_aegis_turn_barrier_stops_when_aegis_expires():
    """필살기를 4턴 한 번만 → 가호 4턴 뒤 매 턴 배리어가 멈춘다."""
    res = _run([CharSpec(DELA, rotation="평평평궁평평평평평평")], max_turn=10)
    turns = sorted({ev.turn for ev in _barriers(res, P2)})
    assert turns and turns[0] == 5 and turns[-1] < 10, turns


# ── 필살기 배리어 · 반격 (핵심 특징 3) ───────────────────────────────────────
def test_ult_barrier_scales_with_own_max_hp_and_rune():
    for rune, pct in ((True, 0.20), (False, 0.15)):
        res = _run(_team(DELA, BARD, rune=rune), max_turn=4)
        hp = _dela(res).max_hp_eff()
        bars = _barriers(res, ULT, turn=4)
        assert len(bars) == 2 and all(abs(ev.detail["final"] - hp * pct) < 1.0 for ev in bars), rune


def test_counter_uses_attacked_allys_own_barrier_and_credit():
    """[precedent: 10448-ULT-counter-own-barrier] 4턴 적 페이즈: 바드가 맞으면 바드 배리어 12% 를 바드 공적으로."""
    res = _run(_team(DELA, BARD), max_turn=4)
    bard = next(u for u in res.state.allies if u.name == "바드")
    counters = [ev for ev in _hits(res, actor="바드", turn=4)
                if ev.detail["skillName"] == ULT and ev.detail["skillPct"] == 12.0]
    assert len(counters) == 1 and counters[0].detail["act"] == "발동"
    assert abs(counters[0].amount - bard.barrier * 0.12 * (1 + bard._sum("dmg_dealt_pct") / 100)) < 1.0
    solo = _run(_team(BARD), max_turn=4)
    assert not [ev for ev in _hits(solo, actor="바드") if ev.detail["skillName"] == ULT]
    assert all(ev.actor != NAME for ev in counters)


def test_sigil_basic_hit_needs_hp_at_least_90():
    full = _run(_team(DELA), max_turn=6)
    hits = [ev for ev in _hits(full) if ev.detail["skillPct"] == 13.5]
    assert [ev.turn for ev in hits if ev.amount > 0] == [5, 6], "배리어가 생긴 뒤 보통 공격마다"
    low = _run(_team(DELA), max_turn=6, incoming_hp_pct=50, allow_death=False)
    assert not [ev for ev in _hits(low) if ev.detail["skillPct"] == 13.5 and ev.turn >= 2]
    off = _run(_team(DELA, rune=False), max_turn=6)
    assert not [ev for ev in _hits(off) if ev.detail["skillPct"] == 13.5]


# ── 생명 방어선 (핵심 특징 4) ────────────────────────────────────────────────
def _incoming(res, name, turn=1):
    return next(ev.detail for ev in res.state.log if ev.turn == turn and ev.actor == name
                and ev.detail and ev.detail.get("kind") == "incoming")


def test_three_tanks_cut_heavy_hits_only():
    """[assumed: 10448-P4-bighit] 수호 3명(델라크로이·다라완·오렘): 15% 피격 −20%(별도 곱) · 8% 피격은 그대로. 수호 2명이면 없음."""
    tanks3 = _team(DELA, DARAWAN, OREM, BARD)
    heavy = _incoming(_run(tanks3, max_turn=1, incoming_hp_pct=15), "바드")
    assert [c["v"] for c in heavy["takenBig"]] == [-20.0]
    assert abs(heavy["dmg"] - heavy["raw"] * 0.8) < 0.01
    light = _incoming(_run(tanks3, max_turn=1, incoming_hp_pct=8), "바드")
    assert light["takenBig"] == [] and abs(light["dmg"] - light["raw"]) < 0.01
    tanks2 = _incoming(_run(_team(DELA, DARAWAN, BARD), max_turn=1, incoming_hp_pct=15), "바드")
    assert tanks2["takenBig"] == []


def test_heavy_hit_test_reads_damage_after_other_cuts():
    """[assumed: 10448-P4-bighit] 방어(−50%)로 15% → 7.5% 가 되면 문턱(10%) 아래라 −20% 없음."""
    team = _team(DELA, DARAWAN, OREM, BARD)
    team[3] = CharSpec(BARD, position=4, rotation="방")
    det = _incoming(_run(team, max_turn=1, incoming_hp_pct=15), "바드")
    assert det["defended"] and det["takenBig"] == []


def test_heal_received_grants_own_barrier():
    """[동료 상호작용] 크로크라인 치료 → 치료받은 아군마다 자신 최대 HP 10% 배리어(1턴)."""
    res = _run(_team(DELA, CROC), max_turn=1)
    heals = [ev for ev in res.state.log if ev.actor == "크로크라인" and ev.detail and ev.detail.get("kind") == "heal"]
    bars = _barriers(res, P4, turn=1)
    assert heals and len(bars) == len(heals)
    for ev in bars:
        unit = next(u for u in res.state.allies if u.name == ev.detail["target"])
        assert ev.actor == unit.name and abs(ev.detail["final"] - unit.max_hp_eff() * 0.10) < 1.0


# ── 필수 교차 점검 ───────────────────────────────────────────────────────────
def test_imbueon_bonus_ex_counts_fireline_again_and_gets_five():
    """[compat 임부언] 1번 자리 델라크로이 4턴 필살기 두 번: 두 번째(가호 = 1)는 방화선 0 을 세고 5중첩을 얻는다.
    두 번째 필살기 배리어는 첫 필살기의 받는 배리어 +9% 를 받는다."""
    res = _run(_team(DELA, IMBUEON), max_turn=4)
    ults = [ev for ev in _barriers(res, ULT, turn=4) if ev.detail["target"] == NAME]
    assert [ev.detail["barRecv"] for ev in ults] == [0, 9.0]
    d = _dela(res)
    assert d.stacks.get("Fireline") == 5 and _recv(d, STAT_BAR_RECV) == [3.0, 3.0, 3.0]
