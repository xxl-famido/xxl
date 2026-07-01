"""Minimal deterministic turn-based combat engine (target-dummy mode).

Implements the core damage path:
  - fixed alternating turns: ally phase (slot order) then enemy phase, up to a
    turn cap (<= 30, the in-game max).
  - action selection: fatal when its cooldown is ready, else basic attack.
  - damage = ATK_eff x skill% x (1 + dmg_dealt%) x (1 + target dmg_taken%).
  - buffs/debuffs with durations and named stacks; on-attack/basic/ex triggers
    and stack-gated triggers fire registered sub-effects.

Buff combination rule (flagged for validation): ATK% and base-ATK% buffs are
summed (additive) on top of base ATK; dmg-dealt% and dmg-taken% are separate
multiplicative channels. Confirm against one observed in-game hit (see plan).
"""
from __future__ import annotations

import random
from collections import Counter
from dataclasses import dataclass, field

from .effects import (
    BARRIER, BUFF, CC, CD_MOD, COND_DMG, DAMAGE, DEBUFF, EXTRA_ACTION, HEAL,
    MARKER, ENTER_DEFENSE, STACK, TRANSFORM, TRIGGER, STAT_ATK, STAT_BASE_ATK, STAT_ATK_FLAT,
    STAT_MAX_HP, STAT_BASE_MAX_HP,
    STAT_DMG_DEALT, STAT_DMG_TAKEN, STAT_DOT_TAKEN, STAT_DOT_DEALT,
    STAT_BASIC_DMG_DEALT, STAT_EX_EFFECT,
    STAT_TRIGGERED_EFFECT, STAT_HEAL_RECV, STAT_BAR_RECV, Effect,
)
from .kit import ResolvedKit
from .names import kr, stat_kr

# action-specific outgoing-effect channel for each action type
_ACTION_EFF = {
    "basic": STAT_BASIC_DMG_DEALT,
    "ex": STAT_EX_EFFECT,
    "trigger": STAT_TRIGGERED_EFFECT,
}

# rotation token -> action; 평/공 = basic, 궁 = fatal, 방 = defend
_TOKEN_ACTION = {
    "평": "basic", "공": "basic", "b": "basic", "B": "basic",
    "궁": "fatal", "f": "fatal", "F": "fatal",
    "방": "defend", "d": "defend", "D": "defend",
}


def parse_rotation(spec: str) -> tuple[list[str], list[str]]:
    """Parse a rotation like '평평방궁|평방궁' -> (prefix actions, loop actions).

    Tokens before '|' run once; tokens after '|' repeat. With no '|', the whole
    sequence is the prefix and its last action repeats once exhausted.
    """
    def toks(part: str) -> list[str]:
        return [_TOKEN_ACTION[c] for c in part.strip() if c in _TOKEN_ACTION]
    if "|" in spec:
        head, tail = spec.split("|", 1)
        return toks(head), toks(tail)
    return toks(spec), []


# Rule (user-confirmed): any "trigger:" damage is a triggered skill (발동) and
# gets triggerEff (발동효과), regardless of which event fired it. The one
# exception is 이태호's 내기혼신 (Qi Surge: Tiger) extra hit on basic attack,
# which is judged as a basic attack (평타뎀, not 발동효과).
BASIC_JUDGED_STACKS = {"Qi Surge: Tiger"}


def _half_turns(duration: int) -> int:
    """Convert a skill 'N turn' duration to half-turns (ally + enemy phases).

    A buff ticks once per phase, so 'N turns' = 2N half-turns from creation;
    the creating phase (ally vs enemy) sets the asymmetric expiry naturally.
    """
    return duration * 2 if duration > 0 else duration


@dataclass
class Buff:
    stat: str
    value: float
    turns: int          # remaining half-turns; -1 = permanent
    src: str = ""       # action label that applied it (basic/fatal/trigger/passive)
    key: int = 0        # effect-object id — same skill line refreshes; different lines coexist
    element: int = 0    # element-specific dmg-taken: only matching-element hits get it (0 = any)
    owner: int = 0      # source char id (for the buff-source drill-down)
    src_skill: str = "" # source KR skill name


@dataclass
class Subscription:
    event: str
    effects: list[Effect]
    chance: float = 100.0
    gate_stack: str | None = None
    gate_count: int = 0
    param: int = 0          # every_turn period / on_turn turn number
    pos: int = 0            # required position (1-based) for position_periodic
    grantor: "Unit | None" = None   # who granted this sub (for buddy-granted triggers)
    target_gate_stack: str | None = None   # require the attack target to hold this stack
    target_gate_count: int = 0
    repeat_stack: str | None = None        # fire N times = enemies' total stacks of this
    need_team_barrier: bool = False        # only fire while ALL allies hold a barrier (오렘)
    need_self_barrier: bool = False        # only fire while THIS unit holds a barrier (오렘 충격역류 부여분)
    once: bool = False                     # "1회만 적용" — fires once per arm (모이루 보호막)
    armed: bool = True                     # once-sub: True until it fires; re-armed on re-grant
    consume_gate: bool = False             # 게이트를 행동시작 스냅샷(act_snap)으로 판정 (소모 트리거)


# site class/element name -> game id (ERoleKind / EProp)
# 전사 fighter=Atk / 수호 tank=Def / 치료 healer=Heal / 보조 support=Buff / 방해 vandal=Debuff
CLASS_ID = {"fighter": 1, "tank": 2, "healer": 3, "support": 4, "vandal": 5}
ELEMENT_ID = {"fire": 1, "water": 2, "wood": 3, "light": 4, "dark": 5}
_ELNAME = {1: "불", 2: "물", 3: "나무", 4: "빛", 5: "어둠"}


@dataclass
class Unit:
    name: str
    side: str                       # "ally" | "enemy"
    slot: int                       # battle position (0-4): dummy targets front, position passives
    base_atk: int
    max_hp: int
    hp: int
    is_dummy: bool = False
    priority: int = 0               # action order among allies (lower = acts first)
    kind: int = 0                   # ERoleKind (1 Atk/Fighter .. 5 Debuff/Vandal)
    element: int = 0                # EProp (1 Fire 2 Water 3 Wood 4 Light 5 Dark)
    fatal_cd: int = 0               # cooldown length of the fatal
    cd_remaining: int = 0           # turns until fatal is ready (0 = ready)
    extra_actions: int = 0          # pending extra actions this turn
    extra_granted: bool = False     # "gain action (once per turn)" already used
    base_actions: int = 1           # rotation-driven actions per turn (이태호 = 2)
    extra_basic: bool = False       # 이태호: actions beyond base_actions = 평타(기본) 또는 fed_action 지정
    fed_action: str = "평"          # 이태호 전용: 임부언 fed 추가행동 토큰(평/궁/방). 기본 평타=종전 동작(단일값 폴백)
    fed_schedule: dict = field(default_factory=dict)  # 이태호: 턴별 fed 토큰 {turn: 평/궁/방} — 임부언 궁 턴마다 개별 지정
    turn_acts: int = 0              # actions taken this turn (reset each turn)
    auto_fatal_pending: bool = False  # 지정 궁이 쿨 미충족으로 불발 → 쿨 차는 대로 자동 발동 예약
    hold_fatal_stacks: set = field(default_factory=set)  # skip fatal while holding these
    feeds_position: int = 0          # fatal grants an extra action to this position's ally
    is_fed_carry: bool = False       # a feeder resets my CD -> fatal on every CD-ready action
    target_cond_dmg: list = field(default_factory=list)  # [(stack, +dmg%)] if target holds stack
    rotation_prefix: list = field(default_factory=list)  # explicit action sequence
    rotation_loop: list = field(default_factory=list)
    action_idx: int = 0
    buffs: list[Buff] = field(default_factory=list)
    stacks: dict[str, int] = field(default_factory=dict)
    stack_turns: dict[str, int] = field(default_factory=dict)  # remaining half-turns; -1 = permanent
    gate_snap: dict | None = None   # stacks snapshot at action start (target-gate사 pre-action state)
    act_snap: dict | None = None    # actor's OWN stacks snapshot at action start (consume-gate용)
    barrier_snap: float | None = None  # 행동 시작 시 배리어 합 스냅샷 — 자기공격 배리어게이트가 "행동 전" 상태로 판정
                                       #  (평타가 부여한 배리어로 그 평타의 "배리어 보유 시" 추가타를 만족시키지 않게)
    subs: list[Subscription] = field(default_factory=list)
    damage_dealt: float = 0.0       # running total this battle
    healing_done: float = 0.0       # total heal output (incl. overheal; for comparison)
    barrier_done: float = 0.0       # total barrier granted
    barriers: list = field(default_factory=list)  # [[amount, half_turns, source], ...] 개별 만료(버프처럼 각자 수명). 합산=barrier 프로퍼티
    defending: bool = False  # 이번 턴 방어 상태(방어 액션 또는 다라완 필살 Enter Defense) → 받는 데미지 50% 감소
    barrier_pre_hit: float | None = None  # 직전 피격 '전' 배리어 합 (배리어 소모 표시용). None=이번 피격에 소모 없음
    barrier_absorbed: float = 0.0         # 직전 피격에서 배리어가 흡수한 양
    taunt_turns: int = 0            # 조롱: >0이면 적이 이 아군을 강제 타격 (쿠모야마)
    taunt_since: int = 0            # 조롱 획득 시점(state.cur_action 스냅) — 다수 조롱 시 먼저 건 캐릭터에 어그로 집중
    hots: list = field(default_factory=list)  # [target, per_turn, turns_left, calc] heal-over-time
    dots: list = field(default_factory=list)  # [target, pct, turns_left, owner, src_skill, cast_snapshot] 지속딜(DoT)
    cond_buffs: list = field(default_factory=list)  # (stack,stat,value,owner,skill,scaled,thresh) while stacks≥thresh
    stack_caps: dict = field(default_factory=dict)  # stack_name -> max count (from its definition line)
    stack_dur: dict = field(default_factory=dict)   # stack_name -> 고유 수명(턴). 한 번이라도 duration>0로 정의되면 타이머 스택
    ran_p4_src: object = None        # 란(10426) P4 시너지: 이 동료가 공격하면 되먹일 란 유닛
    ran_p4_turns: int = 0            # 그 피드백 창의 남은 half-turns

    @property
    def alive(self) -> bool:
        return self.hp > 0

    def _cond_val(self, val: float, n: int, scaled: bool) -> float:
        return val * n if scaled else val      # scaled = value per stack (열화질보 평타뎀+10%×N)

    @property
    def barrier(self) -> float:
        """현재 유효 배리어 = 만료되지 않은 모든 인스턴스 합. (개별 [amount, half_turns, source])"""
        return sum(b[0] for b in self.barriers if b[0] > 0)

    def absorb_damage(self, dmg: float) -> tuple[float, float]:
        """피격 데미지 흡수: 배리어(오래된 인스턴스부터) 먼저 소모 → 남은 건 HP.
        전투불능 방지 — HP는 1 미만으로 내려가지 않음. 반환 (배리어흡수량, HP감소량)."""
        remaining, absorbed = dmg, 0.0
        for b in self.barriers:
            if remaining <= 0:
                break
            if b[0] <= 0:
                continue
            a = min(b[0], remaining)
            b[0] -= a; remaining -= a; absorbed += a
        self.barriers = [b for b in self.barriers if b[0] > 0]
        to_hp = 0.0
        if remaining > 0:
            to_hp = min(remaining, max(0.0, self.hp - 1))   # 체력 1 이하로 안 내려감
            self.hp -= to_hp
        return absorbed, to_hp

    def _sum(self, stat: str) -> float:
        total = sum(b.value for b in self.buffs if b.stat == stat)
        # conditional self-buffs active only while their required stack count ≥ threshold
        for req, st, val, owner, skill, scaled, thresh in self.cond_buffs:
            n = self.stacks.get(req, 0)
            if st == stat and n >= thresh:
                total += self._cond_val(val, n, scaled)
        return total

    def _comp(self, stat: str, element: int = 0) -> list:
        """Components of a stat for the damage breakdown: [{v, by(charId), skill}]."""
        out = []
        for b in self.buffs:
            if b.stat == stat and (b.element == 0 or b.element == element):
                out.append({"v": round(b.value, 2), "by": b.owner, "skill": b.src_skill,
                            "el": _ELNAME.get(b.element, "") if b.element else ""})
        for req, st, val, owner, skill, scaled, thresh in self.cond_buffs:
            n = self.stacks.get(req, 0)
            if st == stat and n >= thresh:
                out.append({"v": round(self._cond_val(val, n, scaled), 2), "by": owner,
                            "skill": skill, "cond": kr(req)})
        return out

    def max_hp_eff(self) -> float:
        """유효 최대 HP = base × (1 + Σ 기초MaxHP%) × (1 + Σ MaxHP%). ATK 공식 미러.
        데미지 시뮬은 HP버프를 대개 무시하지만, 배리어/힐이 MaxHP% 기준일 때(다라완 파4·오렘)
        HP버프가 배리어 크기=딜에 영향 → 여기서만 반영."""
        return self.max_hp * (1 + self._sum(STAT_BASE_MAX_HP) / 100) * (1 + self._sum(STAT_MAX_HP) / 100)

    def base_atk_eff(self) -> float:
        """기초 ATK = base × (1 + Sum base-ATK%).  Only base-ATK% buffs count;
        regular ATK% buffs do NOT. Used by "ATK +X% of own base ATK" buffs."""
        return self.base_atk * (1 + self._sum(STAT_BASE_ATK) / 100)

    def atk_eff(self) -> float:
        """Aggregated ATK (confirmed in-game rule).

        base-ATK% and ATK% are distinct channels that multiply; flat ATK adds
        last::

            ATK = base x (1 + Sum base-ATK%) x (1 + Sum ATK%) + Sum flat
        """
        atk_rate = self._sum(STAT_ATK) / 100
        flat = self._sum(STAT_ATK_FLAT)
        return self.base_atk_eff() * (1 + atk_rate) + flat

    def outgoing_mult(self, action: str, target: "Unit | None" = None) -> float:
        """Attacker-side multiplier: damage-dealt% x action-effect% (separate channels).

        Includes conditional damage-dealt% that applies only while the attack
        target holds a required status (e.g. Command Callout / 전술 호령).
        """
        dd = self._sum(STAT_DMG_DEALT)
        for entry in self.target_cond_dmg:
            if _tcd_active(entry, target):
                dd += entry[1]
        m = 1 + dd / 100
        eff_channel = _ACTION_EFF.get(action)
        if eff_channel:
            m *= 1 + self._sum(eff_channel) / 100
        return m

    def incoming_mult(self, attacker_element: int = 0) -> float:
        """Target-side multiplier from damage-taken% debuffs. 게임은 일반 받뎀증
        (GetDamagedBonusRate)과 속성 받뎀증(GetPropertyDamageRate·propertyBeDamagedEffect)을
        별개 채널로 두고 곱한다(곱연산). 속성 받뎀증은 공격자 속성이 맞을 때만 적용."""
        generic = sum(b.value for b in self.buffs if b.stat == STAT_DMG_TAKEN and b.element == 0)
        prop = sum(b.value for b in self.buffs if b.stat == STAT_DMG_TAKEN
                   and b.element != 0 and b.element == attacker_element)
        return max(0.0, (1 + generic / 100) * (1 + prop / 100))

    def support_mult(self, action: str) -> float:
        """Heal/barrier scale with the action-effect channel only (평타뎀/EX효과/
        발동효과) — healers receive 보통공격뎀증·필살기효과 on their heal/barrier.
        Damage-dealt% (주는딜) is damage-specific and does NOT apply."""
        eff_channel = _ACTION_EFF.get(action)
        return 1 + self._sum(eff_channel) / 100 if eff_channel else 1.0

    def support_detail(self, action: str) -> str:
        eff_stat = _ACTION_EFF.get(action, "")
        eff = self._sum(eff_stat) if eff_stat else 0
        if eff:
            label = {"basic": "평타뎀", "ex": "EX효과", "trigger": "발동효과"}.get(action, "효과")
            return f"{label}+{eff:.0f}%"
        return "버프없음"

    def outgoing_detail(self, action: str, target: "Unit | None") -> str:
        """Human-readable breakdown of the outgoing-damage channels."""
        parts = []
        dd = self._sum(STAT_DMG_DEALT)
        if dd:
            parts.append(f"주는딜+{dd:.0f}%")
        for entry in self.target_cond_dmg:
            if _tcd_active(entry, target):
                stack = entry[0]
                label = kr(stack) if stack else (f"HP<{entry[5]:g}%" if entry[4] == "lt" else f"HP≥{entry[5]:g}%")
                parts.append(f"{label}+{entry[1]:.0f}%")
        eff_stat = _ACTION_EFF.get(action, "")
        eff = self._sum(eff_stat) if eff_stat else 0
        if eff:
            label = {"basic": "평타뎀", "ex": "EX효과", "trigger": "발동효과"}.get(action, "효과")
            parts.append(f"{label}+{eff:.0f}%")
        return ", ".join(parts) if parts else "버프없음"


