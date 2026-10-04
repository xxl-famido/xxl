"""시바히코(10301) 메커니즘 가드 — 데미지 절대값이 아닌 '발동 턴·행동 구조·채널·비율'만 본다.

정체성: 필살(CD 3)로 아군 전체에 고정 ATK 가산(시바히코 기초 ATK 15%)과 ATK 25% 배리어를 주고,
도장이면 '공격 시 자기 배리어의 33.75%로 목표물에게 데미지'(2턴)를 아군 전체에 심는다.
보통 공격 33%·방어 시 HP% 최저 아군에게 배리어를 더 얹는다.

배리어치 데미지(이하 S-3) hit = detail.skillId 10301 · baseLabel '배리어' · act '발동' · amount > 0,
보유자(공격한 동료) = LogEvent.actor_id. 기대값은 이 동료의 예측(10301-T·S·C)에서 가져왔다.
"""
from __future__ import annotations

import pytest

from woofia_sim.harness import CharSpec, run_team

SHIBA = 10301
SHIBA_BASIC = "누가 뚱냥이라...!"
SHIBA_FATAL = "내 동작 똑바로 봐~"
SHIBA_P2 = "기맥 자유술"
DAYANG = 10412      # 다양수이 — 피격 반응·배리어가 없는 중립 동반자(전사)
OREM = 10419
DARAWAN = 10438
LIMBUEON = 10410
TAEHO = 10423
UKYOUNG = 10439
JETBLACK = 10418
MUMYEONG = 10443


def _run(team, **kw):
    kw.setdefault("n_dummies", 1)
    kw.setdefault("max_turn", 10)
    kw.setdefault("seed", 0)
    kw.setdefault("never_proc", not kw.get("force_proc", False))
    return run_team(team, **kw)


def _solo(**kw):
    rotation = kw.pop("rotation", None)
    return _run([CharSpec(SHIBA, position=1, rune=True, rotation=rotation)], **kw)


def _s3(res, holder=None):
    return [ev for ev in res.state.log
            if (ev.detail or {}).get("skillId") == SHIBA and (ev.detail or {}).get("baseLabel") == "배리어"
            and (ev.detail or {}).get("act") == "발동" and ev.amount > 0
            and (holder is None or ev.actor_id == holder)]


def _turns(evs):
    return [ev.turn for ev in evs]


def _at(evs, turn, last=False):
    sel = [ev for ev in evs if ev.turn == turn]
    assert sel, f"T{turn} 이벤트 없음"
    return sel[-1] if last else sel[0]


def _fatal_actions(res, cid):
    """필살 행동(action_id 중복 제거)의 (턴, action_id) 목록."""
    seen, out = set(), []
    for ev in res.state.log:
        if ev.action_kind == "필살기" and ev.actor_id == cid and ev.action_id not in seen:
            seen.add(ev.action_id)
            out.append((ev.turn, ev.action_id))
    return out


def _basic_hits(res, cid, skill_name=None):
    return [ev for ev in res.state.log
            if ev.actor_id == cid and ev.action_kind == "보통공격" and ev.amount > 0
            and (ev.detail or {}).get("act") == "평타"
            and (skill_name is None or (ev.detail or {}).get("skillName") == skill_name)]


def _barriers(res, skill_name, act):
    return [ev for ev in res.state.log
            if (ev.detail or {}).get("kind") == "barrier" and ev.src_id == SHIBA
            and (ev.detail or {}).get("skillName") == skill_name and (ev.detail or {}).get("act") == act]


def test_sigil_trigger_skips_the_installing_ult():
    """[assumed: 10301-SIG-same-action] 도장 필살이 막 심은 '공격 시' 트리거는 그 필살 행동에서는 발동하지 않는다.
    솔로 기본 계획(필살 T4·T7·T10): 자기 S-3 는 다음 보통 공격 T5·T8 뿐, 창이 닫힌 T6·T9 도 없음(예측 T03).
    제단 402(필살 CD +1, 필살 T5·T9)면 T6·T10(예측 T16)."""
    res = _solo()
    assert [t for t, _ in _fatal_actions(res, SHIBA)] == [4, 7, 10]
    hits = _s3(res, SHIBA)
    assert _turns(hits) == [5, 8]
    fatal_ids = {aid for _, aid in _fatal_actions(res, SHIBA)}
    assert not any(ev.action_id in fatal_ids for ev in hits), "설치한 필살 행동에서 S-3 가 발동함"
    assert _turns(_s3(_solo(altar=[402]), SHIBA)) == [6, 10]


