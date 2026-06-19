"""Run and pretty-print team-vs-dummy simulations for comparison.

A team is an ordered list of CharSpec (order = battle position, 1-based).
``run_team`` resolves kits, simulates, and returns per-character damage plus
totals; ``format_result`` renders a turn log and summary.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .effects import CD_MOD, TRIGGER
from .engine import BattleState, simulate
from .kit import ResolvedKit, resolve_kit
from .stats import Investment

# 기본 행동 우선순위: ①역할군 ②포지션.  역할군 순서(ERoleKind class):
#   버퍼(4)=1 → 방해(5)=2 → 힐러(3)=3 → 탱커(2)=4 → 딜러(1)=5
ROLE_RANK = {4: 1, 5: 2, 3: 3, 2: 4, 1: 5}
# 특이 캐릭터 역할순위 오버라이드 (사용자 지정)
SPECIAL_ROLE_RANK = {
    10421: 4.5,   # 파미도 = 딜러(5)와 탱커(4) 사이
    10401: 5.5,   # 아누비로스 = 방해지만 하이퍼캐리 → 딜러보다 늦게(팀 셋업 다 받고)
}


def default_priority(char_id: int, kind: int, position: int) -> float:
    """역할군 순위 + 포지션(소수점 tiebreak)로 행동 우선순위 계산."""
    rank = SPECIAL_ROLE_RANK.get(char_id, ROLE_RANK.get(kind, 9))
    return rank + position * 0.01


def default_rotation(cd: int) -> str:
    """필살기 cd 기반 표준 로테이션 (게이지 0 시작).

    게이지는 매턴 +1, cd만큼 차면 궁 사용. 첫 궁은 cd턴 충전 뒤(T{cd+1}),
    이후 cd턴마다 반복. 즉 선행은 평×cd + 궁, 반복은 평×(cd-1) + 궁.
    cd3 -> 평평평궁|평평궁, cd2 -> 평평궁|평궁, cd1 -> 평궁|궁.
    """
    cd = max(cd, 1)
    return "평" * cd + "궁" + "|" + "평" * (cd - 1) + "궁"


def _turn1_cd_delta(kit: ResolvedKit) -> int:
    """필살 cd를 줄이는 1턴차 패시브(on_turn 1 -> CD_MOD)의 합. 음수면 단축."""
    total = 0
    for psv in kit.passives:
        for eff in psv.effects:
            if eff.kind == TRIGGER and eff.condition == "on_turn" and eff.trigger_param == 1:
                for s in eff.sub_effects:
                    if s.kind == CD_MOD:
                        total += int(s.magnitude)
    return total


def auto_rotation(kit: ResolvedKit) -> str:
    """kit 기반 표준 로테이션. 1턴차 CD 감소 패시브(예: 멍)를 반영해 첫 궁을
    T1로 당김. 멍(cd3, -3) -> 궁평평궁|평평궁, 리카노(cd3) -> 평평평궁|평평궁."""
    from .engine import _self_extra_actions
    if _self_extra_actions(kit) > 0:          # 이태호(매턴 2회, 테세 전환): 첫 행동만 궁, 나머지 평타
        return "궁|평"
    cd = max(kit.fatal.cd, 1)
    loop = "평" * (cd - 1) + "궁"
    if cd + _turn1_cd_delta(kit) <= 0:        # 필살이 1턴에 준비됨
        return "궁" + loop + "|" + loop
    return "평" * cd + "궁" + "|" + loop


@dataclass
class CharSpec:
    char_id: int
    level: int = 60       # 최대 레벨
    evo: int = 5          # 별 (5성 풀돌)
    compat: int = 5       # 육성도 만렙 (+20%)
    skill_level: int = 10
    rune: bool = True     # 도장 해제 (ultimate -> sigil 룬필살기)
    rotation: str | None = None  # 행동 지정 '평평방궁|평방궁' (None=기본정책)
    position: int | None = None  # 전열 위치 1~5 (None=리스트 순서). 더미는 최소 position 타격
    priority: int | None = None  # 행동 순서 (None=position). 낮을수록 먼저 행동
    atk_bonus: int = 0           # 도장 강화: 기본 ATK 가산
    hp_bonus: int = 0            # 도장 강화: 기본 HP 가산

    def investment(self) -> Investment:
        return Investment(level=self.level, evo=self.evo, compat=self.compat)


@dataclass
class TeamResult:
    state: BattleState
    names: list[str]
    per_char_damage: dict[str, float] = field(default_factory=dict)
    total_damage: float = 0.0
    turns: int = 0

    @property
    def dps(self) -> float:
        return self.total_damage / self.turns if self.turns else 0.0


def run_team(specs: list[CharSpec], n_dummies: int = 1, max_turn: int = 10,
             seed: int = 0, enemy_hits: int = 0, turn_orders: dict | None = None,
             force_proc: bool = False) -> TeamResult:
    """Resolve the team (list order = position 1..N) and simulate."""
    specs = specs[:5]
    kits = [resolve_kit(s.char_id, s.investment(), s.skill_level, s.rune) for s in specs]
    for kit, s in zip(kits, specs):          # 도장 강화: 기본 ATK/HP 가산
        kit.atk += int(s.atk_bonus)
        kit.hp += int(s.hp_bonus)
    # 위치(slot): 지정 시 position-1, 아니면 리스트 순서
    slots = [(s.position - 1) if s.position else i for i, s in enumerate(specs)]
    # 우선순위: 지정 시 그 값, 아니면 역할군+포지션 기본값
    priorities = [
        s.priority if s.priority is not None
        else default_priority(s.char_id, kit.kind, slot + 1)
        for s, kit, slot in zip(specs, kits, slots)
    ]
    # rotation: 지정 시 그대로, 아니면 kit 기반 자동(1턴차 CD감소 패시브 반영)
    rotations = [s.rotation if s.rotation is not None else auto_rotation(kit)
                 for s, kit in zip(specs, kits)]
    state = simulate(kits, n_dummies=n_dummies, max_turn=max_turn, seed=seed,
                     rotations=rotations, slots=slots, priorities=priorities,
                     enemy_hits=enemy_hits, turn_orders=turn_orders, force_proc=force_proc)
    names = [u.name for u in state.allies]
    per_char = {u.name: u.damage_dealt for u in state.allies}
    total = sum(per_char.values())
    return TeamResult(state=state, names=names, per_char_damage=per_char,
                      total_damage=total, turns=max_turn)


def format_result(result: TeamResult, specs: list[CharSpec]) -> str:
    lines: list[str] = []
    lines.append("=" * 64)
    lines.append("팀 구성 (포지션 순):")
    for i, (u, s) in enumerate(zip(result.state.allies, specs), 1):
        rune = " 도장ON" if s.rune else ""
        lines.append(f"  P{i} {u.name}: ATK {u.base_atk} HP {u.max_hp} "
                     f"(Lv{s.level} 별{s.evo} 육성도{s.compat} 스킬{s.skill_level}{rune})")
    lines.append("=" * 64)
    lines.append(f"전투 로그 ({result.turns}턴, 타겟더미):")
    cur = 0
    for ev in result.state.log:
        if ev.turn != cur:
            cur = ev.turn
            lines.append(f"-- T{cur} --")
        amt = f"  [{ev.amount:,.0f}]" if ev.amount else ""
        lines.append(f"   {ev.actor}: {ev.text}{amt}")
    lines.append("=" * 64)
    lines.append("캐릭터별 데미지:")
    for name, dmg in sorted(result.per_char_damage.items(),
                            key=lambda kv: -kv[1]):
        share = dmg / result.total_damage * 100 if result.total_damage else 0
        lines.append(f"  {name}: {dmg:,.0f} ({share:.1f}%)")
    lines.append(f"총 데미지: {result.total_damage:,.0f}  |  "
                 f"DPS/turn: {result.dps:,.0f}")
    if result.state.unapplied:
        lines.append("-" * 64)
        lines.append("미적용/미모델링 (이 전투에서 적용 안 된 효과):")
        from collections import Counter
        cats: Counter = Counter()
        for k, v in result.state.unapplied.items():
            cats[k.split(":")[0] if k.startswith("미파싱") else k] += v
        for k, v in cats.most_common():
            lines.append(f"  {v:>4}  {k}")
    return "\n".join(lines)
