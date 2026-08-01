"""Pure simulation API — shared by the local server (server.py) and the
static Pyodide build (browser). No HTTP; just data + meta/skills/run_sim."""
from __future__ import annotations

import json
import os
import random
from collections import defaultdict

from woofia_sim.engine import _kit_has_hp_gate
from woofia_sim.harness import CharSpec, default_priority, run_team, _turn1_cd_delta
from woofia_sim.kit import resolve_kit
from woofia_sim.stats import (
    MAX_EVO,
    MAX_LEVEL,
    Investment,
    can_unlock_rune,
    levelable_passives,
    pevo_cap,
    scale_atk_hp,
    unlocked_passives,
)

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
# 고급 설정 타임라인의 행동 토큰 -> 엔진 액션. 엔진 _TOKEN_ACTION과 같은 어휘.
_ACTION_TOKEN = {"평": "basic", "궁": "fatal", "방": "defend"}
_TOKEN_KR = {"basic": "평", "fatal": "궁", "defend": "방"}   # 실행 결과를 UI 토큰으로
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


def _cd_defend_info(kit) -> dict:
    """방어 시 자신 필살 CD를 줄이는 메커니즘의 상세.

    반환: {"max": 최대감소량, "perStack": 스택당 감소량, "cap": 스택 캡, "stack": 스택명}
    히토하처럼 고정이면 perStack=0/cap=0/stack=None (max만 유효).
    모이루처럼 repeat(own:추격)로 감싸인 경우 스택당 감소량과 캡을 분리해 준다 —
    UI 플래너가 '아군 평타 수 → 실제 추격 중첩'으로 CD를 추정하려면 곱한 값(max)만으론 부족하다.
    """
    from woofia_sim.effects import CD_MOD, STACK
    caps: dict[str, int] = {}

    def collect(effs):
        for e in effs:
            if e.kind == STACK and e.stack_name and e.max_stacks:
                caps[e.stack_name] = max(caps.get(e.stack_name, 0), e.max_stacks)
            collect(e.sub_effects)
    for sl in [kit.basic, kit.fatal, *kit.passives]:
        collect(sl.effects)

    best = {"max": 0, "perStack": 0, "cap": 0, "stack": None}

    def walk(effs, under_defend, rep_stack):
        nonlocal best
        for e in effs:
            d = under_defend or (e.kind == "TRIGGER" and e.condition == "on_defend")
            rs = rep_stack
            if e.condition == "repeat" and e.repeat_stack:
                rs = e.repeat_stack.split(":")[-1]
            if e.kind == CD_MOD and e.target == "self" and e.magnitude < 0 and d:
                per = int(round(-e.magnitude))
                cap = caps.get(rs, 1) if rs else 1
                if per * cap > best["max"]:
                    best = {"max": per * cap, "perStack": per if rs else 0,
                            "cap": cap if rs else 0, "stack": rs}
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
            # 스펙 설정 패널이 슬라이더를 끌 때마다 서버를 왕복하지 않고 즉시 계산하도록
            # 원본값을 함께 내려준다. JS 쪽 공식은 tools/statcheck.js 가 파이썬과 대조한다.
            "baseATK": c["baseATK"], "baseHP": c["baseHP"], "rarity": c["rarity"],
            # 스펙 패널이 "패시브 3" 대신 실제 스킬 이름을 쓰도록 (상세 API를 또 부르지 않게)
            "skillNames": {s: (_skills.get(str(cid), {}).get(s, {}).get("name_kr")
                               or _skills.get(str(cid), {}).get(s, {}).get("name_en") or "")
                           for s in SLOT_KR},
            "priority": round(default_priority(cid, kit.kind, 1), 2),
            "fatalCd": cd, "firstFatal": first_fatal,
            "actionsPerTurn": _actions_per_turn(kit),
            # 도장강화 한계: XL(rarity 3)=18000, XXL은 빛/어둠 23000 / 그 외 20000
            "sealLimit": 18000 if c.get("rarity") == 3 else (23000 if kit.element in (4, 5) else 20000),
            # 방어 시 필살 CD 감소: max=최대감소량(히토하 1 · 모이루 3). 모이루처럼 스택 기반이면
            # perStack/cap이 실려, UI 플래너가 '아군 평타 수 → 실제 추격 중첩'으로 CD를 추정한다.
            "cdDefendReduce": _cd_defend_info(kit)["max"],
            "cdDefendPerStack": _cd_defend_info(kit)["perStack"],
            "cdDefendStackCap": _cd_defend_info(kit)["cap"],
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