def test_fed_carry_second_sigil_fires_through_refreshed_window():
    """[assumed: 10301-SYN-10410] 임부언 fed carry(시바히코 1번): 같은 턴 두 번째 도장 필살은 첫 필살이 연 창을
    갱신할 뿐이라(설치 행동 id 는 최초 설치 값 유지) S-3 를 쏜다 — 자기 S-3 [4,5,7,8,10](예측 C02).
    [precedent: 10301-SYN-10410 — 엔진 처리] 필살 행동은 T4·T7·T10 에 2회씩(예측 C03),
    두 번째 필살 S-3 는 임부언이 남긴 주는딜(+7.5%×2)을 받아 T5 S-3 의 1.15배(예측 C04)."""
    res = _run([CharSpec(SHIBA, position=1, rune=True), CharSpec(LIMBUEON, position=2, rune=True)])
    fatals = _fatal_actions(res, SHIBA)
    assert [t for t, _ in fatals] == [4, 4, 7, 7, 10, 10]
    hits = _s3(res, SHIBA)
    assert _turns(hits) == [4, 5, 7, 8, 10]
    second_ids = {aid for i, (_, aid) in enumerate(fatals) if i % 2 == 1}
    assert {ev.action_id for ev in hits if ev.turn in (4, 7, 10)} <= second_ids, "첫 필살(설치 행동)에서 발동함"
    assert _at(hits, 4, last=True).amount / _at(hits, 5).amount == pytest.approx(1.15, rel=0.002)


def test_same_turn_separate_actions_still_fire():
    """설치 행동 제외는 행동 id 단위다(유닛·턴 단위가 아님) — 같은 턴의 별개 행동은 발동한다.
    [precedent: 10301-SIG-attack-scope — 엔진 처리] 이태호(턴당 2행동, 시바히코 뒤 순서): 창 안 턴마다 두 행동 모두 S-3(예측 C01).
    [assumed: 10301-SIG-same-action] 욱영 도장 회복 행동(토글 끔): 시바히코가 필살 뒤 같은 턴 보통 공격에서 S-3 — [4,5,7,8,10](예측 C05)."""
    res = _run([CharSpec(SHIBA, position=1, rune=True), CharSpec(TAEHO, position=2, rune=True)])
    assert _turns(_s3(res, TAEHO)) == [4, 4, 5, 5, 7, 7, 8, 8, 10, 10]
    res = _run([CharSpec(SHIBA, position=1, rune=True),
                CharSpec(UKYOUNG, position=2, rune=True, ally_ult_after=False)])
    assert _turns(_s3(res, SHIBA)) == [4, 5, 7, 8, 10]
    assert _turns(_basic_hits(res, SHIBA, SHIBA_BASIC)) == list(range(1, 11)), "회복 행동이 보통 공격이 아님(예측 C06)"


def test_channels_and_flat_atk_structure():
    """채널: 필살 배리어 = 필살(EX효과), 파2 배리어 = 발동(발동효과), S-3 = 발동(발동효과) — 배리어 기반 피해 채널은
    원본 채널 대조 도구가 보지 않아 여기서 고정한다(해석 10301-trigger-channels).
    [precedent: 10301-ULT-flat-atk-base — 엔진 처리] 고정 가산 = 기초 ATK × (1 + 기초 ATK% 합) × 15%(detail.calc flatAtk),
    가산 중 보통 공격은 T1 의 (1.12+0.15)/1.12 배(도장 OFF, 예측 T05)."""
    res = _solo(force_proc=True)
    fatal_bar = _at(_barriers(res, SHIBA_FATAL, "필살"), 4)
    assert fatal_bar.detail["effLabel"] == "EX효과"
    p2 = _barriers(res, SHIBA_P2, "발동")
    assert p2 and all(ev.detail["effLabel"] == "발동효과" for ev in p2)
    s3 = _at(_s3(res, SHIBA), 5)
    assert s3.detail["effLabel"] == "발동효과" and s3.detail["skillName"] == SHIBA_FATAL
    flat = next(ev for ev in res.state.log if ev.turn == 4 and (ev.detail or {}).get("calc") == "flatAtk")
    d = flat.detail
    base_pct = sum(c["v"] for c in d["baseAtk"])
    assert d["val"] == pytest.approx(d["base"] * (1 + base_pct / 100) * 0.15, abs=0.01)
    off = _run([CharSpec(SHIBA, position=1, rune=False)])
    basics = _basic_hits(off, SHIBA, SHIBA_BASIC)
    assert _at(basics, 5).amount / _at(basics, 1).amount == pytest.approx(1.133929, rel=0.002)
    assert not _s3(off), "도장 OFF 인데 S-3 발동"


