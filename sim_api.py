"""Pure simulation API — shared by the local server (server.py) and the
static Pyodide build (browser). No HTTP; just data + meta/skills/run_sim."""
from __future__ import annotations

import json
import os
from collections import defaultdict

from woofia_sim.engine import _kit_has_hp_gate
from woofia_sim.harness import CharSpec, default_priority, run_team, _turn1_cd_delta
from woofia_sim.kit import resolve_kit
from woofia_sim.stats import Investment

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

"""Local web server for the WOOFIA simulator dashboard.

  python server.py        # then open http://localhost:8777

Serves the static dashboard/ and exposes:
  GET  /api/chars            -> all 34 characters (name, element, role, base stats)
  GET  /api/char/<id>        -> that character's skills at every skill level
  POST /api/simulate         -> run a battle for a team config, return result + log
No third-party deps (stdlib http.server only).
"""




ELEMENT = {0: ("무", "none"), 1: ("불", "fire"), 2: ("물", "water"),
           3: ("나무", "wood"), 4: ("빛", "light"), 5: ("어둠", "dark")}
ROLE = {1: "전사", 2: "수호", 3: "치유", 4: "보조", 5: "방해"}
SLOTS = ["basicAtk", "ultimate", "sigil", "passive0", "passive1",
         "passive2", "passive3", "passive4"]
SLOT_KR = {"basicAtk": "평타", "ultimate": "필살기", "sigil": "룬 필살기",
           "passive0": "패시브1", "passive1": "패시브2", "passive2": "패시브3",
           "passive3": "패시브4", "passive4": "패시브5"}

_chars = json.load(open(os.path.join(DATA, "chars.json"), encoding="utf-8"))
_skills = json.load(open(os.path.join(DATA, "skills.json"), encoding="utf-8"))
_CHAR_IDS = sorted(int(k) for k in _chars)   # chars.json의 모든 캐릭터 (XXL 34 + XL 최유희 10303 등)

_INV = Investment(level=60, evo=5, compat=5)
_meta_cache: list | None = None


def _actions_per_turn(kit) -> int:
    """How many actions this char takes per turn = 1 + self 'once per turn' extra
    actions (이태호 = 2). These consume 2 rotation tokens per turn."""
    from woofia_sim.effects import EXTRA_ACTION
    extra = 0

    def walk(effs):
        nonlocal extra
        for e in effs:
            if e.kind == EXTRA_ACTION and e.target == "self" and "once per turn" in (e.raw or "").lower():
                extra += int(e.magnitude)
            walk(e.sub_effects)
    for sl in [kit.basic, kit.fatal, *kit.passives]:
        walk(sl.effects)
    return 1 + min(extra, 3)


def _cd_defend_reduce(kit) -> int:
    """방어 시 자신 필살 CD를 줄이는 메커니즘(히토하 고정 1 · 모이루 추격 수만큼)의 최대 감소량.
    on_defend 아래의 자신 EX CD_MOD(mag<0)를 찾고, repeat(own:스택)로 감싸였으면 그 스택 캡을 곱한다."""
    from woofia_sim.effects import CD_MOD, STACK
    caps: dict[str, int] = {}

    def collect(effs):
        for e in effs:
            if e.kind == STACK and e.stack_name and e.max_stacks:
                caps[e.stack_name] = max(caps.get(e.stack_name, 0), e.max_stacks)
            collect(e.sub_effects)
    for sl in [kit.basic, kit.fatal, *kit.passives]:
        collect(sl.effects)

    best = 0

    def walk(effs, under_defend, rep_stack):
        nonlocal best
        for e in effs:
            d = under_defend or (e.kind == "TRIGGER" and e.condition == "on_defend")
            rs = rep_stack
            if e.condition == "repeat" and e.repeat_stack:
                rs = e.repeat_stack.split(":")[-1]
            if e.kind == CD_MOD and e.target == "self" and e.magnitude < 0 and d:
                per = int(round(-e.magnitude))
                best = max(best, per * (caps.get(rs, 1) if rs else 1))
            walk(e.sub_effects, d, rs)
    for sl in [kit.basic, kit.fatal, *kit.passives]:
        walk(sl.effects, False, None)
    return best


