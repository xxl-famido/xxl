"""은빛투신 하쿠이(10444) 메커니즘 가드 — 데미지 절대값이 아닌 '행동 턴·hit 구조·채널·비율'만 본다.

정체성(XXL·물·보조): 보통 공격 본문은 피해 없이 아군 전체 고정 ATK +30%(1턴), 필살(CD 5)은 고정 ATK +45%(2턴)·
자신 제외 아군 남은 필살 CD −1·자기 CD 변동 면역 5턴·【위용】 4턴. 피해는 전부 보통 공격의 추가 효과(원본 509 = 평타 판정):
파5 60% · 위용 보유 시 파2 60% ×2(독립 타격) · 도장 【기원】≧4 이면 120%. 기원 = 하쿠이를 뺀 아군의 필살 1회당 +1(2턴, 최대 4).

하쿠이 hit = 피해 로그(detail 에 atkTotal, amount > 0) ∧ actor_id 10444 ∧ detail 에 rider(열상) 없음.
기대값은 동결 예측(frozen/theory_10444.json · synergy_10444.json, 실행 newchar_BD202610061503_10071717)에서 가져왔다.
태그의 precedent 는 엔진의 기존 동료 처리(선례)를 따른 해석이라는 뜻이다 — 게임 규칙으로 확인된 것이 아니다.
"""
from __future__ import annotations

import pytest

from woofia_sim.effects import CD_MOD, DAMAGE, STACK, TRIGGER, parse_line
from woofia_sim.harness import CharSpec, auto_rotation, run_team
from woofia_sim.kit import resolve_kit
from woofia_sim.stats import Investment

HAKUI = 10444
P2 = "투신의 본모습"          # 위용 =1 → 60% ×2
P5 = "서방의 주인의 후광"     # 1턴 CD −4 · 보통 공격 60%
SHIN = 10402                 # 신리랑 · 골든라이더 · 최유현 · 다양수이 — CD 3 전사(하쿠이 피해에 닿는 효과 없음)
GOLDEN = 10403
CHOI = 10416
DAYANG = 10412
LIMBUEON = 10410
UKYOUNG = 10439
CODEB = 10306
MUNG = 10417
YUKJAM = 10429
MUMYEONG = 10443
ALTAR_MAX_CD = 402           # 필살 최대 CD +1
ALTAR_ACT_CD = 1012          # 행동 시 30% 자기 필살 CD −1


def _run(team, **kw):
    kw.setdefault("n_dummies", 1)
    kw.setdefault("max_turn", 10)
    kw.setdefault("seed", 0)
    kw.setdefault("never_proc", not kw.get("force_proc", False))
    return run_team(team, **kw)


def _solo(**kw):
    spec = {k: kw.pop(k) for k in ("skill_levels", "ult_mode") if k in kw}
    return _run([CharSpec(HAKUI, position=1, rune=True, **spec)], **kw)


def _team4(hakui_priority=None):
    """이론 T08 편성: 하쿠이 1번 + CD 3 전사 4명(같은 턴 T4·T7·T10 에 모두 필살)."""
    return [CharSpec(HAKUI, position=1, priority=hakui_priority), CharSpec(SHIN, position=2),
            CharSpec(GOLDEN, position=3), CharSpec(CHOI, position=4), CharSpec(DAYANG, position=5)]


def _hits(res, cid=HAKUI):
    return [ev for ev in res.state.log
            if ev.detail and "atkTotal" in ev.detail and ev.amount > 0
            and ev.actor_id == cid and "rider" not in ev.detail]


def _named(res, name):
    return [ev for ev in _hits(res) if ev.detail.get("skillName") == name]


def _sigil(res):
    return [ev for ev in _hits(res) if ev.detail.get("skillPct") == 120]


def _turns(evs):
    return [ev.turn for ev in evs]


def _at(evs, turn):
    sel = sorted((ev for ev in evs if ev.turn == turn), key=lambda e: e.action_id)
    assert sel, f"T{turn} 이벤트 없음"
    return sel[0]


def _fatal_turns(res, cid):
    seen, out = set(), []
    for ev in res.state.log:
        if ev.action_kind == "필살기" and ev.actor_id == cid and ev.action_id not in seen:
            seen.add(ev.action_id)
            out.append(ev.turn)
    return out


def _total(res, cid=HAKUI):
    return next(u.damage_dealt for u in res.state.allies if u._kit.char_id == cid)