_ACTION_KR = {"보통공격": "평", "필살기": "궁", "방어": "방"}


def plan_probe(cfg: dict) -> dict:
    """고급 설정 플래너용 경량 프로브 — 이 설정으로 각 턴에 '실제로' 무슨 일이 일어나는지만 돌려준다.

    UI가 행동 예산(추가 행동 부여 규칙)을 JS로 다시 구현하지 않게 하려는 것이 목적이다. 그 로직은
    엔진에만 두고, 플래너는 여기서 받은 실행 결과를 그대로 그린다. `run_sim`과 같은 cfg를 받되
    데미지 계산 결과·로그 상세는 버리고 타임라인만 추린다(확률 100% 고정 = 결정론).

    반환::

        {"turns": N,
         "team":  [{"position", "id", "name", "elementKey", "actionsPerTurn"}, ...],
         "plan":  {"4": {"seq": [{"p":5,"a":"궁"}, ...],          # 그 턴 실행 순서
                         "budget": {...}, "ultOk": [...],         # 예산 · 턴 시작 필살 가능
                         "cdOk": [...], "exec": [...]}, ...}}     # 항목별 실시간 쿨 · 실제 수행
    """
    probe = dict(cfg)
    probe["forceProc"] = True          # 결정론 — 프로브는 항상 같은 답을 줘야 한다
    probe["runs"] = 1
    probe["planner"] = True            # 턴별 행동 예산·필살 가능 정보까지 받는다
    res = run_sim(probe)
    pos_of = {t["name"]: t["position"] for t in res["team"]}
    # 모든 턴을 미리 만들어 둔다 — 아무도 행동하지 않은 턴이 응답에서 빠지면 플래너가
    # 그 턴을 렌더할 수도, 실행 안 됨을 알릴 수도 없다.
    plan: dict[str, dict] = {str(t): {"seq": []}
                             for t in range(1, int(res["meta"]["turns"]) + 1)}
    seen_action: set[int] = set()
    for ev in res["log"]:
        token = _ACTION_KR.get(ev.get("kind") or "")
        if not token or ev["act"] in seen_action:
            continue
        seen_action.add(ev["act"])
        pos = pos_of.get(ev["actor"])
        if pos is None:                # 더미(적) 행동은 타임라인에 넣지 않는다
            continue
        slot = plan.setdefault(str(ev["turn"]), {"seq": []})
        slot["seq"].append({"p": pos, "a": token})
    pl = res.get("planner") or {}
    for t, slot in plan.items():       # 턴별 예산·필살 가능 정보를 타임라인에 붙인다
        slot["budget"] = (pl.get("budget") or {}).get(t, {})
        slot["ultOk"] = (pl.get("ultOk") or {}).get(t, [])
        slot["exec"] = (pl.get("exec") or {}).get(t)   # None = 그 턴은 기본 진행(전부 실행)
        slot["cdOk"] = (pl.get("cdOk") or {}).get(t)
    return {"turns": res["meta"]["turns"], "team": res["team"], "plan": plan}


_SKILL_SLOTS = ("basicAtk", "ultimate", "sigil",
                "passive0", "passive1", "passive2", "passive3", "passive4")


def _clamp(v, lo: int, hi: int, dflt: int) -> int:
    try:
        return max(lo, min(hi, int(v)))
    except (TypeError, ValueError):
        return dflt