@dataclass
class LogEvent:
    turn: int
    actor: str
    text: str
    amount: float = 0.0
    action_id: int = 0       # groups events from one _take_action call
    actor_id: int = 0        # source char id (for the icon)
    detail: dict | None = None   # structured damage breakdown (for the drill-down)
    src_id: int = 0          # the skill-owner char id (for buff/stack source click)
    src_skill: str = ""      # the source KR skill name
    action_kind: str = ""    # 행동 종류: 필살기 / 보통공격 / 방어 / 패시브 / 피격 (그룹 라벨)
    atk_by: str = ""         # 피격 그룹: 공격한 적(더미) 이름


@dataclass
class BattleState:
    allies: list[Unit]
    enemies: list[Unit]
    turn: int = 0
    max_turn: int = 30
    log: list[LogEvent] = field(default_factory=list)
    rng: random.Random = field(default_factory=lambda: random.Random(0))
    unapplied: Counter = field(default_factory=Counter)   # parsed-but-not-applied effects
    enemy_hits: int = 0          # allies the enemy hits per turn (0 = all, by slot order)
    enemy_aoe: bool = False       # 전체공격: 적이 아군 전체를 1회 동시 피격 (조롱 무관, 반격 아군당 1회)
    turn_orders: dict = field(default_factory=dict)   # {turn:[slot,...]} per-turn action-order override
    cur_action: int = 0          # incremented per _take_action; stamped on each event
    cur_actor_id: int = 0
    cur_action_kind: str = ""    # 필살기 / 보통공격 / 방어 / 패시브 / 피격 — 현재 행동 종류
    cur_atk_by: str = ""         # 피격 그룹: 현재 공격 중인 적(더미) 이름
    force_proc: bool = False      # 확률 100% 모드: 모든 확률 판정을 무조건 성공으로
    hp_schedule: bool = False     # 카라트 등 HP게이트 캐릭 동반 시 더미 HP% 4등분 스케줄
    hp10: bool = False            # 체력 10% 모드: 더미 HP를 매 턴 10%로 고정 (저HP 게이트 전부 발동)
    incoming_hp_pct: int = 0      # >0이면 더미가 아군 피격 시 아군 최대HP의 n% 데미지(배리어 흡수, HP 1하한)
    dummy_element: int = 0        # 더미 속성 (EProp: 0무·1불·2물·3나무·4빛·5어둠) — 상성 배율용
    turn_basics: set = field(default_factory=set)   # 이번 턴 평타한 아군 char_id (다양수이 협동)
    turn_exes: set = field(default_factory=set)     # 이번 턴 필살 쓴 아군 char_id
    coord_fired: set = field(default_factory=set)   # 이번 턴 이미 발동한 협동 트리거 id

    def team(self, unit: Unit) -> list[Unit]:
        return self.allies if unit.side == "ally" else self.enemies

    def foes(self, unit: Unit) -> list[Unit]:
        return self.enemies if unit.side == "ally" else self.allies

    def record(self, actor: str, text: str, amount: float = 0.0, detail: dict | None = None,
               src_id: int = 0, src_skill: str = "") -> None:
        self.log.append(LogEvent(self.turn, actor, text, amount, self.cur_action,
                                 self.cur_actor_id, detail, src_id, src_skill,
                                 self.cur_action_kind, self.cur_atk_by))


def _self_extra_actions(kit: ResolvedKit) -> int:
    """Count self 'gain N action (once per turn)' grants (이태호 = 1 -> 2 actions/turn)."""
    total = 0

    def walk(effs):
        nonlocal total
        for e in effs:
            if e.kind == EXTRA_ACTION and e.target == "self" and "once per turn" in (e.raw or "").lower():
                total += int(e.magnitude)
            walk(e.sub_effects)
    for sl in [kit.basic, kit.fatal, *kit.passives]:
        walk(sl.effects)
    return min(total, 3)


def make_unit_from_kit(kit: ResolvedKit, slot: int, priority: int | None = None) -> Unit:
    self_extra = _self_extra_actions(kit)   # 이태호: 1 -> base 2 actions, extras forced 평타
    return Unit(
        name=kit.name, side="ally", slot=slot, priority=slot if priority is None else priority,
        base_atk=kit.atk, max_hp=kit.hp, hp=kit.hp,
        kind=kit.kind, element=kit.element,
        # ultimate gauge starts empty: fatal must charge fatal_cd turns first
        fatal_cd=kit.fatal.cd, cd_remaining=kit.fatal.cd,
        base_actions=1 + self_extra, extra_basic=self_extra > 0,
    )


def _kit_has_hp_gate(kit) -> bool:
    """True if any of this kit's effects gate on the target's HP% (카라트)."""
    def walk(effs):
        for e in effs:
            if e.target_hp_op or (e.kind == COND_DMG and e.target_hp_op):
                return True
            if walk(e.sub_effects):
                return True
        return False
    return any(walk(sl.effects) for sl in [kit.basic, kit.fatal, *kit.passives])


def _hp_sched_pct(turn: int, max_turn: int) -> float:
    """카라트용 더미 HP% 스케줄: 전체 턴 4등분 — Q1 ≥75%(게이트0)·Q2 50~75%(1)·
    Q3 25~50%(2)·Q4 <25%(3+추가타). 각 구간 중앙값을 쓴다."""
    q = (turn - 1) / max(1, max_turn)
    if q < 0.25:
        return 0.875
    if q < 0.50:
        return 0.625
    if q < 0.75:
        return 0.375
    return 0.125


def make_dummy(slot: int, hp: int = 10**9) -> Unit:
    return Unit(name=f"더미{slot+1}", side="enemy", slot=slot,
                base_atk=0, max_hp=hp, hp=hp, is_dummy=True)


# ---- effect resolution --------------------------------------------------

def _resolve_targets(effect: Effect, caster: Unit, state: BattleState,
                     current_target: Unit | None, grantor: Unit | None = None) -> list[Unit]:
    t = effect.target
    if t == "self":
        return [caster]
    if t == "grantor":          # "X's base ATK ..." granted to a buddy -> buffs X
        return [grantor or caster]
    if t == "self_and_grantor":  # "to self and <grantor>" — 실행자 + 부여자 둘 다 (다라완 파2: 아군 방어→자신+다라완 배리어)
        return [caster] + ([grantor] if grantor and grantor is not caster else [])
    if t == "allies":
        return [u for u in state.team(caster) if u.alive]
    if t.startswith("allies_"):
        living = [u for u in state.team(caster) if u.alive]
        sub = t.split("_", 1)[1]
        if sub in CLASS_ID:
            return [u for u in living if u.kind == CLASS_ID[sub]]
        if sub in ELEMENT_ID:
            return [u for u in living if u.element == ELEMENT_ID[sub]]
        return living
    if t == "ally_lowest_hp":
        living = [u for u in state.team(caster) if u.alive]
        return [min(living, key=lambda u: u.hp / u.max_hp)] if living else []
    if t.startswith("position_"):    # ally at a specific battle position (1-based slot)
        slot = int(t.split("_", 1)[1]) - 1
        return [u for u in state.team(caster) if u.alive and u.slot == slot]
    if t == "all_enemies":
        return [u for u in state.foes(caster) if u.alive]
    if t == "target":
        # 리카노 조롱(적): 적이 조롱 보유 시 단일 타격은 그 적으로 딜집중
        taunted = next((u for u in state.foes(caster) if u.alive and u.taunt_turns > 0), None)
        if taunted:
            return [taunted]
        if current_target and current_target.alive:
            return [current_target]
        foes = [u for u in state.foes(caster) if u.alive]
        return [foes[0]] if foes else []
    if t == "positions":        # one hit per position; empty -> front enemy (random fallback)
        foes = sorted([u for u in state.foes(caster) if u.alive], key=lambda u: u.slot)
        if not foes:
            return []
        # 조롱(딜집중): 적이 조롱 보유 시 모든 포지션 타격이 그 적에 집중된다
        taunted = next((u for u in foes if u.taunt_turns > 0), None)
        if taunted:
            return [taunted] * len(effect.positions)
        out = []
        for p in effect.positions:
            at = next((u for u in foes if u.slot == p - 1), None)
            out.append(at if at else foes[0])
        return out
    return []


ROLE_KR = {1: "전사", 2: "수호", 3: "치유", 4: "보조", 5: "방해"}
_ROLE_WORD = {"fighter": "전사", "vandal": "방해", "support": "보조", "healer": "치유", "tank": "수호"}
_ELEM_WORD = {"fire": "불속성", "water": "물속성", "wood": "나무속성", "light": "빛속성", "dark": "어둠속성"}