def test_window_covers_later_actors_on_ult_turn():
    """[precedent: 10301-dur-2turn-window — 엔진 처리(행동 순서)] 창 2턴: 시바히코보다 뒤에 행동하는 동료(다양수이 전사)는
    필살 턴과 다음 턴 — [4,5,7,8,10](예측 T11). 먼저 행동하면(priority 0) 다음 턴만 — [5,8](예측 T12)."""
    res = _run([CharSpec(DAYANG, position=1, rune=True), CharSpec(SHIBA, position=2, rune=True)])
    assert _turns(_s3(res, DAYANG)) == [4, 5, 7, 8, 10]
    res = _run([CharSpec(DAYANG, position=1, rune=True, priority=0), CharSpec(SHIBA, position=2, rune=True)])
    assert _turns(_s3(res, DAYANG)) == [5, 8]


def test_material_is_holders_current_barrier():
    """[precedent: 10301-ULT-order · 10301-SIG-barrier-base · 10301-P-lowest-hp — 엔진 처리] 재료 = 보유자의 그 순간 배리어 합.
    솔로 T5 S-3 = 같은 행동 보통 공격 × 0.3375 × 0.25(필살 배리어만, 같은 행동 파2 배리어는 피해 뒤)(예측 T04).
    다양수이(1번) T5 S-3 는 같은 턴 먼저 들어간 시바히코 파2 배리어(ATK 100%, 동률 → 목록 첫 동료)로 5배(예측 T14)."""
    res = _solo(force_proc=True)
    s3 = _at(_s3(res, SHIBA), 5)
    assert s3.amount / _at(_basic_hits(res, SHIBA, SHIBA_BASIC), 5).amount == pytest.approx(0.084375, rel=0.005)
    assert [c["src"] for c in s3.detail["barrierComp"]] == [SHIBA_FATAL], "같은 행동 파2 배리어가 재료에 들어감"
    team = [CharSpec(DAYANG, position=1, rune=True), CharSpec(SHIBA, position=2, rune=True)]
    with_p2 = _at(_s3(_run(team, force_proc=True), DAYANG), 5).amount
    without = _at(_s3(_run(team), DAYANG), 5).amount
    assert with_p2 / without == pytest.approx(5.0, rel=0.005)


def test_synergy_orem_barrier_gate_and_material():
    """[precedent: 10301-SYN-10419 — 엔진 처리] 시너지 오렘: 시바히코(보조)가 필살 턴마다 오렘(수호)보다 먼저 아군 전체 배리어를 깔아
    오렘 도장 패시브 '배리어 보유 시 공격 25%'가 오렘 필살 턴에도 열린다 — [4,5,7,8,10](예측 S03, 다양수이 동반이면 [5,8]).
    역으로 오렘 필살 배리어가 시바히코 T5 S-3 재료에 더해져 중립 편성(다양수이 1번) 대비 7.036592배(예측 S01)."""
    def orem_25(res):
        return [ev.turn for ev in res.state.log
                if ev.actor_id == OREM and ev.amount > 0 and ev.action_kind in ("필살기", "보통공격")
                and (ev.detail or {}).get("skillName") == "현측 방어 전개"
                and (ev.detail or {}).get("baseLabel") == "ATK" and (ev.detail or {}).get("act") == "발동"]
    res = _run([CharSpec(OREM, position=1, rune=True), CharSpec(SHIBA, position=2, rune=True)])
    assert orem_25(res) == [4, 5, 7, 8, 10]
    assert orem_25(_run([CharSpec(OREM, position=1, rune=True), CharSpec(DAYANG, position=2, rune=True)])) == [5, 8]
    base = _run([CharSpec(DAYANG, position=1, rune=True), CharSpec(SHIBA, position=2, rune=True)])
    ratio = _at(_s3(res, SHIBA), 5).amount / _at(_s3(base, SHIBA), 5).amount
    assert ratio == pytest.approx(7.036592, rel=0.005)


def test_darawan_defense_stance_ult_counts_as_attack():
    """[precedent: 10301-SYN-10438 — 엔진 처리] 다라완 필살(방어 상태 전환·조롱, 피해 없음)도 필살기 행동이라 '공격 시' S-3 가
    발동한다 — 다라완 S-3 [4,5,7,8,10](예측 S13). 방어 토큰 행동만 '공격'에서 빠진다(다음 테스트)."""
    res = _run([CharSpec(SHIBA, position=1, rune=True), CharSpec(DARAWAN, position=2, rune=True)], enemy_hits=0)
    assert _turns(_s3(res, DARAWAN)) == [4, 5, 7, 8, 10]


