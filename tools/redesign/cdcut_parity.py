"""하쿠이 '자신 제외 아군 필살 CD −1' — JS 플래너 ↔ 엔진 일치 검사(해석 10444-AUTO-pull).

화면(core/plan.js)이 그리는 동료 줄의 필살 턴과, 그 화면이 보낼 cfg 로 엔진 프로브(sim_api.plan_probe)를 돌린 실제 필살 턴을
동료마다 대조한다. 대상 = 하쿠이 감소를 받는 동료(cdCutSource). 무작위 편성(하쿠이 자리 무작위) + 무작위 직접 지정 핀
(방어·보통 공격·필살기) + 가끔 특정 턴 순서.

    python tools/redesign/cdcut_parity.py [--cases 300] [--seed 7] [--turns 12]

종료 코드 0 = 전부 일치. 불일치는 사례별로 출력한다(엔진 쪽 추가 행동 필살은 줄에 없으므로 '자연 행동' 필살만 비교).
하쿠이 없이도 화면·엔진이 다른 기존 유형 ①~③(아래 주석)은 따로 세고 판정에서 뺀다.
"""
from __future__ import annotations

import argparse
import json
import random
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import sim_api  # noqa: E402

HAKUI = 10444
LIMBUEON = 10410
UKYOUNG = 10439


def natural_ults(probe: dict, turns: int, team_size: int) -> dict[int, list[int]]:
    """자리 → 자연 행동(그 턴 첫 행동)에서 쓴 필살 턴. 받은 추가 행동의 필살은 줄에 없으니 뺀다."""
    out: dict[int, list[int]] = {p: [] for p in range(1, team_size + 1)}
    for t in range(1, turns + 1):
        seen: set[int] = set()
        for e in probe["plan"].get(str(t), {}).get("seq", []):
            p = e["p"]
            if p in seen:
                continue                    # 같은 동료의 두 번째 행동 = 추가 행동
            seen.add(p)
            if e["a"] == "궁":
                out.setdefault(p, []).append(t)
    return out


def make_cases(n: int, seed: int, turns: int, ids: list[int]) -> list[dict]:
    rng = random.Random(seed)
    others = [c for c in ids if c != HAKUI]
    cases = []
    for _ in range(n):
        picks = rng.sample(others, 4)
        # 임부언(1번 자리 캐리 −3·면역·추가 행동)·욱영(인접 행동 회복)과의 조합을 자주 섞는다 — 사용자 점검 요청(2026-10-07)
        for special, prob in ((LIMBUEON, 0.4), (UKYOUNG, 0.3)):
            if special not in picks and rng.random() < prob:
                picks[rng.randrange(4)] = special
        pos = rng.randrange(5)
        team_ids = picks[:pos] + [HAKUI] + picks[pos:]
        team = [{"id": c} for c in team_ids]
        pins: dict[str, dict[str, str]] = {}          # 핀 = {턴: {자리: 값}} (core/plan.js pinsRowOf)
        for p in range(1, 6):
            if team_ids[p - 1] == HAKUI or rng.random() > 0.35:
                continue
            for _k in range(rng.randint(1, 2)):
                pins.setdefault(str(rng.randint(2, turns - 1)), {})[str(p)] = rng.choice(["방", "평", "궁"])
        overrides = None
        if rng.random() < 0.2:
            order = list(range(1, 6))
            rng.shuffle(order)
            overrides = {str(rng.choice([2, 7])): order}
        cases.append({"team": team, "pins": pins, "turns": turns, "overrides": overrides})
    return cases


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--cases", type=int, default=300)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--turns", type=int, default=12)
    args = ap.parse_args()

    metas = {str(m["id"]): m for m in sim_api.all_meta()}
    cases = make_cases(args.cases, args.seed, args.turns, [int(k) for k in metas])
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = Path(tmp) / "in.json", Path(tmp) / "out.json"
        src.write_text(json.dumps({"chars": metas, "cases": cases}, ensure_ascii=False), encoding="utf-8")
        proc = subprocess.run(["node", str(ROOT / "tools" / "redesign" / "cdcut_parity.mjs"), str(src), str(dst)],
                              capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600)
        if proc.returncode != 0:
            print(proc.stderr[-4000:])
            return 2
        js = json.loads(dst.read_text(encoding="utf-8"))

    checked = mism = known = known_diff = 0
    for k, (c, j) in enumerate(zip(cases, js)):
        cfg = {"team": [{"id": s["id"], "position": i + 1, "rune": True, "rotation": j["lines"][i] or None}
                        for i, s in enumerate(c["team"])],
               "turns": c["turns"], "dummies": 1, "enemyHits": "all",
               "turnOrders": c["overrides"] or {}, "turnPlans": {}}
        eng = natural_ults(sim_api.plan_probe(cfg), c["turns"], len(c["team"]))
        ids = [x["id"] for x in c["team"]]
        for i, s in enumerate(c["team"]):
            if not j["cut"][i] or j["views"][i] is None:
                continue
            # 기존 차이 유형(하쿠이 없이도 생김 — 2026-10-07 하쿠이를 다른 동료로 바꾼 같은 사례로 확인). 따로 센다:
            #   ① 임부언 편성의 1번 자리에 직접 지정 핀(쿨 미충족 필살 칸의 폴백·받은 추가 행동 필살 표시)
            #   ② 임부언 편성 1번 자리 + 특정 턴 순서(플래너는 '1번 자리가 임부언보다 먼저 행동'으로 본다)
            #   ③ 쿨 미충족으로 내린 꽂은 필살기 + 욱영(회복 행동이 엔진의 '차는 즉시 폴백'을 쓴다 — 플래너는 모름)
            pre = ((i == 0 and LIMBUEON in ids and (any("1" in row for row in c["pins"].values()) or c["overrides"]))
                   or (j["demoted"][i] and UKYOUNG in ids))
            if pre:
                known += 1
                known_diff += j["views"][i] != eng.get(1, [])
                continue
            checked += 1
            if j["views"][i] != eng.get(i + 1, []):
                mism += 1
                name = metas[str(s["id"])]["name"]
                print(f"[불일치] 사례 {k} 자리 {i + 1} {name}({s['id']}) 화면 {j['views'][i]} ≠ 엔진 {eng.get(i + 1, [])}"
                      f" · 편성 {[x['id'] for x in c['team']]} · 핀 {c['pins']} · 순서 {c['overrides']}")
    print(f"사례 {len(cases)} · 대조 동료 {checked} · 불일치 {mism}"
          f" · (기존 차이 유형 ①~③ {known}줄 중 {known_diff}줄 다름 — 제외)")
    return 0 if mism == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