def _who(targets: list, caster: Unit, state: "BattleState", effect: "Effect | None" = None) -> str:
    """Label a log line's recipients by the effect's TARGET FILTER when it has one
    (e.g. '아군 전사', '아군 방해', '아군 전체'), else a single name or count."""
    if not targets:
        return "—"
    tgt = effect.target if effect else ""
    if tgt == "self":
        return "자신"
    if tgt == "allies":
        return "아군 전체"
    if tgt.startswith("allies_"):
        suffix = tgt.split("_", 1)[1]
        word = _ROLE_WORD.get(suffix) or _ELEM_WORD.get(suffix)
        if word:
            return f"아군 {word}"
        if suffix == "lowest_hp":
            return "최저HP 아군"
    if len(targets) == 1:
        return "자신" if targets[0] is caster else targets[0].name
    if all(t.side == "enemy" for t in targets):
        return f"적 {len(targets)}명"
    living = [a for a in state.allies if a.alive]
    if all(t.side == "ally" for t in targets) and len(targets) >= len(living):
        return "아군 전체"
    roles: list[str] = []
    for t in targets:
        r = ROLE_KR.get(t.kind, "")
        if r and r not in roles:
            roles.append(r)
    return f"아군 {'·'.join(roles)}" if roles else f"아군 {len(targets)}명"


def _hp_ok(unit: "Unit | None", op: str, val: float) -> bool:
    """True if the unit's HP% satisfies the gate (op 'lt'/'ge', val %). No unit -> False."""
    if unit is None or unit.max_hp <= 0:
        return False
    pct = unit.hp / unit.max_hp * 100
    return pct < val if op == "lt" else pct >= val


def _target_has(unit: "Unit | None", name: str, count: int = 1) -> bool:
    """대상이 상태 `name`을 보유했는가. '조롱(Taunt)'은 stacks가 아니라 taunt_turns로
    추적되므로 특수 처리 (리카노 '조롱 보유 적 → 주는딜+18%' 등)."""
    if unit is None:
        return False
    if name == "Taunt":
        return unit.taunt_turns > 0
    return unit.stacks.get(name, 0) >= count


def _tcd_active(entry: tuple, target: "Unit | None") -> bool:
    """A conditional-주는딜 entry is live when its stack and/or target-HP gate hold."""
    stack, _bonus, _owner, _skill, hp_op, hp_val = entry
    if stack is not None and not _target_has(target, stack):
        return False
    if hp_op is not None and not _hp_ok(target, hp_op, hp_val):
        return False
    return True


def _atk_chan_fields(caster: "Unit") -> dict:
    """힐/베리어 ATK 분해용 — 데미지 hit과 동일한 ATK 채널(base × 기초ATK% × ATK% + 고정)."""
    return {"baseLabel": "ATK", "base": caster.base_atk,
            "baseAtk": caster._comp(STAT_BASE_ATK), "atk": caster._comp(STAT_ATK),
            "flat": caster._comp(STAT_ATK_FLAT), "baseTotal": round(caster.atk_eff(), 2)}


def _dot_cast_snapshot(caster: "Unit", tgt: "Unit") -> dict:
    """DoT 부여 시점에 시전자 측 데미지 구성요소를 고정 캡처한다 — 지속딜은 부여 당시
    스펙을 따르고 이후 시전자 ATK/버프 변화엔 영향받지 않는다(대상측 받뎀은 틱 시점 현재값)."""
    dealt = caster._comp(STAT_DMG_DEALT)
    for entry in caster.target_cond_dmg:
        if _tcd_active(entry, tgt):
            stk, bonus, owner, skill, hp_op, hp_val = entry
            cond_kr = kr(stk) if stk else (f"HP<{hp_val:g}%" if hp_op == "lt" else f"HP≥{hp_val:g}%")
            dealt.append({"v": bonus, "by": owner, "skill": skill, "cond": cond_kr})
    return {
        "atk": caster.atk_eff(), "out": caster.outgoing_mult("dot", tgt),
        "base": caster.base_atk, "baseAtk": caster._comp(STAT_BASE_ATK),
        "atkC": caster._comp(STAT_ATK), "flat": caster._comp(STAT_ATK_FLAT),
        "dealt": dealt, "dotDealt": caster._comp(STAT_DOT_DEALT),
        "detail": caster.outgoing_detail("dot", tgt),
    }


# 속성 상성 (인게임 검증: 어둠→빛 ×1.5 = +50%). 순환 불(1)→나무(3)→물(2)→불,
# 빛(4)↔어둠(5) 상호. 키=공격 속성, 값=그 속성이 우위를 점하는 피격 속성.
_ELEM_BEATS = {1: 3, 3: 2, 2: 1, 4: 5, 5: 4}


def _element_mult(atk_el: int, def_el: int) -> float:
    """속성 상성 최종 배수: 상성 ×1.5(+50%) / 역상성 ×0.75(-25%) / 무속성(0)·무관 ×1.0.
    데미지 식 맨 끝(주는딜·받뎀 다 곱한 뒤)에 곱한다(인게임 검증)."""
    if not atk_el or not def_el:
        return 1.0
    if _ELEM_BEATS.get(atk_el) == def_el:
        return 1.5
    if _ELEM_BEATS.get(def_el) == atk_el:
        return 0.75
    return 1.0


def _record_hit(caster: "Unit", tgt: "Unit", pct: float, action: str, act_kr: str,
                src_id: int, src_skill: str, state: "BattleState",
                snap: dict | None = None, base_override: float | None = None,
                base_label: str = "ATK", barrier_comp: list | None = None,
                barrier_pre: float | None = None, barrier_consumed: float = 0.0,
                ex_effect: bool = False) -> None:
    """Compute, apply and log one damage hit. Shared by direct DAMAGE and DoT ticks.
    snap(있으면, DoT): 시전자 측(ATK·주는딜·지속딜증가)을 부여 시점 값으로 고정.
    base_override: ATK 대신 다른 기준값으로 딜(다라완 = 현재 배리어). ATK 채널은 미적용."""
    if snap is not None:                      # DoT: 시전 시점 스냅샷 사용 (시전자 측 고정)
        atk, out = snap["atk"], snap["out"]
        dealt, dot_dealt = list(snap["dealt"]), snap["dotDealt"]
        base, baseAtk, atkC, flat = snap["base"], snap["baseAtk"], snap["atkC"], snap["flat"]
        detail, eff = snap["detail"], []
    elif base_override is not None:           # 배리어 등 비-ATK 기준: ATK 채널(기초ATK%/ATK%/고정) 미적용
        atk = base_override
        out = caster.outgoing_mult(action, tgt)     # 주는딜·발동효과·조롱 대상조건 주는딜 모두 여전히 적용
        dealt = caster._comp(STAT_DMG_DEALT)
        for entry in caster.target_cond_dmg:        # 대상조건 주는딜(리카노 조롱 +18% 등) — out엔 이미 반영, 분해표시에도 추가
            if _tcd_active(entry, tgt):
                stk, bonus, owner, skill, hp_op, hp_val = entry
                cond_kr = kr(stk) if stk else (f"HP<{hp_val:g}%" if hp_op == "lt" else f"HP≥{hp_val:g}%")
                dealt.append({"v": bonus, "by": owner, "skill": skill, "cond": cond_kr})
        dot_dealt = []
        base, baseAtk, atkC, flat = round(base_override, 2), [], [], []
        eff_stat = _ACTION_EFF.get(action, "")
        eff = caster._comp(eff_stat) if eff_stat else []
        detail = caster.outgoing_detail(action, tgt)
    else:
        atk = caster.atk_eff()
        out = caster.outgoing_mult(action, tgt)
        dealt = caster._comp(STAT_DMG_DEALT)
        for entry in caster.target_cond_dmg:
            if _tcd_active(entry, tgt):
                stk, bonus, owner, skill, hp_op, hp_val = entry
                cond_kr = kr(stk) if stk else (f"HP<{hp_val:g}%" if hp_op == "lt" else f"HP≥{hp_val:g}%")
                dealt.append({"v": bonus, "by": owner, "skill": skill, "cond": cond_kr})
        dot_dealt = caster._comp(STAT_DOT_DEALT) if action == "dot" else []
        base, baseAtk = caster.base_atk, caster._comp(STAT_BASE_ATK)
        atkC, flat = caster._comp(STAT_ATK), caster._comp(STAT_ATK_FLAT)
        eff_stat = _ACTION_EFF.get(action, "")
        eff = caster._comp(eff_stat) if eff_stat else []
        detail = caster.outgoing_detail(action, tgt)
    # '필살기 효과'(리카노 등 아군 필살기효과 증가)를 받는 발동딜에만 ex_effect=True.
    # ※ 다라완 배리어 반격은 이 효과를 받지 않음(사용자 실측 확인) → 호출부에서 ex_effect=False.
    ex_eff = caster._comp(STAT_EX_EFFECT) if ex_effect else []
    if ex_eff:
        out *= 1 + sum(c["v"] for c in ex_eff) / 100
    inc = tgt.incoming_mult(caster.element)
    # 지속(도트) 받는증가는 대상측이라 틱 시점 현재값 (모이루 받는지속딜 +50% 후속 적용 반영)
    dot_taken = ([{"v": round(b.value, 2), "by": b.owner, "skill": b.src_skill}
                  for b in tgt.buffs if b.stat == STAT_DOT_TAKEN] if action == "dot" else [])
    dot_mult = ((1 + sum(c["v"] for c in dot_dealt) / 100) *
                (1 + sum(c["v"] for c in dot_taken) / 100))
    elem = _element_mult(caster.element, tgt.element)   # 속성 상성 (상성×1.5/역상성×0.75/무·무관×1.0)
    dmg = round(atk * pct / 100 * out * inc * dot_mult * elem, 2)
    tgt.hp -= dmg
    caster.damage_dealt += dmg
    # 받뎀증은 별개 곱연산 채널 2개: 일반(element 0) / 속성(공격자 속성과 일치)
    taken_g = [{"v": round(b.value, 2), "by": b.owner, "skill": b.src_skill}
               for b in tgt.buffs if b.stat == STAT_DMG_TAKEN and b.element == 0]
    taken_p = [{"v": round(b.value, 2), "by": b.owner, "skill": b.src_skill,
                "el": _ELNAME.get(b.element, "")}
               for b in tgt.buffs if b.stat == STAT_DMG_TAKEN
               and b.element != 0 and b.element == caster.element]
    struct = {
        "act": act_kr, "target": tgt.name, "final": dmg,
        "base": base, "atkTotal": round(atk, 2), "baseLabel": base_label,
        "barrierComp": barrier_comp,
        "barrierPre": round(barrier_pre, 2) if barrier_pre is not None else None,
        "barrierConsumed": round(barrier_consumed, 2),
        "baseAtk": baseAtk, "atk": atkC, "flat": flat,
        "skillPct": pct, "skillId": src_id, "skillName": src_skill,
        "dealt": dealt,
        "effLabel": {"basic": "평타뎀", "ex": "EX효과", "trigger": "발동효과", "dot": "지속딜"}.get(action, ""),
        "eff": eff, "effEx": ex_eff,
        "takenG": taken_g, "takenP": taken_p,
        "dotDealt": dot_dealt, "dotTaken": dot_taken,
        "elemMult": elem,
    }
    state.record(caster.name,
                 f"{act_kr} → {tgt.name} {dmg:,.2f} = "
                 f"{atk:,.2f}{base_label} × {pct:g}% × {out:.4f}[{detail}] × {inc:.4f}in"
                 + (f" × {elem:g}[{'상성' if elem > 1 else '역상성'}]" if elem != 1.0 else ""),
                 amount=dmg, detail=struct)


