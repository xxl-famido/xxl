"""코드XY(10446) 메커니즘 가드 — 코드X/코드Y 전환 · 필살기 → 추가 행동 · 취약 게이트(자신 100%·아군 전체 60%) · 비축.
데미지 절대값이 아닌 구조·비율만 본다. 가드 값은 원문·원본 트리에서 손으로 계산했다.

정체성(XXL·불·전사): 필살(CD 1) 50% → 필살기마다 행동 +1·현재 CD −1(턴당 1회)이라 2턴부터 매 턴 '필살기 → 보통 공격'.
해석 기록 mining/autonomy/interpretations/10446.json:
  · 'Switch to X' = 다른 코드 제거 + X 부여(원본 508+802), 1턴째 코드Y                               [data]
  · 행동 +1 과 CD −1 은 둘 다 턴당 1회(805 제한이 두 효과에 각각)                                      [data]
  · 필살기 시 추가 행동은 그 행동에서만 생긴다 — 턴당 기본 행동 2회(이태호)가 아니다                   [data]
  · 취약 = 표식(능력치 효과 없음, 3턴, 최대 1) · 100% 추가 피해 = 필살기 판정(510)                       [data]
  · 파5 60% = 아군 전체(자신 포함)·각자 ATK·발동 판정(10002)                                          [data/precedent]
  · 같은 행동이 건 취약은 그 행동의 게이트를 열지 않는다(행동 시작 스냅샷 — 바드 각흔 선례)             [precedent]
  · 비축 N중첩 = 필살기 시 60% N회(필살기 판정, 소모 없음)                                             [data]
  · 전환(코드X)은 그 필살기의 피해 뒤 — 같은 필살기의 피해는 코드X 주는 데미지를 받지 않는다(2패스)     [precedent]
"""
from __future__ import annotations

from woofia_sim.effects import CD_MOD, DAMAGE, EXTRA_ACTION, STACK, TRIGGER
from woofia_sim.engine import _self_extra_actions, make_unit_from_kit
from woofia_sim.harness import CharSpec, auto_rotation, run_team
from woofia_sim.kit import resolve_kit
from woofia_sim.stats import Investment

XY = 10446
RICANO = 10428      # 리카노 — CD 3(4·7·10턴 필살), 취약 게이트를 받는 아군 표본
IMBUEON = 10410     # 임부언 — 1번 자리 캐리 필살 CD −3 + 추가 행동(fed carry)
LEETAEHO = 10423    # 이태호 — '행동 시 행동 +1(턴당 1회)' = 턴당 기본 2회(회귀 기준)
P1 = "늑대인간 전술 전환"
P2 = "늑대인간 공수 교대"
P4 = "무리 사냥의 하울링"
ULT = "운명의 이중 나선"


def _walk(effects):
    for e in effects:
        yield e
        yield from _walk(e.sub_effects)


def _kit(rune: bool = True):
    return resolve_kit(XY, Investment(level=60, evo=5), 10, rune)


def _run(team, **kw):
    kw.setdefault("n_dummies", 1)
    kw.setdefault("max_turn", 6)
    kw.setdefault("seed", 0)
    kw.setdefault("never_proc", True)    # 이 동료의 확률은 전부 100% — 결정론
    return run_team(team, **kw)


def _hits(res, actor="코드XY", turn=None):
    return [ev for ev in res.state.log if ev.detail and ev.detail.get("skillPct") is not None
            and ev.detail.get("kind") is None and ev.actor == actor and (turn is None or ev.turn == turn)]


def _actions(res, actor="코드XY"):
    """턴별 행동 종류 목록(로그의 action_kind 묶음 순서대로)."""
    out: dict[int, list[str]] = {}
    seen = set()
    for ev in res.state.log:
        if ev.actor != actor or ev.action_kind not in ("필살기", "보통공격") or ev.action_id in seen:
            continue
        seen.add(ev.action_id)
        out.setdefault(ev.turn, []).append(ev.action_kind)
    return out


