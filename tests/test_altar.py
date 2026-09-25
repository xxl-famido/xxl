"""길드 제단(祭壇) 엔진 반영 가드 — woofia_sim/altar.py + engine/harness/sim_api 배선.

절대 데미지값이 아니라 '채널·부호·누적·격리'만 본다(캐릭터 수치가 바뀌어도 유효).
적용 규칙(사용자 확정 2026-09-22): 층 누적(3층 = 1·2·3층 전부) · 같은 효과 중복 합산 ·
별 = 체크(부숨)하면 미적용, 달 = 체크(열음)하면 적용.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from woofia_sim.altar import (
    FLOORS, LABEL_KR, MAX_CD_PLUS, MOON_IDS, STAR_IDS, altar_effects, resolve_altars, summarize,
)
from woofia_sim.effects import (
    STAT_ATK, STAT_BAR_RECV, STAT_DMG_DEALT, STAT_DMG_TAKEN, STAT_DMG_TAKEN_EX,
    STAT_DOT_TAKEN, STAT_EX_EFFECT, STAT_HEAL_RECV, TRIGGER,
)
from woofia_sim.harness import CharSpec, run_team

ROOT = Path(__file__).resolve().parents[1]
FIGHTER, HEALER, SUPPORT = 10402, 10404, 10405   # 전사(수) · 치유(수) · 보조(목)
ALL = sorted(STAR_IDS | MOON_IDS)


def _run(altar, team=None, **kw):
    team = team or [CharSpec(FIGHTER, position=1)]
    args = dict(n_dummies=1, max_turn=6, enemy_hits=0, force_proc=True, seed=0)
    args.update(kw)
    return run_team(team, altar=altar, **args)


def _altar_buffs(unit, stat):
    return [b.value for b in unit.buffs if b.stat == stat and b.owner == 0]


# ── 데이터 정합 ─────────────────────────────────────────────────────────────

def test_floor_table_matches_dashboard_json():
    """엔진 FLOORS 는 프런트 dashboard/altars.json 과 층별 Id가 정확히 같아야 한다."""
    data = json.loads((ROOT / "dashboard" / "altars.json").read_text(encoding="utf-8"))
    got = {f["floor"]: {"star": [a["id"] for a in f["star"]], "moon": [a["id"] for a in f["moon"]]}
           for f in data["floors"]}
    assert got == FLOORS
    assert len(STAR_IDS) == 12 and len(MOON_IDS) == 12
    assert set(LABEL_KR) == STAR_IDS | MOON_IDS


def test_every_altar_has_a_mapping():
    for aid in ALL:
        effs = altar_effects(aid)
        if aid in MAX_CD_PLUS:
            assert effs == []                    # 킷 수준 처리
        else:
            assert effs, aid
            assert all(e.owner == 0 and e.src_skill == LABEL_KR[aid] for e in effs)
    with pytest.raises(ValueError):
        altar_effects(999)


# ── resolve: 부호·층 누적·정규화 ───────────────────────────────────────────

def test_resolve_default_all_checked_means_all_blessings_no_penalties():
    """기본(전부 체크) = 별 전부 부숨(페널티 0) + 달 전부 열음(축복 12)."""
    assert resolve_altars({"on": True}) == sorted(MOON_IDS)


def test_resolve_star_off_is_penalty_and_moon_off_is_removed():
    cfg = {"on": True, "floors": {"1": {"on": True, "off": [401, 1012]}}}
    got = resolve_altars(cfg)
    assert 401 in got and 1012 not in got
    assert 1011 in got and 402 not in got


def test_resolve_floor_cascade_prefix():
    """아래층 OFF면 위층은 켜져 있어도 무시(UI 누적 규칙과 동일)."""
    cfg = {"on": True, "floors": {"1": {"on": True}, "2": {"on": False}, "3": {"on": True}}}
    got = resolve_altars(cfg)
    assert got == sorted(FLOORS[1]["moon"])


def test_resolve_off_or_garbage_is_empty():
    assert resolve_altars(None) == []
    assert resolve_altars({"on": False}) == []
    assert resolve_altars({"on": True, "floors": "nope"}) == sorted(MOON_IDS)
    assert resolve_altars({"on": True, "floors": {"1": {"off": ["x", None, "401"]}}}) .count(401) == 1


def test_resolve_accepts_localstorage_dict_off():
    cfg = {"on": True, "floors": {1: {"on": True, "off": {"401": True, "1011": True}}}}
    got = resolve_altars(cfg)
    assert 401 in got and 1011 not in got


def test_summarize_counts():
    s = summarize([401, 1011, 1019])
    assert s == {"active": [401, 1011, 1019], "star": 1, "moon": 2, "floors": [1, 3]}


# ── 엔진 격리: 제단 없음 = 결과 불변 ───────────────────────────────────────

def test_no_altar_is_identical_to_baseline():
    a = _run(None)
    b = _run([])
    assert a.total_damage == b.total_damage
    assert not a.state.altar_active and not b.state.altar_active


# ── 채널 배선 ───────────────────────────────────────────────────────────────

def test_all_24_land_on_expected_channels():
    res = _run(ALL, team=[CharSpec(FIGHTER, position=1), CharSpec(HEALER, position=2),
                         CharSpec(SUPPORT, position=3)])
    st = res.state
    fighter, healer, support = st.allies
    enemy = st.enemies[0]
    # 별: 보스 측 (401 EX한정 / 406~410 속성별 / 414 ATK / 415 주는뎀)
    assert _altar_buffs(enemy, STAT_DMG_TAKEN_EX) == [-75]
    assert sorted((b.element, b.value) for b in enemy.buffs if b.stat == STAT_DMG_TAKEN and b.owner == 0) \
        == [(1, -75), (2, -75), (3, -75), (4, -75), (5, -75)]
    assert _altar_buffs(enemy, STAT_ATK) == [100]
    assert _altar_buffs(enemy, STAT_DMG_DEALT) == [35]
    # 별: 아군 측 (413·417 치료 -75 ×2 합산 / 416 받뎀 +35)
    for u in (fighter, healer, support):
        assert sorted(_altar_buffs(u, STAT_HEAL_RECV)) == [-75, -75, 25, 25]   # 1015·1022 +25 ×2 도 합산
        assert _altar_buffs(u, STAT_DMG_TAKEN) == [35]
        assert _altar_buffs(u, STAT_BAR_RECV) == [25, 25]                       # 1014·1019 중복 합산
        assert _altar_buffs(u, STAT_EX_EFFECT) == [25]
        assert _altar_buffs(u, STAT_DOT_TAKEN) == [-25]
        # 트리거 4종(1012 행동 CD-1 / 1013 필살 CD-3 / 1017 자힐 / 1020 배리어딜)이 각자에게 설치
        subs = [(s.event, s.chance) for s in u.subs if s.effects and s.effects[0].owner == 0]
        assert sorted(subs) == [("on_action", 30), ("on_action", 30), ("on_attack", 50), ("on_ex", 30)]
    # 달 1016(치료·보조 ATK) / 1018(전사·방해 ATK): 직업 필터
    assert _altar_buffs(fighter, STAT_ATK) == [25]
    assert _altar_buffs(healer, STAT_ATK) == [25]
    assert _altar_buffs(support, STAT_ATK) == [25]
    assert st.altar_active == ALL


def test_duplicate_effects_stack_not_refresh():
    """2·3층 같은 효과(6206 배리어 +25%)는 갱신이 아니라 합산 — GC 로 id 재사용돼도 안 겹쳐야."""
    u = _run([1014, 1019]).state.allies[0]
    assert u._sum(STAT_BAR_RECV) - _run([]).state.allies[0]._sum(STAT_BAR_RECV) == 50


def test_401_only_hits_ex_action():
    """보스 필살기 피격 -75% 는 필살 hit 에만(inc ×0.25), 평타는 그대로."""
    res = _run([401], max_turn=6)
    hits = [ev for ev in res.state.log if ev.detail and "takenEx" in ev.detail]
    ex = [ev for ev in hits if ev.detail.get("effLabel") == "EX효과"]
    basic = [ev for ev in hits if ev.detail.get("effLabel") == "평타뎀"]
    assert ex and basic
    assert all(ev.detail["takenEx"] and ev.detail["takenEx"][0]["v"] == -75 for ev in ex)
    assert all(ev.detail["takenEx"] == [] for ev in basic)
    base = _run([], max_turn=6)
    ex0 = [ev for ev in base.state.log if ev.detail and ev.detail.get("effLabel") == "EX효과"]
    assert ex[0].detail["final"] == pytest.approx(ex0[0].detail["final"] * 0.25, rel=1e-6)


def test_402_raises_max_cd_and_delays_first_ult():
    base = _run([])
    plus = _run([402])
    assert plus.state.allies[0].fatal_cd == base.state.allies[0].fatal_cd + 1
    first = lambda r: min((ev.turn for ev in r.state.log if ev.action_kind == "필살기"), default=None)
    assert first(base) is not None and first(plus) == first(base) + 1


def test_heal_received_floor_is_zero_not_negative():
    """별 1·2층 치료 -75% 합산 = -150% → 힐 0 (음수 힐 금지)."""
    team = [CharSpec(HEALER, position=1)]
    res = _run([413, 417], team=team)
    heals = [ev for ev in res.state.log if ev.detail and ev.detail.get("kind") == "heal"]
    assert heals, "치유형 캐릭의 힐 이벤트가 있어야 한다"
    # 캐릭터 자체의 '받는 회복 +x%' 패시브가 더해질 수 있으므로 합계가 -100% 이하인 힐만 0 이어야 한다
    deep = [ev for ev in heals if ev.detail["healRecv"] <= -100]
    assert deep, "합계 -100% 이하인 힐이 있어야 한다"
    assert all(ev.detail["final"] == 0 for ev in deep)
    assert all(ev.detail["final"] >= 0 for ev in heals)


def test_incoming_mode_boss_penalties_multiply():
    """414 ATK+100% · 415 주는뎀 +35% · 416 아군 받뎀 +35% → 피격량 = raw × 2 × 1.35 × 1.35."""
    res = _run([414, 415, 416], enemy_hits=1, incoming_hp_pct=10)
    inc = [ev for ev in res.state.log if ev.detail and ev.detail.get("kind") == "incoming"]
    assert inc
    d = inc[0].detail
    assert not d["defended"]
    assert d["dmg"] == pytest.approx(d["raw"] * 2 * 1.35 * 1.35, rel=1e-6)
    assert d["atkPct"] and d["atkPct"][0]["v"] == 100


def test_trigger_1013_cuts_cd_after_ult():
    """필살 시 30% → CD -3: 확률 100% 모드면 필살 직후 남은 CD 가 (최대 CD - 3) 이하."""
    res = _run([1013], max_turn=8)
    u = res.state.allies[0]
    cd_events = [ev for ev in res.state.log if "필살 CD -3" in ev.text]
    assert cd_events, "CD -3 발동 로그가 없음"
    assert cd_events[0].src_skill == LABEL_KR[1013]


def test_1020_barrier_damage_registers_on_attack_only():
    u = _run([1020]).state.allies[0]
    subs = [s for s in u.subs if s.effects and s.effects[0].owner == 0]
    assert len(subs) == 1 and subs[0].event == "on_attack" and subs[0].chance == 50
    assert subs[0].effects[0].of_barrier and subs[0].effects[0].magnitude == 100


def test_sim_api_contract_and_meta():
    """run_sim: cfg.altar → meta.altar(별/달 수) · 미지정이면 None."""
    import sim_api
    team = [{"id": FIGHTER, "position": 1, "skill": 10, "rune": True}]
    base = {"team": team, "turns": 4, "dummies": 1, "enemyHits": "0", "forceProc": True, "runs": 1, "noBand": True}
    off = sim_api.run_sim(base)
    assert off["meta"]["altar"] is None
    on = sim_api.run_sim({**base, "altar": {"on": True, "floors": {"1": {"on": True, "off": [401]}}}})
    assert on["meta"]["altar"]["star"] == 1 and on["meta"]["altar"]["moon"] == 12
    assert 401 in on["meta"]["altar"]["active"]
    # 401 만 단독(달 전부 해제·2·3층 OFF) → 필살기 피격 -75% 가 실제로 걸려 총딜 감소
    only = sim_api.run_sim({**base, "altar": {"on": True, "floors": {
        "1": {"on": True, "off": [401, 1011, 1012, 1013]}, "2": {"on": False}, "3": {"on": False}}}})
    assert only["meta"]["altar"] == {"active": [401], "star": 1, "moon": 0, "floors": [1], "groups": 0}
    assert only["meta"]["total"] < off["meta"]["total"]


# ── 궁극기 사용 방식 · 궁 맞추기 ──────────────────────────────────────────

from woofia_sim.altar import parse_sync_groups, parse_ult_policy   # noqa: E402


def _ult_turns(res, cid):
    return sorted({ev.turn for ev in res.state.log if ev.actor_id == cid and ev.action_kind == "필살기"})


def _order(res, turn):
    seen = []
    for ev in res.state.log:
        if ev.turn == turn and ev.action_kind in ("필살기", "보통공격", "방어") and ev.actor not in seen:
            seen.append(ev.actor)
    return seen


def test_parse_ult_policy():
    assert parse_ult_policy(None) == {}
    assert parse_ult_policy({"mode": "asap"}) == {"ult_mode": "asap"}
    assert parse_ult_policy({"mode": "asap", "keepDef": False}) == {"ult_mode": "asap", "ult_keep_def": False}
    assert parse_ult_policy({"mode": "??"}) == {"ult_mode": "fixed"}


def test_parse_sync_groups_rules():
    pos = [1, 2, 3, 4, 5]
    raw = [
        {"anchor": 1, "members": [{"p": 2, "order": "before"}, {"p": 3, "order": "after"}, {"p": 1}], "miss": "asap"},
        {"anchor": 2, "members": [{"p": 4}]},                # 2는 이미 멤버 → 앵커 불가
        {"anchor": 4, "members": [{"p": 5}, {"p": 9}]},      # 9는 미출전
        {"anchor": 5, "members": [{"p": 3}]},                # 4번째 그룹 → 최대 3 초과
    ]
    got = parse_sync_groups(raw, pos)
    assert got == [
        {"anchor": 1, "members": [(2, "before", "fatal", False, False), (3, "after", "fatal", False, False)], "miss": "asap"},
        {"anchor": 4, "members": [(5, "before", "fatal", False, False)], "miss": "wait"},
    ]
    assert parse_sync_groups("x", pos) == []
    assert parse_sync_groups([{"anchor": 1, "members": []}], pos) == []


def test_parse_sync_groups_base_and_bonus():
    """base=defend/basic 이면 궁 보류 + 추가 행동에서 궁(bonus) — 부여는 이미 행동한 아군에게만 오므로 order 는 before 강제."""
    pos = [1, 2, 3]
    raw = [{"anchor": 2, "members": [{"p": 1, "order": "after", "base": "defend"},
                                     {"p": 3, "order": "after", "base": "basic"}]}]
    assert parse_sync_groups(raw, pos) == [
        {"anchor": 2, "members": [(1, "before", "defend", True, True), (3, "before", "basic", True, True)], "miss": "wait"}]
    # 알 수 없는 base 는 기본(fatal · 같이 궁)
    assert parse_sync_groups([{"anchor": 2, "members": [{"p": 1, "base": "??", "order": "after"}]}], pos)         == [{"anchor": 2, "members": [(1, "after", "fatal", False, False)], "miss": "wait"}]
    # other: 앵커가 궁을 안 쓰는 턴의 처리(hold=아낌 / own=내 방식대로). 미지정 기본 = 보류 멤버 own, 같이 궁 hold
    assert parse_sync_groups([{"anchor": 2, "members": [{"p": 1, "base": "defend", "other": "hold"},
                                                        {"p": 3, "other": "own"}]}], pos)         == [{"anchor": 2, "members": [(1, "before", "defend", True, False), (3, "before", "fatal", False, True)], "miss": "wait"}]


UK, MATAYA, RICANO = 10439, 10442, 10428   # 욱영(인접 아군 행동 회복) · 마타야 · 리카노


def _turn_seq(res, turn):
    """그 턴의 아군 행동 순서 [(이름, 종류)] — 액션 id 로 묶는다."""
    seen, out = set(), []
    for ev in res.state.log:
        if ev.turn != turn or ev.action_id in seen or ev.action_kind not in ("보통공격", "필살기", "방어"):
            continue
        seen.add(ev.action_id)
        out.append((ev.actor, ev.action_kind))
    return out


def test_sync_defend_then_ult_in_granted_action():
    """사용자 예시(2026-09-24): 마타야(P1)가 방어 → 욱영(P2) 궁(인접 아군 행동 회복) → 마타야가 받은 추가 행동에서 궁.
    제단 OFF 에서도 연동이 돌아야 한다(제단 게이팅 해제)."""
    team = [CharSpec(MATAYA, position=1), CharSpec(UK, position=2), CharSpec(RICANO, position=3)]
    groups = [{"anchor": 2, "members": [(1, "before", "defend", True)], "miss": "wait"}]
    res = run_team(team, altar=None, sync_groups=groups, n_dummies=1, max_turn=7,
                   enemy_hits=0, force_proc=True, seed=0)
    names = {u._kit.char_id: u.name for u in res.state.allies}
    seq = _turn_seq(res, 4)                       # 욱영 CD 3 → 4턴 첫 궁
    mine = [k for n, k in seq if n == names[MATAYA]]
    assert mine == ["방어", "필살기"], seq
    order = [n for n, _ in seq]
    assert order.index(names[MATAYA]) < order.index(names[UK]) < len(order) - 1 - order[::-1].index(names[MATAYA])
    # 구 계약(2-튜플 멤버)도 그대로 — 같이 궁(앵커 앞에서 궁, 추가 행동은 평타)
    old = run_team(team, altar=None, sync_groups=[{"anchor": 2, "members": [(1, "before")], "miss": "wait"}],
                   n_dummies=1, max_turn=7, enemy_hits=0, force_proc=True, seed=0)
    assert [k for n, k in _turn_seq(old, 4) if n == names[MATAYA]] == ["필살기", "보통공격"]


def test_sync_basic_base_and_no_grant_falls_back_by_miss_policy():
    """base=basic: 앵커 궁 턴에 평타 후 추가 행동에서 궁. 앵커가 추가 행동을 안 주는 캐릭이면
    miss=wait 는 궁을 아끼고(대기), miss=asap 은 다음 준비된 행동에서 쓴다."""
    team = [CharSpec(RICANO, position=1), CharSpec(FIGHTER, position=2)]   # 전사 궁은 행동 회복 없음
    for miss, expect_after in (("wait", False), ("asap", True)):
        groups = [{"anchor": 2, "members": [(1, "before", "basic", True, False)], "miss": miss}]   # 다른 턴=아낌
        res = run_team(team, altar=None, sync_groups=groups, n_dummies=1, max_turn=8,
                       enemy_hits=0, force_proc=True, seed=0)
        ults = _ult_turns(res, RICANO)
        anchor_ults = _ult_turns(res, FIGHTER)
        assert anchor_ults and anchor_ults[0] not in ults          # 앵커 턴엔 평타(보류)
        assert (len(ults) > 0) is expect_after, (miss, ults, anchor_ults)


def test_ult_policy_and_sync_apply_without_altar_via_api():
    """sim_api: 제단 OFF 여도 team[].ult · cfg.sync 가 적용된다(게이팅 해제). 구 위치(altar.groups)도 계속 받는다."""
    import sim_api
    team = [{"id": FIGHTER, "position": 1, "skill": 10, "rune": True, "ult": {"mode": "strict"}, "rotation": "평" * 7 + "궁|평"},
            {"id": HEALER, "position": 2, "skill": 10, "rune": True}]
    base = {"team": team, "turns": 10, "dummies": 1, "enemyHits": "0", "forceProc": True, "runs": 1, "noBand": True}
    plain = sim_api.run_sim(base)
    synced = sim_api.run_sim({**base, "sync": [{"anchor": 1, "members": [{"p": 2}]}]})
    fu = sorted({ev["turn"] for ev in synced["log"] if ev["kind"] == "필살기" and ev["actorId"] == FIGHTER})
    hu = sorted({ev["turn"] for ev in synced["log"] if ev["kind"] == "필살기" and ev["actorId"] == HEALER})
    assert fu == [8] and hu == [8], (fu, hu)                     # strict 8턴 + 힐러 맞춤
    assert synced["meta"]["sync"] == 1 and plain["meta"]["sync"] == 0 and synced["meta"]["altar"] is None
    legacy = sim_api.run_sim({**base, "altar": {"on": False, "groups": [{"anchor": 1, "members": [{"p": 2}]}]}})
    assert legacy["meta"]["sync"] == 1


def test_default_policy_is_previous_behaviour():
    """기본(fixed)은 정책 개입 0 — 제단이 있어도 종전 로테이션 그대로."""
    a = _run([1011], max_turn=12)
    b = run_team([CharSpec(FIGHTER, position=1, ult_mode="fixed", ult_keep_def=True)],
                 altar=[1011], n_dummies=1, max_turn=12, enemy_hits=0, force_proc=True, seed=0)
    assert a.total_damage == b.total_damage


def test_asap_uses_ult_whenever_ready():
    """1013(필살 시 CD-3, 확률 100%)이면 asap 은 매 턴 궁, fixed 는 계획 턴(4·7·10)만."""
    fixed = _run([1013], max_turn=12)
    asap = run_team([CharSpec(FIGHTER, position=1, ult_mode="asap")], altar=[1013],
                    n_dummies=1, max_turn=12, enemy_hits=0, force_proc=True, seed=0)
    assert _ult_turns(fixed, FIGHTER) == [4, 7, 10]
    assert _ult_turns(asap, FIGHTER) == list(range(4, 13))


def test_asap_keeps_planned_defend_by_default():
    rot = "평평평방|평평평방"
    keep = run_team([CharSpec(FIGHTER, position=1, ult_mode="asap", rotation=rot)], altar=[1013],
                    n_dummies=1, max_turn=8, enemy_hits=0, force_proc=True, seed=0)
    over = run_team([CharSpec(FIGHTER, position=1, ult_mode="asap", ult_keep_def=False, rotation=rot)],
                    altar=[1013], n_dummies=1, max_turn=8, enemy_hits=0, force_proc=True, seed=0)
    assert 4 not in _ult_turns(keep, FIGHTER) and 8 not in _ult_turns(keep, FIGHTER)
    assert 4 in _ult_turns(over, FIGHTER)


def test_strict_skips_when_not_ready_and_never_falls_back():
    """402(CD+1)로 계획 5턴궁이 밀리면: fixed 는 차는 즉시(6턴), strict 는 다음 계획 턴(10턴)까지 건너뜀."""
    rot = "평평평평궁|평평평평궁"
    fixed = run_team([CharSpec(FIGHTER, position=1, rotation=rot)], altar=[402],
                     n_dummies=1, max_turn=12, enemy_hits=0, force_proc=True, seed=0)
    strict = run_team([CharSpec(FIGHTER, position=1, ult_mode="strict", rotation=rot)], altar=[402],
                      n_dummies=1, max_turn=12, enemy_hits=0, force_proc=True, seed=0)
    assert _ult_turns(fixed, FIGHTER) == [5, 10]          # CD 4 → 5턴 준비, 계획 5턴 궁, 다음 계획 10턴
    assert _ult_turns(strict, FIGHTER) == [5, 10]
    rot2 = "평평평궁|평평평궁"                                # 계획 4턴은 CD 4라 미준비
    fixed2 = run_team([CharSpec(FIGHTER, position=1, rotation=rot2)], altar=[402],
                      n_dummies=1, max_turn=12, enemy_hits=0, force_proc=True, seed=0)
    strict2 = run_team([CharSpec(FIGHTER, position=1, ult_mode="strict", rotation=rot2)], altar=[402],
                       n_dummies=1, max_turn=12, enemy_hits=0, force_proc=True, seed=0)
    assert _ult_turns(fixed2, FIGHTER)[0] == 5             # 차는 즉시 폴백
    assert _ult_turns(strict2, FIGHTER)[0] == 8            # 8턴 계획에서야 궁


def test_sync_group_aligns_and_reorders():
    """힐러(P2)를 딜러(P1, asap)에 앞으로, 보조(P3)를 뒤로 맞춤 → 같은 턴 궁 + 그 턴 순서 H→F→S."""
    team = [CharSpec(FIGHTER, position=1, ult_mode="asap"), CharSpec(HEALER, position=2), CharSpec(SUPPORT, position=3)]
    groups = [{"anchor": 1, "members": [(2, "before"), (3, "after")], "miss": "wait"}]
    res = run_team(team, altar=[1011], sync_groups=groups, n_dummies=1, max_turn=12,
                   enemy_hits=0, force_proc=True, seed=0)
    ft = _ult_turns(res, FIGHTER)
    assert ft and _ult_turns(res, HEALER) == ft and _ult_turns(res, SUPPORT) == ft
    names = {u._kit.char_id: u.name for u in res.state.allies}
    assert _order(res, ft[0]) == [names[HEALER], names[FIGHTER], names[SUPPORT]]


def test_sync_member_waits_when_anchor_holds():
    """앵커가 strict 로 10턴에만 궁이면 멤버도 10턴까지 궁을 아낀다(miss=wait)."""
    team = [CharSpec(FIGHTER, position=1, ult_mode="strict", rotation="평" * 9 + "궁|평"),
            CharSpec(HEALER, position=2)]
    groups = [{"anchor": 1, "members": [(2, "before")], "miss": "wait"}]
    res = run_team(team, altar=[1011], sync_groups=groups, n_dummies=1, max_turn=12,
                   enemy_hits=0, force_proc=True, seed=0)
    assert _ult_turns(res, FIGHTER) == [10]
    assert _ult_turns(res, HEALER) == [10]


def test_probe_altar_procs_off_uses_guaranteed_cd():
    import sim_api
    team = [{"id": FIGHTER, "position": 1, "skill": 10, "rune": True, "ult": {"mode": "asap"}}]
    base = {"team": team, "turns": 8, "dummies": 1, "enemyHits": "0", "forceProc": True, "runs": 1, "noBand": True,
            "altar": {"on": True, "floors": {"1": {"on": True, "off": [402]}}}}
    full = sim_api.run_sim(base)
    probe = sim_api.plan_probe(base)
    ult_turns_full = sorted({ev["turn"] for ev in full["log"] if ev["kind"] == "필살기"})
    ult_turns_probe = sorted(int(t) for t, v in probe["plan"].items() if any(e["a"] == "궁" for e in v["seq"]))
    # 실제 실행: 402(+1)=CD 4 이지만 1012(행동 시 CD-1)·1013(필살 시 CD-3)이 100% 로 터져 3턴부터 매 턴 궁
    assert ult_turns_full == list(range(3, 9))
    # 프로브: 확률 CD감소는 보장이 아니므로 제외 → 보장 CD(4)만 반영해 5턴에 한 번(8턴 이내)
    assert ult_turns_probe == [5]


def test_sync_own_uses_own_plan_on_other_turns():
    """피드백(2026-09-24): 1CD 마타야 = '궁 있으면 바로' + 욱영 궁 턴에만 방어 → 욱영 추가 행동 → 궁.
    연동 멤버(방어→추가 행동 궁)는 앵커가 궁을 안 쓰는 턴에 자기 계획(여기선 매 턴 궁)을 따라야 한다.
    (종전엔 그 턴을 평타로 막아 2125만 < 수동 타임라인 2376만.)"""
    team = [CharSpec(MATAYA, position=1, rotation="방" + "궁" * 12), CharSpec(UK, position=2), CharSpec(RICANO, position=3)]
    own = run_team(team, altar=None, sync_groups=[{"anchor": 2, "members": [(1, "before", "defend", True)], "miss": "wait"}],
                   n_dummies=1, max_turn=8, enemy_hits=0, force_proc=True, seed=0)
    hold = run_team(team, altar=None, sync_groups=[{"anchor": 2, "members": [(1, "before", "defend", True, False)], "miss": "wait"}],
                    n_dummies=1, max_turn=8, enemy_hits=0, force_proc=True, seed=0)
    names = {u._kit.char_id: u.name for u in own.state.allies}
    per_turn = lambda res, t: [k for n, k in _turn_seq(res, t) if n == names[MATAYA]]
    assert per_turn(own, 4) == ["방어", "필살기"] and per_turn(own, 7) == ["방어", "필살기"]
    assert all(per_turn(own, t) == ["필살기"] for t in (2, 3, 5, 6, 8))        # 다른 턴 = 계획대로 궁
    assert all(per_turn(hold, t) == ["보통공격"] for t in (2, 3, 5, 6, 8))       # hold = 종전(아낌)
    assert own.total_damage > hold.total_damage
    # 계획 없이 '준비되면 바로'(asap)도 같은 흐름
    asap = run_team([CharSpec(MATAYA, position=1, ult_mode="asap"), CharSpec(UK, position=2), CharSpec(RICANO, position=3)],
                    altar=None, sync_groups=[{"anchor": 2, "members": [(1, "before", "defend", True)], "miss": "wait"}],
                    n_dummies=1, max_turn=8, enemy_hits=0, force_proc=True, seed=0)
    assert per_turn(asap, 4) == ["방어", "필살기"] and per_turn(asap, 5) == ["필살기"]


ANUBIROS, IMBUEON = 10401, 10410   # 임부언 = 필살로 1번 자리 동료의 CD 초기화 + 추가 행동(피더)


def test_sync_fed_carry_and_feeder_order():
    """피드백(2026-09-25): 욱영 궁 턴 최적 축 = 임부언 평 → 아누비로스 평 → 욱영 궁 → 아누비로스 궁 → 임부언 궁 → 아누비로스 궁.
    ① 연동은 피더가 CD를 되돌려 주는 캐리(아누비로스)의 기본 행동에도 적용 ② 추가 행동을 함께 받으면 궁이 준비된 캐리가 피더보다 먼저."""
    team = [CharSpec(ANUBIROS, position=1), CharSpec(UK, position=2), CharSpec(IMBUEON, position=3)]
    groups = [{"anchor": 2, "members": [(1, "before", "basic", True), (3, "before", "basic", True)], "miss": "wait"}]
    res = run_team(team, altar=None, sync_groups=groups, n_dummies=1, max_turn=7, enemy_hits=0, force_proc=True, seed=0)
    names = {u._kit.char_id: u.name for u in res.state.allies}
    seq = [(n, k) for n, k in _turn_seq(res, 4)]
    a, u, i = names[ANUBIROS], names[UK], names[IMBUEON]
    assert [k for n, k in seq if n == a] == ["보통공격", "필살기", "필살기"], seq
    assert [k for n, k in seq if n == i] == ["보통공격", "필살기"], seq
    tail = [n for n, _ in seq][[n for n, _ in seq].index(u):]
    assert tail == [u, a, i, a], seq                       # 욱영 궁 → 아누 궁 → 임부언 궁 → 아누 궁


# ── 확률 쿨 감소 성공 가정(궁극기 사용 방식 assist) ────────────────────────────

def _plan(turns, ult_turns):
    return "".join("궁" if t in ult_turns else "평" for t in range(1, turns + 1))


def test_cd_assist_pulls_planned_ult_early_and_reports_probability():
    """3쿨(첫 4턴) 캐릭 계획 3·6·9·12: 가정 ON 이면 그 턴 그대로(1012 기회 2번 중 1번 = 51%),
    OFF 면 확률이 안 터진(never_proc) 판에선 원래 쿨로 밀린다. 가정은 '필요한 만큼'만 쓴다(1회)."""
    import sim_api
    rot = _plan(13, {3, 6, 9, 12})
    base = {"turns": 13, "dummies": 1, "enemyHits": "0", "runs": 5, "noBand": True,
            "altar": {"on": True, "floors": {"1": {"on": True, "off": {}}}}}
    on = sim_api.run_sim({**base, "team": [{"id": FIGHTER, "position": 1, "rotation": rot,
                                             "ult": {"mode": "fixed", "assist": True}}]})
    ults = sorted({ev["turn"] for ev in on["log"] if ev["kind"] == "필살기" and ev["actorId"] == FIGHTER})
    assert ults == [3, 6, 9, 12]
    ca = on["meta"]["cdAssist"]
    assert ca["uses"] == 1 and abs(ca["prob"] - 0.51) < 1e-9, ca
    off = run_team([CharSpec(FIGHTER, position=1, rotation=rot)], altar=[1012, 1013],
                   n_dummies=1, max_turn=13, enemy_hits=0, never_proc=True, seed=0)
    assert _ult_turns(off, FIGHTER) == [4, 7, 10, 13]


def test_cd_assist_is_deterministic_under_band_flags():
    """가정 유닛은 확률 CD 감소를 굴리지 않는다 — 바닥(never)·천장(force)·평균이 같은 궁 턴."""
    rot = _plan(12, {3, 6, 9, 12})
    spec = lambda: [CharSpec(FIGHTER, position=1, rotation=rot, ult_assist=True)]   # noqa: E731
    runs = [run_team(spec(), altar=[1012, 1013], n_dummies=1, max_turn=12, enemy_hits=0, seed=0, **kw)
            for kw in ({}, {"never_proc": True}, {"force_proc": True})]
    assert all(_ult_turns(r, FIGHTER) == [3, 6, 9, 12] for r in runs)


def test_cd_assist_not_applied_to_auto_or_asap():
    """자동(계획 없음)·'준비되면 바로'는 가정을 적용하지 않는다 → 확률 그대로, meta.cdAssist 없음."""
    import sim_api
    base = {"turns": 10, "dummies": 1, "enemyHits": "0", "runs": 1, "noBand": True, "forceProc": True,
            "altar": {"on": True, "floors": {"1": {"on": True, "off": {}}}}}
    auto = sim_api.run_sim({**base, "team": [{"id": FIGHTER, "position": 1, "ult": {"mode": "fixed", "assist": True}}]})
    asap = sim_api.run_sim({**base, "team": [{"id": FIGHTER, "position": 1, "rotation": _plan(10, {4}),
                                               "ult": {"mode": "asap", "assist": True}}]})
    plain = sim_api.run_sim({**base, "team": [{"id": FIGHTER, "position": 1}]})
    assert auto["meta"]["cdAssist"] is None and asap["meta"]["cdAssist"] is None
    assert auto["meta"]["total"] == plain["meta"]["total"]


def test_cd_assist_cannot_reach_impossible_turn():
    """기회가 모자란 턴(3쿨의 2턴 = 1턴 행동 1번 = -1뿐)은 가정으로도 불가 → 평타 + 원래 규칙(폴백)."""
    res = run_team([CharSpec(FIGHTER, position=1, rotation=_plan(8, {2}), ult_assist=True)], altar=[1012, 1013],
                   n_dummies=1, max_turn=8, enemy_hits=0, seed=0)
    assert _ult_turns(res, FIGHTER)[0] == 3          # 2턴 불가 → 폴백: 가정으로 준비되는 3턴에 발동


def test_cd_assist_zeto_blocks_external_cd_cut():
    """외부 CD 조작이 막힌 유닛(제토 cd_immune)은 제단 감소 기회가 0 — 가정으로도 앞당겨지지 않는다."""
    from woofia_sim.engine import Unit, _prob_cd_amount
    from woofia_sim.altar import altar_effects
    trig = altar_effects(1012)[0]
    u = Unit(name="x", side="ally", slot=0, base_atk=1, max_hp=1, hp=1, cd_immune=True)
    u._kit = type("K", (), {"char_id": 10441})()
    assert _prob_cd_amount(trig.sub_effects, u) == 0
    u.cd_immune = False
    assert _prob_cd_amount(trig.sub_effects, u) == 1


def test_cd_assist_sync_member_follows_early_anchor():
    """연동: 앵커가 가정으로 3턴에 궁 → '같이 궁' 멤버도 가정으로 3턴에 맞춘다(둘 다 옵션 ON)."""
    import sim_api
    team = [{"id": FIGHTER, "position": 1, "rotation": _plan(12, {3, 6, 9, 12}), "ult": {"mode": "fixed", "assist": True}},
            {"id": HEALER, "position": 2, "ult": {"mode": "fixed", "assist": True}}]
    res = sim_api.run_sim({"team": team, "turns": 12, "dummies": 1, "enemyHits": "0", "runs": 1, "noBand": True,
                           "altar": {"on": True, "floors": {"1": {"on": True, "off": {}}}},
                           "sync": [{"anchor": 1, "members": [{"p": 2}]}]})
    hu = sorted({ev["turn"] for ev in res["log"] if ev["kind"] == "필살기" and ev["actorId"] == HEALER})
    assert hu == [3, 6, 9, 12], hu


def test_cd_assist_probe_opens_timeline_cell():
    """플래너 프로브(보장 CD 기준)도 가정 ON 이면 3턴 궁을 '가능'으로 본다(타임라인 cdOk)."""
    import sim_api
    base = {"team": [{"id": FIGHTER, "position": 1, "ult": {"mode": "fixed", "assist": True}}], "turns": 4, "dummies": 1,
            "enemyHits": "0", "altar": {"on": True, "floors": {"1": {"on": True, "off": {}}}},
            "turnPlans": {"3": [{"p": 1, "a": "궁"}]}}
    pr = sim_api.plan_probe(base)
    assert pr["plan"]["3"]["cdOk"] == [True] and pr["plan"]["3"]["seq"][0]["a"] == "궁"
    off = sim_api.plan_probe({**base, "team": [{"id": FIGHTER, "position": 1}]})
    assert off["plan"]["3"]["cdOk"] == [False]