# ── 첫 필살 공식 (N7) ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("levels,altar,expected", [
    (None, None, [2, 7]),                   # 10444-T01: cd 5 · 1턴 −4 → T2, 이후 5턴 주기
    ({"passive4": 1}, None, [4, 9]),       # 10444-T12: 파5 Lv1 (−2)
    (None, [ALTAR_MAX_CD], [3, 9]),        # 10444-T13: 제단 402 → cd 6
])
def test_first_fatal_follows_partial_turn1_cut(levels, altar, expected):
    """[precedent: 10444-P4-turn1-cd] 1턴 CD 감소가 부분(cd+Δ>0)이어도 기본 계획 첫 필살 = 런타임 준비 턴 max(1, cd+Δ+1)."""
    sl = None if levels is None else {"basicAtk": 10, "ultimate": 10, "sigil": 10, "passive0": 10,
                                      "passive1": 10, "passive2": 10, "passive3": 10, **levels}
    assert _fatal_turns(_solo(skill_levels=sl, altar=altar), HAKUI) == expected
    if levels is None and altar is None:
        import sim_api
        assert sim_api.char_meta(HAKUI)["firstFatal"] == 2          # v2 플래너 ffat 의 원천
        assert auto_rotation(resolve_kit(HAKUI, Investment(level=60, evo=5), 10, True)) == "평궁|평평평평궁"


def test_mung_altar_402_first_fatal_matches_runtime():
    """[precedent: 10444-P4-turn1-cd] N7 일반화의 골든 밖 영향 가드(10444-C06): 제단 402 의 멍(cd 4 · 1턴 −3 = 부분 감소)
    기본 계획 필살 [2,6,10] — 종전 공식이면 [5,9]."""
    res = _run([CharSpec(HAKUI, position=1), CharSpec(MUNG, position=2)], altar=[ALTAR_MAX_CD])
    assert _fatal_turns(res, MUNG) == [2, 6, 10]


# ── 위용 · 파2 · 판정 ─────────────────────────────────────────────────────────

def test_aura_window_gives_two_independent_basic_hits():
    """위용 4턴 = 필살 다음 3번의 보통 공격(10444-T03), 위용 1회 = 파2 독립 2 hit. 세 추가 피해 모두 평타 판정이라
    파3 '필살기 시 보통 공격 데미지 +60%(3턴)'를 받는다 — 같은 ATK 의 T4 파2 ÷ T5 파2 = 1.6(10444-T04)."""
    res = _solo()
    p2 = _named(res, P2)
    assert _turns(p2) == [3, 3, 4, 4, 5, 5, 8, 8, 9, 9, 10, 10]
    for t in (3, 4, 5, 8, 9, 10):                       # 같은 행동 안의 두 타격
        pair = [ev for ev in p2 if ev.turn == t]
        assert len({ev.action_id for ev in pair}) == 1 and pair[0].amount == pair[1].amount
    assert _at(p2, 4).amount / _at(p2, 5).amount == pytest.approx(1.6, rel=0.002)
    for ev in _hits(res):
        assert ev.detail["act"] == "평타" and ev.detail["effLabel"] == "평타뎀"
        assert ev.action_kind == "보통공격"
    assert _turns(_named(res, P5)) == [1, 3, 4, 5, 6, 8, 9, 10]   # 필살 턴(T2·T7)엔 피해 없음


def test_ult_flat_atk_reaches_only_the_next_turn():
    """[precedent: 10444-ULT-flat-atk-base] 필살 고정 가산(기초 ATK×1.15 의 45%, 2턴)은 필살 다음 턴 보통 공격까지 —
    T3 파5 ÷ T4 파5 = (1.15+0.30+0.45)/(1.15+0.30) = 1.310345(10444-T05). 하쿠이 자기 필살이 기원을 주면
    (부여 변환에서 'Except self' 누락) 1.408621 로 어긋난다 [precedent: 10444-P2-grant-per-ex]."""
    res = _solo()
    p5 = _named(res, P5)
    assert _at(p5, 3).amount / _at(p5, 4).amount == pytest.approx(1.310345, rel=0.002)
    assert not any("기원" in ev.text for ev in res.state.log)


# ── 기원 · 도장 패시브 ────────────────────────────────────────────────────────