# ── 파싱 ────────────────────────────────────────────────────────────────────
def test_no_unparsed_lines_rune_on_and_off():
    for rune in (True, False):
        k = _kit(rune)
        for sl in [k.basic, k.fatal, *k.passives]:
            assert not [e.raw for e in _walk(sl.effects) if e.kind == "UNPARSED"], (rune, sl.slot)


def test_switch_lines_clear_the_other_code():
    p1 = next(p for p in _kit().passives if p.slot == "passive1")
    sw = {e.stack_name: e.condition for e in _walk(p1.effects) if e.kind == STACK and (e.condition or "").startswith("switch_from:")}
    assert sw == {"Code: X": "switch_from:Code: Y", "Code: Y": "switch_from:Code: X"}
    first = p1.effects[0]
    assert (first.condition, first.trigger_param, first.sub_effects[0].stack_name) == ("on_turn", 1, "Code: Y")


def test_action_and_cd_cut_parse_as_one_per_turn_on_ex_trigger():
    p1 = next(p for p in _kit().passives if p.slot == "passive1")
    trig = next(e for e in p1.effects if e.kind == TRIGGER and any(s.kind == EXTRA_ACTION for s in e.sub_effects))
    assert trig.condition == "on_ex" and trig.per_turn
    assert [(s.kind, s.target, s.magnitude) for s in trig.sub_effects] == [(EXTRA_ACTION, "self", 1.0), (CD_MOD, "self", -1.0)]


def test_gate_and_sigil_hits_parse_with_their_channels():
    k = _kit()
    p1 = next(p for p in k.passives if p.slot == "passive1")
    gate = next(e for e in p1.effects if e.target_stack == "Weaken")
    assert (gate.condition, gate.target_count, gate.sub_effects[0].force_action, gate.sub_effects[0].magnitude) == ("on_ex", 1, "ex", 100.0)
    p4 = next(p for p in k.passives if p.slot == "passive4")
    inner = p4.effects[0].sub_effects[0]
    assert p4.effects[0].condition == "grant_allies" and "Except self" not in p4.effects[0].raw
    assert (inner.condition, inner.target_stack, inner.sub_effects[0].force_action) == ("on_ex", "Weaken", None), "60% = 발동"
    sig = next(p for p in k.passives if p.slot == "sigilPassive")
    rep = next(e for e in sig.effects if e.repeat_stack)
    assert (rep.condition, rep.repeat_stack, rep.sub_effects[0].kind, rep.sub_effects[0].force_action) == ("on_ex", "own:Focus", DAMAGE, "ex")


# ── 필살기 → 추가 행동 (핵심 특징 1) ────────────────────────────────────────
def test_extra_action_comes_only_with_ex_not_every_turn():
    k = _kit()
    assert _self_extra_actions(k) == 0 and make_unit_from_kit(k, 0).base_actions == 1
    assert auto_rotation(k) == "평궁|궁", "CD 1: 1턴 보통 공격(게이지 충전) → 2턴부터 매 턴 필살기"
    lee = resolve_kit(LEETAEHO, Investment(level=60, evo=5), 10, True)
    assert _self_extra_actions(lee) == 1, "이태호 '행동 시' 추가 행동은 그대로 턴당 기본 2회"
    acts = _actions(_run([CharSpec(XY)], max_turn=5))
    assert acts[1] == ["보통공격"], "1턴: 필살기 없음 → 추가 행동 없음"
    for t in range(2, 6):
        assert acts[t] == ["필살기", "보통공격"], (t, acts[t])