def test_defend_is_not_attack_and_damage_drains_material():
    """[assumed: 10301-SIG-same-action] 필살 다음 턴을 방어로 쓰면(평평평궁|방평궁) 창 안 행동이 설치 필살(제외)과 방어('공격' 아님)뿐 —
    시바히코 S-3 없음(예측 T10). [precedent: 10301-SIG-barrier-base — 엔진 처리] T4 턴 피해 30% 가 필살 배리어를 다 흡수하면
    T5 S-3 재료 0 → 발동은 T8 뿐(예측 T17)."""
    assert _s3(_solo(rotation="평평평궁|방평궁"), SHIBA) == []
    res = _solo(turn_damage=[0, 0, 0, 30, 0, 0, 0, 0, 0, 0])
    assert _turns(_s3(res, SHIBA)) == [8]


# ── N8 검증에서 옮긴 구조 가드 (동결 예측 10301-T02·T06·T08·T13·S04·S08·S11 + 추가 측정 X02·X03) ──

def _recipient_ids(res, events):
    """배리어 부여 로그의 수령자(detail.target 유닛 이름) → char_id."""
    by_name = {u.name: getattr(u._kit, "char_id", 0) for u in res.state.allies}
    return [by_name.get((ev.detail or {}).get("target")) for ev in events]


def test_basic_attack_is_single_target_and_flat_window_is_two_turns():
    """보통 공격은 목표물 1명 — 더미 3에서도 시바히코 보통 공격 hit 는 턴당 1개(예측 T02).
    [precedent: 10301-dur-2turn-window — 엔진 처리] 필살 고정 가산(2턴)이 시바히코 보통 공격에 걸리는 턴은
    필살 다음 턴뿐 — 도장 OFF 에서 T1 보다 1% 넘게 큰 보통 공격 hit 는 T5·T8(예측 T06)."""
    res = _run([CharSpec(SHIBA, position=1, rune=True)], n_dummies=3)
    hits = _basic_hits(res, SHIBA, SHIBA_BASIC)
    assert _turns(hits) == [1, 2, 3, 5, 6, 8, 9]
    assert {ev.detail["target"] for ev in hits} == {"더미1"}
    off = _basic_hits(_run([CharSpec(SHIBA, position=1, rune=False)]), SHIBA, SHIBA_BASIC)
    t1 = _at(off, 1).amount
    assert [ev.turn for ev in off if ev.amount > 1.01 * t1] == [5, 8]


def test_p2_barrier_every_basic_in_force_mode_to_first_listed_on_tie():
    """[precedent: 10301-P1-chance-force — 엔진 처리] 확률 100% 모드: 파2 배리어는 시바히코 보통 공격 7회 모두, 필살 턴 없음(예측 T08).
    [precedent: 10301-P-lowest-hp — 엔진 처리(동률 = 목록 첫 동료)] 피해 없는 2인 팀(다양수이 1번)은 모두 HP 100% 동률이라
    파2 배리어 7개가 전부 다양수이에게 간다(예측 T13)."""
    assert _turns(_barriers(_solo(force_proc=True), SHIBA_P2, "발동")) == [1, 2, 3, 5, 6, 8, 9]
    res = _run([CharSpec(DAYANG, position=1, rune=True), CharSpec(SHIBA, position=2, rune=True)], force_proc=True)
    assert _recipient_ids(res, _barriers(res, SHIBA_P2, "발동")) == [DAYANG] * 7


def test_synergy_mumyeong_self_damage_pulls_p2_barrier():
    """[precedent: 10301-SYN-10443 · 10301-P-lowest-hp] [assumed: 10443-ULT-selfdmg-real] 시너지 무명: 무명 T1 필살 자해로
    HP% 최저가 된 무명이 T2 부터 시바히코 파2 배리어를 받는다 — T1 만 동률(전원 100%)이라 목록 첫 시바히코(예측 S04)."""
    res = _run([CharSpec(SHIBA, position=1, rune=True), CharSpec(MUMYEONG, position=2, rune=True)], force_proc=True)
    assert _recipient_ids(res, _barriers(res, SHIBA_P2, "발동")) == [SHIBA] + [MUMYEONG] * 6


