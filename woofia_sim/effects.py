"""Parse skill description lines into structured combat effects.

The scraped skill data stores each level's effect as English description text
with ``${argN}`` placeholders plus a ``params`` dict.  We resolve the
placeholders to concrete numbers, then match each line against an ordered
grammar of templates to produce :class:`Effect` objects the engine can execute.

Lines that no template matches are returned as ``Effect(kind="UNPARSED", ...)``
so coverage gaps are explicit and never silently dropped.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

# ---- effect taxonomy ----------------------------------------------------

# action kinds
DAMAGE = "DAMAGE"            # deal ATK% damage to target
HEAL = "HEAL"               # heal target for ATK% (optionally each turn)
BARRIER = "BARRIER"         # shield = ATK% or HP%
BUFF = "BUFF"               # stat/modifier change (see stat field)
DEBUFF = "DEBUFF"           # negative modifier on enemy target
CC = "CC"                   # crowd control (paralyze/taunt)
STACK = "STACK"             # gain/remove a named stack
TRANSFORM = "TRANSFORM"     # convert all stacks of one status into another
EXTRA_ACTION = "EXTRA_ACTION"  # gain an extra action this turn
COND_DMG = "COND_DMG"       # +dmg-dealt% while the attack target holds a status
CD_MOD = "CD_MOD"           # EX-skill cooldown change
TRIGGER = "TRIGGER"         # conditional wrapper holding sub-effects
MARKER = "MARKER"           # section header / non-mechanical note
ENTER_DEFENSE = "ENTER_DEFENSE"  # 자신을 방어 상태로 전환(다라완 필살) — 받는 데미지 50% 감소
UNPARSED = "UNPARSED"       # no template matched -> flagged

# buff stat channels
STAT_ATK = "atk_pct"            # current ATK +x%
STAT_BASE_ATK = "base_atk_pct"  # base ATK +x%
STAT_MAX_HP = "max_hp_pct"
STAT_BASE_MAX_HP = "base_max_hp_pct"
STAT_DMG_DEALT = "dmg_dealt_pct"            # TBonusProperty.damageBonus (all outgoing)
STAT_BASIC_DMG_DEALT = "basic_eff_pct"      # attackEffBonus (basic-attack action)
STAT_EX_EFFECT = "ex_eff_pct"               # skill/ultimateEffBonus (EX action)
STAT_TRIGGERED_EFFECT = "trigger_eff_pct"   # triggerEffBonus (triggered action)
STAT_DMG_TAKEN = "dmg_taken_pct"            # damagedBonus (target side / self defensive)
STAT_DOT_TAKEN = "dot_taken_pct"            # GetOtherDotBonusRate (target side) — DoT 틱에만
STAT_DOT_DEALT = "dot_dealt_pct"            # 지속 데미지 주는 증가 (caster side) — DoT 틱에만
STAT_ATK_FLAT = "atk_flat"                  # flat ATK add (e.g. % of caster base ATK)
STAT_HEAL_RECV = "heal_recv_pct"            # 받는 회복량 증가 (target side, heal/HoT received +x%)
STAT_BAR_RECV = "bar_recv_pct"              # 받는 배리어 효과 증가 (수령자 side, beShieldBonus — 오렘 파1·다라완 파4 모두)


@dataclass
class Effect:
    """One resolved combat effect parsed from a description line."""

    kind: str
    raw: str                                  # original (resolved) line
    target: str = "target"                    # see targeting vocabulary
    stat: str | None = None                   # for BUFF/DEBUFF channels
    magnitude: float = 0.0                    # percent value (e.g. 135.0)
    of_base_atk: bool = False                 # magnitude is % of caster base ATK
    of_max_hp: bool = False                   # barrier/heal scales off Max HP
    of_barrier: bool = False                  # DAMAGE scales off caster's CURRENT barrier (다라완)
    duration: int = -1                        # turns; -1 = permanent
    max_stacks: int = 1
    chance: float = 100.0                     # trigger probability %
    stack_name: str | None = None             # for STACK / gated triggers
    into_stack: str | None = None             # TRANSFORM target status
    condition: str | None = None              # human-readable trigger condition
    trigger_param: int = 0                    # period (every_turn) or turn number (on_turn)
    trigger_pos: int = 0                       # required position (position_periodic), 1-based
    target_stack: str | None = None           # gate on the attack TARGET's stack
    target_count: int = 0
    target_hp_op: str | None = None            # gate on the attack TARGET's HP%: "lt"/"ge"
    target_hp_val: float = 0.0                 # threshold % for target_hp_op (카라트 HP 게이트)
    force_action: str | None = None            # override action channel ("ex" = "counts as EX Skill damage")
    each_turn: bool = False                     # DAMAGE: 매 턴 데미지(지속딜/DoT) over `duration` turns
    team_barrier: bool = False                  # 발동 조건: 아군 전원이 베리어 보유 (오렘 충격역류)
    awaken_with: str | None = None             # second stack gained together ("awaken X or Y")
    repeat_stack: str | None = None            # repeat N times = enemies' total stacks of this
    positions: list = field(default_factory=list)  # multi-position damage (enemies in Positions X,Y,Z)
    element: int = 0                           # EProp id for element-specific effects (0 = any)
    owner: int = 0                             # char id whose skill this effect belongs to
    src_skill: str = ""                        # KR skill name (for buff-source drill-down)
    sub_effects: list["Effect"] = field(default_factory=list)
    once: bool = False                         # "This effect can only trigger 1 time" — 발동마다 1회만
    self_barrier: bool = False                 # 발동 조건: 자신(발동 유닛)이 배리어 보유 (오렘 충격역류)
    consume_gate: bool = False                 # 게이트를 행동시작 스냅샷 기준으로 (소모 트리거, 던컨 마도집중)
    barrier_self_amp: bool = False             # 이 '받는 배리어+X%' 버프가 새로 붙는 순간 자기 보유 배리어 소급증폭 (오렘 파1 eff6002 "granted by self")

    @property
    def parsed(self) -> bool:
        return self.kind != UNPARSED


# ---- placeholder resolution --------------------------------------------

_PLACEHOLDER = re.compile(r"\$\{(\w+)\}")


def resolve_placeholders(desc: str, params: dict) -> str:
    """Replace ``${argN}`` with the concrete param value (number as string)."""
    def repl(m: re.Match) -> str:
        val = params.get(m.group(1))
        if val is None:
            return m.group(0)
        # render ints without trailing .0
        if isinstance(val, float) and val.is_integer():
            return str(int(val))
        return str(val)
    return _PLACEHOLDER.sub(repl, desc)


# ---- trigger prefixes (recursive) --------------------------------------

_NUM = r"(\d+(?:\.\d+)?)"
_STK = r"stack(?:\(s\)|s)?"          # stack | stack(s) | stacks
_TRN = r"turn(?:\(s\)|s)?"           # turn | turn(s) | turns

# (pattern, condition, spec) — spec tells parse_line how to read the groups:
#   "chance" -> (chance%, body)   "plain" -> (body,)
#   "param"  -> (N, body)         "pos"   -> (position, period, body)
# "On {Basic Attack|EX Skill}, deal damage ..." with NO "trigger:" = an ADDED part of that
# action (세엔/히토하 "보통공격·필살기 시 추가 데미지"), judged as that action (평타뎀/EX효과,
# not 발동효과). The "trigger:" forms keep the 발동 path (멍).
_ON_BASIC_ADD = re.compile(r"^On Basic Attack, ([Dd]eal damage .+)$")
_ON_EX_ADD = re.compile(r"^On EX Skill, ([Dd]eal damage .+)$")
_TRIGGER_PATTERNS: tuple[tuple[re.Pattern, str, str], ...] = (
    (re.compile(rf"^On attack, there is a(?:\(n\))? {_NUM}% chance to trigger: (.+)$"), "on_attack", "chance"),
    (re.compile(r"^On attack, (?:trigger: )?(.+)$"), "on_attack", "plain"),
    (re.compile(rf"^On Basic Attack, there is a(?:\(n\))? {_NUM}% chance to trigger: (.+)$"), "on_basic_attack", "chance"),
    (re.compile(r"^On Basic Attack, (?:trigger: )?(.+)$"), "on_basic_attack", "plain"),
    (re.compile(rf"^On EX Skill, there is a(?:\(n\))? {_NUM}% chance to trigger: (.+)$"), "on_ex", "chance"),
    (re.compile(r"^On EX Skill, (?:trigger: )?(.+)$"), "on_ex", "plain"),
    (re.compile(rf"^When attacked, there is a(?:\(n\))? {_NUM}% chance to trigger: (.+)$"), "on_attacked", "chance"),
    (re.compile(r"^When attacked, trigger: (.+)$"), "on_attacked", "plain"),
    (re.compile(r"^When taking a Basic Attack, trigger: (.+)$"), "on_take_basic", "plain"),
    (re.compile(r"^Upon receiving healing, trigger: (.+)$"), "on_heal_received", "plain"),  # 다라완 파4(내부 배리어-amp 미모델)
    (re.compile(rf"^When defending, there is a(?:\(n\))? {_NUM}% chance to trigger: (.+)$"), "on_defend", "chance"),
    (re.compile(r"^When defending, (?:trigger: )?(.+)$"), "on_defend", "plain"),
    (re.compile(rf"^On turn {_NUM}, trigger: (.+)$"), "on_turn", "param"),
    (re.compile(rf"^Every {_NUM} {_TRN}, trigger: (.+)$"), "every_turn", "param"),
    (re.compile(r"^At the start of battle, trigger: (.+)$"), "on_battle_start", "plain"),
    (re.compile(rf"^When taking an action, there is a(?:\(n\))? {_NUM}% chance to (.+)$"), "on_action", "chance"),
    (re.compile(r"^When taking an action, trigger: (.+)$"), "on_action", "plain"),
    (re.compile(rf"^When in Position {_NUM}, every {_NUM} {_TRN}, (.+)$"), "position_periodic", "pos"),
    # "목표 HP ≥ N% 타격 시" — 더미는 항상 풀HP라 HP 게이트는 항상 참 → on_attack로 처리
    (re.compile(rf"^[Ww]hen hitting target\(s\) with HP (?:≧|>=) {_NUM}%, (?:trigger: )?(.+)$"), "on_attack", "plain"),
    # 적 처치 시 — 더미는 무한HP라 처치 불가 → inert
    (re.compile(r"^On defeating target\(s\), trigger: (.+)$"), "on_defeat", "plain"),
    # 부모 이벤트 없이 떨어진 확률 트리거(분리 잔여) — on_attack로 근사
    (re.compile(rf"^There is a\(n\) {_NUM}% chance to trigger: (.+)$"), "on_attack", "chance"),
)

# gate on the attack TARGET's HP%: "When locked target HP < 25%, BODY" / "...HP ≧ 50%, BODY".
# 카라트: HP 임계 미만/이상에서 주는딜·필살 추가타·표지 빌드가 갈린다.
_THP = re.compile(rf"^When locked target HP (<|≥|≧|>) {_NUM}%, (.+)$")
_HIT_HP = re.compile(rf"^[Ww]hen hitting target\(s\) with HP (<|≥|≧|>) {_NUM}%,\s*(?:trigger: )?(.+)$")


# team-coordination trigger (다양수이): fires when EVERY ally of a role (except self) has
# used a given action this turn. role = Fighter/Vandal/'' (all); action = basic/EX.
_ALL_ACTED = re.compile(rf"^Except self, when all of own (Fighter |Vandal |)Buddies use (?:a Basic Attack|an EX Skill),\s*(?:there is a(?:\(n\))? {_NUM}% chance to )?(?:trigger: )?(.+)$")

# 최유희 공포의 바람 속격: 평타가 중독(DoT) 보유 대상 적중 시 추가딜 (target 게이트 = Poisoned)
_POISON_HIT = re.compile(rf"^If Basic Attack target\(s\) is/are Poisoned \(DoT\), there is a(?:\(n\))? {_NUM}% chance to trigger: (.+)$")
# 최유희 독설 반격: 방어 후 평타 피격 시 확률 도트 (1턴 무장 = 방어마다 1회)
_DEFEND_COUNTER = re.compile(rf"^When taking a Basic Attack, there is a(?:\(n\))? {_NUM}% chance to (.+?), for {_NUM} turn\(s\)\.?$")


def _apply_hp_gate(eff: "Effect", op: str, val: float) -> None:
    """Tag the LEAF effects (not the trigger wrappers) so each only applies while the
    target's HP% gate holds. Triggers must still register at battle start; their gated
    subs are checked when they fire."""
    if eff.kind != TRIGGER:
        eff.target_hp_op = op
        eff.target_hp_val = val
    for s in eff.sub_effects:
        _apply_hp_gate(s, op, val)


# stack-gated condition, e.g. "When (own) Strategic Insight ≧ 3 stack(s), on attack, trigger: ..."
# Captures the optional inner event so the gate fires on that event (not just once). "own" optional.
_GATE = re.compile(rf"^When (?:own )?(.+?) (?:≧|=) {_NUM} {_STK}[,:]\s*(on attack|on Basic Attack|on EX Skill|[Ww]hen attacked|[Ww]hen defending|[Ww]hen taking an action)?,?\s*(?:there is a(?:\(n\))? {_NUM}% chance to )?(?:trigger: )?(.+)$")

# gate on the attack TARGET's stack, e.g. "When locked target's Judgment = 1 stack(s), on EX Skill, trigger: ..."
_TGATE = re.compile(rf"^When (?:locked target's|target's|target) (.+?) (?:≧|=) {_NUM} {_STK},\s*(on attack|on Basic Attack|on EX Skill|[Ww]hen attacked|[Ww]hen defending|[Ww]hen taking an action)?,?\s*(?:trigger: )?(.+)$")
# target HAS a named status (presence, ≥1): "When locked target(s) is/are with Chisel Marks, [on X,] [trigger: ]Y"
_TWITH = re.compile(r"^When locked target\(s\) (?:is/are|is|are) with (.+?),\s*(on attack|on Basic Attack|on EX Skill|[Ww]hen attacked|[Ww]hen defending|[Ww]hen taking an action)?,?\s*(?:trigger: )?(.+)$")
# enemy-count gate (evaluated vs the current dummy count): "When enemy alive ≧ 5, <effect>"
_ECOUNT = re.compile(r"^When enemy alive (≧|≦|=|>=|<=) (\d+), (.+)$")

# "With X or Y, <event>, trigger: <body>" — gate that holds while X OR Y is present.
# Names may be quoted; the comma can sit inside the quote ("Whitey,") so consume
# any run of quotes/commas after the second name.
_WITH_OR = re.compile(r'^With [\"“]?(.+?)[\"”]? or [\"“]?(.+?)[,\"”]+\s*(on attack|on Basic Attack|on EX Skill|when attacked)?,?\s*(?:trigger: )?(.+)$')
# "With X, <body>" — conditional self-modifier active while X is held (no event)
_WITH_ONE = re.compile(r'^With [\"“]?(.+?)[\"”]?, (.+)$')
# "On EX Skill, trigger the same number of times as the enemies' total stack(s) of Z: <body>"
_REPEAT = re.compile(r"^On EX Skill, trigger the same number of times as the enemies' total stack\(s\) of (.+?): (.+)$")
# generalized repeat-by-stack-count (own / target / enemies) — fires the body N times
_REP_OWN = re.compile(r"^trigger the same number of times as own stack\(s\) of (.+?): (.+)$")
_REP_TGT = re.compile(r"^trigger the same number of times as the target's stack\(s\) of (.+?): (.+)$")
_REP_BASED = re.compile(r"^based on own (.+?) stack\(s\), trigger: (.+)$")
# suffix-form repeat ("Deal damage X ... the same number of times as own/target's stack(s) of Z").
# Exclude lines still carrying a trigger prefix so the event wrapper (On Basic Attack, ...) is
# peeled first and the repeat wraps only the inner damage, not the whole trigger. 임욱잠.
_REP_SUFFIX = re.compile(r"^(?!.*trigger:)(.+?) the same number of times as (own|target's) stack\(s\) of ([^:]+?)\.?$")
# team-state gate (all allies hold Barrier/HoT/...). 팀 버퍼가 유지하므로 참으로 근사(§비고).
_ALL_WITH = re.compile(r"^When all of own Buddies are with (.+?), (on attack|on Basic Attack|on EX Skill|when taking a Basic Attack|when attacked)?,?\s*(?:there is a(?:\(n\))? \d+% chance to )?(?:trigger: )?(.+)$")
# "(Grant )Buddy in Position N <body>" -> apply <body> to the ally at that position
_POS_BUDDY = re.compile(r"^(?:Grant )?Buddy in Position (\d+) (.+)$")
# "All of own Buddies <body>" (no apostrophe) -> apply <body> to the whole team
_ALL_BUDDIES = re.compile(r"^All of own Buddies (?!')(.+)$")

_GATE_EVENT = {
    "on attack": "on_attack", "on Basic Attack": "on_basic_attack",
    "on EX Skill": "on_ex", "when attacked": "on_attacked",
    "when defending": "on_defend", "when taking an action": "on_attack",
    "when taking a Basic Attack": "on_take_basic",
    # capitalized variants (e.g. "...stack(s): When defending,...")
    "When attacked": "on_attacked", "When defending": "on_defend",
    "When taking an action": "on_attack",
}

# "Grant all of own Buddies: <sub-effect>" — delegates a sub-effect to allies.
_GRANT = re.compile(r"^(?:Grant all of own (?:Buddies|members)|Except self, all of own Buddies gain|For all of own Buddies)[,:]? ?(.+)$")

# team-composition gate: "For all of own Buddies, when the number of Wood Buddies ≧ 3,
# trigger: Own damage dealt +15%." -> all allies get +X% damage dealt while the team
# holds ≥N of that element (비어녹스 특별 시급 두 배).
_TEAM_ELEM_DMG = re.compile(
    rf"^For all of own Buddies, when the number of (Fire|Water|Wood|Light|Dark) Buddies (?:≧|=|>=) {_NUM},"
    rf"\s*trigger: (?:Own )?damage dealt \+{_NUM}%\.?$")
# team element-count gate wrapping any effect: "When the number of Water Buddies ≧ 3, [event,] [trigger: ]X"
_TELEM_GATE = re.compile(r"^When the number of (Fire|Water|Wood|Light|Dark) Buddies (?:≧|=|>=) (\d+), (.+)$")


# ---- leaf action patterns ----------------------------------------------
# Each entry: (compiled regex, builder(match) -> Effect). First match wins.

def _f(x: str) -> float:
    return float(x)


def _stk(name: str) -> str:
    """Normalize a stack/status name: drop trailing '(...)' and 'for N turn(s)'."""
    # "(the) following effect[ applied to ...]: X" verbose phrasing -> the real stack name X
    name = re.sub(r"^the following effect[^:]*:\s*", "", name.strip())
    name = re.sub(r"\s*\([^)]*\)\s*$", "", name)
    name = re.sub(r"\s+for \d+ turn(?:\(s\)|s)?\s*$", "", name, flags=re.IGNORECASE)
    return name.strip()


def _opt_dur(m: re.Match, idx: int) -> int:
    g = m.group(idx)
    return int(g) if g else -1


_LEAF_BUILDERS: list[tuple[re.Pattern, "callable"]] = []


def _leaf(pattern: str):
    def deco(fn):
        _LEAF_BUILDERS.append((re.compile(pattern), fn))
        return fn
    return deco


@_leaf(rf"^[Dd]eal damage {_NUM}% of own ATK to (?:enemies in Positions|enemy in ?Position) ([\d ,and]+?)(?:\. If no target exists, attack 1 random enemy instead)?\.?$")
def _b_damage_positions(m):
    # one hit per listed position; an empty position redirects to the front enemy
    # (던컨 찰스 = 단수 "enemy in Position N"; 아누비로스 = "enemies in Positions 1, 3, and 5")
    positions = [int(x) for x in re.findall(r"\d+", m.group(2))]
    return Effect(DAMAGE, m.group(0), target="positions",
                  magnitude=_f(m.group(1)), positions=positions)


@_leaf(rf"^[Dd]eal damage (?:equal to )?{_NUM}% of own ATK to (.+?)(\. This effect counts as EX Skill damage)?(?: each turn for {_NUM} {_TRN}|,? for {_NUM} {_TRN})?\.?$")
def _b_damage(m):
    # "This effect counts as EX Skill damage" -> force the EX (skillEff) channel.
    # "each turn for N turn(s)" -> DoT (지속딜) over N turns; plain "for N" is cosmetic (one-shot).
    each = m.group(4)
    return Effect(DAMAGE, m.group(0), target=_target(m.group(2)), magnitude=_f(m.group(1)),
                  force_action="ex" if m.group(3) else None,
                  each_turn=bool(each), duration=int(each) if each else 0)


# --- subject-less buff bodies (used after a "Buddy in Position N" / "All Buddies" prefix) ---
@_leaf(rf"^ATK \+{_NUM}% of own base ATK(?: for {_NUM} {_TRN})?\.?$")
def _b_body_atk_of_base(m):
    return Effect(BUFF, m.group(0), target="self", stat=STAT_ATK_FLAT, of_base_atk=True,
                  magnitude=_f(m.group(1)), duration=_opt_dur(m, 2))


@_leaf(r"^EX Skill CD (-?\d+) turn\(s\)\.?$")
def _b_body_cd(m):
    return Effect(CD_MOD, m.group(0), target="self", magnitude=float(m.group(1)))


@_leaf(rf"^[Gg]ain {_NUM} action\(s\)\.?$")
def _b_body_action(m):
    return Effect(EXTRA_ACTION, m.group(0), target="self", magnitude=_f(m.group(1)))


@_leaf(rf"^(?:[Oo]wn )?damage taken (-?{_NUM})%(?: for (own Buddy with the lowest HP%))?(?: for {_NUM} {_TRN})?\.?$")
def _b_body_dmg_taken(m):
    # (-?{_NUM}) nests a group, so: 1=signed mag, 2=inner num, 3=target, 4=turns
    tgt = _target(m.group(3)) if m.group(3) else "self"
    return Effect(BUFF, m.group(0), target=tgt, stat=STAT_DMG_TAKEN,
                  magnitude=float(m.group(1)), duration=_opt_dur(m, 4))


@_leaf(rf"^All enemies (Fire |Water |Wood |Light |Dark )?damage taken \+{_NUM}%(?: for {_NUM} {_TRN})?\.?$")
def _b_all_enemy_dmg_taken(m):
    elem = _ELEM.get((m.group(1) or "").strip().lower(), 0)
    return Effect(DEBUFF, m.group(0), target="all_enemies", stat=STAT_DMG_TAKEN,
                  magnitude=_f(m.group(2)), duration=_opt_dur(m, 3), element=elem)


@_leaf(rf"^All of own Buddies' (?:(EX Skill|Basic Attack) )?damage taken (-?{_NUM})%(?: for {_NUM} {_TRN})?\.?$")
def _b_all_buddy_dmg_taken(m):
    # action-specific damage-taken (EX/Basic) collapses to the generic dmg-taken channel
    return Effect(BUFF, m.group(0), target="allies", stat=STAT_DMG_TAKEN,
                  magnitude=float(m.group(2)), duration=_opt_dur(m, 4))


@_leaf(rf"^([Aa]ll of own Buddies' )?(?:HoT|[Hh]ealing) received \+{_NUM}%(?: for (own Buddy with the lowest HP%))?"
       rf"(?: each turn)?(?: for {_NUM} {_TRN})?(?:, up to {_NUM} {_STK})?\.?$")
def _b_heal_recv(m):
    # 1=allies prefix, 2=mag, 3=lowest-HP target, 4=turns, 5=stacks
    tgt = "allies" if m.group(1) else (_target(m.group(3)) if m.group(3) else "self")
    return Effect(BUFF, m.group(0), target=tgt, stat=STAT_HEAL_RECV,
                  magnitude=_f(m.group(2)), duration=_opt_dur(m, 4),
                  max_stacks=int(_f(m.group(5))) if m.group(5) else 1)


# DoT 전용 채널은 미모델 → 일반 주는딜/받는딜 채널로 근사(§비고)
@_leaf(rf"^Target DoT damage taken \+{_NUM}%(?: for {_NUM} {_TRN})?\.?$")
def _b_dot_taken(m):                          # 지속(도트) 데미지 전용 받뎀증 — 일반 타격엔 무효
    return Effect(DEBUFF, m.group(0), target="target", stat=STAT_DOT_TAKEN,
                  magnitude=_f(m.group(1)), duration=_opt_dur(m, 2))


@_leaf(rf"^Own DoT damage dealt \+{_NUM}%(?: for {_NUM} {_TRN})?(?:, up to {_NUM} {_STK})?\.?$")
def _b_dot_dealt(m):                          # 지속(도트) 데미지 전용 주는증가 — 일반 타격엔 무효
    return Effect(BUFF, m.group(0), target="self", stat=STAT_DOT_DEALT,
                  magnitude=_f(m.group(1)), duration=_opt_dur(m, 2),
                  max_stacks=int(m.group(3)) if m.group(3) else 1)


# 수면 부여 + 받뎀증(sleepBonusDamage) — 게임: 수면 대상은 피격 시 받뎀 +Y%, 그리고 "데미지를 받으면
# 효과 해제"(RemoveSleepState). 즉 받뎀 +Y%는 첫 피격 1회만 적용되고 각성한다(2턴 상시 아님).
# CC(stat="sleep")로 두어 엔진이 Sleep 상태를 부여하고 첫 직접피격에 소비한다. magnitude=받뎀 +Y%.
@_leaf(rf"^There is a(?:\(n\))? {_NUM}% chance to put all enemies to Sleep and their damage taken \+{_NUM}%, for {_NUM} {_TRN}\.?(?: Remove the effect when damage is taken\.?)?$")
def _b_sleep_taken(m):
    return Effect(CC, m.group(0), target="all_enemies", stat="sleep",
                  magnitude=_f(m.group(2)), duration=int(_f(m.group(3))), chance=_f(m.group(1)))


# "데미지를 받으면 효과 해제" — 수면의 각성 조건. CC(sleep)가 첫 피격 소비로 이미 구현하므로 마커.
@_leaf(r"^Remove the effect when damage is taken\.?$")
def _b_sleep_remove_note(m):
    return Effect(MARKER, m.group(0))


# 수면만 부여(받뎀증 없음) — 탐랑 도장OFF 필살. 수면 자체는 딜 무관이나 아군 '수면 시 주는딜+X%'
# (탐랑 파2 COND_DMG stack=Sleep) 게이트를 열어준다. 역시 첫 피격에 각성.
@_leaf(rf"^There is a(?:\(n\))? {_NUM}% chance to put all enemies to Sleep for {_NUM} {_TRN}\.?$")
def _b_sleep_plain(m):
    return Effect(CC, m.group(0), target="all_enemies", stat="sleep",
                  magnitude=0.0, duration=int(_f(m.group(2))), chance=_f(m.group(1)))


@_leaf(rf"^(?:[Oo]wn )?damage dealt \+{_NUM}%(?: for {_NUM} {_TRN})?\.?$")
def _b_body_dmg_dealt(m):
    return Effect(BUFF, m.group(0), target="self", stat=STAT_DMG_DEALT,
                  magnitude=_f(m.group(1)), duration=_opt_dur(m, 2))


@_leaf(rf"^(?:[Oo]wn )?Basic Attack damage(?: dealt)? \+{_NUM}%(?: for {_NUM} {_TRN})?(?:, up to {_NUM} {_STK})?\.?$")
def _b_basic_dmg(m):
    return Effect(BUFF, m.group(0), target="self", stat=STAT_BASIC_DMG_DEALT,
                  magnitude=_f(m.group(1)), duration=_opt_dur(m, 2),
                  max_stacks=int(m.group(3)) if m.group(3) else 1)


@_leaf(r"^Immunity to .+$")
def _b_immunity(m):
    return Effect(MARKER, m.group(0))      # CD-change immunity: not modeled (no-op)


@_leaf(r"^[Cc]ancel Defense on target\(s\)\.?$")
def _b_cancel_def(m):
    return Effect(MARKER, m.group(0))      # 더미는 방어 미모델 → inert


@_leaf(rf"^Grant Buddy in Position \d+ for \d+ {_TRN}:$")
def _b_pos_grant_header(m):
    return Effect(MARKER, m.group(0))      # 멀티라인 grant 헤더(본문은 다음 줄들에서 파싱) §비고


@_leaf(rf"^Barrier granted (by|to) self \+{_NUM}%(?: for {_NUM} {_TRN})?(?:, up to {_NUM} {_STK})?\.?$")
def _b_barrier_amp(m):
    # 수령자(self)측 '받는 배리어' 증폭(beShieldBonus). 오렘 파1(eff 6002, "granted by self")·
    # 다라완 파4(eff 8003, "granted to self") 모두 자신이 보유/수령하는 배리어에만 +X%(사용자 인게임).
    # "granted by self"가 로컬라이즈상 부여자처럼 읽히나 실제는 오렘 자신의 배리어 증폭이라 수령자측이
    # 맞다. 부여 시점에 tgt(=self) 기준으로만 적용되므로 오렘이 남에게 준 배리어엔 안 붙는다.
    #  · "by self"(오렘 eff6002)만 추가로 '발동 순간 자기 보유 배리어 소급 +X%' 컴포넌트 보유
    #    → barrier_self_amp=True. "to self"(다라완 eff8003)는 소급 없음(향후 받는 배리어만).
    return Effect(BUFF, m.group(0), target="self", stat=STAT_BAR_RECV,
                  magnitude=_f(m.group(2)), duration=_opt_dur(m, 3),
                  max_stacks=int(_f(m.group(4))) if m.group(4) else 1,
                  barrier_self_amp=(m.group(1) == "by"))


@_leaf(rf"^[Dd]eal damage {_NUM}% of Barrier to (.+?)(?:,? for {_NUM} {_TRN})?\.?$")
def _b_barrier_damage(m):
    # 다라완 필살 반격: 현재 배리어 수치의 N%를 데미지로 (ATK 무관). "for N turns"는 트리거 창.
    return Effect(DAMAGE, m.group(0), target=_target(m.group(2)),
                  magnitude=_f(m.group(1)), of_barrier=True)


@_leaf(r"^Enter Defense \(skill effects triggered by Defense won'?t be triggered\)\.?$")
def _b_enter_defense(m):
    # 다라완 필살: 방어상태 전환 → 받는 데미지 50% 감소. 단 일반 방어와 달리 "방어 시"(on_defend)
    # 트리거는 봉인하므로 defending 플래그만 세우고 on_defend는 발동하지 않는다.
    return Effect(ENTER_DEFENSE, m.group(0))


@_leaf(rf"^All of own Buddies' Chance to be (?:Paralyzed|put to Sleep) -{_NUM}%(?: for {_NUM} {_TRN})?\.?$")
def _b_cc_resist(m):
    return Effect(MARKER, m.group(0))      # CC 저항 — 더미전 무관


@_leaf(rf"^[Gg]ain a Barrier {_NUM}% of own (ATK|Max\. HP) for {_NUM} {_TRN}(?:\. This effect can only trigger 1 time)?\.?$")
def _b_gain_barrier(m):
    return Effect(BARRIER, m.group(0), target="self", magnitude=_f(m.group(1)),
                  of_max_hp="HP" in m.group(2), duration=int(m.group(3)),
                  once="can only trigger 1 time" in m.group(0))


@_leaf(r"^If no target exists, .+$")
def _b_fallback_note(m):
    return Effect(MARKER, m.group(0))      # multi-position fallback already handled (no-op)


@_leaf(rf"^[Aa]waken [\"']?(.+?)[\"']? or [\"']?(.+?)[\"']?(?: for {_NUM} {_TRN})?\.?$")
def _b_awaken(m):
    # "awaken X or Y" -> gain both status stacks together (KR: 흑구와 백구 깨움)
    return Effect(STACK, m.group(0), target="self", stack_name=_stk(m.group(1)),
                  awaken_with=_stk(m.group(2)), magnitude=1.0, max_stacks=1,
                  duration=_opt_dur(m, 3))


_ELEM = {"fire": 1, "water": 2, "wood": 3, "light": 4, "dark": 5}


@_leaf(rf"^Target (Dark |Fire |Water |Wood |Light )?damage taken \+{_NUM}% for {_NUM} {_TRN}(?:, up to {_NUM} {_STK})?\.?$")
def _b_target_dmg_taken(m):
    # an element prefix (e.g. "Dark") makes the debuff apply only to that element's hits
    elem = _ELEM.get((m.group(1) or "").strip().lower(), 0)
    return Effect(DEBUFF, m.group(0), target="target", stat=STAT_DMG_TAKEN,
                  magnitude=_f(m.group(2)), duration=int(m.group(3)),
                  max_stacks=int(m.group(4)) if m.group(4) else 1, element=elem)


@_leaf(rf"^Steal {_NUM}% of own base ATK from .+? for {_NUM} {_TRN}, and grant (double of )?it to own Buddy in Position {_NUM} for {_NUM} {_TRN}\.?$")
def _b_steal_grant_pos(m):
    # 루테닉스: steal N% of own base ATK from enemy, grant it (x2 for sigil) to the
    # ally in Position K as a flat ATK buff. (enemy-side steal is moot vs dummy.)
    mag = _f(m.group(1)) * (2 if m.group(3) else 1)
    return Effect(BUFF, m.group(0), target=f"position_{m.group(4)}",
                  stat=STAT_ATK_FLAT, of_base_atk=True, magnitude=mag,
                  duration=int(m.group(5)))


@_leaf(rf"^Heal (.+?) by {_NUM}% of (?:own|their) ATK(?: each turn for {_NUM} {_TRN}|,? for {_NUM} {_TRN})?(?:\. This effect can only trigger 1 time(?: per turn)?)?\.?$")
def _b_heal(m):
    # group 3 = "each turn for N" (heal-over-time); group 4 = "for N" (one-shot)
    return Effect(HEAL, m.group(0), target=_target(m.group(1)),
                  magnitude=_f(m.group(2)), duration=_opt_dur(m, 3))


@_leaf(rf"^Grant (?:a Barrier|all of own Buddies a Barrier|all of own Buddies) ?(?:a )?Barrier? ?{_NUM}% of own (ATK|Max\. HP) to (.+?) for {_NUM} turn\(s\)\.?$")
def _b_barrier_a(m):
    return Effect(BARRIER, m.group(0), target=_target(m.group(3)),
                  magnitude=_f(m.group(1)), of_max_hp="HP" in m.group(2),
                  duration=int(m.group(4)))


@_leaf(rf"^[Gg]rant (.+?) a Barrier {_NUM}% of own (ATK|Max\. HP) for {_NUM} turn\(s\)\.?$")
def _b_barrier_b(m):
    return Effect(BARRIER, m.group(0), target=_target(m.group(1)),
                  magnitude=_f(m.group(2)), of_max_hp="HP" in m.group(3),
                  duration=int(m.group(4)))


@_leaf(rf"^[Gg]rant (?:a |all of own Buddies a )?Barrier {_NUM}% of own (ATK|Max\. HP) to (.+?) for {_NUM} turn\(s\)\.?$")
def _b_barrier_to(m):
    return Effect(BARRIER, m.group(0), target=_target(m.group(3)),
                  magnitude=_f(m.group(1)), of_max_hp="HP" in m.group(2), duration=int(m.group(4)))


@_leaf(rf"^[Gg]rant a Shield to (.+?) equal to {_NUM}% of own (ATK|Max\. HP) for {_NUM} turn\(s\)\.?$")
def _b_shield(m):
    return Effect(BARRIER, m.group(0), target=_target(m.group(1)),
                  magnitude=_f(m.group(2)), of_max_hp="HP" in m.group(3),
                  duration=int(m.group(4)))


@_leaf(rf"^(Own|All of own Buddies'|[A-Z][\w' ]*?'s) base ATK \+{_NUM}%(?: for {_NUM} {_TRN})?(?:, up to {_NUM} {_STK})?\.?$")
def _b_self_base_atk(m):
    # "Own base ATK" -> self; "All of own Buddies' base ATK" -> 팀 전체(투명인간);
    # "Famido's base ATK" (named) -> the grantor
    who = m.group(1)
    tgt = "self" if who == "Own" else ("allies" if who == "All of own Buddies'" else "grantor")
    return Effect(BUFF, m.group(0), target=tgt, stat=STAT_BASE_ATK,
                  magnitude=_f(m.group(2)), duration=_opt_dur(m, 3),
                  max_stacks=int(m.group(4)) if m.group(4) else 1)


@_leaf(rf"^Own ATK \+{_NUM}%(?: for {_NUM} turn\(s\))?(?:, up to {_NUM} stack\(s\))?\.?$")
def _b_self_atk(m):
    return Effect(BUFF, m.group(0), target="self", stat=STAT_ATK,
                  magnitude=_f(m.group(1)), duration=_opt_dur(m, 2),
                  max_stacks=int(m.group(3)) if m.group(3) else 1)


@_leaf(rf"^Own base Max\. HP \+{_NUM}%\.?$")
def _b_self_base_hp(m):
    return Effect(BUFF, m.group(0), target="self", stat=STAT_BASE_MAX_HP, magnitude=_f(m.group(1)))


@_leaf(rf"^(Own|All of own Buddies') damage dealt \+{_NUM}%(?: for {_NUM} {_TRN})?(?:, up to {_NUM} {_STK})?\.?$")
def _b_dmg_dealt(m):
    tgt = "self" if m.group(1) == "Own" else "allies"
    return Effect(BUFF, m.group(0), target=tgt, stat=STAT_DMG_DEALT,
                  magnitude=_f(m.group(2)), duration=_opt_dur(m, 3),
                  max_stacks=int(m.group(4)) if m.group(4) else 1)


@_leaf(rf"^(Own|All of own Buddies') Basic Attack damage dealt \+{_NUM}%(?: for {_NUM} {_TRN})?(?:, up to {_NUM} {_STK})?\.?$")
def _b_basic_dmg(m):
    tgt = "self" if m.group(1) == "Own" else "allies"
    return Effect(BUFF, m.group(0), target=tgt, stat=STAT_BASIC_DMG_DEALT,
                  magnitude=_f(m.group(2)), duration=_opt_dur(m, 3),
                  max_stacks=int(m.group(4)) if m.group(4) else 1)


@_leaf(rf"^Own damage taken -{_NUM}% for {_NUM} turn\(s\)\.?$")
def _b_self_dmg_taken(m):
    return Effect(BUFF, m.group(0), target="self", stat=STAT_DMG_TAKEN,
                  magnitude=-_f(m.group(1)), duration=int(m.group(2)))


@_leaf(rf"^All of own ((?:(?:Fighter|Vandal|Support|Healer|Tank|Fire|Water|Wood|Light|Dark) )?Buddies)' ATK \+{_NUM}%(?: of own base ATK)?(?: for {_NUM} {_TRN})?\.?$")
def _b_team_atk(m):
    of_base = "of own base ATK" in m.group(0)
    return Effect(BUFF, m.group(0), target=_target("all of own " + m.group(1)),
                  stat=STAT_BASE_ATK if of_base else STAT_ATK, of_base_atk=of_base,
                  magnitude=_f(m.group(2)), duration=_opt_dur(m, 3))


@_leaf(rf"^All of own ((?:(?:Fighter|Vandal|Support|Healer|Tank|Fire|Water|Wood|Light|Dark) )?Buddies)' Max\. HP \+{_NUM}%(?: for {_NUM} {_TRN})?\.?$")
def _b_team_hp(m):
    return Effect(BUFF, m.group(0), target=_target("all of own " + m.group(1)),
                  stat=STAT_MAX_HP, magnitude=_f(m.group(2)), duration=_opt_dur(m, 3))


@_leaf(rf"^[Hh]eal (.+?) by {_NUM}% of (?:his|their|own) (?:Max\. )?HP(?: each turn for {_NUM} {_TRN}| for {_NUM} {_TRN})?\.?$")
def _b_heal_hp(m):
    # heal based on a % of (max) HP rather than ATK; approximate with target Max HP
    return Effect(HEAL, m.group(0), target=_target(m.group(1)), magnitude=_f(m.group(2)),
                  duration=_opt_dur(m, 3), of_max_hp=True)


@_leaf(rf"^[Hh]eal {_NUM}% of (?:his|their|own) (?:Max\. )?HP\.?$")
def _b_heal_hp_self(m):
    # no explicit target ("heal 25% of his HP") -> the lowest-HP ally (healer context)
    return Effect(HEAL, m.group(0), target="ally_lowest_hp", magnitude=_f(m.group(1)), of_max_hp=True)


# 자신 풀HP 조건은 더미전에서 피격 여부에 따라 달라 단순화 어려움 -> 인식만 (스테이지/HP추적 시 구현). §비고
@_leaf(r"^At full HP, .+$")
def _b_full_hp(m):
    return Effect(MARKER, m.group(0))


@_leaf(rf"^All of own Buddies' Triggered Skill effect \+{_NUM}% for {_NUM} {_TRN}\.?$")
def _b_team_trig(m):
    return Effect(BUFF, m.group(0), target="allies", stat=STAT_TRIGGERED_EFFECT,
                  magnitude=_f(m.group(1)), duration=int(m.group(2)))


@_leaf(rf"^(?:[Oo]wn |All of own Buddies' |[A-Z][\w']*?'s )?(?:Triggered [Ss]kill|EX Skill) effect \+{_NUM}%(?: for {_NUM} {_TRN})?(?:, up to {_NUM} {_STK})?\.?$")
def _b_eff_bonus(m):
    is_ex = "EX Skill" in m.group(0)
    tgt = "allies" if m.group(0).startswith("All of own Buddies") else "self"
    return Effect(BUFF, m.group(0), target=tgt,
                  stat=STAT_EX_EFFECT if is_ex else STAT_TRIGGERED_EFFECT,
                  magnitude=_f(m.group(1)), duration=_opt_dur(m, 2),
                  max_stacks=int(m.group(3)) if m.group(3) else 1)


@_leaf(rf"^Target damage taken \+{_NUM}% for {_NUM} turn\(s\)\.?$")
def _b_target_dmg_taken(m):
    return Effect(DEBUFF, m.group(0), target="target", stat=STAT_DMG_TAKEN,
                  magnitude=_f(m.group(1)), duration=int(m.group(2)))


@_leaf(rf"^Target damage dealt -{_NUM}% for {_NUM} turn\(s\)\.?$")
def _b_target_dmg_dealt(m):
    return Effect(DEBUFF, m.group(0), target="target", stat=STAT_DMG_DEALT,
                  magnitude=-_f(m.group(1)), duration=int(m.group(2)))


# 투명인간: 단일 대상 ATK 다운 (적 전체판은 _b_enemy_atk_down)
@_leaf(rf"^Target ATK -{_NUM}% for {_NUM} {_TRN}(?:, up to {_NUM} {_STK})?\.?$")
def _b_target_atk_down(m):
    return Effect(DEBUFF, m.group(0), target="target", stat=STAT_ATK,
                  magnitude=-_f(m.group(1)), duration=int(m.group(2)),
                  max_stacks=int(m.group(3)) if m.group(3) else 1)


@_leaf(rf"^There is a\(n\) {_NUM}% chance to Paralyze (.+?) for {_NUM} turn\(s\)\.?$")
def _b_paralyze(m):
    return Effect(CC, m.group(0), target=_target(m.group(2)), stat="paralyze",
                  duration=int(m.group(3)), chance=_f(m.group(1)))


@_leaf(rf"^Gain Taunt for {_NUM} turn\(s\)\.?$")
def _b_taunt(m):
    # 쿠모야마: 자신에게 조롱 -> 적이 이 탱커를 강제 타격
    return Effect(CC, m.group(0), target="self", stat="taunt", duration=int(m.group(1)))


@_leaf(rf"^(.+?) gains?(?:/gain)? Taunt(?: for {_NUM} {_TRN})?\.?$")
def _b_taunt_target(m):
    # 리카노: 적 목표물에게 조롱 -> 플레이어 단일/포지션 공격이 그 적에 딜집중
    return Effect(CC, m.group(0), target=_target(m.group(1)), stat="taunt",
                  duration=_opt_dur(m, 2) if _opt_dur(m, 2) > 0 else 1)


@_leaf(rf"^(?:Own )?EX Skill CD -{_NUM} turn\(s\)\.?$")
def _b_cd(m):
    return Effect(CD_MOD, m.group(0), target="self", magnitude=-_f(m.group(1)))


@_leaf(r"^[Gg]ain (\d+) actions?(?: \(only once per turn\))?\.?$")
def _b_gain_action(m):
    return Effect(EXTRA_ACTION, m.group(0), target="self", magnitude=float(m.group(1)))


@_leaf(rf"^[Gg]ain {_NUM} {_STK} of (.+?)(?: for {_NUM} {_TRN})?(?:, up to {_NUM} {_STK})?\.?$")
def _b_stack_gain_self(m):
    # no explicit "up to N" -> cap at the number gained (markers stay at 1)
    return Effect(STACK, m.group(0), target="self", stack_name=_stk(m.group(2)),
                  magnitude=_f(m.group(1)), duration=_opt_dur(m, 3),
                  max_stacks=int(m.group(4)) if m.group(4) else int(_f(m.group(1))))


@_leaf(rf"^{_NUM} {_STK} of (.+?)(?: for {_NUM} {_TRN})?(?:, up to {_NUM} {_STK})?\.?$")
def _b_bare_stack(m):
    # bare "N stack(s) of X ..." (e.g. after 'Grant all buddies') -> stack gain
    return Effect(STACK, m.group(0), target="self", stack_name=_stk(m.group(2)),
                  magnitude=_f(m.group(1)), duration=_opt_dur(m, 3),
                  max_stacks=int(m.group(4)) if m.group(4) else int(_f(m.group(1))))


@_leaf(rf"^(.+?) gains?(?:/gain)? {_NUM} {_STK} of (.+?)(?: for {_NUM} {_TRN})?(?:, up to {_NUM} {_STK})?(?:, for \d+(?:\.\d+)? {_TRN})?\.?$")
def _b_stack_gain_other(m):
    # 끝의 ", for N turn(s)" = 트리거 창(비캡처) — 이게 없으면 스택명이 "X for 2 turn(s),"로 오염됨 (다라완 Wavetime)
    return Effect(STACK, m.group(0), target=_target(m.group(1)), stack_name=_stk(m.group(3)),
                  magnitude=_f(m.group(2)), duration=_opt_dur(m, 4),
                  max_stacks=int(m.group(5)) if m.group(5) else int(_f(m.group(2))))


@_leaf(rf"^(.+?) gains?/gain (.+?)(?: for {_NUM} {_TRN})?\.?$")
def _b_mark_apply(m):
    return Effect(STACK, m.group(0), target=_target(m.group(1)),
                  stack_name=_stk(m.group(2)), magnitude=1.0, max_stacks=1,
                  duration=_opt_dur(m, 3))


@_leaf(rf"^[Rr]emove {_NUM} stack\(s\) of the following effect from self: (.+?)\.?$")
def _b_stack_remove_n(m):
    # remove N stacks of a named effect from self (partial, not clear-all)
    return Effect(STACK, m.group(0), target="self", stack_name=_stk(m.group(2)), magnitude=-_f(m.group(1)))


# 부분 제거 "Remove N stack(s) of X from Y" (투명인간 네온 표식 3 소모) — 전량 제거보다 먼저 매칭.
# 아래 _b_stack_remove의 `(.+?)`가 "3 stack(s) of Neon Mark"를 통째로 스택명으로 먹는 걸 막는다.
# (위 _b_stack_remove_n은 "...of the following effect from self:" 표현 전용이라 별개)
@_leaf(rf"^[Rr]emove {_NUM} {_STK} of (.+?) from (self|locked target\(s\)|locked target|target.*?)\.?$")
def _b_stack_remove_n_from(m):
    return Effect(STACK, m.group(0), target=_target(m.group(3)),
                  stack_name=_stk(m.group(2)), magnitude=-_f(m.group(1)))


@_leaf(r"^[Rr]emove (.+?) from (self|locked target\(s\)|locked target|target.*?)\.?$")
def _b_stack_remove(m):
    # "Remove X from self/target" clears all stacks of X (magnitude sentinel -9999)
    return Effect(STACK, m.group(0), target=_target(m.group(2)),
                  stack_name=_stk(m.group(1)), magnitude=-9999.0)


@_leaf(rf"^(.+?) lasts for {_NUM} turns?, up to {_NUM} stacks?\.?$")
def _b_stack_def(m):
    # stack lifetime/cap definition (no buff): just fixes the cap so build-up isn't clamped
    return Effect(STACK, m.group(0), target="self", stack_name=_stk(m.group(1)), magnitude=0.0,
                  max_stacks=int(_f(m.group(3))), duration=int(_f(m.group(2))),
                  condition=f"stack_cap:{_stk(m.group(1))}")


@_leaf(r"^[Tt]ransform (.+?) into (.+?)\.?$")
def _b_transform(m):
    return Effect(TRANSFORM, m.group(0), target="self",
                  stack_name=_stk(m.group(1)), into_stack=_stk(m.group(2)))


@_leaf(r"^[Gg]ain ([A-Z][\w' :·-]+?)\.?$")
def _b_gain_status(m):
    # bare "gain X" (no count) -> 1 stack of named status (binary marker)
    return Effect(STACK, m.group(0), target="self",
                  stack_name=_stk(m.group(1)), magnitude=1.0, max_stacks=1)


@_leaf(rf"^ATK -{_NUM}% for all enemies for {_NUM} turn\(s\)(?:, up to {_NUM} stack\(s\))?\.?$")
def _b_enemy_atk_down(m):
    return Effect(DEBUFF, m.group(0), target="all_enemies", stat=STAT_ATK,
                  magnitude=-_f(m.group(1)), duration=int(m.group(2)),
                  max_stacks=int(m.group(3)) if m.group(3) else 1)


@_leaf(rf"^When locked target\(s\) is/are with (.+?), own damage dealt \+{_NUM}%\.?$")
def _b_cond_dmg(m):
    # +Y% damage dealt while the attack target holds status X
    return Effect(COND_DMG, m.group(0), target="self",
                  stack_name=_stk(m.group(1)), magnitude=_f(m.group(2)))


@_leaf(r"^Sigil Passive.*:?$")
def _b_marker(m):
    return Effect(MARKER, m.group(0), stat="section")


@_leaf(r"^Will not trigger if .+$")
def _b_caveat_marker(m):
    # 오렘 "단, 피격 후 배리어가 사라지면 발동되지 않음" — 더미 모드에선 베리어가 소모되지 않아 무의미
    return Effect(MARKER, m.group(0))


@_leaf(r"^([A-Z][A-Za-z'\"’: .-]{1,38}):$")
def _b_stackdef(m):
    # stack-definition header ("Battle Spirit:") — keep the name so parse_skill_level can
    # attach the following per-stack body line ("EX Skill effect +6%, up to 9 stack(s)").
    return Effect(MARKER, m.group(0), stat="stack_def", stack_name=_stk(m.group(1)))


# ---- targeting vocabulary ----------------------------------------------

def _target(text: str) -> str:
    """Map a natural-language target phrase to a canonical token."""
    # drop trailing clauses that leak into a greedy target capture
    raw = re.split(r",? (?:each turn )?for \d+ turn", text)[0]
    raw = raw.split(" the same number of times")[0]
    raw = raw.split(" and own ")[0].split(", and ")[0]
    t = raw.strip().lower().strip('."” ')
    if "positions" in t and "enem" in t:
        return "all_enemies"
    if "position" in t and "enem" in t:
        return "target"
    if "all enemies" in t:
        return "all_enemies"
    if t in ("target", "target(s)", "the target", "locked target", "locked target(s)",
             "random target", "random target(s)", "a random enemy target",
             "random enemy target"):
        return "target"
    if "lowest hp" in t:
        return "ally_lowest_hp"
    # class/element-filtered buddies (전사/방해/보조/치료/수호 · 속성)
    for word in ("fighter", "vandal", "support", "healer", "tank",
                 "fire", "water", "wood", "light", "dark"):
        if f"{word} buddies" in t:
            return f"allies_{word}"
    if "buddies" in t:
        return "allies"
    if "allies" in t:                 # "all allies" / "all of own allies" (룬 힐·베리어)
        return "allies"
    # "self and <named grantor>" (다라완 파2: 방어한 아군 자신 + 다라완 둘 다에게)
    if re.match(r"^self and [A-Z][A-Za-z. ]+$", raw.strip()):
        return "self_and_grantor"
    if "self" in t or t in ("themselves", "themself", "itself"):
        return "self"
    # a named character (e.g. "Haniya", "Famido", "Jet Black", "Capt. Locke") = the
    # effect owner / grantor. 단어 1개~여러 개 영문명(공백 구분) 모두 인식.
    if re.match(r"^[A-Z][A-Za-z.]*(?: [A-Z][A-Za-z.]*)*$", text.strip()):
        return "grantor"
    return f"raw:{text.strip()}"


# 기리안 도장: "Revive a random Buddy and heal N% of his HP." 가 문장 분리되며 앞 절만 남는다.
# 부활은 더미전(아군 사망 없음)에서 의미 없어 no-op. 아래 _b_bare_status보다 먼저 잡지 않으면
# 상태이상 이름으로 오인돼 'Revive a random Buddy' 유령 스택이 생기고 로그에도 노출된다.
@_leaf(r"^Revive a random Buddy$")
def _b_revive_marker(m):
    return Effect(MARKER, m.group(0))


# registered LAST: a bare status name like "Afterglow" / "Afterglow for 2 turn(s)"
# (used after a "Grant all of own Buddies <status>" prefix). Pure-word phrases only
# -> lines with %, +, digits, ':' etc. never reach here.
@_leaf(rf"^([A-Z][\w' ·-]+?)(?: for {_NUM} {_TRN})?\.?$")
def _b_bare_status(m):
    return Effect(STACK, m.group(0), target="self", stack_name=_stk(m.group(1)),
                  magnitude=1.0, max_stacks=1, duration=_opt_dur(m, 2))


# ---- top-level parse ----------------------------------------------------

_CLAUSE_SUBJ = (r"(?:[Oo]wn|[Aa]ll|[Tt]arget|[Ss]elf|[Gg]ain|[Hh]eal|[Gg]rant"
                r"|[Rr]emove|[Cc]ancel|[Dd]eal|[Tt]here|[Ee]xcept|damage|Healing|HoT)\b")
_CLAUSE_AND = re.compile(rf",? and (?={_CLAUSE_SUBJ})")


def _split_clauses(text: str) -> list[str]:
    """Split a compound effect on ' and ' / ', and ' that begins a NEW effect clause
    (subject word follows). Avoids 'Positions 1, 3, and 5' (digit after 'and' = no
    subject) and 'of own base ATK' (no 'and' boundary)."""
    parts = _CLAUSE_AND.split(text)
    return [p.strip() for p in parts if p.strip()]


_PER_STACK = re.compile(
    r"^(.+?): Own Basic Attack damage dealt \+(\d+(?:\.\d+)?)% for \d+ turn\(s\), up to (\d+) stack\(s\)\.?$")


def parse_line(line: str) -> Effect:
    """Parse a single resolved description line into an Effect (recursive)."""
    line = line.strip()
    # "gain: <effect>" — self-grant of a (usually temporary) trigger/buff. Strip and parse body.
    if line[:6].lower() == "gain: ":
        inner = parse_line(line[6:])
        if inner.parsed:
            inner.raw = line
            return inner
    # bare "trigger: <effect>" leftover (split artifact) — strip and parse the body
    if line[:9].lower() == "trigger: ":
        inner = parse_line(line[9:])
        if inner.parsed:
            inner.raw = line
            return inner
    # named-stack definition: "「Stack」: Own Basic Attack damage dealt +N% for M turn(s), up to K stack(s)."
    # -> each stack confers basic-eff +N% (per-stack), and fixes the stack's cap to K.
    psm = _PER_STACK.match(line)
    if psm:
        return Effect(BUFF, line, target="self", stat=STAT_BASIC_DMG_DEALT,
                      magnitude=_f(psm.group(2)), max_stacks=int(psm.group(3)),
                      condition=f"per_stack:{_stk(psm.group(1))}")
    # team-element-count gate: ≥N of an element -> all allies get +X% damage dealt
    tem = _TEAM_ELEM_DMG.match(line)
    if tem:
        return Effect(BUFF, line, target="allies", stat=STAT_DMG_DEALT,
                      magnitude=_f(tem.group(3)),
                      condition=f"team_elem:{tem.group(1).lower()}:{int(_f(tem.group(2)))}")
    tgm2 = _TELEM_GATE.match(line)
    if tgm2:
        body = tgm2.group(3)
        inner = parse_line(body[:1].upper() + body[1:])
        if inner.parsed:
            return Effect(TRIGGER, line, condition=f"team_elem_gate:{tgm2.group(1).lower()}:{tgm2.group(2)}",
                          sub_effects=[inner])
    # "Grant all of own Buddies: <sub>" — delegate sub-effect to allies
    grm = _GRANT.match(line)
    if grm and grm.group(1):
        # delegated body may start lowercase mid-sentence ("when attacked,...");
        # capitalize so trigger patterns match. Only treat as a grant if it parses.
        body = grm.group(1)
        inner = parse_line(body[:1].upper() + body[1:])
        if inner.parsed:
            return Effect(TRIGGER, line, condition="grant_allies", target="allies",
                          sub_effects=[inner])
    # "At the start of battle, <sub>" (non-trigger form, e.g. gain stacks)
    if line.startswith("At the start of battle, ") and "trigger:" not in line:
        inner = parse_line(line[len("At the start of battle, "):])
        if inner.parsed:
            return Effect(TRIGGER, line, condition="on_battle_start", sub_effects=[inner])
    # team-coordination (다양수이): "Except self, when all of own [role] Buddies use [action], ..."
    aam = _ALL_ACTED.match(line)
    if aam:
        role = (aam.group(1) or "").strip() or "any"
        action = "basic" if "Basic Attack" in line else "ex"
        chance = float(aam.group(2)) if aam.group(2) else 100.0
        body = aam.group(3)
        # the body refers to 다양수이 by name = the caster (self): normalize so leaves match
        body = re.sub(r"^[A-Z][a-zA-Z]+'s ", "Own ", body)
        body = re.sub(r"^[A-Z][a-zA-Z]+ gains ", "Gain 1 stack of ", body)
        inner = parse_line(body[:1].upper() + body[1:])
        if inner.parsed:
            return Effect(TRIGGER, line, condition=f"all_acted:{role}:{action}",
                          chance=chance, sub_effects=[inner])
        return Effect(MARKER, line)
    # target-HP gated (카라트): "When locked target HP < 25%, BODY" / "when hitting target HP ≧ 50%, BODY"
    thm = _THP.match(line) or _HIT_HP.match(line)
    if thm:
        op = "lt" if thm.group(1) in ("<",) else "ge"
        val = float(thm.group(2))
        inner = parse_line(thm.group(3)[:1].upper() + thm.group(3)[1:])
        if inner.parsed:
            # a static "own damage dealt +Y%" -> conditional 주는딜 active while the HP gate holds
            if inner.kind == BUFF and inner.stat == STAT_DMG_DEALT and inner.target == "self":
                return Effect(COND_DMG, line, target="self", magnitude=inner.magnitude,
                              target_hp_op=op, target_hp_val=val)
            _apply_hp_gate(inner, op, val)        # gate every leaf (trigger subs / direct hits)
            return inner
        return Effect(MARKER, line)
    # stack-gated condition
    tgm = _TGATE.match(line)
    if tgm:
        subs = [parse_line(c) for c in _split_clauses(tgm.group(4))]
        event = _GATE_EVENT.get(tgm.group(3)) if tgm.group(3) else "on_attack"
        return Effect(TRIGGER, line, condition=event,
                      target_stack=_stk(tgm.group(1)), target_count=int(tgm.group(2)),
                      sub_effects=subs)
    twm = _TWITH.match(line)
    if twm:
        subs = [parse_line(c) for c in _split_clauses(twm.group(3))]
        if any(s.parsed for s in subs):
            # static "own damage dealt +Y%" with NO event = per-target conditional 주는딜 (COND_DMG):
            # +Y% only when attacking a target holding the status. As a triggered self-buff it would
            # over-apply to every target once fired. 파미도 전술 호령.
            if twm.group(2) is None and len(subs) == 1 and subs[0].kind == BUFF \
                    and subs[0].stat == STAT_DMG_DEALT and subs[0].target == "self":
                return Effect(COND_DMG, line, target="self",
                              stack_name=_stk(twm.group(1)), magnitude=subs[0].magnitude)
            event = _GATE_EVENT.get(twm.group(2)) if twm.group(2) else "on_attack"
            return Effect(TRIGGER, line, condition=event,
                          target_stack=_stk(twm.group(1)), target_count=1, sub_effects=subs)
    pm = _POISON_HIT.match(line)              # 최유희: 평타가 중독(DoT) 대상 적중 시 추가딜
    if pm:
        subs = [parse_line(c) for c in _split_clauses(pm.group(2))]
        if any(s.parsed for s in subs):
            return Effect(TRIGGER, line, condition="on_basic_attack", chance=_f(pm.group(1)),
                          target_stack="Poisoned", target_count=1, sub_effects=subs)
    dcm = _DEFEND_COUNTER.match(line)         # 최유희: 평타 피격 시 확률 도트 (방어마다 1회 무장)
    if dcm:
        body = dcm.group(2)
        inner = parse_line(body[:1].upper() + body[1:])
        if inner.parsed:
            return Effect(TRIGGER, line, condition="on_take_basic", chance=_f(dcm.group(1)),
                          once=True, sub_effects=[inner])
    ecm = _ECOUNT.match(line)
    if ecm:
        op = {"≧": "ge", ">=": "ge", "≦": "le", "<=": "le", "=": "eq"}[ecm.group(1)]
        body = ecm.group(3)
        inner = parse_line(body[:1].upper() + body[1:])
        if inner.parsed:
            return Effect(TRIGGER, line, condition=f"enemy_gate:{op}:{ecm.group(2)}", sub_effects=[inner])
    for rx, src in ((_REP_OWN, "own"), (_REP_TGT, "target"), (_REP_BASED, "own")):
        rm = rx.match(line)
        if rm:
            subs = [parse_line(c) for c in _split_clauses(rm.group(2))]
            if any(s.parsed for s in subs):
                return Effect(TRIGGER, line, condition="repeat",
                              repeat_stack=f"{src}:{_stk(rm.group(1))}", sub_effects=subs)
    rsm = _REP_SUFFIX.match(line)
    if rsm:
        inner = parse_line(rsm.group(1))
        if inner.parsed:
            src = "own" if rsm.group(2) == "own" else "target"
            return Effect(TRIGGER, line, condition="repeat",
                          repeat_stack=f"{src}:{_stk(rsm.group(3))}", sub_effects=[inner])
    awm = _ALL_WITH.match(line)
    if awm:
        subs = [parse_line(c) for c in _split_clauses(awm.group(3))]
        if any(s.parsed for s in subs):
            event = _GATE_EVENT.get(awm.group(2)) if awm.group(2) else "on_attack"
            if "Barrier" in awm.group(1):
                # 게임 실제 동작(인게임 검증): "아군 전체가 배리어 보유 시 자신이 [X] 시 발동" =
                # 아군 전체에 부여하고, 각 아군이 자기 배리어 보유 시 [X] 발동(자기 ATK 기준).
                # 오렘 충격역류: 쿠모야마가 자기 배리어 보유 중 피격되면 쿠모야마 ATK 50%로 반격.
                inner = Effect(TRIGGER, line, condition=event, self_barrier=True, sub_effects=subs)
                return Effect(TRIGGER, line, condition="grant_allies", sub_effects=[inner])
            return Effect(TRIGGER, line, condition=event, sub_effects=subs)
    pbm = _POS_BUDDY.match(line)
    if pbm:
        inner = parse_line(pbm.group(2))
        if inner.parsed:
            inner.target = f"position_{pbm.group(1)}"
            inner.raw = line
            return inner
    abm = _ALL_BUDDIES.match(line)
    if abm:
        inner = parse_line(abm.group(1))
        if inner.parsed:
            inner.target = "allies"
            inner.raw = line
            return inner
    rpm = _REPEAT.match(line)
    if rpm:
        subs = [parse_line(c) for c in _split_clauses(rpm.group(2))]
        return Effect(TRIGGER, line, condition="on_ex",
                      repeat_stack=_stk(rpm.group(1)), sub_effects=subs)
    wom = _WITH_OR.match(line)
    if wom:
        subs = [parse_line(c) for c in _split_clauses(wom.group(4))]
        event = _GATE_EVENT.get(wom.group(3)) if wom.group(3) else "on_attack"
        # OR-gate over two stacks encoded as "A|B"
        return Effect(TRIGGER, line, condition=event,
                      stack_name=f"{_stk(wom.group(1))}|{_stk(wom.group(2))}",
                      max_stacks=1, sub_effects=subs)
    wnm = _WITH_ONE.match(line)
    if wnm:
        body = wnm.group(2)
        inner = parse_line(body[:1].upper() + body[1:])
        if inner.parsed and inner.kind in (BUFF, DEBUFF):
            # conditional self-buff: active while the named stack is held
            inner.condition = f"while:{_stk(wnm.group(1))}"
            inner.raw = line
            return inner
    gm = _GATE.match(line)
    if gm:
        subs = [parse_line(c) for c in _split_clauses(gm.group(5))]
        event = _GATE_EVENT.get(gm.group(3)) if gm.group(3) else None
        # event-gates fire on that event while the stack threshold holds;
        # event-less gates fall back to a check-when-met condition.
        cond = event if event else f"{gm.group(1)}>={gm.group(2)}"
        return Effect(TRIGGER, line, condition=cond,
                      stack_name=_stk(gm.group(1)), max_stacks=int(gm.group(2)),
                      chance=float(gm.group(4)) if gm.group(4) else 100.0,
                      sub_effects=subs)
    # "On Basic Attack, deal damage ..." WITHOUT a "trigger:" keyword = an ADDED part
    # of the basic attack (세엔 "보통공격 시 추가 데미지"), judged as 보통공격 (평타뎀,
    # not 발동효과). 멍's "On Basic Attack, trigger: Deal..." keeps the trigger (발동) path.
    obm = _ON_BASIC_ADD.match(line)
    if obm:
        inner = parse_line(obm.group(1)[:1].upper() + obm.group(1)[1:])
        if inner.parsed and inner.kind == DAMAGE:
            inner.force_action = "basic"
            return Effect(TRIGGER, line, condition="on_basic_attack", sub_effects=[inner])
    oem = _ON_EX_ADD.match(line)
    if oem:
        inner = parse_line(oem.group(1)[:1].upper() + oem.group(1)[1:])
        if inner.parsed and inner.kind == DAMAGE:
            inner.force_action = "ex"
            return Effect(TRIGGER, line, condition="on_ex", sub_effects=[inner])
    # trigger prefixes (also try a capitalized line so lowercase split artifacts like
    # "when defending,..." / "when taking an action,..." still match the prefix list)
    cap = line[:1].upper() + line[1:]
    for pat, cond, spec in _TRIGGER_PATTERNS:
        m = pat.match(line) or (cap != line and pat.match(cap))
        if m:
            g = m.groups()
            chance, param, pos = 100.0, 0, 0
            if spec == "chance":
                chance = float(g[0])
            elif spec == "param":
                param = int(float(g[0]))
            elif spec == "pos":
                pos, param = int(g[0]), int(g[1])
            subs = [parse_line(c) for c in _split_clauses(g[-1])]
            # "N% chance to awaken X or Y" rolls EACH dog independently -> push the
            # chance onto the awaken effect and let the trigger always fire
            if spec == "chance" and len(subs) == 1 and subs[0].awaken_with:
                subs[0].chance = chance
                chance = 100.0
            return Effect(TRIGGER, line, condition=cond, chance=chance,
                          trigger_param=param, trigger_pos=pos, sub_effects=subs)
    # leaf actions
    for pat, build in _LEAF_BUILDERS:
        m = pat.match(line)
        if m:
            return build(m)
    return Effect(UNPARSED, line)


_POS_GRANT_HEADER = re.compile(rf"^Grant Buddy in Position \d+ for \d+ {_TRN}:$")


def parse_skill_level(desc: str, params: dict) -> list[Effect]:
    """Resolve placeholders and parse every line of one skill level."""
    resolved = resolve_placeholders(desc, params)
    out: list[Effect] = []
    lines = [ln.strip() for ln in resolved.split("\n")]
    skip_until_blank = False
    pending_def: str | None = None        # a "StackName:" header awaiting its per-stack body
    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            skip_until_blank = False
            pending_def = None
            continue
        # 멀티라인 "Grant Buddy in Position N for M turn(s):" 헤더 — 다음 빈 줄까지의 본문은
        # 그 포지션 동료 전용(방어 연계 niche)이라, 헤더가 통째로 흡수해 self 오발동을 막는다. §비고
        if skip_until_blank:
            continue
        if _POS_GRANT_HEADER.match(line):
            out.append(Effect(MARKER, line))
            skip_until_blank = True
            continue
        # split a line into sentences, but keep "This effect ..." qualifiers
        # attached to the clause they modify (e.g. "...counts as EX Skill damage")
        sentences: list[str] = []
        # split on sentence boundaries ". " before a capital, but not after the
        # "Max." abbreviation (e.g. "Own base Max. HP +15%")
        for s in re.split(r"(?<=[)%\w])(?<!Max)\. (?=[A-Z])", line):
            if s.startswith("This effect") and sentences:
                sentences[-1] = sentences[-1] + ". " + s
            else:
                sentences.append(s)
        for s in sentences:
            eff = parse_line(s)
            # "StackName:" header followed by a self-buff body -> a per-stack definition
            # (다양수이 전의: EX효과+6%×중첩, 최대 9). Each stack confers the buff's stat.
            if eff.kind == MARKER and eff.stat == "stack_def" and eff.stack_name:
                pending_def = eff.stack_name
            elif pending_def and eff.kind == BUFF and eff.target == "self" and eff.stat:
                eff.condition = f"per_stack:{pending_def}"
                eff.stack_name = pending_def
                pending_def = None
            out.append(eff)
    # 후처리: "When own X ≧ N, [효과]. On attack, remove X from self" 패턴(던컨 마도집중 등)에서
    # 제거 절이 문장 분리로 ≥N 게이트를 잃고 매 공격마다 발동(생기자마자 제거)하던 것을 교정한다.
    # 제거 트리거에 X≥N 게이트를 물리고, 같은 행동이 막 올린 스택이 자기 제거를 유발하지 않도록
    # 행동시작 스냅샷 기준(consume_gate)으로 판정한다.
    gates = {e.stack_name: e.max_stacks for e in out
             if e.kind == TRIGGER and e.stack_name
             and e.condition == f"{e.stack_name}>={e.max_stacks}"}
    if gates:
        for e in out:
            if e.kind == TRIGGER and e.condition == "on_attack" and not e.stack_name:
                rem = next((s for s in e.sub_effects if s.kind == STACK
                            and s.magnitude <= -9000 and s.stack_name in gates), None)
                if rem:
                    e.stack_name, e.max_stacks, e.consume_gate = rem.stack_name, gates[rem.stack_name], True
    # 후처리: 트리거 줄 '바로 다음'의 트리거 없는 스택 소모는 그 트리거에 속한 소모 효과다.
    # 게임 설명이 한 트리거의 효과를 두 줄로 쪼갠 형태 — 투명인간 passive1:
    #   "목표물 네온 표식 ≧3, 필살기 발동 시 120% 딜"  /  다음 줄 "네온 표식 3중첩 감소"
    # 트리거가 명시된 제거(모이루 "방어 시 ... 추격 제거")는 이미 자기 트리거를 가지므로 해당 없음.
    # 이게 없으면 소모가 패시브 상시효과로 새어 전투 시작 1회 no-op → 스택이 영원히 안 깎인다.
    absorbed: set[int] = set()
    for i in range(1, len(out)):
        eff, prev = out[i], out[i - 1]
        if (eff.kind == STACK and eff.magnitude < 0 and eff.stack_name
                and prev.kind == TRIGGER and prev.target_stack == eff.stack_name):
            prev.sub_effects.append(eff)
            absorbed.add(i)
    if absorbed:
        out = [e for i, e in enumerate(out) if i not in absorbed]
    return out
