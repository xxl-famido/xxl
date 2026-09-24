"""길드전 방탈출(시즌1, 맵 111/112/113) 제단(祭壇) 효과 → 엔진 Effect 매핑.

제단은 게임 오브젝트 Id(별 401~422 · 달 1001~1022) 24개가 층별로 고정 배치된 데이터라,
캐릭터 스킬처럼 영문 설명문을 파서(effects.py)에 태우지 않고 **Id → Effect 생성 테이블**로
명시 매핑한다(제단 문구는 ``Boss(es)`` / ``a Buddy`` 등 문법이 달라 정규식을 오염시킨다).

적용 규칙(사용자 확정, 2026-09-22):
  - **층 누적**: 2층 전투 = 1·2층 제단, 3층 전투 = 1·2·3층 제단이 전부 걸린다.
  - **중복 합산**: 같은 효과가 여러 층에 있으면(6206 배리어+25% 2·3층, 6208 치료+25% 2·3층,
    별 치료-75% 1·2층) 전부 더한다(1회 아님).
  - 별 제단(페널티) = 체크(부숨)하면 **미적용**, 해제된 것이 걸린다.
    달 제단(축복) = 체크(열음)한 것이 걸린다. → UI cfg의 ``off`` 의미가 두 종류에서 반대.
  - 층 OFF면 그 층 제단은 종류 불문 전부 미적용. 켜진 층은 1..N 접두 구간(UI 규칙과 동일하게 정규화).

데이터 출처: mining/results/altar_by_floor.json (BD202609091356, sectionhunk 실배치 24/24 일치).
"""
from __future__ import annotations

from .effects import (
    BUFF, CD_MOD, DAMAGE, DEBUFF, HEAL, TRIGGER, Effect,
    STAT_ATK, STAT_BAR_RECV, STAT_DMG_DEALT, STAT_DMG_TAKEN, STAT_DMG_TAKEN_EX,
    STAT_DOT_TAKEN, STAT_EX_EFFECT, STAT_HEAL_RECV,
)

ALTAR_OWNER = 0                 # 캐릭터가 아닌 출처 — 드릴다운은 아이콘 없이 스킬명(라벨)만 표시
ALTAR_BUILD = "BD202609091356"  # 매핑 기준 빌드(0909). 배치가 바뀌면 FLOORS·dashboard/altars.json 동시 갱신

# 층별 실배치 (dashboard/altars.json 과 동일해야 한다 — tests/test_altar.py 가 대조)
FLOORS: dict[int, dict[str, list[int]]] = {
    1: {"star": [401, 402, 413], "moon": [1011, 1012, 1013]},
    2: {"star": [414, 415, 416, 417], "moon": [1014, 1015, 1016, 1017]},
    3: {"star": [406, 407, 408, 409, 410], "moon": [1018, 1019, 1020, 1021, 1022]},
}
STAR_IDS: frozenset[int] = frozenset(i for f in FLOORS.values() for i in f["star"])
MOON_IDS: frozenset[int] = frozenset(i for f in FLOORS.values() for i in f["moon"])
FLOOR_OF: dict[int, int] = {i: fl for fl, f in FLOORS.items() for i in f["star"] + f["moon"]}

# 킷 수준(전투 시작 전) 적용 — "필살기 최대 CD +N턴". 로테이션 자동 생성·초기 충전(게이지 0)에 같이 반영
MAX_CD_PLUS: dict[int, int] = {402: 1}

_ELEMENT_OF_STAR = {406: 1, 407: 2, 408: 3, 409: 4, 410: 5}   # 불·물·나무·빛·어둠
_EL_KR = {1: "불", 2: "물", 3: "나무", 4: "빛", 5: "어둠"}