def apply_effect(effect: Effect, caster: Unit, state: BattleState,
                 current_target: Unit | None, source: str,
                 grantor: Unit | None = None) -> None:
    kind = effect.kind
    if kind == MARKER:
        return
    if kind == ENTER_DEFENSE:            # 다라완 필살: 방어 상태 전환 → 이번 턴 받는 데미지 50% 감소
        caster.defending = True          # (일반 방어와 달리 on_defend 트리거는 발동하지 않음 — 설명 명시)
        state.record(caster.name, "방어 상태 전환 (받는 데미지 50%↓)", amount=0)
        return
    if kind == "UNPARSED":
        state.unapplied[f"미파싱: {effect.raw[:60]}"] += 1
        return
    # 카라트 HP 게이트: 대상 HP%가 임계를 못 넘으면 이 효과(추가타·표지 빌드 등)는 발동 안 함.
    # COND_DMG는 게이트를 저장만 하고 데미지 시점에 평가하므로 여기서 막지 않는다.
    if effect.target_hp_op and kind != COND_DMG \
            and not _hp_ok(current_target, effect.target_hp_op, effect.target_hp_val):
        return

    if kind == TRIGGER:
        cond = effect.condition
        if cond == "on_battle_start":
            for sub in effect.sub_effects:
                apply_effect(sub, caster, state, current_target, source, grantor)
        elif cond == "grant_allies":
            # buddies GAIN the sub-trigger; it buffs the grantor (caster) when it fires.
            # 직접 효과(스택/버프)를 아군 전체에 즉시 부여하는 경우(이태호 오봉만상 등)는
            # 아군 수만큼 "자신 X" 로그가 반복되므로, 첫 아군 로그를 "아군 전체"로 합치고
            # 나머지 아군은 동일 효과라 로그를 생략한다(트리거 설치는 로그가 없어 무영향).
            exclude_self = "Except self" in (effect.raw or "")
            recipients = [a for a in state.team(caster)
                          if not (exclude_self and a is caster)]
            for idx, ally in enumerate(recipients):
                before = len(state.log)
                for sub in effect.sub_effects:
                    apply_effect(sub, ally, state, current_target, source, grantor=caster)
                if idx == 0:
                    for ev in state.log[before:]:
                        ev.text = ev.text.replace("자신", "아군 전체", 1)
                else:
                    del state.log[before:]
        elif cond and cond.startswith("enemy_gate:"):
            # enemy-count gate (vs the current dummy count): apply inner only if met
            _, op, n = cond.split(":")
            alive = len([e for e in state.foes(caster) if e.alive])
            if {"ge": alive >= int(n), "le": alive <= int(n), "eq": alive == int(n)}[op]:
                for sub in effect.sub_effects:
                    apply_effect(sub, caster, state, current_target, source, grantor)
        elif cond and cond.startswith("team_elem_gate:"):
            _, elem, n = cond.split(":")
            cnt = sum(1 for a in state.allies if a.alive and a.element == ELEMENT_ID.get(elem, 0))
            if cnt >= int(n):
                for sub in effect.sub_effects:
                    apply_effect(sub, caster, state, current_target, source, grantor)
        elif cond == "repeat":
            # fire the body N times = a stack count (own / target / enemies)
            src, _, name = (effect.repeat_stack or "").partition(":")
            if src == "own":
                n = caster.stacks.get(name, 0)
            elif src == "target":
                # count = max(pre-action snapshot, current live). The snapshot ignores a
                # same-action REMOVAL (포르베어 필살이 물보라 제거 후에도 4 카운트); live picks
                # up a same-action ADDITION (임욱잠 평타가 화약 +1 후 그만큼 연발).
                snap = current_target.gate_snap if current_target and current_target.gate_snap is not None else {}
                live = current_target.stacks if current_target else {}
                n = max(snap.get(name, 0), live.get(name, 0))
            else:
                n = sum(u.stacks.get(name, 0) for u in state.enemies)
            for _ in range(n):
                for sub in effect.sub_effects:
                    apply_effect(sub, caster, state, current_target, source, grantor)
        elif cond and cond.endswith(tuple("0123456789")) and effect.stack_name:
            # event-less "When own X ≧ N, ..." gate. A static self-buff becomes a DYNAMIC
            # conditional buff (active whenever X ≥ N — 카라트 호혈표지≥2 → 필살효과+33.75%);
            # other subs keep the fire-once-if-already-met behavior.
            thresh = effect.max_stacks
            met = caster.stacks.get(effect.stack_name, 0) >= thresh
            for sub in effect.sub_effects:
                if sub.kind == BUFF and sub.target == "self" and not sub.condition:
                    entry = (effect.stack_name, sub.stat, sub.magnitude, sub.owner,
                             sub.src_skill, False, thresh)
                    if entry not in caster.cond_buffs:
                        caster.cond_buffs.append(entry)
                elif met:
                    apply_effect(sub, caster, state, current_target, source, grantor)
        else:
            # avoid duplicate registration when the same grant re-fires (e.g. 멍 re-ults
            # at T1 then T4): refresh, don't stack a second identical subscription.
            once = effect.once or any(child.once for child in effect.sub_effects)
            dup = next((s for s in caster.subs if s.event == (cond or "")
                        and s.effects is effect.sub_effects and s.grantor is grantor), None)
            if dup is None:
                caster.subs.append(Subscription(
                    event=cond or "", effects=effect.sub_effects,
                    chance=effect.chance,
                    gate_stack=effect.stack_name, gate_count=effect.max_stacks,
                    param=effect.trigger_param, pos=effect.trigger_pos, grantor=grantor,
                    target_gate_stack=effect.target_stack, target_gate_count=effect.target_count,
                    repeat_stack=effect.repeat_stack, need_team_barrier=effect.team_barrier,
                    need_self_barrier=effect.self_barrier, once=once,
                    consume_gate=effect.consume_gate))
            elif once:
                dup.armed = True            # 재발동(예: 다음 EX) 시 once 보호막 재장전
        return

    targets = _resolve_targets(effect, caster, state, current_target, grantor)
    # effect-level override ("counts as EX Skill damage") wins over the source
    action = effect.force_action or {"fatal": "ex", "ex": "ex", "trigger": "trigger"}.get(source, "basic")
    # display label follows the effective action channel, so force_action="basic"
    # (세엔 "보통공격 시 추가 데미지") shows 평타 and draws 평타뎀, not 발동효과
    act_kr = {"basic": "평타", "ex": "필살", "trigger": "발동"}.get(action, "발동")

    if effect.condition and effect.condition.startswith("while:"):
        # conditional self-buff: active only while the named stack is held (flat)
        req = effect.condition.split(":", 1)[1]
        entry = (req, effect.stat, effect.magnitude, effect.owner, effect.src_skill, False, 1)
        if entry not in caster.cond_buffs:
            caster.cond_buffs.append(entry)
        return

    if effect.condition and effect.condition.startswith("stack_cap:"):
        name = effect.condition.split(":", 1)[1]      # stack lifetime/cap definition only
        caster.stack_caps[name] = max(caster.stack_caps.get(name, 0), effect.max_stacks)
        return

    if effect.condition and effect.condition.startswith("per_stack:"):
        # named-stack definition: each stack confers `magnitude` of `stat`, capped at
        # max_stacks (열화질보 N중첩 -> 평타뎀 +10%×N). Also fixes the stack's cap so
        # every "+1 stack" op respects it (not the per-op max_stacks=1).
        req = effect.condition.split(":", 1)[1]
        caster.stack_caps[req] = max(caster.stack_caps.get(req, 0), effect.max_stacks)
        entry = (req, effect.stat, effect.magnitude, effect.owner, effect.src_skill, True, 1)
        if entry not in caster.cond_buffs:
            caster.cond_buffs.append(entry)
        return

    if effect.condition and effect.condition.startswith("team_elem:"):
        # team-composition gate: ≥N allies of an element -> apply this buff to all
        # allies (else skip). Static vs a dummy, so evaluated once at passive install.
        _, elem, n = effect.condition.split(":")
        elem_id = ELEMENT_ID.get(elem, 0)
        if sum(1 for a in state.allies if a.alive and a.element == elem_id) < int(n):
            return                          # condition not met -> no buff
        # met -> fall through to the BUFF branch (target=allies)

    if kind == TRANSFORM:
        n = caster.stacks.get(effect.stack_name or "", 0)
        if n > 0 and effect.into_stack:
            caster.stacks[effect.into_stack] = caster.stacks.get(effect.into_stack, 0) + n
            caster.stacks[effect.stack_name] = 0
            state.record(caster.name, f"{act_kr} → {kr(effect.stack_name)} → {kr(effect.into_stack)} 전환", amount=0, src_id=effect.owner, src_skill=effect.src_skill)
        return

    if kind == EXTRA_ACTION:
        self_already = caster.extra_granted     # 호출 전 상태 (이태호 2번째 행동 판별용)
        for tgt in targets:
            if tgt is caster:
                if not caster.extra_granted:   # self "(only once per turn)"
                    caster.extra_actions += int(effect.magnitude)
                    caster.extra_granted = True
            elif tgt.turn_acts > 0:            # 임부언 -> P1: 이미 행동을 마친 동료만 회복 효과.
                tgt.extra_actions += int(effect.magnitude)   # 아직 행동 전이면 회복은 낭비(2회 안 됨)
        # self 추가행동이 이번 턴 이미 부여됐으면(이태호 2번째 행동) 재부여 안 되므로 로그 생략
        self_only = bool(targets) and all(t is caster for t in targets)
        if targets and not (self_only and self_already):
            granted = [t for t in targets if t is caster or t.turn_acts > 0]
            tail = "" if granted else " (대상 행동 전 — 회복 무효)"
            state.record(caster.name, f"{act_kr} → {_who(targets, caster, state, effect)} 추가 행동 +{int(effect.magnitude)}{tail}", amount=0, src_id=effect.owner, src_skill=effect.src_skill)
        return

    if kind == COND_DMG:
        tgt_unit = grantor if effect.target == "grantor" else caster
        tgt_unit.target_cond_dmg.append((effect.stack_name, effect.magnitude, effect.owner,
                                         effect.src_skill, effect.target_hp_op, effect.target_hp_val))
        return

    if kind == DAMAGE:
        if effect.each_turn and effect.duration > 0:
            # 지속딜(DoT): 매 턴 _tick_dots 가 같은 공식으로 한 번씩 적용한다 (지속 채널 = 평타뎀/EX효과
            # 안 받고 주는딜·받뎀만). 부여 시점엔 등록만. 같은 스킬의 DoT는 갱신(인스턴스 1개),
            # 다른 스킬의 DoT는 공존한다 (모이루 평타↔방어 도트, 최유희 도트 등 — 각각 별개 스킬).
            for tgt in targets:
                snap = _dot_cast_snapshot(caster, tgt)   # 부여 시점 시전자 스펙 고정
                # 같은 스킬의 서로 다른 도트 라인(최유희 궁: 단일 50% + 전체 25%)은 공존해야 하므로
                # 마그니튜드도 키에 포함 — 같은 (스킬, 배율) 재적용만 갱신, 다른 배율은 별개 도트.
                same = next((e for e in caster.dots if e[0] is tgt
                             and e[3] == effect.owner and e[4] == effect.src_skill
                             and e[1] == effect.magnitude), None)
                if same:
                    same[1] = effect.magnitude          # 같은 스킬 재적용 -> 턴·스냅샷 갱신
                    same[2] = int(effect.duration)
                    same[5] = snap
                else:
                    caster.dots.append([tgt, effect.magnitude, int(effect.duration),
                                        effect.owner, effect.src_skill, snap])
                state.record(caster.name,
                             f"{act_kr} 지속딜 → {tgt.name} {effect.magnitude:g}%/턴 ×{effect.duration}턴",
                             amount=0, src_id=effect.owner, src_skill=effect.src_skill)
            return
        bo = caster.barrier if effect.of_barrier else None      # 다라완: 현재 배리어 수치 기준
        bl = "배리어" if effect.of_barrier else "ATK"
        comp = None
        if effect.of_barrier:
            # ★ 구성 = 실제 배리어 인스턴스 각각을 그대로 (합산·재계산 X). 같은 스킬(파도 차징)이라도
            #   방어한 아군마다 그 아군 ATK로 개별 계산된 값이므로, 저장된 생성계산식/현재값을 그대로 가져온다.
            comp = [{"src": b[2], "v": round(b[0], 2),
                     "orig": round((b[3] or {}).get("final", b[0]), 2), "detail": b[3],
                     "turn": (b[3] or {}).get("turn"), "actId": (b[3] or {}).get("actId")}
                    for b in caster.barriers if b[0] > 0]
        # 피격으로 배리어가 소모됐으면 반격 기준값을 "기존 배리어 − 소모"로 표시
        bpre = caster.barrier_pre_hit if effect.of_barrier else None
        bcons = caster.barrier_absorbed if (effect.of_barrier and bpre is not None) else 0.0
        for tgt in targets:
            _record_hit(caster, tgt, effect.magnitude, action, act_kr,
                        effect.owner, effect.src_skill, state, base_override=bo,
                        base_label=bl, barrier_comp=comp, barrier_pre=bpre, barrier_consumed=bcons,
                        ex_effect=False)   # 배리어 반격은 리카노 등 아군 필살기효과 증가를 받지 않음(사용자 실측 확인)
    elif kind in (BUFF, DEBUFF):
        for tgt in targets:
            if effect.of_base_atk:
                # "+X% of own base ATK": base ATK includes the caster's base-ATK%
                # buffs (not regular ATK% buffs), snapshotted at grant time
                stat = STAT_ATK_FLAT
                val = effect.magnitude / 100 * caster.base_atk_eff()
            else:
                stat, val = (effect.stat or "?"), effect.magnitude
            # dedup by effect-OBJECT identity: the SAME skill line re-applied
            # refreshes; DIFFERENT lines coexist even when text/value is
            # identical (defend +30% base-ATK vs fatal +30% base-ATK are
            # separate skills -> both apply). Only "up to N stacks" effects
            # stack to N copies.
            ekey = id(effect)
            same = [b for b in tgt.buffs if b.key == ekey]
            if same and len(same) >= max(1, effect.max_stacks):
                for b in same:
                    b.value = val                            # update to new snapshot
                    b.turns = _half_turns(effect.duration)   # refresh (at stack cap)
            else:
                tgt.buffs.append(Buff(stat, val, _half_turns(effect.duration),
                                      src=source, key=ekey, element=effect.element,
                                      owner=effect.owner, src_skill=effect.src_skill))
        if source != "passive" and targets:           # show buff/debuff actions in the log
            atk_calc = None
            if effect.of_base_atk or stat == STAT_ATK_FLAT:
                vl = f"고정ATK {val:+,.0f}"
                if effect.of_base_atk:                 # 고정ATK = base × (1+기초ATK%) × 부여%
                    atk_calc = {"calc": "flatAtk", "base": caster.base_atk,
                                "baseAtk": caster._comp(STAT_BASE_ATK),
                                "pct": effect.magnitude, "val": round(val, 2)}
            else:
                el = ({1: "불 ", 2: "물 ", 3: "나무 ", 4: "빛 ", 5: "어둠 "}.get(effect.element, "")
                      if stat == STAT_DMG_TAKEN else "")
                vl = f"{el}{stat_kr(stat)} {effect.magnitude:+g}%"
            dur = f" {effect.duration}턴" if effect.duration > 0 else ""
            kind_kr = "디버프" if kind == DEBUFF else "버프"
            state.record(caster.name, f"{act_kr} {kind_kr} → {_who(targets, caster, state, effect)} {vl}{dur}",
                         amount=0, detail=atk_calc, src_id=effect.owner, src_skill=effect.src_skill)
    elif kind == STACK:
        # "awaken X or Y" -> each status rolls independently at the effect's chance
        names = [effect.stack_name or "?"]
        if effect.awaken_with:
            names.append(effect.awaken_with)
        fired: list[str] = []            # names that actually activated (independent rolls)
        for tgt in targets:
            for name in names:
                if not state.force_proc and effect.awaken_with and effect.chance < 100 \
                        and state.rng.random() * 100 >= effect.chance:
                    continue
                if name not in fired:
                    fired.append(name)
                if effect.magnitude <= -9000:    # "remove X from self" -> clear all
                    tgt.stacks[name] = 0
                    tgt.stack_turns.pop(name, None)
                    continue
                cur = tgt.stacks.get(name, 0)
                delta = int(effect.magnitude) if effect.magnitude else 1
                # any op that DEFINES a cap (max_stacks>1, e.g. 물보라 '최대 4중첩')
                # registers it, so later bare "+1 stack" ops (max_stacks=1) don't clamp
                # the stack back down to 1 (열화질보·물보라).
                if effect.max_stacks > 1:
                    tgt.stack_caps[name] = max(tgt.stack_caps.get(name, 0), effect.max_stacks)
                cap = max(tgt.stack_caps.get(name, 0), effect.max_stacks, 1)
                if effect.duration > 0:
                    tgt.stack_dur[name] = effect.duration   # 이 스택의 고유 수명 기억
                native = tgt.stack_dur.get(name, 0)
                # 타이머 스택: 한 번이라도 duration>0로 정의된 스택은, 이후 dur=0인 ±조작(상어수탄 평타 -1/+1
                # 등)에도 타이머 리스트를 유지한다. (혼합형 스택이 영구로 변질돼 변환 시 리셋되던 버그 수정)
                if effect.duration > 0 or native > 0:
                    # 중첩마다 개별 수명. 재적용해도 기존 중첩의 남은 시간은 유지되고 각자 만료(전체 리셋 X).
                    timers = list(tgt.stack_turns[name]) if isinstance(tgt.stack_turns.get(name), list) else []
                    if delta > 0:
                        timers.extend([_half_turns(effect.duration if effect.duration > 0 else native)] * delta)
                        if len(timers) > cap:
                            timers = timers[len(timers) - cap:]   # 초과분은 가장 오래된 것부터 밀어냄
                    elif delta < 0:
                        timers = timers[:max(0, len(timers) + delta)]
                    tgt.stack_turns[name] = timers
                    tgt.stacks[name] = len(timers)
                else:                                  # 영구 상태 스택 (각흔·화약 등) — 카운트 직접 관리
                    tgt.stacks[name] = max(0, min(cur + delta, cap))
                    tgt.stack_turns[name] = -1
        if source != "passive" and targets and fired:
            who = _who(targets, caster, state, effect)
            amt = "제거" if effect.magnitude <= -9000 else f"{(int(effect.magnitude) or 1):+d}중첩"
            # awaken (흑구/백구 등) = 각각 독립 확률 → 활성화된 것만 따로 한 줄씩
            labels = [kr(n) for n in fired] if effect.awaken_with else ["·".join(kr(n) for n in fired)]
            for label in labels:
                state.record(caster.name, f"{act_kr} → {who} {label} {amt}",
                             amount=0, src_id=effect.owner, src_skill=effect.src_skill)
    elif kind == CD_MOD:
        for tgt in targets:
            tgt.cd_remaining = max(0, tgt.cd_remaining + int(effect.magnitude))
        if targets:
            state.record(caster.name, f"{act_kr} → {_who(targets, caster, state, effect)} 필살 CD {int(effect.magnitude):+d}", amount=0, src_id=effect.owner, src_skill=effect.src_skill)
    elif kind == HEAL:
        atk = caster.atk_eff()
        mult = caster.support_mult(action)
        detail = caster.support_detail(action)
        eff_stat = _ACTION_EFF.get(action, "")
        for tgt in targets:
            # of_max_hp면 대상 최대HP의 X%(시전자 ATK 무관), 아니면 ATK% × 효과배율
            if effect.of_max_hp:
                raw = tgt.max_hp_eff() * effect.magnitude / 100
                basef = {"baseLabel": f"{tgt.name} 최대HP", "baseTotal": round(tgt.max_hp_eff(), 2)}
            else:
                raw = atk * effect.magnitude / 100 * mult
                basef = _atk_chan_fields(caster)       # base × 기초ATK% × ATK% + 고정 풀분해
            recv = tgt._sum(STAT_HEAL_RECV)                  # 받는 회복량 증가
            per = round(raw * (1 + recv / 100), 2)
            struct = {
                "kind": "heal", "act": act_kr, "final": per, "target": tgt.name,
                "skillPct": effect.magnitude, "skillId": effect.owner, "skillName": effect.src_skill,
                "eff": caster._comp(eff_stat) if (eff_stat and not effect.of_max_hp) else [],
                "healRecv": round(recv, 2), **basef,
            }
            # 로그 텍스트는 버프 라인처럼 간결하게, 계산식은 detail(드릴다운)에
            if effect.duration and effect.duration > 0:     # heal-over-time
                # 같은 스킬·대상의 지속힐 재적용은 갱신(중첩 X) — DoT와 동일. 맹씨 취심신왕처럼
                # 매 평타로 재설치되는 HoT가 인스턴스 누적되던 버그 수정.
                same = next((h for h in caster.hots if len(h) > 3 and h[0] is tgt
                             and h[3].get("skillId") == effect.owner
                             and h[3].get("skillName") == effect.src_skill
                             and h[3].get("skillPct") == effect.magnitude), None)
                if same:
                    same[1], same[2], same[3] = per, effect.duration, struct
                else:
                    caster.hots.append([tgt, per, effect.duration, struct])
                state.record(caster.name,
                             f"{act_kr} 지속힐 → {tgt.name} +{per:,.0f}/턴 ({effect.duration}턴)",
                             src_id=effect.owner, src_skill=effect.src_skill,
                             detail={**struct, "hot": effect.duration})
            else:
                tgt.hp = min(tgt.max_hp, tgt.hp + per)
                caster.healing_done += per
                state.record(caster.name, f"{act_kr} 힐 → {tgt.name} +{per:,.0f}",
                             amount=per, src_id=effect.owner, src_skill=effect.src_skill, detail=struct)
                _fire_subs(tgt, "on_heal_received", state, caster)   # 힐 수령 트리거(다라완 파4: 받는 배리어 +24%)
    elif kind == BARRIER:
        # 베리어 기준값: of_max_hp면 최대HP%(HP버프 반영), 아니면 ATK% (오렘·다라완파4 = 최대HP의 X%)
        base = caster.max_hp_eff() if effect.of_max_hp else caster.atk_eff()
        base_lbl = "최대HP" if effect.of_max_hp else "ATK"
        # 배리어는 부여 방식 무관하게 '발동효과'로 증가 (사용자 인게임 확인).
        # ★ 단, 평타(보통공격)로 얻는 배리어만 예외적으로 '보통공격 강화'(평타뎀)도 추가 적용
        #   (멍 패시브 등 — 평타로 생긴 배리어라 보통공격 증뎀 버프를 받음). 두 채널은 곱연산.
        eff_comps = caster._comp(STAT_TRIGGERED_EFFECT)
        mult = 1 + caster._sum(STAT_TRIGGERED_EFFECT) / 100
        basic_comps = []
        if action == "basic":
            mult *= 1 + caster._sum(STAT_BASIC_DMG_DEALT) / 100
            basic_comps = caster._comp(STAT_BASIC_DMG_DEALT)
        amt = round(base * effect.magnitude / 100 * mult, 2)
        # 드릴다운: ATK 기반은 base×기초ATK%×ATK%+고정 풀분해, HP 기반은 정적 최대HP
        basef = {"baseLabel": "최대HP", "baseTotal": round(caster.max_hp_eff(), 2)} if effect.of_max_hp \
            else _atk_chan_fields(caster)
        struct = {
            "kind": "barrier", "act": act_kr, "final": round(amt, 2),
            "skillPct": effect.magnitude, "skillId": effect.owner, "skillName": effect.src_skill,
            "eff": eff_comps, "effBasic": basic_comps, **basef,   # 발동효과 + (평타배리어면)보통공격뎀
        }
        dur = f" ({effect.duration}턴)" if effect.duration and effect.duration > 0 else ""
        bt = _half_turns(effect.duration) if effect.duration and effect.duration > 0 else -1
        bsrc = effect.src_skill or act_kr    # 배리어 출처(스킬명) — 추적/구성 로그용
        for tgt in targets:
            # 수령자측 배리어 증폭(다라완 파4: 힐 받으면 이후 얻는 배리어 +24%) — 부여 시점 값으로 곱연산
            recv = tgt._sum(STAT_BAR_RECV)
            amt_t = round(amt * (1 + recv / 100), 2) if recv else amt
            tstruct = {**struct, "final": amt_t, "barRecv": round(recv, 2),
                       "turn": state.turn, "actId": state.cur_action}
            # [금액, 타이머, 출처, 생성계산식(+생성 턴/액션ID)] — 재귀 드릴다운 + "추적" 점프용
            tgt.barriers.append([amt_t, bt, bsrc, tstruct])
            caster.barrier_done += amt_t
            state.record(caster.name, f"{act_kr} 베리어 → {tgt.name} +{amt_t:,.0f}{dur}",
                         amount=amt_t, src_id=effect.owner, src_skill=effect.src_skill,
                         detail={**tstruct, "target": tgt.name})
    elif kind == CC:
        if effect.stat == "taunt":     # 조롱: 이 유닛(들)이 상대편의 공격을 강제로 끌어온다
            for tgt in targets:
                # 조롱은 명시 지속시간만큼만(게임 정확: 1턴). 이전엔 적-조롱에 +1해 다음 아군 턴까지
                # 끌었으나, 1턴 조롱이 2턴처럼 작동해 조롱 게이트 효과(리카노 빛나는스타 +18% 주는딜,
                # 딜집중)가 다음 턴까지 잘못 적용됐다. 행동 순서는 우선순위로 조절.
                if tgt.taunt_turns <= 0:            # 새로 조롱 획득 → 건 시점 기록(연속 유지 중이면 최초 시점 보존)
                    tgt.taunt_since = state.cur_action
                tgt.taunt_turns = max(tgt.taunt_turns, max(1, effect.duration))
            if targets:
                state.record(caster.name, f"{act_kr} → {_who(targets, caster, state, effect)} 조롱 {effect.duration}턴",
                             amount=0, src_id=effect.owner, src_skill=effect.src_skill)
        else:
            # other crowd-control (기절/마비 등): not damage-relevant in dummy mode
            state.unapplied[f"미모델링({kind})"] += 1


