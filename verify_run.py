"""Detailed per-turn verification: 파미도(우선순위1) + 이태호(우선순위2) vs dummy.

파미도가 먼저 공격 -> 더미에 전술 호령(Command Callout) 부여 -> 같은 턴 이태호
공격 시 '목표물이 전술 호령 보유 -> 주는딜 +15%' 적용 여부를 검증한다. 이태호는
전열(slot0)이라 매턴 피격되어 파미도 쿼터백 지휘선도 발동한다.

Run:  python verify_run.py
"""
from __future__ import annotations

import random

from woofia_sim.effects import (
    STAT_ATK, STAT_ATK_FLAT, STAT_BASE_ATK, STAT_BASIC_DMG_DEALT, STAT_DMG_DEALT,
    STAT_EX_EFFECT,
)
from woofia_sim.engine import (
    BattleState, make_dummy, make_unit_from_kit, parse_rotation,
    _compute_hold_fatal, _fire_time_subs, _install_passives, _take_action,
    _tick_buffs,
)
from woofia_sim.kit import resolve_kit
from woofia_sim.stats import Investment

INV = Investment(level=60, evo=5, compat=5)


def build(char_id, slot, rotation, priority):
    kit = resolve_kit(char_id, INV, skill_level=10, rune=True)
    u = make_unit_from_kit(kit, slot, priority=priority)
    u._kit = kit
    u.rotation_prefix, u.rotation_loop = parse_rotation(rotation)
    return u


def out_breakdown(u, target):
    """Explain the outgoing multiplier for a basic-action hit on `target`."""
    dd = u._sum(STAT_DMG_DEALT)
    cond = 0.0
    for stack, bonus in u.target_cond_dmg:
        if target.stacks.get(stack, 0) > 0:
            cond += bonus
    basic_eff = u._sum(STAT_BASIC_DMG_DEALT)
    parts = [f"주는딜 {dd:.0f}%"]
    if cond:
        parts.append(f"전술호령 +{cond:.0f}%")
    parts.append(f"평타효과 {basic_eff:.0f}%")
    total = (1 + (dd + cond) / 100) * (1 + basic_eff / 100)
    return f"(1+{dd + cond:.0f}%)x(1+{basic_eff:.0f}%) = {total:.2f}  [{' · '.join(parts)}]"


def run():
    famido = build(10421, 2, "평평방궁|평방궁", priority=1)   # 우선순위1: 먼저 침
    taeho = build(10423, 0, "궁공|공", priority=2)            # 우선순위2, 전열(피격)
    allies = [famido, taeho]
    dummy = make_dummy(0)
    state = BattleState(allies=allies, enemies=[dummy], max_turn=10,
                        rng=random.Random(0))
    for u in allies:
        _install_passives(u, state)
    for u in allies:
        _compute_hold_fatal(u)

    print(f"우선순위1 파미도 (P3, ATK {famido.base_atk})  /  우선순위2 이태호 (P1 전열, ATK {taeho.base_atk})")
    print(f"이태호 조건부주는딜 설치: {taeho.target_cond_dmg}  (파미도 부여)")
    print("=" * 76)

    while state.turn < state.max_turn:
        state.turn += 1
        t = state.turn
        for u in allies:
            if u.alive:
                _fire_time_subs(u, state)
        print(f"\n────── T{t} ──────")
        n0 = len(state.log)
        for u in sorted(allies, key=lambda x: x.priority):
            if not u.alive:
                continue
            u.extra_actions = 0
            u.extra_granted = False
            _take_action(u, state)
            g = 0
            while u.extra_actions > 0 and g < 5:
                u.extra_actions -= 1
                g += 1
                _take_action(u, state)
        print("  [아군 페이즈]  (전술호령 보유:", "O" if dummy.stacks.get("Command Callout", 0) else "X", ")")
        for ev in state.log[n0:]:
            print(f"     {ev.actor}: {ev.text}")
        _tick_buffs(state)
        n1 = len(state.log)
        _take_action(dummy, state)        # 더미 -> 이태호 피격
        _tick_buffs(state)
        for u in allies:
            if u.alive and u.cd_remaining > 0:
                u.cd_remaining -= 1
        # 이태호 평타 outgoing 분해 (전술호령 +15% 반영 확인)
        print(f"  [이태호 outgoing] {out_breakdown(taeho, dummy)}")

    print("\n" + "=" * 76)
    total = sum(u.damage_dealt for u in allies)
    for u in sorted(allies, key=lambda x: -x.damage_dealt):
        print(f"  {u.name}: {u.damage_dealt:,.0f} ({u.damage_dealt / total * 100:.1f}%)")
    print(f"총합 {total:,.0f} | DPS {total / state.max_turn:,.0f}")


if __name__ == "__main__":
    run()
