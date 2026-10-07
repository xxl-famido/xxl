"""은빛투신 하쿠이(10444) 메커니즘 가드 — 데미지 절대값이 아닌 '행동 턴·hit 구조·채널·비율'만 본다.

정체성(XXL·물·보조): 보통 공격 본문은 피해 없이 아군 전체 고정 ATK +30%(1턴), 필살(CD 5)은 고정 ATK +45%(2턴)·
자신 제외 아군 남은 필살 CD −1·자기 CD 변동 면역 5턴·【위용】 4턴. 피해는 전부 보통 공격의 추가 효과(평타 판정, 해석 10444-dmg-basic-judged):
파5 60% · 위용 보유 시 파2 60% ×2(독립 타격) · 도장 【기원】≧4 이면 120%. 기원 = 하쿠이를 뺀 아군의 필살 1회당 +1(2턴, 최대 4).

하쿠이 hit = 피해 로그(detail 에 atkTotal, amount > 0) ∧ actor_id 10444 ∧ detail 에 rider(열상) 없음.
기대값은 이 동료의 동결 예측(10444-T·S·C)과 N8 추가 측정(10444-X, 해석 기록에서 도출)에서 가져왔다.
태그의 precedent 는 엔진의 기존 동료 처리(선례)를 따른 해석이라는 뜻이다 — 게임 규칙으로 확인된 것이 아니다.

동결 예측은 동료의 자동 계획 필살을 [4,7,10](CD 3)으로 두고 세웠다. 2026-10-07 사용자 결정으로 자동 계획은 하쿠이의
'자신 제외 아군 필살 CD −1'로 일찍 찬 필살을 당겨 쓴다(10444-AUTO-pull) — 그래서 하쿠이 메커니즘 가드는 동료를
ult_mode="strict"(계획 턴만)로 두어 예측 시나리오의 [4,7,10]을 그대로 재현하고, 당김 자체는 맨 아래 가드가 본다.
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
MUNG_SIGIL = "패란의 영감"   # 멍 도장 — 아군 전체에 '보통 공격 시 ATK 20%'(3턴) 부여
RICANO = 10428
ZETTO = 10441
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


def _team4(hakui_priority=None, ally_mode="strict"):
    """이론 T08 편성: 하쿠이 1번 + CD 3 전사 4명. ally_mode='strict' = 같은 턴 T4·T7·T10 에 모두 필살(예측 시나리오),
    'fixed' = 자동 계획(하쿠이 감소로 당겨짐 — 10444-AUTO-pull)."""
    return [CharSpec(HAKUI, position=1, priority=hakui_priority), CharSpec(SHIN, position=2, ult_mode=ally_mode),
            CharSpec(GOLDEN, position=3, ult_mode=ally_mode), CharSpec(CHOI, position=4, ult_mode=ally_mode),
            CharSpec(DAYANG, position=5, ult_mode=ally_mode)]


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
    res = _run([CharSpec(HAKUI, position=1), CharSpec(MUNG, position=2, ult_mode="strict")], altar=[ALTAR_MAX_CD])
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
    res = _run([CharSpec(HAKUI, position=1), CharSpec(SHIN, position=2, ult_mode="strict"),
                CharSpec(CHOI, position=3, ult_mode="strict")])
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
    res = _run([CharSpec(HAKUI, position=1), CharSpec(LIMBUEON, position=2, ult_mode="strict")])
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
    res = _run([CharSpec(HAKUI, position=1), CharSpec(UKYOUNG, position=2, ult_mode="strict")])
    assert _turns(_named(res, P2)) == [3, 3, 4, 4, 4, 4, 5, 5, 7, 7, 8, 8, 9, 9, 10, 10, 10, 10]


def test_synergy_codeb_vulnerable_rides_each_hakui_hit():
    """[precedent: 10444-SYN-10306] 열상은 받은 타격마다 — 열상 창(코드B 필살 T4·T7 뒤) 안의 하쿠이 T5·T8 보통 공격은
    파5·파2×2 로 3회씩 [5,5,5,8,8,8](10444-S11). 열상 이벤트는 하쿠이 hit 필터(rider 제외)에 섞이지 않는다."""
    res = _run([CharSpec(HAKUI, position=1), CharSpec(CODEB, position=2, ult_mode="strict")])
    riders = [ev for ev in res.state.log if ev.detail and "rider" in ev.detail and ev.actor_id == HAKUI]
    assert _turns(riders) == [5, 5, 5, 8, 8, 8]
    assert all(ev.detail.get("skillName") in (P2, P5) for ev in _hits(res))


# ── N8 시뮬레이터 검증에서 옮긴 가드 ──────────────────────────────────────────

def test_extra_damage_hits_only_current_target():
    """[precedent: 10444-target-current] 추가 피해의 '목표물' = 그 보통 공격의 현재 목표물 1명 — 더미 3에서도 파5 hit 는
    보통 공격 턴마다 1개 [1,3,4,5,6,8,9,10](10444-T02), 하쿠이 hit 의 대상은 한 더미뿐."""
    res = _solo(n_dummies=3)
    assert _turns(_named(res, P5)) == [1, 3, 4, 5, 6, 8, 9, 10]
    assert len({ev.detail.get("target") for ev in _hits(res)}) == 1


def test_basic_dmg_buffs_stay_on_hakui():
    """[precedent: 10444-P2-self-line] 파3 '필살기 시 자신 보통 공격 데미지 +60%(3턴)'와 기원 중첩당 +12% 는 하쿠이 자신만 —
    동료(신리랑·최유현, 각자 필살 T4·T7·T10) hit 의 평타뎀 성분에 하쿠이 항목이 없고, 하쿠이 T3 파5 에는 +60 하나
    (10444-X01, N8 추가 측정)."""
    res = _run([CharSpec(HAKUI, position=1), CharSpec(SHIN, position=2), CharSpec(CHOI, position=3)])
    ally = [c for cid in (SHIN, CHOI) for ev in _hits(res, cid)
            for c in ev.detail.get("eff", []) if c.get("by") == HAKUI]
    assert ally == []
    assert [c["v"] for c in _at(_named(res, P5), 3).detail["eff"] if c.get("by") == HAKUI] == [60.0]


def _mung_grant_turns(res):
    return _turns([ev for ev in _hits(res)
                   if ev.detail.get("skillName") == MUNG_SIGIL and ev.detail.get("skillPct") == 20])


def test_synergy_mung_grant_fires_on_damageless_basic():
    """[precedent: 10444-SYN-10417] [precedent: 10444-attack-scope] 멍 도장이 준 '보통 공격 시 ATK 20%'(3턴)는 본문 피해가
    없는 하쿠이 보통 공격에서도 발동한다. 하쿠이 1번(먼저 행동)이면 멍 필살(T1·T4·T7·T10) 다음 두 턴 [3,5,6,8,9]
    (10444-S01), 멍 1번이면 필살 당일부터 하쿠이 보통 공격 전부 [1,3,4,5,6,8,9,10](10444-S03)."""
    hakui_first = _run([CharSpec(HAKUI, position=1), CharSpec(MUNG, position=2, ult_mode="strict")])
    assert _mung_grant_turns(hakui_first) == [3, 5, 6, 8, 9]
    mung_first = _run([CharSpec(MUNG, position=1, ult_mode="strict"), CharSpec(HAKUI, position=2)])
    assert _mung_grant_turns(mung_first) == [1, 3, 4, 5, 6, 8, 9, 10]


def test_synergy_ricano_debuffs_land_on_next_turn_basic():
    """[precedent: 10444-dur-windows] 리카노(하쿠이 뒤 행동)의 보통 공격 '받는 데미지 +6.25%'·도장 '+18.75%'(각 2턴)는
    다음 턴 하쿠이 보통 공격에 실리고 하쿠이 행동 시점에 겹치지 않는다 — 파5 hit 마다 [턴, 리카노 받는딜](10444-S07)."""
    res = _run([CharSpec(HAKUI, position=1), CharSpec(RICANO, position=2, ult_mode="strict")])
    taken = [[ev.turn, round(sum(c["v"] for c in ev.detail.get("takenG", []) if c.get("by") == RICANO), 2)]
             for ev in _named(res, P5)]
    assert taken == [[1, 0], [3, 6.25], [4, 6.25], [5, 18.75], [6, 6.25], [8, 18.75], [9, 6.25], [10, 6.25]]


def test_anti_zetto_keeps_sigil_passive_closed():
    """[precedent: 10444-P2-grant-per-ex] [precedent: 10444-SIG-gate-timing] 안티: T08 편성의 다양수이를 제토(마지막 턴에만
    필살)로 바꾸면 T4·T7 아군 필살이 3회라 기원 ≧4 가 열리지 않는다 — 도장 패시브 hit 없음(10444-S13, 다양수이면 [5,8])."""
    team = _team4()
    team[4] = CharSpec(ZETTO, position=5)
    assert _sigil(_run(team)) == []


def test_compat_ukyoung_toggle_defers_hakui_ult():
    """[precedent: 10444-SYN-10439] 교차 점검(엔진 정책 _defer_ult_for_uk 일관성): 욱영 토글(ally_ult_after) ON 이면 T7 하쿠이
    필살이 욱영 회복 행동으로 밀려 T7 자연 행동은 위용 없는 보통 공격 — 파2 hit 턴(10444-C03, 토글 OFF 는 10444-S04)."""
    res = _run([CharSpec(HAKUI, position=1), CharSpec(UKYOUNG, position=2, ally_ult_after=True, ult_mode="strict")])
    assert _turns(_named(res, P2)) == [3, 3, 4, 4, 4, 4, 5, 5, 8, 8, 9, 9, 10, 10, 10, 10]


# ── 자동 계획 당김 (해석 10444-AUTO-pull · 사용자 결정 2026-10-07) ─────────────────

def test_auto_plan_pulls_ally_ults_by_hakui_cut():
    """[precedent: 10444-AUTO-pull] 자동(계획 없음) 동료는 하쿠이 필살의 '자신 제외 아군 필살 CD −1'로 일찍 찬 필살을 바로
    쓰고 주기를 거기서 다시 센다. CD 3 동료: T2 −1 → T3(종전 T4) · 주기 3 → T6 · T7 −1 → T8 = [3,6,8].
    '계획 턴만'(strict)은 당기지 않고 [4,7,10], '준비되면 바로'(asap)는 자동과 같다(확률 감소가 없을 때)."""
    for mode, want in (("fixed", [3, 6, 8]), ("asap", [3, 6, 8]), ("strict", [4, 7, 10])):
        res = _run(_team4(ally_mode=mode))
        for cid in (SHIN, GOLDEN, CHOI, DAYANG):
            assert _fatal_turns(res, cid) == want, (mode, cid)
    assert _turns(_sigil(_run(_team4(ally_mode="fixed")))) == [4, 9]   # 동료 4명 T3·T8 필살 → 다음 하쿠이 보통 공격


def test_auto_plan_unchanged_without_external_cut():
    """[precedent: 10444-AUTO-pull] 다른 동료의 확정 CD 감소가 없으면 자동 계획은 종전 그대로 — 하쿠이 대신 무명이면 [4,7,10].
    특수 리듬(이태호 '첫 행동만 필살')은 하쿠이가 있어도 당기지 않는다."""
    team = _team4()
    team[0] = CharSpec(MUMYEONG, position=1)
    for i in range(1, 5):
        team[i] = CharSpec(team[i].char_id, position=i + 1)
    res = _run(team)
    assert all(_fatal_turns(res, cid) == [4, 7, 10] for cid in (SHIN, GOLDEN, CHOI, DAYANG))
    taeho = 10423
    assert _fatal_turns(_run([CharSpec(taeho, position=1), CharSpec(HAKUI, position=2)]), taeho) ==         _fatal_turns(_run([CharSpec(taeho, position=1), CharSpec(SHIN, position=2)]), taeho) == [1]


def test_auto_plan_pull_ignores_probabilistic_altar_cut():
    """[precedent: 10444-AUTO-pull] 당김은 '확정' CD 만 본다 — 제단 1012(행동 시 30% 자기 CD −1)를 확률 100%로 터뜨려도
    자동 동료는 하쿠이 감소만큼만 당겨 [3,6,8](제단 없을 때와 같음). 확률 감소까지 쓰는 건 '준비되면 바로'의 몫."""
    team = lambda m: [CharSpec(HAKUI, position=1), CharSpec(SHIN, position=2, ult_mode=m),
                      CharSpec(CHOI, position=3, ult_mode=m)]
    auto = _fatal_turns(_run(team("fixed"), altar=[ALTAR_ACT_CD], force_proc=True), SHIN)
    assert auto == _fatal_turns(_run(team("fixed")), SHIN) == [3, 6, 8]
    asap = _fatal_turns(_run(team("asap"), altar=[ALTAR_ACT_CD], force_proc=True), SHIN)
    assert len(asap) > len(auto)


def test_user_plan_is_not_pulled_by_engine():
    """[precedent: 10444-AUTO-pull] 사용자 계획(rotation)은 엔진이 당기지 않는다 — 직접 지정 줄은 화면 플래너가 하쿠이 감소를
    반영해 채운 줄을 보낸다(core/plan.js). 같은 계획을 문자열로 주면 [4,7,10] 그대로."""
    res = _run([CharSpec(HAKUI, position=1), CharSpec(SHIN, position=2, rotation="평평평궁|평평궁")])
    assert _fatal_turns(res, SHIN) == [4, 7, 10]


def test_auto_pull_waits_for_ukyoung_with_toggle():
    """[precedent: 10444-AUTO-pull] [precedent: 10444-SYN-10439] 욱영 토글(인접 아군 필살 나중) ON 이면 당겨진 필살도 욱영 필살 뒤
    회복 행동에서 — T3 인접 신리랑: 보통 공격 → 욱영 필살 → 신리랑 필살."""
    team = [CharSpec(UKYOUNG, position=1, ally_ult_after=True), CharSpec(SHIN, position=2), CharSpec(HAKUI, position=3),
            CharSpec(CHOI, position=4), CharSpec(DAYANG, position=5)]
    res = _run(team)
    seq, seen = [], set()
    for ev in sorted(res.state.log, key=lambda e: e.action_id):
        if ev.turn == 3 and ev.actor_id in (UKYOUNG, SHIN) and ev.action_id not in seen                 and ev.action_kind in ("보통공격", "필살기"):
            seen.add(ev.action_id)
            seq.append((ev.actor_id, ev.action_kind))
    assert seq == [(SHIN, "보통공격"), (UKYOUNG, "필살기"), (SHIN, "필살기")]
    assert _fatal_turns(res, SHIN) == [3, 6, 8]


def _blocked(res):
    """CD 변동 면역으로 무효가 된 CD 감소 — (턴, 감소를 준 동료)."""
    return sorted({(ev.turn, ev.actor_id) for ev in res.state.log if "면역으로 무효" in ev.text})


@pytest.mark.parametrize("carry", [SHIN, UKYOUNG])
def test_auto_pull_with_limbueon_immunity_anti_synergy(carry):
    """[precedent: 10444-AUTO-pull] [precedent: 10444-SYN-10410] 하쿠이 + 임부언 + 1번 자리 캐리(신리랑·욱영, CD 3) 20턴 — 손 계산:
    T2 하쿠이 −1 → T3 캐리 자기 행동 필살 + 임부언(당겨짐) −3 → 받은 추가 행동 필살(면역 3~5) · T6 같은 더블(면역 6~8) ·
    역시너지: 하쿠이 −1(7·12·17)은 늘 1번 면역 기간이라 무효 · 임부언은 하쿠이에 당겨져 3·6·8·11·13·16·18 →
    8·13·18 의 −3 은 면역으로 무효(추가 행동 평타), 11·16 은 면역 밖이라 CD 1 → 0 → 추가 행동 필살 → 캐리 자기 행동 필살은
    그 뒤 3턴(14·19). 캐리 필살 = 자기 행동 3·6·9·14·19 + 추가 행동 3·6·11·16."""
    res = _run([CharSpec(carry, position=1), CharSpec(LIMBUEON, position=2), CharSpec(HAKUI, position=3),
                CharSpec(CHOI, position=4), CharSpec(DAYANG, position=5)], max_turn=20)
    assert _fatal_turns(res, carry) == [3, 3, 6, 6, 9, 11, 14, 16, 19]
    for cid in (LIMBUEON, CHOI, DAYANG):
        assert _fatal_turns(res, cid) == [3, 6, 8, 11, 13, 16, 18], cid
    assert _fatal_turns(res, HAKUI) == [2, 7, 12, 17]
    assert _blocked(res) == [(7, HAKUI), (8, LIMBUEON), (12, HAKUI), (13, LIMBUEON), (17, HAKUI), (18, LIMBUEON)]


def test_fed_carry_bonus_ult_rephases_own_rhythm():
    """[precedent: 10444-AUTO-pull] 하쿠이 편성의 1번 자리 캐리가 받은 추가 행동에서 쓴 필살(오렘 T11)은 쿨을 계획 주기 밖에서
    새로 돌린다 → 다음 자기 행동 필살은 계획 칸(T15)이 아니라 확정 쿨이 찬 T14. 오렘 [3,3,6,6,9,11,14,16]."""
    res = _run([CharSpec(10419, position=1), CharSpec(10437, position=2), CharSpec(HAKUI, position=3),
                CharSpec(10427, position=4), CharSpec(LIMBUEON, position=5)], max_turn=16)
    assert _fatal_turns(res, 10419) == [3, 3, 6, 6, 9, 11, 14, 16]


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