def test_second_ex_same_turn_has_no_cd_cut_and_no_third_action():
    """턴 계획으로 2턴 두 행동을 모두 필살기로: 첫 필살기 CD 1→0(−1)·행동 +1, 두 번째 필살기는 CD −1·행동 +1 없음(턴당 1회)."""
    res = _run([CharSpec(XY)], max_turn=3, turn_plans={2: [(0, "fatal"), (0, "fatal"), (0, "basic")]})
    acts = _actions(res)
    assert acts[2] == ["필살기", "필살기"], "세 번째 항목은 예산 없음(추가 행동 1회뿐)"
    cuts = [ev for ev in res.state.log if ev.turn == 2 and "필살 CD -1" in ev.text]
    assert len(cuts) == 1
    xy = res.state.allies[0]
    assert xy.cd_remaining == 0, "2턴 끝 CD 1 → 턴 경과 −1 → 0"


# ── 코드X / 코드Y (핵심 특징 2) ─────────────────────────────────────────────
def test_codes_are_exclusive_and_follow_last_action():
    res = _run([CharSpec(XY)], max_turn=1)
    xy = res.state.allies[0]
    assert (xy.stacks.get("Code: Y"), xy.stacks.get("Code: X", 0)) == (1, 0), "1턴 시작 코드Y, 보통 공격도 코드Y"
    res = _run([CharSpec(XY)], max_turn=2, turn_plans={2: [(0, "fatal")]})   # 추가 행동을 쓰지 않음
    xy = res.state.allies[0]
    assert (xy.stacks.get("Code: X"), xy.stacks.get("Code: Y", 0)) == (1, 0), "필살기 뒤 코드X 만"
    res = _run([CharSpec(XY)], max_turn=2)
    xy = res.state.allies[0]
    assert (xy.stacks.get("Code: Y"), xy.stacks.get("Code: X", 0)) == (1, 0), "필살기 → 보통 공격이면 코드Y 로 끝남"


def test_code_x_damage_dealt_hits_the_following_basic_not_the_same_ex():
    """[precedent: 10446-P2-switch-timing] 전환은 그 필살기의 피해 뒤 — 필살기 피해(코드Y 상태로 시작)는 +15% 없음,
    바로 다음 추가 행동 보통 공격만 코드X 주는 데미지 +15%."""
    res = _run([CharSpec(XY)], max_turn=3)
    seen = set()
    for ev in _hits(res, turn=3):
        dealt = [c for c in ev.detail.get("dealt", []) if c.get("cond") == "코드X"]
        seen.add(ev.detail["act"])
        if ev.detail["act"] == "평타":
            assert [c["v"] for c in dealt] == [15.0], ev.text
        else:
            assert not dealt, ev.text
    assert seen == {"평타", "필살", "발동"}, "3턴에 보통 공격·필살기 판정·발동 피해가 모두 있어야 가드가 의미 있다"


def test_code_y_cuts_damage_taken_code_x_does_not():
    res = _run([CharSpec(XY)], max_turn=2)                                   # 코드Y 로 끝남
    assert abs(res.state.allies[0].incoming_mult() - 0.85) < 1e-9
    res = _run([CharSpec(XY)], max_turn=2, turn_plans={2: [(0, "fatal")]})  # 코드X 로 끝남
    assert abs(res.state.allies[0].incoming_mult() - 1.0) < 1e-9


# ── 취약 게이트 (핵심 특징 3) ───────────────────────────────────────────────
def test_weaken_opens_gates_from_next_ex_not_its_own():
    """[precedent: 10446-P1-weaken-same-action] 2턴 첫 필살기가 건 취약은 그 필살기의 100%·60%를 열지 않는다. 3턴부터 둘 다."""
    res = _run([CharSpec(XY)], max_turn=3)
    t2 = [(ev.detail["act"], ev.detail["skillPct"], ev.detail["skillName"]) for ev in _hits(res, turn=2)]
    assert ("필살", 100.0, P1) not in t2 and ("발동", 60.0, P4) not in t2
    t3 = [(ev.detail["act"], ev.detail["skillPct"], ev.detail["skillName"]) for ev in _hits(res, turn=3)]
    assert t3.count(("필살", 100.0, P1)) == 1, "100% = 필살기 판정"
    assert t3.count(("발동", 60.0, P4)) == 1, "파5 부여분은 자신에게도"
    dummy = res.state.enemies[0]
    assert dummy.stacks.get("Weaken") == 1 and not dummy.buffs, "취약은 표식 — 능력치 효과 없음, 최대 1"