# 드릴다운(버프 출처)에 보이는 라벨. 층은 라벨에 넣어 2·3층 중복분이 구분되게 한다.
LABEL_KR: dict[int, str] = {
    401: "별 제단 1층 · 보스 필살기 피격 -75%",
    402: "별 제단 1층 · 아군 필살기 최대 CD +1",
    413: "별 제단 1층 · 아군 받는 치료 -75%",
    414: "별 제단 2층 · 보스 ATK +100%",
    415: "별 제단 2층 · 보스 주는 데미지 +35%",
    416: "별 제단 2층 · 아군 받는 데미지 +35%",
    417: "별 제단 2층 · 아군 받는 치료 -75%",
    406: "별 제단 3층 · 보스 불속성 피격 -75%",
    407: "별 제단 3층 · 보스 물속성 피격 -75%",
    408: "별 제단 3층 · 보스 나무속성 피격 -75%",
    409: "별 제단 3층 · 보스 빛속성 피격 -75%",
    410: "별 제단 3층 · 보스 어둠속성 피격 -75%",
    1011: "달 제단 1층 · 아군 필살기 효과 +25%",
    1012: "달 제단 1층 · 행동 시 30% 자신 필살 CD -1",
    1013: "달 제단 1층 · 필살 시 30% 자신 필살 CD -3",
    1014: "달 제단 2층 · 아군 받는 배리어 +25%",
    1015: "달 제단 2층 · 아군 받는 치료·지속치료 +25%",
    1016: "달 제단 2층 · 치료형·보조형 ATK +25%",
    1017: "달 제단 2층 · 행동 시 30% 최대HP 15% 자힐",
    1018: "달 제단 3층 · 전사형·방해형 ATK +25%",
    1019: "달 제단 3층 · 아군 받는 배리어 +25%",
    1020: "달 제단 3층 · 공격 시 50% 배리어 100% 데미지",
    1021: "달 제단 3층 · 아군 받는 지속딜 -25%",
    1022: "달 제단 3층 · 아군 받는 치료·지속치료 +25%",
}


def _stat(kind: str, target: str, stat: str, value: float, aid: int, element: int = 0) -> Effect:
    """영구 스탯 버프/디버프 한 줄. 제단마다 새 Effect 객체 = 엔진의 버프 키(id(effect))가 갈려
    같은 효과의 2·3층 중복분이 갱신되지 않고 **합산**된다."""
    return Effect(kind, LABEL_KR[aid], target=target, stat=stat, magnitude=value,
                  duration=-1, element=element, owner=ALTAR_OWNER, src_skill=LABEL_KR[aid])


def _trigger(event: str, chance: float, aid: int, inner: Effect) -> Effect:
    return Effect(TRIGGER, LABEL_KR[aid], condition=event, chance=chance,
                  owner=ALTAR_OWNER, src_skill=LABEL_KR[aid], sub_effects=[inner])