def _team_has_barrier(caster: Unit, state: BattleState) -> bool:
    """True if every living ally currently holds a barrier (오렘 충격역류 발동 조건).
    Any source's barrier counts — 기리안 방어 쉴드 등 포함."""
    return all(u.barrier > 0 for u in state.team(caster) if u.alive)


def _is_poisoned(tgt: "Unit | None", state: BattleState) -> bool:
    """대상이 중독(지속 데미지/DoT)을 보유했는가 — 누군가 이 대상에게 건 DoT가 있으면 True (최유희)."""
    if tgt is None:
        return False
    return any(e[0] is tgt for u in state.allies + state.enemies for e in u.dots)


def _ready_subs(caster: Unit, event: str, state: BattleState,
                current_target: Unit | None) -> list[tuple[Subscription, str]]:
    """Subs that fire for `event` now: gate/barrier/once-qualified and chance rolled.
    Side effects: rolls the RNG and disarms once-subs (so call exactly once per event).
    Returns [(sub, src)]; the caller applies effects (allows damage/buff phase split)."""
    # snapshot which gated subs qualify BEFORE firing, so same-event triggers
    # (e.g. transform A->B and B->A) don't chain-cancel within one event.
    ready = [s for s in list(caster.subs)
             if s.event == event and _qualifies(s, caster, current_target)
             and (not s.need_team_barrier or _team_has_barrier(caster, state))
             and (not s.need_self_barrier or caster.barrier > 0)   # 자기 배리어 보유 시만 (오렘 충격역류)
             and (not s.once or s.armed)           # once-sub: 장전된 동안만
             and (s.target_gate_stack != "Poisoned" or _is_poisoned(current_target, state))]
    out: list[tuple[Subscription, str]] = []
    for sub in ready:
        if not state.force_proc and sub.chance < 100 and state.rng.random() * 100 >= sub.chance:
            continue
        if sub.once:
            sub.armed = False                       # 1회 발동 후 소진 (다음 재발동에 재장전)
        # triggered damage is 발동 by default; 내기혼신 (Qi Surge) is judged basic
        src = "basic" if sub.gate_stack in BASIC_JUDGED_STACKS else "trigger"
        out.append((sub, src))
    return out


