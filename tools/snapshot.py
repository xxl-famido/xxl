"""회귀 스냅샷 도구 — 검증 끝난 조합의 시뮬 결과를 골든으로 고정하고 변화를 검출한다.

VERIFICATION_PLAN.md §8.7 완료 기준의 "핵심 조합 회귀 스냅샷 보관" 항목 구현.

엔진/파서를 고칠 때마다 "고치려던 것만 바뀌고 나머지는 그대로인가"를 초 단위로 확인하는 것이
목적이다. 조합은 두 층으로 구성한다:

* **solo_*** — `data/chars.json`의 전 캐릭터 1인 전투. 캐릭터별 변화를 정확히 한 조합에
  국한시켜 보여주므로, 어떤 스킬을 건드렸는지 바로 드러난다.
* **team_*** — 엔진의 교차 메커니즘(2행동·fed carry·인접·배리어 채널·발동효과 순차 누적·
  수면 게이트·스택 반복 발동·팀 속성 게이트·DoT·협동 트리거)을 각각 자극하는 대표 팀.

판정은 두 단계로 나눈다. **수치(FAIL)** 가 계약이고 **로그 텍스트(WARN)** 는 표시용이다:

* FAIL — 총딜/캐릭터별 딜·힐·배리어/턴별 딜/미적용 카운터 중 하나라도 달라짐. 곧 밸런스가
  바뀌었다는 뜻이므로 의도한 변경이 아니면 회귀다.
* WARN — 수치는 같은데 로그 이벤트 구성이나 문구만 달라짐. 로그 문구 개선 등 무해한 경우가
  대부분이라 종료 코드에 영향을 주지 않는다.

용법::

    python tools/snapshot.py                # 전 조합 비교 (회귀 있으면 종료코드 1)
    python tools/snapshot.py -f xuying      # 이름에 'xuying'이 든 조합만
    python tools/snapshot.py --update       # 현재 결과를 골든으로 기록/갱신
    python tools/snapshot.py --update -f team_barrier
    python tools/snapshot.py --list         # 조합 목록만 출력
    python tools/snapshot.py --tol 1e-6     # 부동소수 허용 오차를 두고 비교

골든은 조합당 JSON 한 개로 ``tools/snapshots/`` 에 저장된다(조합별 파일이라 git diff가
바뀐 조합만 보여준다). 배포 대상이 아니므로(`deploy.yml`은 woofia_sim/·dashboard/·data/만
복사) 라이브에는 영향이 없다.

주의: 결정론이 전제다. 모든 조합은 ``force_proc=True`` (확률 100%) + 고정 시드로 돌린다.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

from woofia_sim.harness import CharSpec, TeamResult, run_team   # noqa: E402

SNAPSHOT_DIR = _ROOT / "tools" / "snapshots"
CHARS_PATH = _ROOT / "data" / "chars.json"

# 스냅샷 포맷 버전. 기록 항목을 바꾸면 올린다 (옛 골든은 재생성 필요로 표시된다).
SCHEMA_VERSION = 1

# 금액 반올림 자릿수. 엔진이 이미 hit 단위로 2자리 반올림하므로 동일하게 맞춘다.
_ROUND = 2
# 전 캐릭터 solo 조합의 공통 설정 — 스킬 1사이클(대개 CD 3)이 두 번 이상 돌도록 10턴.
_SOLO_TURNS = 10
_SOLO_DUMMIES = 3
_SOLO_ENEMY_HITS = 3
_SOLO_INCOMING_HP_PCT = 5      # 피격 반응(반격·배리어 소모) 경로까지 태우기 위한 최소 피해
_DEFAULT_SEED = 0


def _canonical(obj: object) -> dict:
    """JSON 왕복으로 정규화 — 저장 형태와 메모리 형태를 항상 같게 만든다."""
    return json.loads(json.dumps(obj, ensure_ascii=False, sort_keys=True))


@dataclass(frozen=True)
class Combo:
    """골든 하나에 대응하는 재현 가능한 전투 설정."""

    name: str
    specs: tuple[CharSpec, ...]
    purpose: str = ""
    turns: int = _SOLO_TURNS
    dummies: int = 1
    enemy_hits: int = 0
    enemy_aoe: bool = False
    dummy_element: int = 0
    hp10: bool = False
    incoming_hp_pct: int = 0
    seed: int = _DEFAULT_SEED

    def config(self) -> dict:
        """골든에 함께 저장할 설정 스냅샷 (설정이 바뀌면 비교 대신 재생성하도록).

        JSON 왕복을 한 번 태워 정규화한다 — `fed_action={4: "궁"}` 처럼 int 키를 쓰는 값이
        저장 시 `"4"`로 바뀌어, 정규화 없이는 갓 기록한 골든과도 매번 다르다고 나온다.
        """
        return _canonical({
            "team": [
                {
                    "id": s.char_id, "position": s.position, "priority": s.priority,
                    "skill": s.skill_level, "rune": s.rune, "rotation": s.rotation,
                    "fedAction": s.fed_action, "allyUltAfter": s.ally_ult_after,
                }
                for s in self.specs
            ],
            "turns": self.turns, "dummies": self.dummies,
            "enemyHits": self.enemy_hits, "enemyAoe": self.enemy_aoe,
            "dummyElement": self.dummy_element, "hp10": self.hp10,
            "incomingHpPct": self.incoming_hp_pct, "seed": self.seed,
            "forceProc": True,
        })


class SnapshotError(RuntimeError):
    """조합을 구성할 수 없는 상태(데이터 누락·손상). CLI는 메시지만 보여주고 종료한다."""


def load_char_ids() -> list[int]:
    """`data/chars.json`의 전 캐릭터 id (정렬)."""
    try:
        chars = json.loads(CHARS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SnapshotError(f"chars.json을 읽을 수 없음: {CHARS_PATH} ({exc})") from exc
    if not chars:
        raise SnapshotError(f"chars.json이 비어 있음: {CHARS_PATH}")
    return sorted(int(k) for k in chars)


def _solo_combos() -> list[Combo]:
    """전 캐릭터 1인 전투 — 캐릭터별 변화를 한 조합에 국한시키는 기본 안전망."""
    return [
        Combo(
            name=f"solo_{cid}",
            specs=(CharSpec(cid, position=1),),
            purpose="단독 전투 (캐릭터별 회귀 격리)",
            dummies=_SOLO_DUMMIES,
            enemy_hits=_SOLO_ENEMY_HITS,
            incoming_hp_pct=_SOLO_INCOMING_HP_PCT,
        )
        for cid in load_char_ids()
    ]


def _team_combos() -> list[Combo]:
    """엔진 교차 메커니즘별 대표 팀. 각 조합이 자극하는 경로를 purpose에 남긴다."""
    return [
        Combo(
            name="team_fed_carry_double_ult",
            purpose="임부언 fed carry — P1 캐리 CD 리셋으로 한 턴 2회 궁",
            specs=(CharSpec(10401, position=1), CharSpec(10410, position=2)),
            turns=15, dummies=3, enemy_hits=2, incoming_hp_pct=5,
        ),
        Combo(
            name="team_taeho_two_actions",
            purpose="이태호 턴당 2행동 + 임부언 fed 토큰(4턴 궁) + 월지호비/일지어천 전환",
            specs=(CharSpec(10423, position=1, fed_action={4: "궁"}),
                   CharSpec(10410, position=2)),
            turns=15, dummies=3, enemy_hits=2, incoming_hp_pct=5,
        ),
        Combo(
            name="team_xuying_adjacent_off",
            purpose="욱영 인접 링 타겟 + 좌우끝 적 연쇄딜 (아군 필살 나중 OFF)",
            specs=(CharSpec(10402, position=1), CharSpec(10439, position=2),
                   CharSpec(10429, position=3)),
            turns=12, dummies=3, enemy_hits=2, incoming_hp_pct=5,
        ),
        Combo(
            name="team_xuying_adjacent_on",
            purpose="욱영 ally_ult_after ON — 인접 아군 궁 보류 후 회복 행동에서 재소비",
            specs=(CharSpec(10402, position=1),
                   CharSpec(10439, position=2, ally_ult_after=True),
                   CharSpec(10429, position=3)),
            turns=12, dummies=3, enemy_hits=2, incoming_hp_pct=5,
        ),
        Combo(
            name="team_barrier_channels",
            purpose="배리어 액션 채널(CHG-1)·오렘 소급 증폭(CHG-4)·다라완 배리어 비례 반격·조롱",
            specs=(CharSpec(10419, position=1), CharSpec(10414, position=2),
                   CharSpec(10438, position=3)),
            turns=12, dummies=3, enemy_aoe=True, incoming_hp_pct=10,
        ),
        Combo(
            name="team_trigger_eff_chain",
            purpose="발동효과 순차 누적 2-패스 (제트블랙·하니엘 팀 발동효과 + 신리랑 자기 누적)",
            specs=(CharSpec(10402, position=1), CharSpec(10418, position=2),
                   CharSpec(10425, position=3)),
            turns=12, dummies=3, enemy_hits=2, incoming_hp_pct=5,
        ),
        Combo(
            name="team_ex_eff_buff",
            purpose="EX효과 채널 (리카노 팀 영구 EX효과 + 모이루/카푸카 고계수 필살)",
            specs=(CharSpec(10428, position=1), CharSpec(10436, position=2),
                   CharSpec(10411, position=3)),
            turns=12, dummies=3, enemy_hits=2, incoming_hp_pct=5,
        ),
        Combo(
            name="team_sleep_gate",
            purpose="수면 CC(CHG-5) — 첫 직접피격 1회 받뎀증 + 탐랑 파2 수면 조건 주는딜",
            specs=(CharSpec(10408, position=1), CharSpec(10401, position=2)),
            turns=12, dummies=3, enemy_hits=2, incoming_hp_pct=5,
        ),
        Combo(
            name="team_repeat_stacks",
            purpose="스택 수만큼 반복 발동 (크로크라인 own 3종·포르베어 target·임욱잠 target)",
            specs=(CharSpec(10435, position=1), CharSpec(10422, position=2),
                   CharSpec(10429, position=3)),
            turns=15, dummies=3, enemy_hits=2, incoming_hp_pct=5,
        ),
        Combo(
            name="team_ran_p4_synergy",
            purpose="란 허물 매미 교전 — 방어(란의 기운) → P4 동료 버프 → 그 동료 공격이 되먹임",
            specs=(CharSpec(10426, position=1, rotation="평평궁방|평궁방"),
                   CharSpec(10421, position=4, priority=9)),
            turns=15, dummies=3, enemy_hits=2, incoming_hp_pct=5,
        ),
        Combo(
            name="team_wood_element_gate",
            purpose="팀 속성 게이트 (비어녹스 나무 동료 ≥3 → 아군 전체 주는딜) + 나무 상성",
            specs=(CharSpec(10405, position=1), CharSpec(10421, position=2),
                   CharSpec(10439, position=3), CharSpec(10416, position=4)),
            turns=12, dummies=3, enemy_hits=2, dummy_element=2, incoming_hp_pct=5,
        ),
        Combo(
            name="team_karat_hp10",
            purpose="카라트 목표 HP% 게이트 — 체력 10% 모드에서 저HP 분기 전부 발동",
            specs=(CharSpec(10409, position=1), CharSpec(10428, position=2)),
            turns=12, dummies=3, enemy_hits=2, hp10=True, incoming_hp_pct=5,
        ),
        Combo(
            name="team_dot_channel",
            purpose="지속딜 채널 — 부여 시점 스냅샷 고정 + 대상측 받는 지속딜은 틱 시점",
            specs=(CharSpec(10303, position=1), CharSpec(10436, position=2)),
            turns=15, dummies=3, enemy_hits=2, incoming_hp_pct=5,
        ),
        Combo(
            name="team_coordination",
            purpose="다양수이 협동 트리거 — 자신 제외 전사 동료 전원 평타 시 전의 누적 → 궁에서 EX효과로 실현",
            # 게이트는 '자신 제외' 전사 동료만 보므로 다양수이 본인은 기본 로테이션(궁 포함)을 쓴다.
            # 동료를 평타로 고정해야 매 턴 게이트가 열리고, 쌓인 전의가 궁 데미지에 실제로 반영된다.
            specs=(CharSpec(10412, position=1),
                   CharSpec(10413, position=2, rotation="평|평"),
                   CharSpec(10432, position=3, rotation="평|평")),
            turns=12, dummies=3, enemy_hits=2, incoming_hp_pct=5,
        ),
    ]


def all_combos() -> list[Combo]:
    """전 조합 (solo 먼저, 그다음 team)."""
    return _solo_combos() + _team_combos()


def _log_fingerprint(result: TeamResult) -> tuple[str, dict, int]:
    """로그의 (해시, 구조 히스토그램, 이벤트 수).

    해시는 문구까지 포함하므로 표시용 문구만 바뀌어도 달라진다(WARN 판정에만 쓴다).
    히스토그램은 행동 종류·출력 종류 카운트라 문구 변화엔 둔감하고 구조 변화엔 민감하다.
    """
    hasher = hashlib.sha256()
    kinds: Counter = Counter()
    details: Counter = Counter()
    for ev in result.state.log:
        hasher.update(
            f"{ev.turn}|{ev.actor}|{ev.action_kind}|{ev.text}|"
            f"{round(ev.amount, _ROUND)}\n".encode()
        )
        kinds[ev.action_kind or "-"] += 1
        if ev.detail:
            details[str(ev.detail.get("kind") or ev.detail.get("act") or "-")] += 1
    return (
        f"sha256:{hasher.hexdigest()[:32]}",
        {"byActionKind": dict(sorted(kinds.items())),
         "byOutput": dict(sorted(details.items()))},
        len(result.state.log),
    )


def measure(combo: Combo) -> dict:
    """조합을 한 번 돌려 골든에 저장할 계측치를 만든다."""
    result = run_team(
        list(combo.specs),
        n_dummies=combo.dummies,
        max_turn=combo.turns,
        seed=combo.seed,
        enemy_hits=combo.enemy_hits,
        force_proc=True,
        enemy_aoe=combo.enemy_aoe,
        dummy_element=combo.dummy_element,
        hp10=combo.hp10,
        incoming_hp_pct=combo.incoming_hp_pct,
    )
    per_char = {
        u.name: {
            "damage": round(u.damage_dealt, _ROUND),
            "healing": round(u.healing_done, _ROUND),
            "barrier": round(u.barrier_done, _ROUND),
        }
        for u in result.state.allies
    }
    per_turn: dict[int, dict[str, float]] = defaultdict(dict)
    for ev in result.state.log:
        if ev.amount and ev.detail and "atkTotal" in ev.detail:
            cur = per_turn[ev.turn].get(ev.actor, 0.0)
            per_turn[ev.turn][ev.actor] = round(cur + ev.amount, _ROUND)
    log_hash, histogram, event_count = _log_fingerprint(result)
    return {
        "schema": SCHEMA_VERSION,
        "purpose": combo.purpose,
        "config": combo.config(),
        "total": round(result.total_damage, _ROUND),
        "dps": round(result.dps, _ROUND),
        "perChar": per_char,
        "perTurn": {str(t): per_turn[t] for t in sorted(per_turn)},
        "unapplied": dict(sorted(result.state.unapplied.items())),
        "events": {"count": event_count, **histogram},
        "logHash": log_hash,
    }


def golden_path(name: str) -> Path:
    return SNAPSHOT_DIR / f"{name}.json"


def load_golden(name: str) -> dict | None:
    """저장된 골든. 없으면 None, 깨졌으면 예외 대신 None + 경고."""
    path = golden_path(name)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"  ! 골든 손상 — 재생성 필요: {path.name} ({exc})")
        return None


def save_golden(name: str, payload: dict) -> None:
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    golden_path(name).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _num_diffs(old: dict, new: dict, tol: float, path: str = "") -> list[str]:
    """중첩 dict의 수치 차이를 사람이 읽는 줄로 (`경로: 옛값 → 새값 (증감)`)."""
    lines: list[str] = []
    for key in sorted(set(old) | set(new)):
        here = f"{path}.{key}" if path else str(key)
        a, b = old.get(key), new.get(key)
        if isinstance(a, dict) or isinstance(b, dict):
            lines += _num_diffs(a or {}, b or {}, tol, here)
        # bool 은 int 의 하위형이라 수치 분기보다 먼저 걸러야 한다
        # (안 그러면 `rune: True → False` 가 `1.00 → 0.00` 으로 나온다).
        elif isinstance(a, bool) or isinstance(b, bool):
            if a != b:
                lines.append(f"{here}: {a!r} → {b!r}")
        elif isinstance(a, (int, float)) and isinstance(b, (int, float)):
            if abs(a - b) > tol * max(abs(a), abs(b)):
                delta = b - a
                # 미적용 카운터처럼 정수인 값은 소수점 없이 (딜 수치만 2자리)
                fmt = ",d" if isinstance(a, int) and isinstance(b, int) else ",.2f"
                # 2자리로는 같아 보이는 미세 차이(부동소수 노이즈)는 원값을 그대로 보여준다 —
                # 안 그러면 `100.00 → 100.00` 처럼 '차이 없음'으로 읽힌다.
                if f"{a:{fmt}}" == f"{b:{fmt}}":
                    lines.append(f"{here}: {a!r} → {b!r} (미세 차이 — --tol 검토)")
                    continue
                pct = f" ({delta / a * 100:+.2f}%)" if a else ""
                lines.append(f"{here}: {a:{fmt}} → {b:{fmt}} ({delta:+{fmt}}){pct}")
        elif a != b:
            lines.append(f"{here}: {a!r} → {b!r}")
    return lines


# 수치 계약 = 이 키들. 하나라도 다르면 FAIL.
_NUMERIC_KEYS = ("total", "dps", "perChar", "perTurn", "unapplied")


@dataclass
class Verdict:
    """조합 하나의 비교 결과."""

    name: str
    status: str                                   # ok | fail | warn | new | config
    fail_lines: list[str] = field(default_factory=list)
    warn_lines: list[str] = field(default_factory=list)


def compare(combo: Combo, golden: dict | None, current: dict, tol: float) -> Verdict:
    """골든과 현재 결과를 대조해 판정한다."""
    if golden is None:
        return Verdict(combo.name, "new")
    if golden.get("schema") != SCHEMA_VERSION:
        return Verdict(combo.name, "config",
                       [f"스냅샷 스키마 {golden.get('schema')} → {SCHEMA_VERSION} — --update 필요"])
    if golden.get("config") != current["config"]:
        return Verdict(combo.name, "config",
                       ["전투 설정이 골든과 다름 — 조합 정의 변경. --update로 재기록"]
                       + _num_diffs(golden.get("config", {}), current["config"], tol, "config"))

    fail_lines: list[str] = []
    for key in _NUMERIC_KEYS:
        fail_lines += _num_diffs(golden.get(key, {}) if isinstance(golden.get(key), dict)
                                 else {key: golden.get(key)},
                                 current[key] if isinstance(current[key], dict)
                                 else {key: current[key]},
                                 tol, key if isinstance(current[key], dict) else "")
    warn_lines: list[str] = []
    if golden.get("events") != current["events"]:
        warn_lines += _num_diffs(golden.get("events", {}), current["events"], tol, "events")
    if golden.get("logHash") != current["logHash"]:
        warn_lines.append("로그 문구/순서 변화 (수치 동일)")

    if fail_lines:
        return Verdict(combo.name, "fail", fail_lines, warn_lines)
    if warn_lines:
        return Verdict(combo.name, "warn", [], warn_lines)
    return Verdict(combo.name, "ok")


def _select(combos: list[Combo], needle: str | None) -> list[Combo]:
    if not needle:
        return combos
    return [c for c in combos if needle.lower() in c.name.lower()]


def _stale_goldens(known: set[str]) -> list[str]:
    """조합 정의에서 사라졌는데 파일만 남은 골든."""
    if not SNAPSHOT_DIR.exists():
        return []
    return sorted(p.stem for p in SNAPSHOT_DIR.glob("*.json") if p.stem not in known)


def run(needle: str | None, update: bool, tol: float, verbose: bool) -> int:
    """비교(또는 갱신)를 수행하고 종료 코드를 돌려준다."""
    combos = _select(all_combos(), needle)
    if not combos:
        print(f"'{needle}'에 해당하는 조합 없음. --list로 목록 확인")
        return 2

    verdicts: list[Verdict] = []
    for combo in combos:
        try:
            current = measure(combo)
        except Exception as exc:                                     # noqa: BLE001
            verdicts.append(Verdict(combo.name, "fail", [f"시뮬 실행 실패: {exc!r}"]))
            continue
        if update:
            save_golden(combo.name, current)
            verdicts.append(Verdict(combo.name, "ok"))
            continue
        verdicts.append(compare(combo, load_golden(combo.name), current, tol))

    if update:
        print(f"골든 {len(verdicts)}개 기록 → {SNAPSHOT_DIR.relative_to(_ROOT)}")
        return 0

    counts = Counter(v.status for v in verdicts)
    for verdict in verdicts:
        if verdict.status == "ok" and not verbose:
            continue
        mark = {"ok": "✓", "fail": "✗ FAIL", "warn": "△ WARN",
                "new": "+ NEW", "config": "⚙ CONFIG"}[verdict.status]
        print(f"{mark:9} {verdict.name}")
        for line in verdict.fail_lines[:12]:
            print(f"            {line}")
        if len(verdict.fail_lines) > 12:
            print(f"            … 외 {len(verdict.fail_lines) - 12}건")
        for line in verdict.warn_lines[:4] if verdict.status != "fail" else []:
            print(f"            {line}")

    stale = _stale_goldens({c.name for c in all_combos()})
    for name in stale:
        print(f"⌫ STALE   {name} (조합 정의에 없음 — 파일 삭제 검토)")

    print(
        f"\n조합 {len(verdicts)}개 — 일치 {counts['ok']} · 회귀 {counts['fail']} · "
        f"경고 {counts['warn']} · 신규 {counts['new']} · 설정변경 {counts['config']}"
        + (f" · 잔여골든 {len(stale)}" if stale else "")
    )
    if counts["new"] or counts["config"]:
        print("신규/설정변경 조합은 `python tools/snapshot.py --update`로 골든을 기록하세요.")
    return 1 if counts["fail"] else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="woofia_sim 회귀 스냅샷 — 대표 조합의 시뮬 결과를 골든과 대조",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("-f", "--filter", dest="needle", metavar="SUBSTR",
                        help="이름에 이 문자열이 포함된 조합만")
    parser.add_argument("--update", action="store_true",
                        help="현재 결과를 골든으로 기록/갱신 (비교하지 않음)")
    parser.add_argument("--list", action="store_true", help="조합 목록만 출력")
    parser.add_argument("--tol", type=float, default=0.0, metavar="REL",
                        help="수치 비교 상대 허용 오차 (기본 0 = 완전 일치)")
    parser.add_argument("-v", "--verbose", action="store_true", help="일치한 조합도 출력")
    args = parser.parse_args(argv)

    if args.tol < 0:
        parser.error("--tol 은 0 이상이어야 합니다")

    try:
        if args.list:
            for combo in _select(all_combos(), args.needle):
                ids = "+".join(str(s.char_id) for s in combo.specs)
                print(f"  {combo.name:32} {combo.turns:>3}턴  {ids:<24} {combo.purpose}")
            return 0
        return run(args.needle, args.update, args.tol, args.verbose)
    except SnapshotError as exc:
        print(f"오류: {exc}")
        return 2
    except OSError as exc:                     # 골든 기록/읽기 중 디스크·권한 문제
        print(f"오류: 스냅샷 파일 접근 실패 ({exc})")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