def altar_effects(aid: int) -> list[Effect]:
    """제단 Id → 그 제단이 '걸려 있을 때' 전투에 주입할 Effect 목록(매 호출 새 객체).

    402(최대 CD +1)는 킷 수준(MAX_CD_PLUS)에서 처리하므로 여기서는 빈 목록.
    알 수 없는 Id는 ValueError — 조용히 무시하면 UI·엔진 데이터가 어긋난 채 지나간다.
    """
    if aid not in LABEL_KR:
        raise ValueError(f"unknown altar id {aid}")
    lab = LABEL_KR[aid]
    if aid == 401:      # 보스 측이 필살기 공격을 받을 때 받는 데미지 -75% (EX 액션 한정 받뎀 채널)
        return [_stat(DEBUFF, "all_enemies", STAT_DMG_TAKEN_EX, -75, aid)]
    if aid == 402:      # 아군 필살기 최대 CD +1 → harness(run_team)에서 kit.fatal.cd 에 반영
        return []
    if aid in (413, 417):   # 아군 받는 치료 -75% (1·2층 합산 = -150% → 엔진이 0 하한)
        return [_stat(BUFF, "allies", STAT_HEAL_RECV, -75, aid)]
    if aid == 414:      # 보스 ATK +100% — 피격 데미지 모드에서 피격량 ×2 (ATK 비례)
        return [_stat(BUFF, "all_enemies", STAT_ATK, 100, aid)]
    if aid == 415:      # 보스 주는 데미지 +35% — 피격 데미지 모드에서만 의미
        return [_stat(BUFF, "all_enemies", STAT_DMG_DEALT, 35, aid)]
    if aid == 416:      # 아군 받는 데미지 +35% — 피격 데미지 모드에서만 의미
        return [_stat(DEBUFF, "allies", STAT_DMG_TAKEN, 35, aid)]
    if aid in _ELEMENT_OF_STAR:   # 보스 속성별 피격 -75% (공격자 속성이 맞을 때만, 곱연산 채널)
        return [_stat(DEBUFF, "all_enemies", STAT_DMG_TAKEN, -75, aid, element=_ELEMENT_OF_STAR[aid])]
    if aid == 1011:
        return [_stat(BUFF, "allies", STAT_EX_EFFECT, 25, aid)]
    if aid == 1012:     # 행동 시 30% → 자신 현재 필살 CD -1
        return [_trigger("on_action", 30, aid,
                         Effect(CD_MOD, lab, target="self", magnitude=-1, owner=ALTAR_OWNER, src_skill=lab))]
    if aid == 1013:     # 필살 시 30% → 자신 현재 필살 CD -3
        return [_trigger("on_ex", 30, aid,
                         Effect(CD_MOD, lab, target="self", magnitude=-3, owner=ALTAR_OWNER, src_skill=lab))]
    if aid in (1014, 1019):
        return [_stat(BUFF, "allies", STAT_BAR_RECV, 25, aid)]
    if aid in (1015, 1022):   # 받는 치료 +25% + 받는 지속치료 +25% — 엔진은 HoT도 같은 채널(설치 시점 recv)
        return [_stat(BUFF, "allies", STAT_HEAL_RECV, 25, aid)]
    if aid == 1016:
        return [_stat(BUFF, "allies_healer", STAT_ATK, 25, aid),
                _stat(BUFF, "allies_support", STAT_ATK, 25, aid)]
    if aid == 1017:     # 행동 시 30% → 자신 최대HP 15% 자힐
        return [_trigger("on_action", 30, aid,
                         Effect(HEAL, lab, target="self", magnitude=15, of_max_hp=True,
                                owner=ALTAR_OWNER, src_skill=lab))]
    if aid == 1018:
        return [_stat(BUFF, "allies_fighter", STAT_ATK, 25, aid),
                _stat(BUFF, "allies_vandal", STAT_ATK, 25, aid)]
    if aid == 1020:     # 공격 시 50% → 자신 배리어 수치 100%만큼 현재 목표물에 데미지 (다라완과 같은 채널)
        return [_trigger("on_attack", 50, aid,
                         Effect(DAMAGE, lab, target="target", magnitude=100, of_barrier=True,
                                owner=ALTAR_OWNER, src_skill=lab))]
    if aid == 1021:
        return [_stat(BUFF, "allies", STAT_DOT_TAKEN, -25, aid)]
    raise ValueError(f"altar {aid} has no effect mapping")   # LABEL_KR 에 있는데 분기가 없으면 버그


def resolve_altars(cfg: dict | None) -> list[int]:
    """UI cfg → 이번 전투에 걸리는 제단 Id 목록(정렬).

    cfg = ``{"on": bool, "floors": {"1": {"on": bool, "off": [id, ...]}, "2": ..., "3": ...}}``
      - ``off`` = 그 층에서 체크를 **해제**한 제단. 별은 해제 = 서 있음 = 페널티 적용,
        달은 해제 = 안 열음 = 축복 미적용.
      - 층 키가 없으면 그 층은 ON·전부 체크(=별 전부 부숨, 달 전부 열음)로 본다.
      - 켜진 층은 1..N 접두 구간으로 정규화한다(UI 규칙: 아래층 OFF면 위층도 OFF).
    on 이 아니거나 형식이 틀리면 빈 목록(=제단 미사용, 기존 결과 불변).
    """
    if not isinstance(cfg, dict) or not cfg.get("on"):
        return []
    floors_cfg = cfg.get("floors")
    if not isinstance(floors_cfg, dict):
        floors_cfg = {}
    active: list[int] = []
    open_chain = True
    for fl in sorted(FLOORS):
        fc = floors_cfg.get(str(fl), floors_cfg.get(fl))
        fc = fc if isinstance(fc, dict) else {}
        floor_on = open_chain and (fc.get("on", True) is not False)
        if not floor_on:
            open_chain = False
            continue
        off: set[int] = set()
        raw_off = fc.get("off") or []
        if isinstance(raw_off, dict):          # {id: true} 형태(localStorage 원형)도 허용
            raw_off = [k for k, v in raw_off.items() if v]
        for x in raw_off:
            try:
                off.add(int(x))
            except (TypeError, ValueError):
                continue
        active.extend(i for i in FLOORS[fl]["star"] if i in off)        # 해제된 별 = 페널티 적용
        active.extend(i for i in FLOORS[fl]["moon"] if i not in off)    # 체크된 달 = 축복 적용
    return sorted(active)