def test_gate_hit_takes_ex_effect_bonus():
    res = _run([CharSpec(XY)], max_turn=4)
    gate = next(ev for ev in _hits(res, turn=4) if ev.detail["skillName"] == P1)
    assert sum(c["v"] for c in gate.detail["eff"]) == 45.0, "보통 공격 3회(1~3턴) → 필살기 효과 +15%×3"


def test_weaken_lasts_three_turns():
    """2턴 필살기 취약(3턴) — 4턴 필살기는 게이트 열림, 5턴 필살기는 닫힘(만료)."""
    open4 = _run([CharSpec(XY, rotation="평궁평궁평")], max_turn=4)
    assert any(ev.detail["skillName"] == P1 for ev in _hits(open4, turn=4))
    shut5 = _run([CharSpec(XY, rotation="평궁평평궁")], max_turn=5)
    assert not any(ev.detail["skillName"] in (P1, P4) for ev in _hits(shut5, turn=5))


def test_pack_hunt_gives_each_ally_60pct_of_own_atk_on_ex():
    """[동료 상호작용] 리카노(CD 3) 4턴 필살기: 코드XY 가 2·3턴 건 취약 → 리카노 ATK 60% 발동 피해 1회, 공적은 리카노."""
    res = _run([CharSpec(RICANO, position=1), CharSpec(XY, position=2)], max_turn=4)
    ric = [ev for ev in _hits(res, actor="리카노", turn=4) if ev.detail["skillName"] == P4]
    assert len(ric) == 1 and ric[0].detail["act"] == "발동" and ric[0].detail["skillPct"] == 60.0
    solo = _run([CharSpec(RICANO, position=1)], max_turn=4)
    assert not [ev for ev in _hits(solo, actor="리카노") if ev.detail["skillName"] == P4]
    # 리카노는 코드XY 보다 먼저 행동한다(보조 우선) — 1턴엔 취약이 없어 필살기가 있어도 열리지 않음(리카노 첫 필살 4턴)
    assert res.state.allies[0].damage_dealt > solo.state.allies[0].damage_dealt


# ── 비축 (도장) ─────────────────────────────────────────────────────────────
def test_focus_hits_equal_stacks_capped_at_three_and_not_consumed():
    res = _run([CharSpec(XY)], max_turn=6)
    for turn, want in ((2, 1), (3, 2), (4, 3), (5, 3), (6, 3)):
        n = sum(1 for ev in _hits(res, turn=turn)
                if ev.detail["skillName"] == ULT and ev.detail["skillPct"] == 60.0 and ev.detail["act"] == "필살")
        assert n == want, (turn, n)
    off = _run([CharSpec(XY, rune=False)], max_turn=4)
    assert not [ev for ev in _hits(off) if ev.detail["skillPct"] == 60.0 and ev.detail["act"] == "필살"]


# ── 필수 교차 점검 ───────────────────────────────────────────────────────────
def test_imbueon_fed_carry_keeps_one_cd_cut_per_turn():
    """[compat 임부언] 1번 자리 코드XY = fed carry → 받은 추가 행동도 필살기(엔진 일반 규칙). 자기 CD −1 은 턴당 1회."""
    res = _run([CharSpec(XY, position=1), CharSpec(IMBUEON, position=2)], max_turn=4)
    acts = _actions(res)
    assert acts[2] == ["필살기", "필살기"]
    for t in (2, 3, 4):
        own = [ev for ev in res.state.log if ev.turn == t and ev.actor == "코드XY" and ev.text.endswith("자신 필살 CD -1")]
        assert len(own) == 1, (t, len(own))
    assert acts[4].count("필살기") == 3, "4턴 임부언 필살기(CD −3·추가 행동) → 세 번째 필살기"
