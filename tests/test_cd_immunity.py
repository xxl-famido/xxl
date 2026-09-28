"""시한부 필살 CD 변동 면역(임부언 10410 필살/도장) 가드.

원문: "아군 포지션 1에 위치한 동료의 필살기 CD 3 감소 / … 필살기 CD 변동 효과에 면역됨(3턴)".
- CD 감소가 먼저 적용되고 그 뒤 면역 부여(같은 필살 안).
- 면역 중엔 자기·아군·제단(1012·1013)·성공 가정 CD 변동이 모두 무효, 필살 후 CD 재설정은 허용.
- 제토(10441)의 영구 'Immune to EX Skill CD changes.'(MARKER → Unit.cd_immune)는 그대로.
"""
from __future__ import annotations

from woofia_sim.effects import CD_IMMUNE, CD_MOD, MARKER
from woofia_sim.engine import _kit_has_cd_immune
from woofia_sim.harness import CharSpec, run_team
from woofia_sim.kit import resolve_kit

ANUBI, IMBUEON, ZETTO = 10401, 10410, 10441
ANUBI_NAME = "명계 경비견 아누비로스"
BLOCK = "CD 변동 면역으로 무효"


def test_parser_timed_immunity_after_cd_cut():
    for rune in (False, True):
        effs = resolve_kit(IMBUEON, rune=rune).fatal.effects
        kinds = [e.kind for e in effs]
        assert CD_IMMUNE in kinds, kinds
        imm = effs[kinds.index(CD_IMMUNE)]
        assert imm.target == "position_1" and imm.duration == 3
        # 원문 순서: CD 감소가 면역보다 먼저
        assert kinds.index(CD_MOD) < kinds.index(CD_IMMUNE)


def test_zetto_permanent_immunity_untouched():
    kit = resolve_kit(ZETTO, rune=True)
    assert any(e.kind == MARKER and e.raw.startswith("Immune to") for e in kit.fatal.effects)
    assert not any(e.kind == CD_IMMUNE for e in kit.fatal.effects)
    assert _kit_has_cd_immune(kit)


def _check_window(log):
    """아누비로스(P1)의 CD 변동 로그가 '면역 부여 턴(부여 이후)~+2턴'에서만 무효로 찍히는지."""
    grant_turn = None
    blocked = applied = 0
    for ev in log:
        if "CD 변동 면역(" in ev.text and ANUBI_NAME in ev.text:
            grant_turn = ev.turn
            continue
        is_anubi_cd = ev.actor == ANUBI_NAME and "필살 CD" in ev.text and ev.text.startswith("발동")
        if not is_anubi_cd:
            continue
        immune = grant_turn is not None and ev.turn <= grant_turn + 2
        if immune:
            assert BLOCK in ev.text, f"T{ev.turn} 면역 중인데 적용됨: {ev.text}"
            blocked += 1
        else:
            assert BLOCK not in ev.text, f"T{ev.turn} 면역 밖인데 무효: {ev.text}"
            applied += 1
    return blocked, applied


def test_altar_cd_cut_blocked_during_immunity():
    res = run_team([CharSpec(ANUBI), CharSpec(IMBUEON)], max_turn=10,
                   altar=[1012, 1013], force_proc=True)
    blocked, applied = _check_window(res.state.log)
    assert blocked > 0 and applied > 0


def test_assist_success_not_banked_during_immunity():
    """성공 가정 ON: 면역 중 확률 CD 감소는 적립되지 않고 무효 로그. 임부언이 매 턴 필살해 면역이 이어지면
    아누비로스는 자연 충전(3턴 주기)으로만 필살하고, 재필살 시 임부언의 CD-3도 막힌다(면역만 갱신)."""
    res = run_team([CharSpec(ANUBI, rotation="평궁", ult_assist=True),
                    CharSpec(IMBUEON, rotation="궁", ult_assist=True)],
                   max_turn=10, altar=[1012, 1013])
    log = res.state.log
    assert any("성공 가정 적립 안 함" in ev.text for ev in log)
    assert any(ev.actor == "임부언" and ANUBI_NAME in ev.text and "필살 CD -3" in ev.text and BLOCK in ev.text
               for ev in log), "면역 중 재필살의 CD-3이 막히지 않음"
    ult_turns = sorted({ev.turn for ev in log if ev.actor == ANUBI_NAME and ev.action_kind == "필살기"})
    assert ult_turns == [3, 6, 9], ult_turns


def test_no_imbueon_no_immunity_logs():
    res = run_team([CharSpec(ANUBI)], max_turn=10, altar=[1012, 1013], force_proc=True)
    assert not any("CD 변동 면역" in ev.text for ev in res.state.log)
