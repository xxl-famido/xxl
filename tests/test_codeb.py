"""코드B(10306) 메커니즘 가드 — 「열상」이 '공격당'이 아니라 '받은 데미지 1회당' 붙는지를 본다.

정체성(XL·물·방해): 필살 황혼 연사(CD 3) = 목표물에 「열상」(도장 2턴 / 기본 1턴) 부여 후 ATK 110%(기본 80%) 2회 공격.
열상 = 목표물이 데미지를 받을 때마다 코드B 기초 ATK 30%(기본 15%)의 고정 데미지 추가(사용자 확인 2026-10-04):
  · 값은 필살 시점의 기초 ATK(기초ATK% 포함)로 고정
  · 타격·추가타·반격·지속 틱 하나하나에 붙는다(2회 공격이면 2번, 3연타면 3번)
  · 주는딜·받뎀·속성 상성 같은 배율은 받지 않고, 딜 공적은 코드B에게 쌓인다

열상 hit = detail.rider == "열상" · amount > 0 · actor == 코드B.
"""
from __future__ import annotations

import pytest

from woofia_sim.effects import DAMAGE, DEBUFF, STAT_DMG_TAKEN_FLAT, TRIGGER
from woofia_sim.harness import CharSpec, run_team
from woofia_sim.kit import resolve_kit
from woofia_sim.stats import Investment

CODEB = 10306
CODEB_NAME = "코드B"
CODEB_FATAL = "황혼 연사"
CODEB_P2 = "월영의 잠행"
CHOI = 10303        # 최유희 — 지속딜(DoT) 틱
UKYOUNG = 10439     # 욱영 — 한 행동에 3타(목표 + 좌우 끝)
DARAWAN = 10438     # 다라완 — 적 페이즈 배리어 반격


def _run(team, **kw):
    kw.setdefault("n_dummies", 1)
    kw.setdefault("max_turn", 6)
    kw.setdefault("seed", 0)
    kw.setdefault("never_proc", True)
    return run_team(team, **kw)


def _riders(res, turn=None):
    return [ev for ev in res.state.log
            if (ev.detail or {}).get("rider") and (turn is None or ev.turn == turn)]


def _hits(res, turn=None):
    """열상이 아닌 실제 데미지 타격(직접·추가타·반격·지속 틱)."""
    return [ev for ev in res.state.log
            if ev.detail and ev.detail.get("act") and not ev.detail.get("kind")
            and not ev.detail.get("rider") and ev.amount > 0
            and (turn is None or ev.turn == turn)]


def _base_atk_eff(rune: bool = True) -> float:
    kit = resolve_kit(CODEB, Investment(level=60, evo=5, compat=5), 10, rune)
    return kit.atk * 1.15            # 파4 주먹이 단단해진다: 자신 기초 ATK +15%


# ── 파싱 ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("rune,pct,dur,hit", [(True, 30.0, 2, 110.0), (False, 15.0, 1, 80.0)])
def test_fatal_parses_to_vulnerable_then_two_hits(rune, pct, dur, hit):
    kit = resolve_kit(CODEB, Investment(level=60, evo=5, compat=5), 10, rune)
    effs = kit.fatal.effects
    assert [e.kind for e in effs] == [DEBUFF, DAMAGE, DAMAGE]      # 열상 먼저 → 두 타격 모두 열상을 받는다
    vul = effs[0]
    assert (vul.stat, vul.magnitude, vul.duration, vul.of_base_atk, vul.stack_name) == \
        (STAT_DMG_TAKEN_FLAT, pct, dur, True, "Vulnerable")
    assert [e.magnitude for e in effs[1:]] == [hit, hit]
    assert effs[1] is not effs[2]                                   # 독립 타격 2개(배율 합 1개 아님)


def test_moonlit_stealth_parses_as_defend_granted_attack_window():
    kit = resolve_kit(CODEB, Investment(level=60, evo=5, compat=5), 10, True)
    p2 = next(p for p in kit.passives if p.slot == "passive2")
    outer = p2.effects[0]
    assert (outer.kind, outer.condition) == (TRIGGER, "on_defend")
    inner = outer.sub_effects[0]
    assert (inner.kind, inner.condition, inner.chance, inner.duration) == (TRIGGER, "on_attack", 100.0, 2)
    assert [(s.kind, s.magnitude) for s in inner.sub_effects] == [(DAMAGE, 100.0)]


# ── 열상: 타격당 1회 ─────────────────────────────────────────────────────────

def test_each_of_two_fatal_hits_gets_one_vulnerable():
    res = _run([CharSpec(CODEB, position=1)])
    t4 = [ev for ev in res.state.log if ev.turn == 4 and ev.detail and ev.detail.get("act")
          and not ev.detail.get("kind")]
    # 필살 110% → 열상 → 필살 110% → 열상 (타격 바로 뒤에 붙는다)
    assert [("rider" if ev.detail.get("rider") else ev.detail["skillPct"]) for ev in t4] == \
        [110.0, "rider", 110.0, "rider"]