def char_meta(cid: int) -> dict:
    c = _chars[str(cid)]
    kit = resolve_kit(cid, _INV, 10, True)
    el_kr, el_key = ELEMENT.get(kit.element, ELEMENT[0])
    cd = kit.fatal.cd
    first_fatal = 1 if (cd + _turn1_cd_delta(kit)) <= 0 else cd + 1   # 첫 필살 사용 가능 턴
    return {"id": cid, "name": c.get("name_kr", str(cid)),
            "element": el_kr, "elementKey": el_key, "role": ROLE.get(kit.kind, "?"),
            "atk": round(kit.atk), "hp": round(kit.hp),
            "priority": round(default_priority(cid, kit.kind, 1), 2),
            "fatalCd": cd, "firstFatal": first_fatal,
            "actionsPerTurn": _actions_per_turn(kit),
            # 도장강화 한계: XL(rarity 3)=18000, XXL은 빛/어둠 23000 / 그 외 20000
            "sealLimit": 18000 if c.get("rarity") == 3 else (23000 if kit.element in (4, 5) else 20000),
            "cdDefendReduce": _cd_defend_reduce(kit),  # 방어 시 필살 CD 감소량 (히토하 1)
            "hpSchedule": _kit_has_hp_gate(kit)}  # 적 HP% 의존 (카라트) → 더미 HP 스케줄


def all_meta() -> list:
    global _meta_cache
    if _meta_cache is None:
        _meta_cache = [char_meta(c) for c in _CHAR_IDS]
    return _meta_cache


def char_skills(cid: int) -> dict:
    sk = _skills[str(cid)]
    out = []
    for slot in SLOTS:
        sd = sk.get(slot)
        if not sd:
            continue
        from woofia_sim.effects import resolve_placeholders
        levels = []
        for lv in range(10):
            e = sd["levels"].get(str(lv))
            if not e:
                continue
            levels.append({"cd": e.get("cd", 0),
                           "kr": resolve_placeholders(e.get("desc_kr", ""), e.get("params", {}))})
        out.append({"slot": slot, "slotKr": SLOT_KR.get(slot, slot),
                    "name": sd.get("name_kr", ""), "levels": levels})
    return {"id": cid, "skills": out}