def test_supplication_is_one_stack_per_ally_ex():
    """[precedent: 10444-P2-grant-per-ex] 기원은 하쿠이를 뺀 아군의 필살 1회당 1중첩(전원 필살 여부 무관) —
    동료 2명이 T4 에 필살 → 먼저 행동하는 하쿠이의 T5 파5 ÷ T6 파5 = 1+2×0.12 = 1.24(10444-T07)."""
    res = _run([CharSpec(HAKUI, position=1), CharSpec(SHIN, position=2), CharSpec(CHOI, position=3)])
    p5 = _named(res, P5)
    assert _at(p5, 5).amount / _at(p5, 6).amount == pytest.approx(1.24, rel=0.002)
    assert sum(1 for ev in res.state.log if ev.turn == 4 and "기원 +1중첩" in ev.text) == 2


def test_sigil_passive_opens_on_four_supplication():
    """[precedent: 10444-P2-grant-per-ex] [precedent: 10444-SIG-gate-timing] 동료 4명이 직전 턴 모두 필살한 다음
    하쿠이 보통 공격에서만 도장 120% — [5,8](10444-T08). 평타 판정이라 기원 평타뎀을 같이 받아 120%/60% = 2.0(10444-T09).
    하쿠이를 마지막에 두면 같은 턴 앞선 필살도 세어 [4,5,8,10](10444-T11)."""
    res = _run(_team4())
    sig = _sigil(res)
    assert _turns(sig) == [5, 8]
    assert _at(sig, 5).amount / _at(_named(res, P5), 5).amount == pytest.approx(2.0, rel=0.002)
    assert _turns(_sigil(_run(_team4(hakui_priority=9)))) == [4, 5, 8, 10]


# ── 필살: 아군 CD −1 · CD 변동 면역 ───────────────────────────────────────────

def test_ult_cuts_other_allies_current_cd():
    """[precedent: 10444-ULT-ally-cd] '자신을 제외한 아군 현재 필살 CD −1' — asap 최유현(CD 3)의 필살 [4,7,10] → [3,6,8]
    (10444-T14). 로그 라벨은 '자신 제외 아군'이고 하쿠이 자신의 CD 는 줄지 않는다."""
    res = _run([CharSpec(HAKUI, position=1), CharSpec(CHOI, position=2, ult_mode="asap")])
    assert _fatal_turns(res, CHOI) == [3, 6, 8]
    cut = [ev for ev in res.state.log if ev.actor_id == HAKUI and "필살 CD -1" in ev.text]
    assert [ev.turn for ev in cut] == [2, 7]
    assert all("자신 제외 아군" in ev.text for ev in cut)
    assert _fatal_turns(res, HAKUI) == [2, 7]


def test_immunity_blocks_same_action_altar_cut():
    """[precedent: 10444-ULT-immune-same-action] [precedent: 10444-ULT-cd-immune] 필살 본문의 CD 변동 면역(5턴)이 같은
    필살 행동의 제단 1012 '행동 시 자기 CD −1'(확률 100%)보다 먼저 걸려 첫 필살 뒤 감소가 전부 막힌다 —
    asap 하쿠이 필살 [2,7](10444-T15). 면역이 없으면 [2,5,8]."""
    res = _solo(ult_mode="asap", altar=[ALTAR_ACT_CD], force_proc=True)
    assert _fatal_turns(res, HAKUI) == [2, 7]


# ── 시너지·교차 점검 가드 ─────────────────────────────────────────────────────

def test_synergy_limbueon_fed_carry_becomes_basic_attack():
    """[precedent: 10444-SYN-10410] 하쿠이 1번 + 임부언: 임부언 필살(T4·T7·T10)의 CD −3 은 하쿠이 면역에 막히고(로그),
    행동 회복만 남아 추가 행동이 보통 공격 — 하쿠이 행동 목록(10444-C01)·무효 로그 턴(10444-C02)."""
    res = _run([CharSpec(HAKUI, position=1), CharSpec(LIMBUEON, position=2)])
    seen, acts = set(), []
    for ev in sorted(res.state.log, key=lambda e: e.action_id):
        if ev.actor_id == HAKUI and ev.action_kind in ("보통공격", "필살기") and ev.action_id not in seen:
            seen.add(ev.action_id)
            acts.append((ev.turn, "평" if ev.action_kind == "보통공격" else "궁"))
    assert acts == [(1, "평"), (2, "궁"), (3, "평"), (4, "평"), (4, "평"), (5, "평"), (6, "평"),
                    (7, "궁"), (7, "평"), (8, "평"), (9, "평"), (10, "평"), (10, "평")]
    blocked = [ev.turn for ev in res.state.log if ev.actor_id == LIMBUEON
               and "필살 CD -3" in ev.text and "면역으로 무효" in ev.text]
    assert blocked == [4, 7, 10]