def test_anti_barriers_delay_mumyeong_low_hp_gate():
    """[precedent: 10301-SYN-10443 (iii) · 10301-BAR-instances] [assumed: 10443-ULT-selfdmg-real · 10443-HP-pool-scale]
    안티 무명: T2 턴 피해 45% 를 시바히코 파2·필살 배리어가 흡수해 무명 HP 가 60% 로 남는다 — 무명 'HP≦50% 보통 공격 데미지 +30%'
    는 T3·T4 에 열리지 않고 T5 자해 뒤 T6·T7·T8·T10 에만(예측 S08, 다양수이 동반이면 [3,4,6,7,8,10])."""
    res = _run([CharSpec(SHIBA, position=1, rune=True), CharSpec(MUMYEONG, position=2, rune=True)],
               force_proc=True, turn_damage=[0, 45, 0, 0, 0, 0, 0, 0, 0, 0])
    gated = [ev.turn for ev in _basic_hits(res, MUMYEONG, "참격세")
             if any("HP≦50%" in str(c.get("cond", "")) for c in (ev.detail or {}).get("eff", []))]
    assert gated == [6, 7, 8, 10]


def test_anti_jetblack_first_slot_acts_before_window_on_ult_turn():
    """[precedent: 10301-dur-2turn-window · 10301-SIG-attack-scope — 엔진 처리(같은 보조끼리 자리 순)] 안티 제트블랙:
    제트블랙을 1번에 두면 필살 턴마다 시바히코보다 먼저 행동해 필살 턴 당일은 창 밖 — 제트블랙 S-3 는 T5·T8 뿐(예측 S11)."""
    res = _run([CharSpec(JETBLACK, position=1, rune=True), CharSpec(SHIBA, position=2, rune=True)])
    assert _turns(_s3(res, JETBLACK)) == [5, 8]


def test_grants_outlive_incapacitated_shibahiko():
    """[assumed: 10301-DEATH-grant-persist] 시바히코가 T4 턴 피해 110% 로 전투불능이 돼도, 그 턴 도장 필살이 다양수이에게 준
    S-3 창과 고정 가산은 만료(T6 시작)까지 남는다 — 다양수이 S-3 발동 이벤트(금액 무관, 배리어는 턴 피해로 소진) T4·T5,
    T5 보통 공격에 시바히코 고정 가산 항목(N8 추가 측정 10301-X02·X03)."""
    res = _run([CharSpec(DAYANG, position=1, rune=True), CharSpec(SHIBA, position=2, rune=True)],
               force_proc=True, turn_damage=[0, 0, 0, 110, 0, 0, 0, 0, 0, 0])
    deaths = [ev.turn for ev in res.state.log if ev.actor_id == SHIBA and (ev.detail or {}).get("kind") == "death"]
    assert deaths == [4]
    fired = [ev.turn for ev in res.state.log
             if ev.actor_id == DAYANG and (ev.detail or {}).get("skillId") == SHIBA
             and (ev.detail or {}).get("baseLabel") == "배리어" and (ev.detail or {}).get("act") == "발동"]
    assert fired == [4, 5]
    t5 = _at([ev for ev in res.state.log if ev.actor_id == DAYANG and ev.action_kind == "보통공격"
              and (ev.detail or {}).get("act") == "평타" and (ev.detail or {}).get("skillId") == DAYANG], 5)
    assert SHIBA_FATAL in [c.get("skill") for c in t5.detail.get("flat", [])]


def test_barrier_drilldown_pre_hit_only_within_the_hit_phase():
    """드릴다운 표시(barrierPre '기존 배리어 − 소모')는 그 피격의 적 페이즈 반격에만 붙는다. 피격 10% 에서 다음 턴 아군 페이즈의
    S-3 에 직전 적 페이즈 값이 남으면 만료·새 배리어가 빠진 숫자(예: 기준 33,688 옆 '기존 8,422 − 소모 8,422')가 보였다(N8-② 검수).
    다라완 필살 반격(적 페이즈)은 '기존 − 소모 = 기준 배리어'로 그대로 표시된다. 데미지 수치와 무관한 표시 필드다."""
    res = _run([CharSpec(DAYANG, position=1, rune=True), CharSpec(SHIBA, position=2, rune=True)],
               force_proc=True, incoming_hp_pct=10)
    hits = [ev for ev in res.state.log if (ev.detail or {}).get("skillId") == SHIBA
            and (ev.detail or {}).get("baseLabel") == "배리어" and (ev.detail or {}).get("act") == "발동"]
    assert len(hits) == 7 and all(ev.detail["barrierPre"] is None for ev in hits)
    res = _run([CharSpec(SHIBA, position=1, rune=True), CharSpec(DARAWAN, position=2, rune=True)],
               force_proc=True, incoming_hp_pct=10)
    counters = [ev.detail for ev in res.state.log if ev.action_kind == "피격" and ev.actor_id == DARAWAN
                and (ev.detail or {}).get("baseLabel") == "배리어" and "final" in ev.detail]
    assert counters and all(d["barrierPre"] is not None
                            and d["barrierPre"] - d["barrierConsumed"] == pytest.approx(d["base"], abs=0.02)
                            for d in counters)