def _fire_subs(caster: Unit, event: str, state: BattleState,
               current_target: Unit | None) -> None:
    # Sequential per-sub (roll → apply → next roll) — preserves seeded RNG order even
    # when an earlier sub's effects roll (apply_effect effect-chance). _ready_subs is
    # only for the simultaneous-AoE 2-pass where rolling all up-front IS the intent.
    # snapshot which gated subs qualify BEFORE firing, so same-event triggers
    # (e.g. transform A->B and B->A) don't chain-cancel within one event.
    ready = [s for s in list(caster.subs)
             if s.event == event and _qualifies(s, caster, current_target)
             and (not s.need_team_barrier or _team_has_barrier(caster, state))
             and (not s.need_self_barrier or caster.barrier > 0)   # 자기 배리어 보유 시만 (오렘 충격역류)
             and (not s.once or s.armed)           # once-sub: 장전된 동안만
             and (s.target_gate_stack != "Poisoned" or _is_poisoned(current_target, state))]
    for sub in ready:
        if not state.force_proc and sub.chance < 100 and state.rng.random() * 100 >= sub.chance:
            continue
        if sub.once:
            sub.armed = False                       # 1회 발동 후 소진 (다음 재발동에 재장전)
        # triggered damage is 발동 by default; 내기혼신 (Qi Surge) is judged basic
        src = "basic" if sub.gate_stack in BASIC_JUDGED_STACKS else "trigger"
        reps = _repeat_count(sub, state) if sub.repeat_stack else _gate_reps(caster, sub.gate_stack)
        for _ in range(reps):
            for eff in sub.effects:
                apply_effect(eff, caster, state, current_target, source=src,
                             grantor=sub.grantor)


def _gate_ok(caster: Unit, gate_stack: str | None, gate_count: int) -> bool:
    if not gate_stack:
        return True
    if "|" in gate_stack:            # OR-gate: hold any of the listed stacks
        return any(caster.stacks.get(s, 0) > 0 for s in gate_stack.split("|"))
    return caster.stacks.get(gate_stack, 0) >= gate_count


def _qualifies(sub: "Subscription", caster: Unit, target: Unit | None) -> bool:
    # target-gate reads the PRE-action snapshot when set, so a stack the SAME action
    # applies (e.g. 바드 필살이 각흔 부여) doesn't satisfy its own gate that turn.
    tgt_stacks = (target.gate_snap if target is not None and target.gate_snap is not None
                  else (target.stacks if target is not None else {}))
    if not sub.target_gate_stack:
        target_ok = True
    elif sub.target_gate_stack == "Taunt":            # 조롱은 taunt_turns로 추적
        target_ok = target is not None and target.taunt_turns > 0
    elif sub.target_gate_stack == "Poisoned":         # 중독(DoT 보유)은 _fire_subs에서 state로 판정
        target_ok = True
    else:
        target_ok = tgt_stacks.get(sub.target_gate_stack, 0) >= sub.target_gate_count
    # 소모 트리거(던컨 마도집중 제거)는 행동시작 스냅샷으로 게이트 판정 — 같은 행동이 막
    # 올린 스택이 자기 제거를 유발하지 않게 (≥N을 '행동 시작 시점'에 들고 있었어야 소모).
    if sub.consume_gate and sub.gate_stack:
        snap = caster.act_snap if caster.act_snap is not None else caster.stacks
        self_ok = snap.get(sub.gate_stack, 0) >= sub.gate_count
    else:
        self_ok = _gate_ok(caster, sub.gate_stack, sub.gate_count)
    return self_ok and target_ok


def _repeat_count(sub: "Subscription", state: BattleState) -> int:
    """Fire count = enemies' total stacks of sub.repeat_stack (0 -> no fire)."""
    return sum(u.stacks.get(sub.repeat_stack, 0) for u in state.enemies)


def _gate_reps(caster: Unit, gate_stack: str | None) -> int:
    """OR-gate effects fire once per held stack (e.g. 흑구+백구 = Hellhound +2)."""
    if gate_stack and "|" in gate_stack:
        return sum(1 for s in gate_stack.split("|") if caster.stacks.get(s, 0) > 0)
    return 1


def _fire_attack(caster: Unit, events: tuple[str, ...], state: BattleState,
                 current_target: Unit | None) -> None:
    """Resolve attack-triggered subs across `events` in TWO passes, ordered to match
    the confirmed in-game rule (파미도/리카노/세숭/멍/제트블랙/신리랑, 오차 0):

    Pass 1 interleaves 발동효과(STAT_TRIGGERED_EFFECT) buffs and triggered (발동)
    DAMAGES in firing order (= subscription install order = 일반 패시브 → 도장
    패시브). 발동효과 is the triggered damage's OWN effect channel, so a proc sees
    only the 발동효과 granted by subs that fired BEFORE it — accumulating in sequence
    (신리랑: 패시브 +60 → 80% proc[+60] → 도장 +30 → 40% proc[+90]; 제트블랙 Still
    Mind +24 → Full Support proc[+24], 1턴차부터).

    Pass 2 applies everything else (ATK/기초ATK/고정ATK such as 전술판독 +30%, 받뎀
    such as 리카노 사이드라인 +12%, stacks). These land AFTER all procs, so a proc
    never sees same-action ATK/받뎀 grants — only carried-over buffs and this skill's
    body effects (applied earlier, before this call).

    Gates are snapshotted and chances rolled ONCE up-front (before any effect), so
    later state changes don't retroactively gate the damage pass.
    """
    fired: list[tuple[Subscription, str]] = []
    for event in events:
        # 자기공격 트리거의 배리어게이트는 '행동 전' 배리어(barrier_snap)로 판정 — 이 공격이 부여한
        # 배리어가 같은 공격의 "배리어 보유 시" 게이트를 즉석에서 만족시키지 않도록 (오렘 도장 등).
        bsnap = caster.barrier_snap if caster.barrier_snap is not None else caster.barrier
        for sub in [s for s in list(caster.subs)
                    if s.event == event and _qualifies(s, caster, current_target)
                    and (not s.need_team_barrier or _team_has_barrier(caster, state))
                    and (not s.need_self_barrier or bsnap > 0)
                    and (s.target_gate_stack != "Poisoned" or _is_poisoned(current_target, state))]:
            if not state.force_proc and sub.chance < 100 and state.rng.random() * 100 >= sub.chance:
                continue
            src = "basic" if sub.gate_stack in BASIC_JUDGED_STACKS else "trigger"
            fired.append((sub, src))
    # 2-패스 순서 (인게임 확정):
    #   Pass 1 — 발동효과(발동딜 자신의 효과 채널) 버프 + 발동딜(DAMAGE)을 발동 순서대로
    #            인라인 적용. 발동효과는 "그 딜보다 앞서 발동한 분"만 반영된다(순차 누적).
    #            예) 신리랑: 패시브 발동효과+60 → 80%딜(60%만) → 도장 발동효과+30 → 40%딜(90%).
    #            (발동 순서 = subs 설치순서 = 일반 패시브 → 도장 패시브)
    #   Pass 2 — ATK·기초ATK·고정ATK(전술판독)·받뎀(리카노 사이드라인) 등 나머지는 모든 발동딜 뒤.
    def _inline(eff: Effect) -> bool:
        return eff.kind == DAMAGE or (eff.kind in (BUFF, DEBUFF)
                                      and eff.stat == STAT_TRIGGERED_EFFECT)
    for inline_pass in (True, False):
        for sub, src in fired:
            if inline_pass and sub.repeat_stack:
                reps = _repeat_count(sub, state)        # EX multi-hit by enemy stacks
            else:
                reps = _gate_reps(caster, sub.gate_stack)  # OR-gate: once per held dog
            for _ in range(reps):
                for eff in sub.effects:
                    if _inline(eff) == inline_pass:
                        apply_effect(eff, caster, state, current_target, source=src,
                                     grantor=sub.grantor)


def _fire_time_subs(unit: Unit, state: BattleState) -> None:
    """Fire time-based triggers: every_turn / on_turn / position_periodic."""
    state.cur_action += 1
    state.cur_actor_id = getattr(unit._kit, "char_id", 0)
    state.cur_action_kind = "패시브"
    foes = [u for u in state.foes(unit) if u.alive]
    target = foes[0] if foes else None
    for sub in list(unit.subs):
        # 매 턴 반복형(every_turn/position_periodic)은 전투 시작 턴(1턴)엔 발동 안 함 —
        # 게임은 1턴=기준(0중첩), 다음 아군턴(2턴)부터 누적. on_turn(전투시작 1회성)은 1턴 유지.
        if sub.event == "every_turn":
            fire = sub.param > 0 and state.turn > 1 and state.turn % sub.param == 0
        elif sub.event == "on_turn":
            fire = state.turn == sub.param
        elif sub.event == "position_periodic":
            in_pos = sub.pos == 0 or (unit.slot + 1) == sub.pos
            fire = in_pos and state.turn > 1 and state.turn % max(1, sub.param) == 0
        else:
            continue
        if not fire:
            continue
        if not state.force_proc and sub.chance < 100 and state.rng.random() * 100 >= sub.chance:
            continue
        for eff in sub.effects:
            apply_effect(eff, unit, state, target, source="trigger")


def _next_token(unit: Unit) -> str | None:
    """Next action token from the rotation, or None if no rotation is set."""
    if not unit.rotation_prefix and not unit.rotation_loop:
        return None
    i = unit.action_idx
    unit.action_idx += 1
    if i < len(unit.rotation_prefix):
        return unit.rotation_prefix[i]
    if unit.rotation_loop:
        return unit.rotation_loop[(i - len(unit.rotation_prefix)) % len(unit.rotation_loop)]
    return unit.rotation_prefix[-1] if unit.rotation_prefix else None


def _ran_p4_synergy(ran: "Unit", state: "BattleState") -> None:
    """란 '허물 매미 교전': 방어(란의 기운 보유) 시 포지션4 동료에게 ATK +24%(란 기초ATK 기준, 1턴)
    부여 + 그 동료의 공격이 란을 되먹이도록 표시. (멀티라인 위치부여+이름지목 피드백이라 특수처리)"""
    p4 = next((u for u in state.allies if u.alive and u.slot == 3 and u is not ran), None)
    if p4 is None:
        return
    flat = round(ran.base_atk * 0.24)
    K = 104260024
    p4.buffs = [b for b in p4.buffs if b.key != K]
    p4.buffs.append(Buff(stat=STAT_ATK_FLAT, value=flat, turns=_half_turns(1), src="trigger",
                         key=K, owner=10426, src_skill="허물 매미 교전"))
    p4.ran_p4_src = ran
    p4.ran_p4_turns = _half_turns(1)         # 정확히 1턴 — P4 동료는 란 방어 이후 같은 턴에 공격해야 발동(순서는 우선순위로)
    state.record(ran.name, f"발동 → P4 {p4.name} ATK +{flat:,.0f} · 공격연계 부여 (허물 매미 교전)",
                 src_id=10426, src_skill="허물 매미 교전")


def _ran_p4_feedback(p4: "Unit", state: "BattleState") -> None:
    """포지션4 동료가 공격 시 란에게 되먹임: 발동 스킬 효과 +108%(2턴) + 해일의 송곳니 +5."""
    ran = p4.ran_p4_src
    if ran is None or not getattr(ran, "alive", False):
        p4.ran_p4_src = None
        p4.ran_p4_turns = 0
        return
    K = 104260108
    ran.buffs = [b for b in ran.buffs if b.key != K]
    ran.buffs.append(Buff(stat=STAT_TRIGGERED_EFFECT, value=108.0, turns=_half_turns(2), src="trigger",
                          key=K, owner=10426, src_skill="허물 매미 교전"))
    cap = ran.stack_caps.get("Tidefang", 16) or 16
    ran.stacks["Tidefang"] = min(ran.stacks.get("Tidefang", 0) + 5, cap)
    ran.stack_turns.setdefault("Tidefang", -1)
    state.record(p4.name, "발동 → 란 발동 스킬 효과 +108% 2턴 · 해일의 송곳니 +5 (허물 매미 교전)",
                 src_id=10426, src_skill="허물 매미 교전")
    p4.ran_p4_src = None             # 부여당 1회(다음 공격)로 제한 — 창 닫기
    p4.ran_p4_turns = 0


