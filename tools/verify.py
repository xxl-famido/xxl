"""전 XXL 캐릭터 스킬 검증 도구.

용법:
  python tools/verify.py            # 34종 감사표 (미파싱 수 + 상태)
  python tools/verify.py 10422      # 한 캐릭 정밀 덤프 (스킬 원문 + 효과 테이블 + 스모크)
  python tools/verify.py 10422 -en  # 영문 원문도 함께

감사표는 VERIFICATION_PLAN.md 추적 매트릭스의 근거. 정밀 덤프는 캐릭 1종 검증의
1~3단계(원문 읽기 / 파싱 점검 / 효과 의미 대조)를 한 화면에 모아 보여준다.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from woofia_sim.kit import resolve_kit                      # noqa: E402
from woofia_sim.harness import CharSpec, run_team           # noqa: E402
from woofia_sim.names import kr, stat_kr                    # noqa: E402

_DATA = Path(__file__).resolve().parents[1] / "data"
CHARS = json.loads((_DATA / "chars.json").read_text(encoding="utf-8"))
SKILLS = json.loads((_DATA / "skills.json").read_text(encoding="utf-8"))
IDS = [c for c in sorted(int(k) for k in CHARS) if 10401 <= c <= 10436]

SLOT_KR = {"basicAtk": "평타", "ultimate": "필살", "sigil": "룬필살",
           "passive0": "패시브1", "passive1": "패시브2", "passive2": "패시브3",
           "passive3": "패시브4", "passive4": "패시브5", "sigilPassive": "룬패시브"}


def _walk(effs, acc):
    for e in effs:
        acc.append(e)
        _walk(e.sub_effects, acc)


def _slots(kit):
    return [("평타", kit.basic), ("필살", kit.fatal)] + [(SLOT_KR.get(p.slot, p.slot), p) for p in kit.passives]


def audit():
    rows = []
    for cid in IDS:
        try:
            kit = resolve_kit(cid, None, 10, True)
        except Exception as ex:                                  # noqa: BLE001
            rows.append((cid, "?", -1, str(ex)[:30]))
            continue
        acc = []
        for _, sl in _slots(kit):
            _walk(sl.effects, acc)
        unp = sum(1 for e in acc if e.kind == "UNPARSED")
        rows.append((cid, kit.name, unp, ""))
    rows.sort(key=lambda r: (-(r[2]), r[0]))
    print("=== XXL 34종 파싱 감사 (미파싱 많은 순) ===")
    total = 0
    for cid, nm, unp, err in rows:
        flag = "ERR " + err if unp < 0 else ("✓ 완전파싱" if unp == 0 else f"미파싱 {unp}")
        print(f"  {cid}  {nm[:16]:16}  {flag}")
        total += max(unp, 0)
    clean = sum(1 for r in rows if r[2] == 0)
    print(f"\n총 미파싱 {total}개 · 완전파싱 {clean}/{len(IDS)}종")


def dump(cid: int, show_en: bool):
    kit = resolve_kit(cid, None, 10, True)
    raw = SKILLS.get(str(cid), {})
    print(f"════ {cid} {kit.name} · {kit.rarity}성 · class={kit.kind} element={kit.element} "
          f"· ATK {kit.atk:,} HP {kit.hp:,} · 필살CD {kit.fatal.cd} ════\n")
    for label, sl in _slots(kit):
        sd = raw.get(sl.slot, {})
        print(f"── [{label}] {sl.name}  (cd {sl.cd}) ──")
        lv = (sd.get("levels", {}) or {}).get("9") or (list(sd.get("levels", {}).values()) or [{}])[-1]
        if lv:
            from woofia_sim.effects import resolve_placeholders
            print("  설명:", resolve_placeholders(lv.get("desc_kr", ""), lv.get("params", {})).replace("\n", "\n        "))
            if show_en:
                print("  EN  :", resolve_placeholders(lv.get("desc_en", ""), lv.get("params", {})).replace("\n", "\n        "))
        acc = []
        _walk(sl.effects, acc)
        for e in acc:
            tag = "‼UNPARSED" if e.kind == "UNPARSED" else f"{e.kind}"
            bits = [f"target={e.target}", f"stat={e.stat}", f"mag={e.magnitude}"]
            if e.condition:
                bits.append(f"cond={e.condition}")
            if e.stack_name:
                bits.append(f"stack={kr(e.stack_name)}({e.max_stacks})")
            if e.chance and e.chance < 100:
                bits.append(f"chance={e.chance}%")
            if e.duration not in (-1, 0):
                bits.append(f"dur={e.duration}")
            print(f"    {tag:12} {' '.join(b for b in bits if not b.endswith('=None'))}")
            if e.kind == "UNPARSED":
                print(f"                 raw: {(e.raw or '')[:100]}")
        print()
    # 스모크: 단독 10턴
    print("── 스모크 (단독 10턴, 100%모드) ──")
    res = run_team([CharSpec(cid, position=1)], 1, 10, enemy_hits=5, force_proc=True)
    u = res.state.allies[0]
    print(f"  총딜 {u.damage_dealt:,.0f} · 힐 {u.healing_done:,.0f} · 베리어 {u.barrier_done:,.0f}")
    if res.state.unapplied:
        print("  미적용 효과:", dict(res.state.unapplied))

    # 트리거 버프 수신 검증: 제트블랙(10418, 보통공격 시 아군 전체 발동효과+24%) 동반 + 100%모드.
    # 테스트 캐릭의 발동(trigger) 데미지 hit이 그 버프를 받는지 + 채널 누수(평타/필살에 새는지) 확인.
    if cid != 10418:
        from collections import Counter
        r2 = run_team([CharSpec(cid, position=1), CharSpec(10418, position=2)], 1, 10,
                      enemy_hits=5, force_proc=True)
        hits = [ev for ev in r2.state.log if ev.actor_id == cid and ev.detail]
        by_act = Counter(ev.detail["act"] for ev in hits)
        trig = [ev for ev in hits if ev.detail["act"] == "발동"]
        got = sum(1 for ev in trig if any(c.get("by") == 10418 for c in ev.detail["eff"]))
        leaked = sum(1 for ev in hits if ev.detail["act"] != "발동"
                     and any(c.get("by") == 10418 for c in ev.detail["eff"]))
        print("── 트리거 버프 수신 (제트블랙 동반·100%) ──")
        print(f"  hit 유형: {dict(by_act)}")
        if trig:
            mark = "✓ 전부 수신" if got == len(trig) else f"‼ {len(trig)}개 중 {got}개만 수신"
            print(f"  발동 hit의 발동효과+24% 수신: {mark}")
        else:
            print("  발동(trigger) 데미지 없음 → 트리거 버프 수신 테스트 해당 없음")
        if leaked:
            print(f"  ‼ 발동효과가 평타/필살 채널로 누수: {leaked}개 (채널 분리 오류)")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    if not args:
        audit()
    else:
        dump(int(args[0]), "-en" in sys.argv)
