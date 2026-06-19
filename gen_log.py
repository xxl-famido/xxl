"""Generate a readable, fully-annotated 10-turn battle log to a file.

Edit TEAM below (CharSpec list) and run.  Logs every hit's formula plus each
ally's ATK-channel breakdown and key stacks/buffs per turn.

Run:  python gen_log.py   ->  10턴_상세로그.txt
"""
from __future__ import annotations

import random

from woofia_sim.effects import STAT_ATK, STAT_ATK_FLAT, STAT_BASE_ATK, STAT_DMG_DEALT
from woofia_sim.engine import (
    BattleState, make_dummy, make_unit_from_kit, parse_rotation,
    _ally_phase, _compute_hold_fatal, _fire_time_subs, _install_passives,
    _mark_fed_carries, _take_action, _tick_buffs, _tick_hots,
)
from woofia_sim.harness import CharSpec, auto_rotation, default_priority
from woofia_sim.kit import resolve_kit
from woofia_sim.names import kr, stat_kr


def buff_stacks(u):
    """버프로 모델링된 스택(같은 효과 N중첩, count>=2)을 '라벨+값%×N'로 표시.
    예: 파미도 쿼터백 = 기초ATK+7.5%×4, 이태호 sigil램프 = ATK+2%×N."""
    groups = {}
    for b in u.buffs:
        cnt, _ = groups.get(b.key, (0, None))
        groups[b.key] = (cnt + 1, b)
    out = []
    for cnt, b in groups.values():
        if cnt >= 2:
            out.append(f"{stat_kr(b.stat)}+{b.value:g}%×{cnt}")
    return out

# ── 편집: 팀 구성 (position=전열위치, rotation=행동) ──
TEAM = [
    CharSpec(10401, position=1),   # 아누비로스 (하이퍼캐리, P1 → 임부언 버프 수령)
    CharSpec(10410, position=2),   # 임부언 (P1 전용 서포터: CD초기화+재행동)
    CharSpec(10421, position=3),   # 파미도 (특이)
    CharSpec(10428, position=4),   # 리카노 (방해)
    CharSpec(10425, position=5),   # 하니엘 (버퍼)
]
MAX_TURN = 30
OUT: list[str] = []


def w(line: str = "") -> None:
    OUT.append(line)


def build(spec):
    kit = resolve_kit(spec.char_id, spec.investment(), spec.skill_level, spec.rune)
    slot = (spec.position - 1) if spec.position else 0
    prio = spec.priority if spec.priority is not None else default_priority(spec.char_id, kit.kind, slot + 1)
    u = make_unit_from_kit(kit, slot, priority=prio)
    u._kit = kit
    rot = spec.rotation if spec.rotation is not None else auto_rotation(kit)
    u.rotation_prefix, u.rotation_loop = parse_rotation(rot)
    return u


def atk_line(u, ref_base):
    base_r = sum(b.value for b in u.buffs if b.stat == STAT_BASE_ATK)
    atk_r = sum(b.value for b in u.buffs if b.stat == STAT_ATK)
    flats = [b for b in u.buffs if b.stat == STAT_ATK_FLAT]
    flat = sum(b.value for b in flats)
    dd = sum(b.value for b in u.buffs if b.stat == STAT_DMG_DEALT)
    cond = "; ".join(f"{kr(s)}일때+{bo:.0f}%" for s, bo, *_ in u.target_cond_dmg)
    extra = []
    if dd:
        extra.append(f"주는딜+{dd:.0f}%")
    if cond:
        extra.append(cond)
    flat_s = (" + 고정 " + f"{flat:,.2f}" + "(" + "; ".join(f"+{b.value:,.2f}" for b in flats) + ")") if flats else ""
    w(f"     {u.name}: ATK {u.atk_eff():,.2f} = 기본{u.base_atk:,}×(1+기초{base_r:.2f}%)×(1+ATK{atk_r:.2f}%){flat_s}"
      + (f"  | 주는딜버프: {', '.join(extra)}" if extra else ""))


def run():
    allies = [build(s) for s in TEAM]
    dummy = make_dummy(0)
    state = BattleState(allies=allies, enemies=[dummy], max_turn=MAX_TURN, rng=random.Random(0))
    for u in allies:
        _install_passives(u, state)
    for u in allies:
        _compute_hold_fatal(u)
    _mark_fed_carries(allies)

    w(f"════════ XXL WOOFIA 전투 시뮬 상세 로그 ({MAX_TURN}턴 / 타겟더미) ════════")
    order = sorted(allies, key=lambda x: x.priority)
    w("행동 순서(우선순위): " + " → ".join(f"{u.name}({u.priority:.2f})" for u in order))
    w("설정 Lv60/5성/육성도5/도장ON. 매 적턴 아군 전원 각 1대 피격 가정.")
    w("데미지 = ATK × 스킬% × 주는딜배율[버프] × 받는딜배율(in)")
    w("─" * 76)
    cum = {u.name: 0.0 for u in allies}

    while state.turn < state.max_turn:
        state.turn += 1
        for u in allies:
            if u.alive:
                _fire_time_subs(u, state)
            u.extra_actions = 0
            u.extra_granted = False
        w(f"\n━━━━━━━━ {state.turn}턴 ━━━━━━━━")
        b0 = len(state.log)
        _ally_phase(allies, state)
        for ev in state.log[b0:]:
            w(f"     {ev.actor} {ev.text}")
        w("  · ATK 구성:")
        for u in allies:
            atk_line(u, u.base_atk)
        units = []
        for u in allies:
            parts = [f"{kr(k)}={v}" for k, v in u.stacks.items() if v]
            parts += buff_stacks(u)            # 버프형 스택 (쿼터백 등)
            if parts:
                units.append(f"{u.name[:3]} " + ",".join(parts))
        st = "  · 스택: " + " | ".join(units)
        if dummy.stacks:
            st += f" | 더미 {','.join(f'{kr(k)}={v}' for k, v in dummy.stacks.items() if v)}"
        w(st)
        _tick_buffs(state)
        _take_action(dummy, state)
        _tick_buffs(state)
        _tick_hots(state)
        for u in allies:
            if u.alive and u.cd_remaining > 0:
                u.cd_remaining -= 1
        w("  · 누적딜: " + " | ".join(f"{u.name} {u.damage_dealt:,.2f}" for u in allies))
        sup = [u for u in allies if u.healing_done or u.barrier_done]
        if sup:
            w("  · 누적힐/베리어: " + " | ".join(
                f"{u.name} 힐{u.healing_done:,.2f}" + (f"/베리어{u.barrier_done:,.2f}" if u.barrier_done else "") for u in sup))

    total = sum(u.damage_dealt for u in allies)
    w("\n" + "═" * 76)
    w(f"최종 합계 ({MAX_TURN}턴)")
    for u in sorted(allies, key=lambda x: -(x.damage_dealt + x.healing_done + x.barrier_done)):
        extra = ""
        if u.healing_done:
            extra += f"  힐 {u.healing_done:,.2f}"
        if u.barrier_done:
            extra += f"  베리어 {u.barrier_done:,.2f}"
        w(f"   {u.name}: 딜 {u.damage_dealt:,.2f}{extra}")
    w(f"   총딜 {total:,.2f} | DPS {total / state.max_turn:,.2f}")

    with open("10턴_상세로그.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(OUT))
    print(f"wrote 10턴_상세로그.txt ({len(OUT)} lines)")


if __name__ == "__main__":
    run()
