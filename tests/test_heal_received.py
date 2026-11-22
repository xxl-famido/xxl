"""'치료를 받을 때' 트리거(on_heal_received, 원본 eff20005) 판정 가드 — 피드백 행 35.

다라완 파4(파도 위의 서퍼) · 몽규 파2(스탯이 부족하면... 스킬로!) · 델라크로이 파4(생명 방어선)는 같은 트리거다.
반응하는 치료 = 행동 본문의 치료 진행(보통 공격·필살기 판정) + 본문이 설치한 지속 치료의 틱.
반응하지 않는 치료 = 발동 효과로 들어온 치료('…치료 진행' 발동) + 발동이 설치한 지속 치료의 틱 · 흡혈.
해석 기록 mining/autonomy/interpretations/10448.json `10448-P4-heal-source` [feedback-confirmed].

시나리오 동료: 몽규 파1 '연쇄 치료 반응'(행동 시 발동 치료) · 맹씨 파1 '취심신왕'(보통 공격 시 발동 지속 치료) ·
레오 파1 '파티꾼 레오'(보통 공격 시 발동 지속 치료) · 맹씨 필살기·레오 보통 공격(본문 지속 치료).
"""
from __future__ import annotations

from woofia_sim.harness import CharSpec, run_team

DELA, DARAWAN, MONGGYU, MENG, LEO = 10448, 10438, 10440, 10404, 10406
TRIGGERED = "발동"
DIRECT = ("평타", "필살")


# 반응 로그 = 트리거 스킬의 '치료를 받을 때' 줄만(같은 스킬의 다른 줄 — 다라완 필살기 시 배리어·몽규 집중 소모 — 은 뺀다)
def DELA_P4(ev) -> bool:
    return ev.src_skill == "생명 방어선" and bool(ev.detail) and ev.detail.get("kind") == "barrier"


def DARAWAN_P4(ev) -> bool:
    return ev.src_skill == "파도 위의 서퍼" and "받는배리어" in ev.text


def MONGGYU_P2(ev) -> bool:
    return ev.src_skill == "스탯이 부족하면... 스킬로!" and "집중 +" in ev.text


def _run(ids, max_turn=4):
    team = [CharSpec(c, position=i + 1) for i, c in enumerate(ids)]
    return run_team(team, n_dummies=1, max_turn=max_turn, seed=0, never_proc=True)


def _heals(res):
    """즉시 치료와 지속 치료 틱 로그(지속 치료 '설치' 로그는 detail.hot 이 있어 뺀다)."""
    return [ev for ev in res.state.log
            if ev.detail and ev.detail.get("kind") == "heal" and "hot" not in ev.detail]


def _pairs(res, is_response):
    """반응 로그마다 같은 행동 묶음에서 바로 앞에 같은 수령자가 받은 치료 로그를 짝짓는다(반응은 치료 직후에 기록된다)."""
    last: dict = {}
    pairs = []
    for ev in res.state.log:
        d = ev.detail or {}
        if d.get("kind") == "heal" and "hot" not in d:
            last[(ev.action_id, d.get("target"))] = ev
        elif is_response(ev):
            pairs.append((ev, last.get((ev.action_id, ev.actor))))
    return pairs


def _kinds(heals):
    """시나리오가 네 종류 치료를 다 지나가는지: (즉시|틱, 판정)."""
    return {("틱" if ev.action_kind == "지속힐" else "즉시", ev.detail["act"]) for ev in heals}


def test_scenario_covers_direct_and_triggered_instant_and_tick_heals():
    """[시나리오 확인] 아래 가드가 발동 즉시 치료·발동 지속 치료 틱·본문 즉시 치료·본문 지속 치료 틱을 모두 지나간다."""
    kinds = _kinds(_heals(_run([DELA, MONGGYU, MENG, LEO])))
    assert {("즉시", "평타"), ("즉시", "발동"), ("틱", "필살"), ("틱", "평타"), ("틱", "발동")} <= kinds, kinds


def test_delacroy_barrier_only_from_direct_heals():
    """[feedback-confirmed: 10448-P4-heal-source] 생명 방어선 배리어는 본문 치료(틱 포함)마다 1번, 발동 치료에는 0번."""
    res = _run([DELA, MONGGYU, MENG, LEO])
    pairs = _pairs(res, DELA_P4)
    assert pairs
    assert all(cause is not None and cause.detail["act"] in DIRECT for _, cause in pairs), \
        [(ev.text, cause and cause.text) for ev, cause in pairs if cause is None or cause.detail["act"] not in DIRECT]
    direct = [ev for ev in _heals(res) if ev.detail["act"] in DIRECT]
    assert len(pairs) == len(direct)          # 아군 전체가 부여받음 → 본문 치료 1번 = 배리어 1번


def test_darawan_barrier_recv_only_from_direct_heals():
    """[feedback-confirmed: 10448-P4-heal-source] 다라완 '받는 배리어 증가'도 같은 트리거 — 발동 치료로는 안 걸린다."""
    res = _run([DARAWAN, MONGGYU, MENG, LEO])
    pairs = _pairs(res, DARAWAN_P4)
    assert pairs
    assert all(cause is not None and cause.detail["act"] in DIRECT for _, cause in pairs)
    name = next(u.name for u in res.state.allies if u._kit.char_id == DARAWAN)
    to_darawan = [ev for ev in _heals(res) if ev.detail["target"] == name]
    assert any(ev.detail["act"] == TRIGGERED for ev in to_darawan)       # 발동 치료를 받긴 받는다
    assert len(pairs) == sum(ev.detail["act"] in DIRECT for ev in to_darawan)


def test_monggyu_focus_only_from_direct_heals():
    """[feedback-confirmed: 10448-P4-heal-source] 몽규 '집중' 은 자기 '연쇄 치료 반응'(발동 치료)으로는 쌓이지 않는다."""
    res = _run([MENG, MONGGYU, LEO])
    pairs = _pairs(res, MONGGYU_P2)
    assert pairs
    assert all(cause is not None and cause.detail["act"] in DIRECT for _, cause in pairs)
    assert any(ev.detail["act"] == TRIGGERED and ev.src_skill == "연쇄 치료 반응" for ev in _heals(res))


def test_hot_keeps_install_judgement_through_refresh():
    """[엔진 규칙] 같은 스킬·대상 지속 치료 갱신은 설치 판정을 다시 적는다 — 틱은 그 판정만 본다."""
    res = _run([DELA, MENG], max_turn=3)
    meng = next(u for u in res.state.allies if u._kit.char_id == MENG)
    assert meng.hots, "맹씨 취심신왕 지속 치료가 남아 있어야 한다"
    for entry in meng.hots:
        assert len(entry) == 5 and entry[4] is (entry[3]["act"] in DIRECT)