def _apply_incoming(ally: Unit, attacker: Unit, state: BattleState) -> None:
    """피격 데미지 모드: 아군 최대HP의 n%를 데미지로 (배리어 먼저 흡수, HP 1하한).
    반격 발동 '전에' 호출 → 배리어 비례 딜(다라완)·배리어 게이트(오렘)가 소모 후 값으로 판정."""
    ally.barrier_pre_hit = None
    if state.incoming_hp_pct <= 0:
        return
    pre = ally.barrier
    raw = ally.max_hp_eff() * state.incoming_hp_pct / 100   # 체퍼뎀(최대HP n%)
    defended = ally.defending                               # 방어 상태면 받는 데미지 50% 감소
    # 정상 공격과 동일하게 곱연산 채널을 모두 적용:
    #   방어 50%↓ × 아군 받는뎀 증감(배리어 보유 -10% 등, 속성 받뎀 포함) × 공격자 주는뎀 증감(다라완 sigil -24% 등)
    taken_mult = ally.incoming_mult(attacker.element)
    dealt_mult = max(0.0, 1 + attacker._sum(STAT_DMG_DEALT) / 100)
    dmg = raw * (0.5 if defended else 1.0) * taken_mult * dealt_mult
    absorbed, to_hp = ally.absorb_damage(dmg)
    if absorbed > 0:                         # 배리어 소모 발생 → 반격의 "기존 배리어 − 소모" 표시용
        ally.barrier_pre_hit = pre
        ally.barrier_absorbed = absorbed
    # 각 감소 채널을 UI에 개별 표기 (방어 −50% 옆에 받는뎀 −10%·주는뎀 −24% 등)
    taken_g = [{"v": round(b.value, 2), "by": b.owner, "skill": b.src_skill}
               for b in ally.buffs if b.stat == STAT_DMG_TAKEN and b.element == 0]
    taken_p = [{"v": round(b.value, 2), "by": b.owner, "skill": b.src_skill, "el": _ELNAME.get(b.element, "")}
               for b in ally.buffs if b.stat == STAT_DMG_TAKEN and b.element != 0 and b.element == attacker.element]
    dealt = [{"v": round(b.value, 2), "by": b.owner, "skill": b.src_skill}
             for b in attacker.buffs if b.stat == STAT_DMG_DEALT]
    dtail = " (방어 -50%)" if defended else ""
    tail = f" (배리어 흡수 {absorbed:,.0f}" + (f" · HP -{to_hp:,.0f}" if to_hp else "") + ")"
    state.record(ally.name, f"{attacker.name} 피격 데미지 {dmg:,.0f}{dtail}{tail}", amount=0,
                 detail={"kind": "incoming", "dmg": round(dmg, 2), "raw": round(raw, 2),
                         "defended": defended, "absorbed": round(absorbed, 2), "hpLost": round(to_hp, 2),
                         "preBar": round(pre, 2), "remainBar": round(pre - absorbed, 2),
                         "taken": taken_g, "takenP": taken_p, "dealt": dealt})


def _take_action(unit: Unit, state: BattleState) -> None:
    state.cur_action += 1            # each action gets a fresh id (for log grouping)
    state.cur_actor_id = getattr(unit._kit, "char_id", 0) if not unit.is_dummy else 0
    state.cur_action_kind = ""       # set below once the action (fatal/basic/defend) is known
    foes = [u for u in state.foes(unit) if u.alive]
    # target the front foe = lowest battle position (slot), not list order
    target = min(foes, key=lambda u: u.slot) if foes else None
    if unit.is_dummy:
        # enemy phase: the enemy lands N hits, each on a DISTINCT random ally
        # (no ally hit twice), firing their defensive subs (쿼터백/성노 counters).
        # enemy_hits<0 -> 적이 공격 안 함(피격/반격 없음). =0 -> all allies.
        if state.enemy_hits < 0:
            return
        living = [u for u in state.foes(unit) if u.alive]
        if state.enemy_aoe:
            # 전체공격: 아군 전체가 1회 "동시" 피격. 동시 타격이므로 한 아군의 반격(발동딜)은
            # 같은 AoE가 만드는 버프/스택(예: 파미도 쿼터백 지휘선 기초ATK)을 미리 받지 않아야
            # 한다. 그래서 모든 피격 반응을 모은 뒤, 반격(DAMAGE) 먼저 → 버프/스택 나중 2-패스.
            # (순차 피격인 일반 공격은 누적이 맞으므로 아래 else 경로에서 종전대로 처리)
            # 수집: 아군별 피격 헤더를 찍고(각자 고유 action_id), 그 아군의 반응 구독을 모은다.
            # action_id를 함께 저장해, 2-패스로 적용할 때도 각 반응이 "그 아군 피격 그룹" 아래에
            # 표시되도록 한다(표시는 캐릭터별 묶음, 계산은 딜 먼저 2-패스 — 둘을 분리).
            reactions: list[tuple[Unit, Subscription, str, int]] = []
            for ally in sorted(living, key=lambda u: u.slot):
                state.cur_action += 1
                state.cur_actor_id = getattr(ally._kit, "char_id", 0)
                state.cur_action_kind = "피격"
                state.cur_atk_by = unit.name
                state.record(ally.name, f"{unit.name}에게 피격", amount=0)   # 헤더(반응 없어도 표시)
                _apply_incoming(ally, unit, state)   # 피격 데미지(배리어 흡수) — 반격 게이트 판정 전
                aid = state.cur_action
                for ev in ("on_attacked", "on_take_basic"):
                    for sub, src in _ready_subs(ally, ev, state, unit):
                        reactions.append((ally, sub, src, aid))
            last_aid = state.cur_action
            for want_damage in (True, False):          # 반격(딜) = AoE 前 상태로 / 버프·스택은 뒤
                for ally, sub, src, aid in reactions:
                    state.cur_action = aid              # 표시: 해당 아군 피격 그룹으로 복원
                    state.cur_actor_id = getattr(ally._kit, "char_id", 0)
                    state.cur_action_kind = "피격"
                    state.cur_atk_by = unit.name
                    reps = (_repeat_count(sub, state) if (want_damage and sub.repeat_stack)
                            else _gate_reps(ally, sub.gate_stack))
                    for _ in range(reps):
                        for eff in sub.effects:
                            if (eff.kind == DAMAGE) == want_damage:
                                apply_effect(eff, ally, state, unit, source=src,
                                             grantor=sub.grantor)
            state.cur_action = last_aid                 # 그룹 카운터 단조 유지
            state.cur_atk_by = ""
            return
        n = state.enemy_hits if state.enemy_hits > 0 else len(living)
        taunters = [u for u in living if u.taunt_turns > 0]
        if taunters:
            # 조롱: 모든 타격이 조롱한 탱커에게 강제로 — 탱커가 피격·반격을 흡수.
            # 다수 조롱(쿠모야마+다라완 등) 시엔 먼저 건 캐릭터(가장 이른 taunt_since)에게 어그로 집중.
            focus = min(taunters, key=lambda u: (u.taunt_since, u.slot))
            chosen = [focus] * n
        else:
            n = min(n, len(living))
            chosen = state.rng.sample(living, n) if n < len(living) else living
        for ally in sorted(chosen, key=lambda u: u.slot):
            # 순차 피격: 피격 단위로 그룹 + 그로 인한 반격·버프·스택을 누적 처리(정상).
            state.cur_action += 1
            state.cur_actor_id = getattr(ally._kit, "char_id", 0)
            state.cur_action_kind = "피격"
            state.cur_atk_by = unit.name
            state.record(ally.name, f"{unit.name}에게 피격", amount=0)   # 헤더(반응 없어도 표시)
            _apply_incoming(ally, unit, state)   # 피격 데미지(배리어 흡수) — 반격 발동 전
            _fire_subs(ally, "on_attacked", state, unit)
            _fire_subs(ally, "on_take_basic", state, unit)
        state.cur_atk_by = ""
        return

    kit_basic, kit_fatal = unit._kit.basic, unit._kit.fatal  # type: ignore[attr-defined]
    unit.turn_acts += 1
    # 이태호: base 2회 초과 행동(예: 임부언이 준 3번째)은 메인 로테이션을 소비하지 않고
    # fed_action 지정 토큰을 사용(기본 '평'=평타 → 종전 동작과 동일). 임부언 궁의 CD-3로 '궁' 재발동 가능.
    forced_basic = unit.extra_basic and unit.turn_acts > unit.base_actions
    if forced_basic:
        # 임부언 추가행동: 이번 턴 지정 토큰(fed_schedule) 우선, 없으면 단일 fed_action(구호환)
        fed_tok = unit.fed_schedule.get(state.turn, unit.fed_action)
        token = _TOKEN_ACTION.get(fed_tok, "basic")
    else:
        token = _next_token(unit)

    if token == "defend":
        state.cur_action_kind = "방어"
        unit.defending = True            # 방어 상태 → 이번 턴 받는 데미지 50% 감소
        state.record(unit.name, "defend (방어)")
        # 란(허물 매미 교전): 방어 전 란의 기운 보유 여부 — on_defend가 제거하기 전에 캡처
        ran_had_gale = getattr(unit._kit, "char_id", 0) == 10426 and unit.stacks.get("Gale Breath", 0) >= 1
        _fire_subs(unit, "on_defend", state, target)
        _fire_subs(unit, "on_action", state, target)
        if ran_had_gale:
            _ran_p4_synergy(unit, state)
        return

    if not forced_basic and unit.is_fed_carry and bool(kit_fatal.effects):
        # a feeder (e.g. 임부언) resets this carry's CD mid-turn -> fatal on every
        # CD-ready action (natural + the granted bonus), ignoring the rotation
        use_fatal = unit.cd_remaining <= 0
    elif token == "fatal":
        use_fatal = unit.cd_remaining <= 0 and bool(kit_fatal.effects)
        if not use_fatal and bool(kit_fatal.effects):
            unit.auto_fatal_pending = True   # 지정 궁이 쿨 미충족으로 불발 → 오토 폴백 예약
    elif token == "basic":
        # 폴백: 앞서 지정 궁이 불발됐으면, 쿨이 차는 대로 자동으로 궁 발동 (오토 전환)
        use_fatal = (unit.auto_fatal_pending and unit.cd_remaining <= 0
                     and bool(kit_fatal.effects))
    else:  # no rotation -> default policy: fatal if ready, unless holding it
        holding = any(unit.stacks.get(s, 0) > 0 for s in unit.hold_fatal_stacks)
        use_fatal = unit.cd_remaining <= 0 and bool(kit_fatal.effects) and not holding

    cid = getattr(unit._kit, "char_id", 0)
    if use_fatal:
        skill, label, event = kit_fatal, "fatal", "on_ex"
        unit.cd_remaining = unit.fatal_cd
        unit.auto_fatal_pending = False     # 궁 발동했으니 폴백 예약 해제
        state.cur_action_kind = "필살기"
        state.turn_exes.add(cid)            # 다양수이 협동: 이 아군이 이번 턴 필살 사용
    else:
        skill, label, event = kit_basic, "basic", "on_basic_attack"
        state.cur_action_kind = "보통공격"
        state.turn_basics.add(cid)          # 이 아군이 이번 턴 평타 사용

    # 란 P4 시너지: 이 동료(포지션4)가 공격(평타/궁)하면 란에게 되먹임
    if unit.ran_p4_src is not None and unit.ran_p4_turns > 0:
        _ran_p4_feedback(unit, state)

    # snapshot the target's stacks BEFORE this action's own effects, so a stack the
    # action applies (바드 필살 -> 각흔) doesn't satisfy its own target-gate this turn.
    if target is not None:
        target.gate_snap = dict(target.stacks)
    # snapshot the actor's OWN stacks too — consume-on-attack gates (던컨 마도집중 소모)
    # read this so a stack the same action just gained doesn't trigger its own removal.
    unit.act_snap = dict(unit.stacks)
    unit.barrier_snap = unit.barrier    # 행동 전 배리어 — 자기공격 트리거의 배리어게이트 판정 기준
    before = len(state.log)
    for eff in skill.effects:
        apply_effect(eff, unit, state, target, source=label)
    # make a fatal cast visible even when it deals no direct damage (only buffs
    # / on-EX triggers), e.g. 하니엘's 성결 -> 종판/성노 fire as 발동 afterwards
    if label == "fatal" and len(state.log) == before:
        state.record(unit.name, "필살 시전 (직접딜 없음 → 버프/발동)")
    # resolve attack procs from the action-specific event then generic on-attack,
    # buffs/stacks first and triggered damages last, so the 발동 damage sees the
    # fully-buffed ATK this same attack granted (e.g. 파미도 Strategic flat)
    _fire_attack(unit, (event, "on_attack"), state, target)
    _fire_subs(unit, "on_action", state, target)   # may grant an extra action
    unit.act_snap = None
    unit.barrier_snap = None
    if target is not None:
        target.gate_snap = None


