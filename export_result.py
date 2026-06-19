"""Run a team simulation and export a rich result.json for the web dashboard.

Edit TEAM / MAX_TURN below and run:  python export_result.py
"""
from __future__ import annotations

import json
from collections import defaultdict

from woofia_sim.harness import CharSpec, run_team

# ── 팀 구성 (position 1~5) ──
TEAM = [
    CharSpec(10401, position=1),   # 아누비로스
    CharSpec(10410, position=2),   # 임부언
    CharSpec(10421, position=3),   # 파미도
    CharSpec(10428, position=4),   # 리카노
    CharSpec(10425, position=5),   # 하니엘
]
MAX_TURN = 30

ELEMENT = {0: ("무", "none"), 1: ("불", "fire"), 2: ("물", "water"),
           3: ("나무", "wood"), 4: ("빛", "light"), 5: ("어둠", "dark")}
ROLE = {1: "딜러", 2: "탱커", 3: "힐러", 4: "버퍼", 5: "방해"}


def main() -> None:
    result = run_team(TEAM, n_dummies=1, max_turn=MAX_TURN)
    state = result.state
    units = {u.name: u for u in state.allies}

    # per-turn damage per actor (for the chart)
    per_turn: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    log = []
    for ev in state.log:
        if ev.amount:
            per_turn[ev.turn][ev.actor] += ev.amount
        log.append({"turn": ev.turn, "actor": ev.actor,
                    "text": ev.text, "amount": round(ev.amount, 2)})

    team = []
    for u in sorted(state.allies, key=lambda x: x.slot):
        el_kr, el_key = ELEMENT.get(u.element, ELEMENT[0])
        team.append({
            "name": u.name, "position": u.slot + 1,
            "element": el_kr, "elementKey": el_key,
            "role": ROLE.get(u.kind, "?"),
            "atk": round(u.base_atk), "hp": round(u.max_hp),
            "priority": round(u.priority, 2),
        })

    total = result.total_damage
    per_char = []
    for u in sorted(state.allies, key=lambda x: -x.damage_dealt):
        el_kr, el_key = ELEMENT.get(u.element, ELEMENT[0])
        per_char.append({
            "name": u.name, "elementKey": el_key, "role": ROLE.get(u.kind, "?"),
            "damage": round(u.damage_dealt, 2),
            "share": round(u.damage_dealt / total * 100, 1) if total else 0,
            "healing": round(u.healing_done, 2), "barrier": round(u.barrier_done, 2),
        })

    chart = [{"turn": t,
              "byActor": {a: round(v, 2) for a, v in per_turn[t].items()},
              "total": round(sum(per_turn[t].values()), 2)}
             for t in range(1, MAX_TURN + 1)]

    out = {
        "meta": {"turns": MAX_TURN, "dummies": 1,
                 "total": round(total, 2), "dps": round(result.dps, 2),
                 "order": [u.name for u in sorted(state.allies, key=lambda x: x.priority)]},
        "team": team, "perChar": per_char, "chart": chart, "log": log,
    }
    with open("dashboard/result.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    # data.js lets the dashboard open straight from file:// (no fetch/CORS)
    with open("dashboard/data.js", "w", encoding="utf-8") as f:
        f.write("window.RESULT = " + json.dumps(out, ensure_ascii=False) + ";")
    print(f"wrote dashboard/result.json + data.js  (총딜 {total:,.0f} / {len(log)} log lines)")


if __name__ == "__main__":
    main()