ULT_MODES = ("fixed", "strict", "asap")
MAX_SYNC_GROUPS = 3


def parse_ult_policy(raw: object) -> dict:
    """team[].ult = {"mode": fixed|strict|asap, "keepDef": bool} → CharSpec 키워드. 이상하면 기본(fixed·유지)."""
    if not isinstance(raw, dict):
        return {}
    mode = raw.get("mode")
    out = {"ult_mode": mode if mode in ULT_MODES else "fixed"}
    if raw.get("keepDef") is False:
        out["ult_keep_def"] = False
    return out


SYNC_BASES = ("fatal", "defend", "basic")
SYNC_OTHERS = ("hold", "own")   # 앵커가 궁을 안 쓰는 턴: hold=궁 아낌 / own=내 사용 방식대로


def parse_sync_groups(raw: object, positions: list[int]) -> list[dict]:
    """cfg.sync(구: altar.groups) → 검증된 궁 맞추기(연동) 그룹(포지션 1-based).

    입력: [{"anchor": p, "members": [{"p": p, "order": "before"|"after", "base": "fatal"|"defend"|"basic"}, ...],
            "miss": "wait"|"asap"}]
    other(선택): "hold"|"own" — 앵커가 궁을 안 쓰는 턴에 궁을 아낄지(hold) 내 사용 방식대로 쓸지(own).
    미지정이면 base 가 보류(defend/basic)일 때 own, fatal 이면 hold.
    출력 멤버: (p, order, base, bonus, own) — base 는 앵커 궁 턴의 멤버 기본 행동(기본 fatal=같이 궁). base 가 defend/basic
    이면 궁을 보류하고 **앵커가 준 추가 행동에서 궁**(bonus=True). 추가 행동은 이미 행동한 아군에게만 들어가므로
    그 경우 order 는 before 로 강제한다.
    규칙: 최대 3그룹 · 앵커/멤버는 출전 포지션이어야 함 · 한 포지션은 그룹 전체에서 한 역할만
    (앵커는 다른 그룹 멤버 불가 → 순환·연쇄 원천 차단) · 멤버 없는 그룹은 버림.
    """
    if not isinstance(raw, list):
        return []
    present = set(int(p) for p in positions)
    used: set[int] = set()
    groups: list[dict] = []
    for g in raw[:MAX_SYNC_GROUPS]:
        if not isinstance(g, dict):
            continue
        try:
            anchor = int(g.get("anchor"))
        except (TypeError, ValueError):
            continue
        if anchor not in present or anchor in used:
            continue
        members: list[tuple[int, str, str, bool, bool]] = []
        for m in (g.get("members") or []):
            try:
                p = int(m.get("p") if isinstance(m, dict) else m)
            except (TypeError, ValueError, AttributeError):
                continue
            if p not in present or p == anchor or p in used or any(p == q[0] for q in members):
                continue
            order = (m.get("order") if isinstance(m, dict) else None)
            base = (m.get("base") if isinstance(m, dict) else None)
            base = base if base in SYNC_BASES else "fatal"
            bonus = base != "fatal"
            other = (m.get("other") if isinstance(m, dict) else None)
            own = (other == "own") if other in SYNC_OTHERS else bonus   # 기본: 보류 멤버=내 방식대로, 같이 궁=아낌
            members.append((p, "before" if bonus or order != "after" else "after", base, bonus, own))
        if not members:
            continue
        used.add(anchor)
        used.update(p for p, *_ in members)
        groups.append({"anchor": anchor, "members": members,
                       "miss": "asap" if g.get("miss") == "asap" else "wait"})
    return groups


def summarize(active: list[int]) -> dict:
    """결과 meta 용 요약 — UI 표시(별 n · 달 m)와 재현용 Id 목록."""
    return {"active": list(active),
            "star": sum(1 for i in active if i in STAR_IDS),
            "moon": sum(1 for i in active if i in MOON_IDS),
            "floors": sorted({FLOOR_OF[i] for i in active if i in FLOOR_OF})}