def _tick_buffs(state: BattleState) -> None:
    """Tick one half-turn (called after the ally phase and the enemy phase).

    Decrements buff and stack lifetimes; expires those that reach 0.
    """
    for unit in state.allies + state.enemies:
        if unit.ran_p4_turns > 0:                 # 란 P4 피드백 창 감소
            unit.ran_p4_turns -= 1
            if unit.ran_p4_turns <= 0:
                unit.ran_p4_src = None
        kept: list[Buff] = []
        for b in unit.buffs:
            if b.turns < 0:
                kept.append(b)
            else:
                b.turns -= 1
                if b.turns > 0:
                    kept.append(b)
        unit.buffs = kept
        # 배리어 인스턴스: 각자 하프턴 감소, 0이면 만료 제거 (turns<0 = 영구)
        if unit.barriers:
            kept_b = []
            for b in unit.barriers:
                if b[1] < 0:
                    kept_b.append(b)
                elif b[1] - 1 > 0:
                    kept_b.append([b[0], b[1] - 1, b[2], b[3]])
            unit.barriers = kept_b
        for name in list(unit.stack_turns):
            t = unit.stack_turns[name]
            if isinstance(t, list):      # 타이머 스택: 중첩마다 개별 만료
                t = [x - 1 for x in t if x - 1 > 0]
                if t:
                    unit.stack_turns[name] = t
                    unit.stacks[name] = len(t)
                else:
                    unit.stacks[name] = 0
                    del unit.stack_turns[name]
            elif t < 0:
                continue                 # permanent state stack
            else:
                unit.stack_turns[name] = t - 1
                if unit.stack_turns[name] <= 0:
                    unit.stacks[name] = 0
                    del unit.stack_turns[name]


def _tick_hots(state: BattleState) -> None:
    """Apply heal-over-time once per turn and decrement their remaining turns."""
    for u in state.allies + state.enemies:
        if not u.hots:
            continue
        state.cur_action += 1                          # group this unit's HoT ticks together
        state.cur_actor_id = getattr(u._kit, "char_id", 0)   # 직전 행동 컨텍스트 상속 방지
        state.cur_action_kind = "지속힐"
        kept = []
        for entry in u.hots:
            tgt, per, turns = entry[0], entry[1], entry[2]
            calc = entry[3] if len(entry) > 3 else None    # 설치 시점 계산식(드릴다운)
            if tgt.alive:
                tgt.hp = min(tgt.max_hp, tgt.hp + per)
                u.healing_done += per
                state.record(u.name, f"지속힐 → {tgt.name} {per:,.2f}",
                             src_id=(calc or {}).get("skillId", 0),
                             src_skill=(calc or {}).get("skillName", ""),
                             detail=calc)
                _fire_subs(tgt, "on_heal_received", state, u)   # 지속힐 수령도 트리거(다라완 파4)
            entry[2] = turns - 1
            if entry[2] > 0:
                kept.append(entry)
        u.hots = kept


def _tick_dots(state: BattleState) -> None:
    """Apply 지속딜(DoT) once per turn, recomputed with current ATK/buffs/받뎀, then
    decrement remaining turns. Uses the 'dot' channel (주는딜·받뎀만, 평타뎀/EX효과 제외)."""
    for u in state.allies + state.enemies:
        if not u.dots:
            continue
        state.cur_action += 1                          # group this unit's DoT ticks together
        state.cur_actor_id = getattr(u._kit, "char_id", 0)
        state.cur_action_kind = "지속딜"
        kept = []
        for entry in u.dots:
            tgt, pct, turns, src_id, src_skill, snap = entry
            if tgt.alive:
                _record_hit(u, tgt, pct, "dot", "지속", src_id, src_skill, state, snap=snap)
            entry[2] = turns - 1
            if entry[2] > 0:
                kept.append(entry)
        u.dots = kept


def _install_passives(unit: Unit, state: BattleState) -> None:
    """Apply always-on passive effects and register triggers at battle start."""
    for psv in unit._kit.passives:  # type: ignore[attr-defined]
        for eff in psv.effects:
            apply_effect(eff, unit, state, None, source="passive")


def _compute_hold_fatal(unit: Unit) -> None:
    """Detect stacks where using fatal is counter-productive.

    A "hold" stack is one the fatal would transform away (an on-EX transform
    whose source it is) AND that enables value on basic attack (gates an
    on-basic trigger). e.g. 이태호's Solar Flight: fatal flips it back to Lunar
    Pounce, but while held each basic farms Qi Surge -> hold fatal, spam basic.
    """
    transform_src: set = set()
    basic_gated: set = set()
    for sub in unit.subs:
        if sub.event == "on_ex":
            for eff in sub.effects:
                if eff.kind == TRANSFORM and eff.stack_name:
                    transform_src.add(eff.stack_name)
        if sub.event == "on_basic_attack" and sub.gate_stack:
            basic_gated.add(sub.gate_stack)
    unit.hold_fatal_stacks = transform_src & basic_gated
    # fatal that grants an extra action to a fixed position feeds that carry
    for eff in unit._kit.fatal.effects:  # type: ignore[attr-defined]
        if eff.kind == EXTRA_ACTION and (eff.target or "").startswith("position_"):
            unit.feeds_position = int(eff.target.split("_")[1])


def _mark_fed_carries(allies: list[Unit]) -> None:
    """One-time: mark carries that a feeder (e.g. 임부언) keeps CD-resetting, so they
    fatal on every CD-ready action (natural + the granted bonus)."""
    for u in allies:
        if u.feeds_position:
            carry = next((a for a in allies if a.slot == u.feeds_position - 1), None)
            # 이태호(extra_basic): fed action stays a 평타, not a forced fatal
            if carry is not None and carry is not u and not carry.extra_basic:
                carry.is_fed_carry = True


_ROLE_KIND = {"Fighter": 1, "Vandal": 5}   # 전사=1, 방해=5 (역할 협동 게이트)


def _check_coordination(allies: list[Unit], state: BattleState) -> None:
    """다양수이 협동 트리거: 자신 제외 [역할] 동료 전원이 이번 턴 [행동]을 마치면 1회 발동."""
    for u in allies:
        if not u.alive:
            continue
        for sub in u.subs:
            if not sub.event.startswith("all_acted:") or id(sub) in state.coord_fired:
                continue
            _, role, action = sub.event.split(":")
            acted = state.turn_basics if action == "basic" else state.turn_exes
            kind = _ROLE_KIND.get(role)        # None = 모든 역할
            peers = [a for a in allies if a is not u and a.alive
                     and (kind is None or a.kind == kind)]
            if not peers or not all(getattr(a._kit, "char_id", 0) in acted for a in peers):
                continue
            state.coord_fired.add(id(sub))      # 이번 턴 1회만
            if not state.force_proc and sub.chance < 100 and state.rng.random() * 100 >= sub.chance:
                continue
            state.cur_action += 1
            state.cur_actor_id = getattr(u._kit, "char_id", 0)
            state.cur_action_kind = "패시브"
            for eff in sub.effects:
                apply_effect(eff, u, state, None, "trigger", grantor=sub.grantor)


def _ally_phase(allies: list[Unit], state: BattleState) -> None:
    """Run the ally phase as a queue so granted extra actions act right after the
    action that granted them (self-grants like 이태호, or 임부언 -> 아누비로스)."""
    override = state.turn_orders.get(state.turn) if state.turn_orders else None
    if override:
        bypos = {u.slot: u for u in allies if u.alive}
        queue = [bypos[s] for s in override if s in bypos]
        queue += [u for u in sorted(allies, key=lambda x: x.priority)
                  if u.alive and u not in queue]   # any not listed -> base order, appended
    else:
        # 지정한 우선순위 그대로 — 임부언 같은 피더도 강제로 미루지 않는다. 사용자가 임부언을
        # 아누비로스 뒤에 둬야 더블 궁이 되고, 앞에 두면 회복이 낭비됨(아래 EXTRA_ACTION 게이트).
        queue = sorted([u for u in allies if u.alive], key=lambda u: u.priority)
    guard = 0
    while queue and guard < 50:
        guard += 1
        u = queue.pop(0)
        if not u.alive:
            continue
        _take_action(u, state)
        _check_coordination(allies, state)   # 다양수이: 역할 동료 전원 행동 완료 시 발동
        # any ally now holding pending extra actions acts next (priority order)
        pending = [v for v in sorted(allies, key=lambda x: x.priority)
                   if v.alive and v.extra_actions > 0]
        for v in pending:
            v.extra_actions -= 1
        queue[0:0] = pending


def simulate(kits: list[ResolvedKit], n_dummies: int = 1, max_turn: int = 30,
             seed: int = 0, rotations: list[str | None] | None = None,
             slots: list[int] | None = None,
             priorities: list[float] | None = None,
             enemy_hits: int = 0, turn_orders: dict | None = None,
             force_proc: bool = False, enemy_aoe: bool = False,
             dummy_element: int = 0, hp10: bool = False,
             fed_actions: list[str | None] | None = None,
             incoming_hp_pct: int = 0) -> BattleState:
    """Run a target-dummy battle and return the final state (with log).

    rotations: optional per-ally action strings (e.g. '평평방궁|평방궁').
    slots:     battle positions (0-based); dummy targets the lowest slot.
    priorities: action order (lower acts first); defaults to slot.
    """
    allies = []
    for i, kit in enumerate(kits[:5]):
        slot = slots[i] if slots and i < len(slots) else i
        prio = priorities[i] if priorities and i < len(priorities) else slot
        u = make_unit_from_kit(kit, slot, priority=prio)
        u._kit = kit  # type: ignore[attr-defined]
        if rotations and i < len(rotations) and rotations[i]:
            u.rotation_prefix, u.rotation_loop = parse_rotation(rotations[i])
        if fed_actions and i < len(fed_actions) and fed_actions[i]:
            fa = fed_actions[i]              # 이태호 임부언 fed 추가행동: dict={turn:토큰}(턴별) 또는 str(단일, 구호환)
            if isinstance(fa, dict):
                u.fed_schedule = {int(k): v for k, v in fa.items() if v}
            else:
                u.fed_action = fa
        allies.append(u)
    enemies = [make_dummy(i) for i in range(max(1, min(n_dummies, 5)))]
    for e in enemies:
        e.element = dummy_element        # 더미 속성 → 공격자 속성과 상성 판정
    state = BattleState(allies=allies, enemies=enemies, max_turn=max_turn,
                        rng=random.Random(seed), enemy_hits=enemy_hits, enemy_aoe=enemy_aoe,
                        turn_orders=turn_orders or {}, force_proc=force_proc,
                        hp_schedule=any(_kit_has_hp_gate(u._kit) for u in allies),
                        dummy_element=dummy_element, hp10=hp10, incoming_hp_pct=incoming_hp_pct)

    for u in allies:
        _install_passives(u, state)
    for u in allies:
        _compute_hold_fatal(u)
    _mark_fed_carries(allies)

    while state.turn < state.max_turn:
        state.turn += 1
        state.turn_basics.clear()           # 다양수이 협동: 턴별 행동 집계 리셋
        state.turn_exes.clear()
        state.coord_fired.clear()
        if state.hp10:                      # 체력 10% 모드: 더미 HP 10% 고정 → 카라트 저HP 게이트
            for e in enemies:               # (주는딜 +15%×3·추가타 100%, HP<75/<50/<25) 매 턴 전부 발동
                e.hp = e.max_hp * 0.10
        elif state.hp_schedule:             # 카라트 등 HP게이트 캐릭: HP%를 4등분 스케줄로 단계 감소
            pct = _hp_sched_pct(state.turn, state.max_turn)
            for e in enemies:
                e.hp = e.max_hp * pct
        for u in allies:
            if u.alive:
                _fire_time_subs(u, state)   # on_turn-1 CD cut etc. before actions
            u.extra_actions = 0             # reset BEFORE the phase so cross-ally
            u.extra_granted = False         # grants (e.g. 임부언 -> P1) survive
            u.turn_acts = 0                 # actions-taken counter (이태호 3rd = forced 평타)
            u.defending = False             # 방어 상태 리셋 — 이번 턴 방어/Enter Defense 시 다시 설정
        # --- ally phase (queue: priority order + granted extra actions) ---
        _ally_phase(allies, state)
        _tick_buffs(state)                   # half-turn tick (after ally phase)
        # --- enemy phase ---
        for u in sorted(enemies, key=lambda x: x.slot):
            if u.alive:
                _take_action(u, state)
        _tick_buffs(state)                   # half-turn tick (after enemy phase)
        _tick_hots(state)                    # heal-over-time (once per turn)
        _tick_dots(state)                    # 지속딜(DoT) (once per turn)
        # fatal cooldown charges one step at turn end
        for u in allies:
            if u.alive and u.cd_remaining > 0:
                u.cd_remaining -= 1
        for u in allies + enemies:           # 조롱 지속시간 감소 (아군 어그로·적 딜집중 둘 다)
            if u.taunt_turns > 0:
                u.taunt_turns -= 1
    return state