def test_vulnerable_value_is_fixed_base_atk_share_with_no_multipliers():
    # 불속성 더미: 물 공격 = 상성 ×1.5. 열상은 상성·버프를 받지 않는다.
    res = _run([CharSpec(CODEB, position=1)], dummy_element=1)
    riders = _riders(res)
    assert riders
    expect = round(_base_atk_eff() * 0.30, 2)
    for ev in riders:
        assert ev.amount == pytest.approx(expect, abs=0.02)
        assert ev.actor == CODEB_NAME and ev.src_skill == CODEB_FATAL
        assert ev.detail["elemMult"] == 1.0 and not ev.detail["dealt"] and not ev.detail["takenG"]
    assert any(h.detail["elemMult"] == 1.5 for h in _hits(res))   # 같은 전투의 일반 타격은 상성을 받는다


def test_vulnerable_window_rune_two_turns_basic_one_turn():
    rune = _run([CharSpec(CODEB, position=1, rune=True)])
    assert [len(_riders(rune, t)) for t in range(1, 7)] == [0, 0, 0, 2, 1, 0]
    base = _run([CharSpec(CODEB, position=1, rune=False)])
    assert [len(_riders(base, t)) for t in range(1, 7)] == [0, 0, 0, 2, 0, 0]
    assert _riders(base)[0].amount == pytest.approx(round(_base_atk_eff(False) * 0.15, 2), abs=0.02)


def test_every_hit_instance_of_allies_gets_vulnerable():
    """욱영 3연타·최유희 발동 추가타·다라완 적 페이즈 반격·지속 틱 — 열상 창 안의 모든 타격에 정확히 1개씩."""
    team = [CharSpec(CODEB, position=1), CharSpec(CHOI, position=2),
            CharSpec(UKYOUNG, position=3), CharSpec(DARAWAN, position=4)]
    res = _run(team, max_turn=5, force_proc=True, never_proc=False)
    t4_hits = [h for h in _hits(res, 4) if h.action_id >= _riders(res, 4)[0].action_id]
    assert len(_riders(res, 4)) == len(t4_hits)                     # 필살 시전 이후 T4 타격 수 = 열상 수
    kinds = {h.action_kind for h in t4_hits}
    assert {"필살기", "보통공격", "피격", "지속딜"} <= kinds
    uk = [h for h in t4_hits if h.actor == "욱영"]
    assert len(uk) == 3                                             # 목표 + 좌우 끝(적 1명 → 같은 적 3타)
    # 열상 기간이 끝난 T5 지속 틱에는 붙지 않는다(T5 적 페이즈 뒤 만료)
    t5_dot_acts = {h.action_id for h in _hits(res, 5) if h.action_kind == "지속딜"}
    assert t5_dot_acts and not [r for r in _riders(res, 5) if r.action_id in t5_dot_acts]


def test_vulnerable_damage_is_credited_to_codeb_not_the_hitter():
    team = [CharSpec(CODEB, position=1), CharSpec(UKYOUNG, position=2)]
    res = _run(team)
    units = {u.name: u for u in res.state.allies}
    own_hits = sum(h.amount for h in _hits(res) if h.actor == CODEB_NAME)
    riders = sum(r.amount for r in _riders(res))
    assert units[CODEB_NAME].damage_dealt == pytest.approx(own_hits + riders, abs=0.05)
    assert units["욱영"].damage_dealt == pytest.approx(sum(h.amount for h in _hits(res) if h.actor == "욱영"), abs=0.05)


def test_vulnerable_does_not_feed_lifesteal_or_itself():
    res = _run([CharSpec(CODEB, position=1)])
    lifesteal = [ev for ev in res.state.log if (ev.detail or {}).get("act") == "흡혈"]
    assert len(lifesteal) == len(_hits(res))                        # 흡혈은 직접 타격에만
    t4 = [ev for ev in res.state.log if ev.turn == 4]
    for i, ev in enumerate(t4):                                     # 열상 바로 뒤에 또 열상이 오지 않는다(재귀 없음)
        if (ev.detail or {}).get("rider") and i + 1 < len(t4):
            assert not (t4[i + 1].detail or {}).get("rider")


def test_vulnerable_only_on_the_fatal_target():
    res = _run([CharSpec(CODEB, position=1), CharSpec(UKYOUNG, position=2)], n_dummies=3)
    targets = {r.detail["target"] for r in _riders(res)}
    assert targets == {"더미1"}


# ── 월영의 잠행: 방어 후 공격 시 추가타 ─────────────────────────────────────────

def test_moonlit_stealth_after_defend_adds_trigger_hit():
    res = _run([CharSpec(CODEB, position=1, rotation="방평평궁평평|평")], max_turn=5)
    extra = [h for h in _hits(res) if h.detail["skillName"] == CODEB_P2]
    assert [h.turn for h in extra] == [2]                           # 방어한 T1부터 2턴 창 → T2 공격에만
    assert extra[0].detail["skillPct"] == 100.0 and extra[0].detail["effLabel"] == "발동효과"