def _spec_fields(m: dict) -> dict:
    """'캐릭터 스펙 설정'이 켜진 슬롯의 육성 값. 범위를 벗어난 입력은 잘라낸다.

    진화 단계 상한은 성급에 종속(``(evo+1)*5-1``, ★5는 0)이라 evo 를 먼저 확정한 뒤
    자른다. ``Investment.normalized()`` 가 한 번 더 막지만, 여기서 잘라야 UI 표시와
    엔진이 같은 값을 본다.
    """
    evo = _clamp(m.get("evo"), 0, MAX_EVO, MAX_EVO)
    spec = {
        "level": _clamp(m.get("level"), 1, MAX_LEVEL, MAX_LEVEL),
        "evo": evo,
        "pevo": _clamp(m.get("pevo"), 0, pevo_cap(evo), 0),
        "compat": _clamp(m.get("compat"), 0, 5, 5),
    }
    raw = m.get("skillLevels")
    if isinstance(raw, dict):
        lv = {s: _clamp(raw[s], 1, 10, 10) for s in _SKILL_SLOTS if s in raw}
        if lv:
            spec["skill_levels"] = lv
    return spec


def run_sim(cfg: dict) -> dict:
    specs = []
    for m in cfg["team"]:
        spec_on = bool(m.get("specOn"))          # 스펙 설정을 켠 슬롯만 개별 육성 적용
        specs.append(CharSpec(
            int(m["id"]), skill_level=int(m.get("skill", 10)),
            # 꺼져 있으면 CharSpec 기본값(Lv60·★5·Bond5·전 슬롯 10)이 그대로 = 풀육성
            **(_spec_fields(m) if spec_on else {}),
            # 스펙이 꺼져 있으면 풀육성 기준 = 도장 해제 상태
            rune=(bool(m.get("rune", True)) if spec_on else True),
            position=int(m["position"]),
            rotation=(m.get("rotation") or None),
            fed_action=(m.get("fedActions") or m.get("fedAction") or None),   # 이태호 임부언 fed 추가행동: 턴별 dict{turn:토큰}(신) 또는 단일 str(구)
            ally_ult_after=bool(m.get("allyUltAfter", False)),   # 욱영 토글
            priority=(float(m["priority"]) if m.get("priority") not in (None, "") else None),
            atk_bonus=int(m.get("sealAtk", 0) or 0), hp_bonus=int(m.get("sealHp", 0) or 0)))
    turns = int(cfg.get("turns", 30))
    # per-turn order override: {turn: [position,...]} -> {turn:[slot,...]}
    torders = {int(t): [int(p) - 1 for p in order]
               for t, order in (cfg.get("turnOrders") or {}).items()}
    # 고급 설정(명시 타임라인): {turn: [{"p":포지션, "a":"평|궁|방"}, ...]} -> {turn:[(slot, token)]}
    # 우선순위: 같은 턴에 turnPlans와 turnOrders가 함께 오면 **turnPlans가 이긴다**
    # (엔진 _ally_phase가 명시 타임라인을 먼저 처리하고 반환). 대시보드는 둘을 동시에 보내지 않는다.
    # 그 턴은 우선순위·턴계획을 모두 대체한다. 같은 캐릭이 여러 번 등장할 수 있고(추가 행동),
    # 엔진이 행동 예산으로 실행 가능 여부를 최종 판정한다.
    # 빈 목록은 '그 턴엔 아무도 행동하지 않음'이라는 유효한 지정이므로 버리지 않는다.
    # 알 수 없는 토큰은 빼지 않고 None으로 남긴다 — 빼면 exec 인덱스가 요청과 어긋난다.
    tplans: dict[int, list] = {}
    for t, seq in (cfg.get("turnPlans") or {}).items():
        try:
            turn = int(t)
            entries = []
            for e in (seq if isinstance(seq, list) else []):
                if not isinstance(e, dict):
                    entries.append((-1, None))
                    continue
                try:
                    pos = int(e["p"]) - 1
                except (KeyError, TypeError, ValueError):
                    pos = -1
                entries.append((pos, _ACTION_TOKEN.get(e.get("a"))))
            tplans[turn] = entries
        except (TypeError, ValueError):
            continue                        # 턴 키가 숫자가 아니면 그 항목만 버린다
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
    # 피격 데미지 모드: 더미가 아군 피격 시 아군 최대HP의 n%(1~99) 데미지. 0/미지정=끔.
    inc = cfg.get("incomingHpPct")
    incoming_hp_pct = max(0, min(99, int(inc))) if inc not in (None, "", False) else 0
    # 평균 모드: 확률(난수) 판정은 시드마다 달라지므로 N회(다른 시드) 돌려 평균을 낸다.
    # 100% 모드는 결정론(모든 발동 성공)이라 1회면 충분.
    runs = 1 if force else max(1, min(int(cfg.get("runs", 50) or 50), 500))
    # 확률 모드는 매 실행마다 랜덤 시드 베이스로 진행 → 같은 설정도 매번 다른 전개(사용자 요청).
    # 100% 모드(force)는 시드 무관 결정론이라 영향 없음(재현이 필요하면 100% 모드 사용).
    # cfg["seed"](정수)를 주면 그 값으로 고정 재현 가능(선택). 미지정이면 엔트로피 랜덤.
    _seed = cfg.get("seed")
    # 100% 모드는 '결정론'이라고 문서화돼 있었지만, 적이 때릴 아군을 고르는 rng.sample 때문에
    # enemyHits가 숫자면 매 실행 결과가 1.5~2.6% 흔들렸다. force면 시드를 고정해 실제로 재현되게 한다.
    seed_base = (int(_seed) if _seed is not None and _seed != ""
                 else (0 if force else random.randrange(1 << 31)))

    states, run_totals, run_dps = [], [], []
    char_dmg: dict[int, float] = defaultdict(float)
    char_heal: dict[int, float] = defaultdict(float)
    char_bar: dict[int, float] = defaultdict(float)
    chart_acc: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    dps_sum = 0.0
    for s in range(runs):
        res = run_team(specs, n_dummies=n_dummies, max_turn=turns, enemy_hits=enemy_hits,
                       turn_orders=torders, turn_plans=tplans, force_proc=force,
                       seed=seed_base + s, enemy_aoe=enemy_aoe,
                       dummy_element=dummy_element, hp10=hp10, incoming_hp_pct=incoming_hp_pct)
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

    planner = None
    if cfg.get("planner"):
        # 포지션(1-based) 기준으로 변환 — UI가 그대로 쓰는 좌표계
        planner = {
            "budget": {str(t): {str(sl + 1): n for sl, n in b.items()}
                       for t, b in rep.turn_budget.items()},
            "ultOk": {str(t): sorted(sl + 1 for sl in ready)
                      for t, ready in rep.turn_ready.items()},
            # 명시 타임라인의 항목별 실행 여부 — 요청 순서와 인덱스가 1:1로 맞는다
            "exec": {str(t): [_TOKEN_KR.get(x) for x in m] for t, m in rep.turn_exec.items()},
            # 항목별 '그 시점' 필살 가능 — 턴 시작 스냅샷(ultOk)과 달리 같은 턴 안의 CD 변화를 반영
            "cdOk": {str(t): list(m) for t, m in rep.turn_cdok.items()},
        }
    out_meta = {"turns": turns, "total": round(avg_total, 2), "dps": round(dps_sum / runs, 2),
                     "order": [u.name for u in sorted(rep.allies, key=lambda x: x.priority)],
                     "runs": runs, "totalStd": round(std, 2),
                     "totalMin": round(min(run_totals), 2), "totalMid": round(_median(run_totals), 2),
                     "totalMax": round(max(run_totals), 2),
                     "dpsMin": round(min(run_dps), 2), "dpsMid": round(_median(run_dps), 2),
                     "dpsMax": round(max(run_dps), 2)}
    return {"meta": out_meta, "team": team, "perChar": per_char, "chart": chart,
            "log": log, "planner": planner}
