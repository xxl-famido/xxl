"""확률 편차 밴드: 바닥값(never_proc)·천장값(force_proc).

바닥 = 확률 효과가 전혀 발동하지 않았을 때(최소) / 천장 = 전부 발동했을 때(최대).
- 바닥 ≤ 표본 런 (바닥은 확정 하한).
- 제토 없는 확률 의존 팀은 바닥 < 천장이고, 천장이 표본의 확정 상한.
- 제토(10441) 도장 행동회복 체이닝은 천장(force_proc)에서도 실제 50%만 굴려
  무한 폭발이 없다(기존 기조). 바닥(never_proc)에서는 그냥 발동 안 함.
- run_sim 이 totalFloor/totalCeil/dpsFloor/dpsCeil 을 싣고 바닥≤평균≤천장.
"""
from __future__ import annotations

from woofia_sim.harness import CharSpec, run_team
from sim_api import run_sim

INVIS = 10437     # 투명인간 — passive2 47.78% 확률 발동
TAMRANG = 10408   # 탐랑 — 필살 40% 확률 수면
ZETTO = 10441     # 제토 — 도장 행동회복 50% 체이닝(천장 예외)


def _team_total(ids: list[int], **flags) -> float:
    specs = [CharSpec(cid, position=i + 1) for i, cid in enumerate(ids)]
    return run_team(specs, n_dummies=3, max_turn=12, enemy_hits=2, seed=0, **flags).total_damage


def test_never_proc_is_deterministic() -> None:
    a = _team_total([INVIS, TAMRANG], never_proc=True)
    b = _team_total([INVIS, TAMRANG], never_proc=True)
    assert a == b, "바닥(0%) 모드는 결정론이어야 한다"


def test_floor_below_ceiling_for_proc_team() -> None:
    floor = _team_total([INVIS, TAMRANG], never_proc=True)
    ceil = _team_total([INVIS, TAMRANG], force_proc=True)
    assert floor < ceil, f"확률 의존 팀은 밴드 폭 > 0 이어야 (바닥 {floor:.0f} < 천장 {ceil:.0f})"


def test_floor_and_ceiling_bound_samples_without_zetto() -> None:
    """제토가 없으면 바닥 ≤ 모든 표본 ≤ 천장 (천장이 확정 상한)."""
    floor = _team_total([INVIS, TAMRANG], never_proc=True)
    ceil = _team_total([INVIS, TAMRANG], force_proc=True)
    for sd in range(12):
        specs = [CharSpec(INVIS, position=1), CharSpec(TAMRANG, position=2)]
        tot = run_team(specs, n_dummies=3, max_turn=12, enemy_hits=2, seed=100 + sd).total_damage
        assert floor - 1 <= tot <= ceil + 1, f"seed {sd}: {tot:.0f} 이 [{floor:.0f}, {ceil:.0f}] 밖"


def test_zetto_ceiling_no_infinite_chain() -> None:
    """제토 천장은 유한(무한 체이닝 없음), 바닥 ≤ 천장."""
    floor = _team_total([ZETTO], never_proc=True)
    ceil = _team_total([ZETTO], force_proc=True)
    assert 0 < floor <= ceil < 1e12, f"제토 바닥 {floor:.0f} / 천장 {ceil:.0f}"


def test_run_sim_exposes_band() -> None:
    r = run_sim({"team": [{"id": INVIS, "position": 1}, {"id": TAMRANG, "position": 2}],
                 "turns": 12, "dummies": 3, "enemyHits": 2, "runs": 20})
    m = r["meta"]
    for key in ("totalFloor", "totalCeil", "dpsFloor", "dpsCeil"):
        assert key in m, f"run_sim meta 에 {key} 없음"
    assert m["totalFloor"] <= m["total"] <= m["totalCeil"], \
        f"바닥 {m['totalFloor']} ≤ 평균 {m['total']} ≤ 천장 {m['totalCeil']} 성립해야"


def test_run_sim_zetto_band_contains_average() -> None:
    """제토 팀도 바닥 ≤ 평균 ≤ 천장 (천장 max-시드 + 평균 정합 클램프). 변동 커서 밴드 폭 > 0."""
    r = run_sim({"team": [{"id": INVIS, "position": 1}, {"id": ZETTO, "position": 2}],
                 "turns": 12, "dummies": 3, "enemyHits": 2, "runs": 25})
    m = r["meta"]
    assert m["totalFloor"] <= m["total"] <= m["totalCeil"], \
        f"제토: 바닥 {m['totalFloor']} ≤ 평균 {m['total']} ≤ 천장 {m['totalCeil']}"
    assert m["totalCeil"] > m["totalFloor"], "제토는 변동이 커 밴드 폭 > 0 이어야"


def test_run_sim_band_is_reproducible() -> None:
    """밴드는 고정 시드라 재실행해도 같은 값(평균은 랜덤 시드라 달라질 수 있음)."""
    cfg = {"team": [{"id": INVIS, "position": 1}, {"id": ZETTO, "position": 2}],
           "turns": 12, "dummies": 3, "enemyHits": 2, "runs": 20}
    a, b = run_sim(cfg)["meta"], run_sim(cfg)["meta"]
    assert (a["totalFloor"], a["totalCeil"]) == (b["totalFloor"], b["totalCeil"]), \
        "밴드(바닥/천장)는 고정 시드라 재현되어야 한다"


def test_plan_probe_skips_band() -> None:
    """플래너 프로브는 밴드를 계산하지 않고 타임라인만 돌려준다(성능)."""
    from sim_api import plan_probe
    pr = plan_probe({"team": [{"id": INVIS, "position": 1}], "turns": 10, "dummies": 1})
    assert pr["turns"] == 10 and pr["team"], "프로브가 타임라인을 정상 반환해야"