def run_sim(cfg: dict) -> dict:
    specs = []
    for m in cfg["team"]:
        specs.append(CharSpec(
            int(m["id"]), skill_level=int(m.get("skill", 10)),
            rune=bool(m.get("rune", True)), position=int(m["position"]),
            rotation=(m.get("rotation") or None),
            fed_action=(m.get("fedAction") or None),   # 이태호 임부언 fed 추가행동(평/궁/방)
            priority=(float(m["priority"]) if m.get("priority") not in (None, "") else None),
            atk_bonus=int(m.get("sealAtk", 0) or 0), hp_bonus=int(m.get("sealHp", 0) or 0)))
    turns = int(cfg.get("turns", 30))
    # per-turn order override: {turn: [position,...]} -> {turn:[slot,...]}
    torders = {int(t): [int(p) - 1 for p in order]
               for t, order in (cfg.get("turnOrders") or {}).items()}
    force = bool(cfg.get("forceProc", False))
    n_dummies = int(cfg.get("dummies", 1))
    # enemyHits: 숫자(개별 타격 횟수) 또는 "all"/"전체"(아군 전체 1회 동시 피격)
    _eh_raw = cfg.get("enemyHits", None)
    _eh = str(_eh_raw) if _eh_raw is not None else ""   # 미지정과 명시적 "0"을 구분
    enemy_aoe = _eh in ("all", "전체", "aoe")
    # 명시적 "0" = 적 공격 안 함(피격/반격 없음, 센티넬 -1) / "all" = 전체 동시피격(0) /
    # 그 외 N = 개별 N회 / 미지정("") = 0 = all (기존 폴백 유지)
    enemy_hits = -1 if _eh == "0" else (0 if enemy_aoe else int(_eh or 0))
    dummy_element = int(cfg.get("dummyElement", 0) or 0)   # 더미 속성 (0무·1불·2물·3나무·4빛·5어둠)
    hp10 = bool(cfg.get("hp10", False))                    # 체력 10% 모드 (더미 HP 고정, 카라트 저HP 게이트)
    # 평균 모드: 확률(난수) 판정은 시드마다 달라지므로 N회(다른 시드) 돌려 평균을 낸다.
    # 100% 모드는 결정론(모든 발동 성공)이라 1회면 충분.
    runs = 1 if force else max(1, min(int(cfg.get("runs", 50) or 50), 500))

    states, run_totals, run_dps = [], [], []
    char_dmg: dict[int, float] = defaultdict(float)
    char_heal: dict[int, float] = defaultdict(float)
    char_bar: dict[int, float] = defaultdict(float)
    chart_acc: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    dps_sum = 0.0
    for s in range(runs):
        res = run_team(specs, n_dummies=n_dummies, max_turn=turns, enemy_hits=enemy_hits,
                       turn_orders=torders, force_proc=force, seed=s, enemy_aoe=enemy_aoe,
                       dummy_element=dummy_element, hp10=hp10)
        st = res.state
        states.append(st)
        run_totals.append(res.total_damage)
        run_dps.append(res.dps)
        dps_sum += res.dps
        for u in st.allies:
            cid = u._kit.char_id
            char_dmg[cid] += u.damage_dealt
            char_heal[cid] += u.healing_done
            char_bar[cid] += u.barrier_done
        for ev in st.log:
            if ev.detail and ev.detail.get("act") and not ev.detail.get("kind"):  # 데미지 hit만(힐/베리어 제외)
                chart_acc[ev.turn][ev.actor] += ev.amount

    avg_total = sum(run_totals) / runs
    rep = states[min(range(runs), key=lambda i: abs(run_totals[i] - avg_total))]  # 평균에 가장 가까운 런 = 로그 표본

    log = [{"turn": ev.turn, "actor": ev.actor, "actorId": ev.actor_id,
            "act": ev.action_id, "text": ev.text, "amount": round(ev.amount, 2),
            "detail": ev.detail, "srcId": ev.src_id, "srcSkill": ev.src_skill,
            "kind": ev.action_kind, "atkBy": ev.atk_by} for ev in rep.log]
    team = []
    for u in sorted(rep.allies, key=lambda x: x.slot):
        el_kr, el_key = ELEMENT.get(u.element, ELEMENT[0])
        team.append({"id": u._kit.char_id, "name": u.name, "position": u.slot + 1,
                     "element": el_kr, "elementKey": el_key, "role": ROLE.get(u.kind, "?"),
                     "atk": round(u.base_atk), "hp": round(u.max_hp),
                     "priority": round(u.priority, 2)})
    char_units = {u._kit.char_id: u for u in rep.allies}
    per_char = []
    for cid, u in sorted(char_units.items(), key=lambda kv: -(char_dmg[kv[0]] + char_heal[kv[0]])):
        el_kr, el_key = ELEMENT.get(u.element, ELEMENT[0])
        avg_d = char_dmg[cid] / runs
        per_char.append({"id": cid, "name": u.name, "elementKey": el_key,
                         "role": ROLE.get(u.kind, "?"), "damage": round(avg_d, 2),
                         "share": round(avg_d / avg_total * 100, 1) if avg_total else 0,
                         "healing": round(char_heal[cid] / runs, 2), "barrier": round(char_bar[cid] / runs, 2)})
    chart = [{"turn": t, "total": round(sum(chart_acc[t].values()) / runs, 2),
              "byActor": {a: round(v / runs, 2) for a, v in chart_acc[t].items()}}
             for t in range(1, turns + 1)]
    std = (sum((x - avg_total) ** 2 for x in run_totals) / runs) ** 0.5 if runs > 1 else 0.0

    def _median(xs: list[float]) -> float:
        s = sorted(xs)
        n = len(s)
        return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2

    return {"meta": {"turns": turns, "total": round(avg_total, 2), "dps": round(dps_sum / runs, 2),
                     "order": [u.name for u in sorted(rep.allies, key=lambda x: x.priority)],
                     "runs": runs, "totalStd": round(std, 2),
                     "totalMin": round(min(run_totals), 2), "totalMid": round(_median(run_totals), 2),
                     "totalMax": round(max(run_totals), 2),
                     "dpsMin": round(min(run_dps), 2), "dpsMid": round(_median(run_dps), 2),
                     "dpsMax": round(max(run_dps), 2)},
            "team": team, "perChar": per_char, "chart": chart, "log": log}