def test_synergy_ukyoung_recovery_basic_adds_aura_hits():
    """[precedent: 10444-SYN-10439] 욱영 필살(T4·T7·T10)의 인접 행동 회복 = 하쿠이 추가 보통 공격 — 위용 창이면 그 행동도
    파2 ×2 (T7 은 필살 직후) → 파2 hit 턴(10444-S04)."""
    res = _run([CharSpec(HAKUI, position=1), CharSpec(UKYOUNG, position=2)])
    assert _turns(_named(res, P2)) == [3, 3, 4, 4, 4, 4, 5, 5, 7, 7, 8, 8, 9, 9, 10, 10, 10, 10]


def test_synergy_codeb_vulnerable_rides_each_hakui_hit():
    """[precedent: 10444-SYN-10306] 열상은 받은 타격마다 — 열상 창(코드B 필살 T4·T7 뒤) 안의 하쿠이 T5·T8 보통 공격은
    파5·파2×2 로 3회씩 [5,5,5,8,8,8](10444-S11). 열상 이벤트는 하쿠이 hit 필터(rider 제외)에 섞이지 않는다."""
    res = _run([CharSpec(HAKUI, position=1), CharSpec(CODEB, position=2)])
    riders = [ev for ev in res.state.log if ev.detail and "rider" in ev.detail and ev.actor_id == HAKUI]
    assert _turns(riders) == [5, 5, 5, 8, 8, 8]
    assert all(ev.detail.get("skillName") in (P2, P5) for ev in _hits(res))


# ── 파싱 격리 ─────────────────────────────────────────────────────────────────

def _walk(effs):
    for e in effs:
        yield e
        yield from _walk(e.sub_effects)


def test_parse_isolation_of_new_patterns():
    """기원 부여 변환은 스택명 집합(ALL_ACTED_AS_GRANT)으로만 — 같은 협동 문형의 다양수이·임욱잠은 all_acted 그대로.
    부여 변환 raw 에 'Except self' 가 남아 엔진이 하쿠이 자신을 뺀다. 게이트형 보통 공격 추가 피해(무명 불굴)는 평타 판정."""
    inv = Investment(level=60, evo=5)
    for cid in (DAYANG, YUKJAM):
        kit = resolve_kit(cid, inv, 10, True)
        conds = [e.condition for sl in (kit.basic, kit.fatal, *kit.passives) for e in _walk(sl.effects)]
        assert any((c or "").startswith("all_acted:") for c in conds), cid
    hakui = resolve_kit(HAKUI, inv, 10, True)
    grant = next(e for p in hakui.passives for e in p.effects if e.condition == "grant_allies")
    assert "Except self" in grant.raw
    on_ex = grant.sub_effects[0]
    assert on_ex.kind == TRIGGER and on_ex.condition == "on_ex"
    stack = on_ex.sub_effects[0]
    assert (stack.kind, stack.target, stack.stack_name, stack.duration, stack.max_stacks) == \
        (STACK, "grantor", "Supplication", 2, 4)
    ult = {e.kind: e for e in hakui.fatal.effects}
    assert ult[CD_MOD].target == "other_allies" and ult[CD_MOD].magnitude == -1
    assert (ult[STACK].stack_name, ult[STACK].duration) == ("Aura", 4)
    mumyeong = resolve_kit(MUMYEONG, inv, 10, True)
    gated = [s for p in mumyeong.passives for e in p.effects
             if e.kind == TRIGGER and e.condition == "on_basic_attack" and e.stack_name == "Fearless"
             for s in e.sub_effects if s.kind == DAMAGE]
    assert gated and all(s.force_action == "basic" for s in gated)
    two = parse_line("When own Aura = 1 stack(s), on Basic Attack, deal damage 60% of own ATK to target(s) 2 times.")
    assert [s.kind for s in two.sub_effects] == [DAMAGE, DAMAGE]
    assert all(s.target == "target" for s in two.sub_effects)
