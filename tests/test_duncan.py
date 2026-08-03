"""던컨 찰스(10427) 버프 회귀 — '확률 추가 발동'이 엉뚱한 행동에서 터지지 않는가.

원문(한국어):
    보통 공격 시 "아군 전체 ATK +16% (2턴)" 발동
    또 50%의 확률로 "아군 전체 ATK +32% (2턴)" 추가 발동

영어 원문은 두 절이 한 문장(", and there is a 50% chance to trigger: ...")이라,
뒤 절이 이벤트 없는 확률절로 잘려 나가 **on_attack 리스너**로 심겼었다. 그 결과
평타 전용이어야 할 +32%가 **필살기에서도** 터지고, 리스너가 깔리는 첫 평타에서는
오히려 빠졌다. 같은 이벤트를 쓰는 형제 트리거로 끌어올려 고쳤다(임부언 순종 교육과 같은 모양).

같은 모양을 쓰는 '물을 좋아하는 포르베어' 아군 부여분도 함께 고쳐졌다.
"""
from __future__ import annotations

from woofia_sim.effects import TRIGGER, parse_skill_level
from woofia_sim.harness import CharSpec, run_team
from woofia_sim.kit import _load

DUNCAN = 10427
PORBEAR = 10422


def _passive1(cid: int):
    _, skills = _load()
    lv = skills[str(cid)]["passive1"]["levels"]
    e = lv[sorted(lv, key=int)[-1]]
    return parse_skill_level(e["desc_en"], e["params"])


def _walk(effs):
    for e in effs:
        yield e
        yield from _walk(e.sub_effects)


def test_chance_clause_keeps_its_event() -> None:
    """'또 N% 확률로 추가 발동'은 앞 절과 같은 이벤트여야 한다."""
    effs = _passive1(DUNCAN)
    trig = [e for e in effs if e.kind == TRIGGER]
    assert len(trig) == 2, [t.condition for t in trig]
    assert {t.condition for t in trig} == {"on_basic_attack"}
    assert sorted(t.chance for t in trig) == [50.0, 100.0]
    # 평타 트리거 안에 on_attack 리스너가 다시 생기면 안 된다
    for e in _walk(effs):
        assert not (e.kind == TRIGGER and e.condition == "on_attack"), e.raw


def test_porbear_ally_grant_is_basic_only() -> None:
    """아군에게 부여하는 확률 디버프도 '보통 공격 시' 로 남아야 한다."""
    grants = [e for e in _walk(_passive1(PORBEAR))
              if e.kind == TRIGGER and e.condition == "grant_allies"]
    assert grants
    inner = [s for s in grants[0].sub_effects if s.kind == TRIGGER]
    assert inner and all(s.condition == "on_basic_attack" for s in inner), \
        [s.condition for s in inner]


def _buff_turns(rot: str, magnitude: str, turns: int = 8) -> set[int]:
    """그 버프가 적용된 턴 번호."""
    res = run_team([CharSpec(DUNCAN, rotation=rot)], max_turn=turns,
                   force_proc=True, seed=0)
    return {ev.turn for ev in res.state.log
            if magnitude in (getattr(ev, "text", "") or "")}


def test_extra_buff_only_on_basic_attacks() -> None:
    """+32%는 평타 턴에만 붙고 필살기 턴(T4·T7)에는 붙지 않는다."""
    rot = "평평평궁|평평궁"           # T4·T7 이 필살
    extra = _buff_turns(rot, "ATK +32%")
    base = _buff_turns(rot, "ATK +16%")
    assert extra == base, f"+32% {sorted(extra)} vs +16% {sorted(base)}"
    assert 4 not in extra and 7 not in extra, sorted(extra)
    assert 1 in extra, "리스너가 늦게 깔려 첫 평타를 놓치면 안 된다"


def test_arcane_focus_cycles() -> None:
    """마도 집중: 필살기로 2중첩 → 다음 공격에 주는뎀 +150% 적용 후 소모."""
    res = run_team([CharSpec(DUNCAN, rotation="궁|궁")], max_turn=14,
                   force_proc=True, seed=0)
    txt = [getattr(ev, "text", "") or "" for ev in res.state.log]
    assert any("마도 집중 +1중첩" in t for t in txt)
    assert any("주는딜+150%" in t for t in txt), "조건 충족 시 +150%가 적용돼야 한다"
    assert any("마도 집중 제거" in t for t in txt), "공격 시 소모돼야 한다"
    # 소모 뒤에는 다시 0에서 시작 — 버프가 남아 돌지 않는다
    assert res.state.allies[0].stacks.get("Arcane Focus", 0) <= 2
