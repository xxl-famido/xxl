/**
 * 행동 계획 모델 계약: 플래너 기본 함수(전 동료 × 제단 환경)·칸 클릭·프리셋 5종·잠긴 턴 재조정·편성 변경 규칙·
 * 요약 파생이 v1 과 같다(새 기능 '모두 필살기'·요약·필살기 방식 3택은 성질 테스트). 핀·잠긴 턴 계약은 pins.test.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadV1, CHARS, CHARS_LIST } from './helpers/v1.js';
import { SCENARIOS, applyToStore, full, slot, ID, COND0, withAssistPullSlot } from './helpers/samples.js';
import { createStore } from '../src/core/store.js';
import * as L from '../src/core/plan.js';

const v1 = loadV1();
v1.exec("API.probe = cfg => Promise.resolve({ plan: {} }); API.simulate = () => Promise.resolve({ error: 'x' });");
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const clone = (v) => JSON.parse(JSON.stringify(v));
const F = (f1 = {}, on = [true, true, true]) => ({ 1: { on: on[0], off: f1 }, 2: { on: on[1], off: {} }, 3: { on: on[2], off: {} } });
const ENVS = {
  none: null,
  cdPlus: { on: true, floors: F({ 402: true, 1012: true, 1013: true }) },            // 402 적용 · 확률 감소 없음
  proc: { on: true, floors: F({}) },                                                 // 1012·1013 적용
  both: { on: true, floors: F({ 402: true }) },                                      // 402 + 확률 감소
  offFloor: { on: true, floors: F({ 402: true }, [false, false, false]) },           // 1층 꺼짐 → 영향 없음
};
function setEnv(altar, team = [null, null, null, null, null], turns = 30) {
  v1.setState(full({ team, altar, cond: { ...COND0, turns } }));
  return L.makeEnv({ chars: CHARS, altar });
}
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const randPlan = (n) => Array.from({ length: n }, () => ['평', '궁', '방'][Math.floor(rnd() * 3)]);

test('환경: cdPlus · 확률 감소 제단 판정 == v1', () => {
  for (const [k, a] of Object.entries(ENVS)) {
    const env = setEnv(a);
    assert.equal(env.cdPlus, v1.eval('cdPlus()'), k);
    assert.deepEqual(env.procIds, v1.eval('altarProcCdActive()'), k);
  }
});

test('플래너 기본 함수: 전 동료 × 제단 환경 × 턴 수 == v1', () => {
  for (const [ek, a] of Object.entries(ENVS)) {
    const env = setEnv(a);
    for (const m of CHARS_LIST) {
      const id = m.id, M = `CHARS[${id}]`;
      for (const n of [7, 13, 30]) {
        assert.deepEqual(L.fillPlan(m, '평', n, env), v1.eval(`fillPlan(${M}, '평', ${n})`), `fill ${id} ${ek}`);
        assert.deepEqual(L.fillPlan(m, '방', n, env), v1.eval(`fillPlan(${M}, '방', ${n})`));
        assert.deepEqual(L.defaultPlan(m, n, env), v1.eval(`defaultPlan(${M}, ${n})`), `default ${id} ${ek}`);
        assert.deepEqual(L.ult3Plan(m, n, '방'), v1.eval(`ult3Plan(${M}, ${n}, '방')`));
        assert.deepEqual(L.passiveDefendPlan(m, n, env), v1.eval(`passiveDefendPlan(${M}, ${n})`));
        assert.equal(L.canEarlyUlt(m, env), v1.eval(`canEarlyUlt(${M})`));
        const src = L.cdProcSources(m, env);
        assert.deepEqual(src, v1.eval(`cdProcSources(${M})`));
        const ab = Array.from({ length: n }, (_, k) => (k * 7) % 4);
        for (const [abv, abs] of [[null, 'null'], [ab, JSON.stringify(ab)]]) {
          assert.deepEqual(L.earlyUltPlan(m, n, abv, src, env), v1.eval(`earlyUltPlan(${M}, ${n}, ${abs}, cdProcSources(${M}))`), `early ${id} ${ek}`);
        }
        const p = randPlan(n * (m.actionsPerTurn || 1));
        for (const s of [null, src.length ? src : null]) {
          const ss = JSON.stringify(s);
          const ok2 = L.ultAvail(p, m, ab, s, env), ok1 = v1.eval(`(() => { const o = ultAvail(${JSON.stringify(p)}, ${M}, ${JSON.stringify(ab)}, ${ss}); return { ok: [...o], luck: o.luck }; })()`);
          assert.deepEqual([...ok2], ok1.ok, `ultAvail ${id} ${ek}`);
          assert.deepEqual(ok2.luck, ok1.luck);
          assert.deepEqual(L.normalizePlan(p.slice(), m, ab, s, env), v1.eval(`(() => { const x = ${JSON.stringify(p)}; normalizePlan(x, ${M}, ${JSON.stringify(ab)}, ${ss}); return x; })()`), `normalize ${id} ${ek}`);
          assert.equal(L.isPristinePlan(p, m, n, ab, s, env), v1.eval(`isPristinePlan(${JSON.stringify(p)}, ${M}, ${n}, ${JSON.stringify(ab)}, ${ss})`));
          const base = L.defaultPlan(m, n, env);
          assert.equal(L.isPristinePlan(base, m, n, ab, s, env), v1.eval(`isPristinePlan(${JSON.stringify(base)}, ${M}, ${n}, ${JSON.stringify(ab)}, ${ss})`));
          const ut = 2 + Math.floor(rnd() * (n - 2));
          const e2 = p.slice(), r2 = L.enforceCdDefend(e2, m, ut, ab, s, env);
          const e1 = v1.eval(`(() => { const x = ${JSON.stringify(p)}; const r = enforceCdDefend(x, ${M}, ${ut}, ${JSON.stringify(ab)}, ${ss}); return { x, r }; })()`);
          assert.deepEqual({ x: e2, r: r2 }, e1, `enforceCdDefend ${id} ${ek}`);
        }
        assert.equal(L.isUlt3Plan(p, m), v1.eval(`isUlt3Plan(${JSON.stringify(p)}, ${M})`));
        const anchor = 1 + Math.floor(rnd() * n);
        assert.deepEqual(L.reflowUlts(p.slice(), m, anchor, env), v1.eval(`(() => { const x = ${JSON.stringify(p)}; reflowUlts(x, ${M}, ${anchor}); return x; })()`));
        assert.deepEqual(L.reflowFromFirst(p.slice(), m, env), v1.eval(`(() => { const x = ${JSON.stringify(p)}; reflowFromFirst(x, ${M}); return x; })()`));
        const short = p.slice(0, 5);
        assert.deepEqual(L.padPlan(short.slice(), m, n, env), v1.eval(`padPlan(${JSON.stringify(short)}, ${M}, ${n})`));
      }
    }
  }
});

test('팀 의존 함수: allyBasicCounts · imbueonUltTurns · taehoFedTurns == v1', () => {
  const teams = [SCENARIOS.taehoFed.team, SCENARIOS.everything.team, SCENARIOS.fedCarry.team, SCENARIOS.zeto.team, SCENARIOS.taehoNotP1.team,
    [slot(ID.TAEHO), slot(ID.IMBUEON, { usePlan: true, plan: ['궁', '궁', '평', '궁', '평', '평', '궁', ...Array(23).fill('평')], ult: { mode: 'fixed', keepDef: true, assist: true } }), null, null, null]];
  for (const [ek, a] of Object.entries(ENVS)) {
    for (const t of teams) {
      const env = setEnv(a, t);
      for (const n of [10, 30]) {
        t.forEach((s, i) => {
          if (!s) return;
          assert.deepEqual(L.allyBasicCounts(t, i, n, env), v1.eval(`allyBasicCounts(team, ${i}, ${n})`), `ab ${ek}`);
          const f2 = L.taehoFedTurns(s, t, n, env), f1 = v1.eval(`taehoFedTurns(team[${i}], team, ${n})`);
          assert.deepEqual(f2 ? [...f2] : f2, f1);
        });
        assert.deepEqual([...L.imbueonUltTurns(t, n, env)], v1.eval(`imbueonUltTurns(team, ${n})`), `imbueon ${ek}`);
      }
    }
  }
});

test('플래너 칸 클릭: planClick == v1 renderPlanner onclick (연속 편집 · 방어 자동 배치 · 불가 되돌림)', () => {
  const cases = [
    { id: ID.RICANO, clicks: [[5, '궁'], [9, '궁'], [2, '방'], [5, '평'], [20, '궁']] },
    { id: ID.HITOHA, clicks: [[5, '궁'], [9, '궁'], [2, '궁'], [14, '궁'], [15, '방']] },
    { id: ID.MOIRU, clicks: [[7, '궁'], [9, '궁'], [16, '궁'], [3, '궁']] },
    { id: ID.TAEHO, clicks: [[1, '궁'], [3, '궁'], [6, '방'], [2, '궁']] },
    { id: ID.ZETO, clicks: [[10, '궁'], [20, '궁'], [0, '방']] },
    { id: ID.MATAYA, clicks: [[1, '궁'], [3, '궁'], [0, '방']] },
    { id: ID.LEO, clicks: [[2, '궁'], [5, '궁'], [8, '궁']], altar: ENVS.proc, ult: { mode: 'fixed', keepDef: true, assist: true } },
    { id: ID.BARD, clicks: [[3, '궁'], [4, '궁'], [9, '방']], altar: ENVS.both },
  ];
  for (const c of cases) {
    const team = [slot(c.id, { usePlan: true, ult: c.ult }), slot(ID.FAMIDO), slot(ID.HANIEL), null, null];
    if (!c.ult) delete team[0].ult;
    const turns = 20;
    const env = setEnv(c.altar || null, team, turns);
    let s2 = clone(team[0]);
    for (const [idx, a] of c.clicks) {
      const t2 = [s2, ...team.slice(1)];
      const pv = L.planView(s2, 0, t2, turns, env);
      const ti = Math.floor(idx / pv.apt);
      if (a === '궁' && pv.lockUlt[ti]) { assert.equal(L.planClick(s2, 0, t2, turns, idx, a, env).status, 'locked'); continue; }
      v1.toasts.length = 0;
      const p1 = v1.eval(`(() => { const s = team[0]; renderPlanner(s, CHARS[s.id]);
        $('#planner').onclick({ target: { closest: () => ({ dataset: { idx: '${idx}', a: '${a}' }, disabled: false }) } });
        return s.plan || null; })()`);
      const r = L.planClick(s2, 0, t2, turns, idx, a, env);
      if (r.plan) s2 = { ...s2, plan: r.plan, rotation: r.plan.join('') };
      assert.deepEqual(s2.plan || null, p1, `${c.id} click ${idx}${a}`);
      if (r.status === 'defended') assert.ok(v1.toasts.some((m) => m.includes('방어')), 'defended 토스트');
      if (r.status === 'impossible') assert.ok(v1.toasts.some((m) => m.includes('불가')), 'impossible 토스트');
    }
  }
});

test('프리셋 5종: 가용성 · 목표 계획(v1 조합) · 토글 복원 · 첫 필살기 당기기 ⇄ 확률 감소 가정', () => {
  const env0 = L.makeEnv({ chars: CHARS, altar: null });
  const envP = L.makeEnv({ chars: CHARS, altar: ENVS.proc });
  assert.deepEqual(L.PRESETS, ['allUlt', 'ult3', 'early', 'pdef', 'reflow']);
  assert.equal(L.presetAvailable('ult3', CHARS[ID.INVIS], env0), true);
  assert.equal(L.presetAvailable('ult3', CHARS[ID.RICANO], env0), false);
  assert.equal(L.presetAvailable('pdef', CHARS[ID.FAMIDO], env0), true);
  assert.equal(L.presetAvailable('early', CHARS[ID.LEO], env0), false);
  assert.equal(L.presetAvailable('early', CHARS[ID.LEO], envP), true);
  assert.equal(L.presetAvailable('early', CHARS[ID.MATAYA], envP), false);
  assert.equal(L.presetAvailable('allUlt', CHARS[ID.ZETO], env0), false);
  assert.equal(L.presetAvailable('reflow', CHARS[ID.TAEHO], env0), false);

  const st = createStore({ storage: mem(), chars: CHARS });
  applyToStore(st, { team: [slot(ID.FAMIDO), slot(ID.INVIS), slot(ID.LEO), slot(ID.MATAYA), slot(ID.TAEHO)], altar: ENVS.proc, cond: { ...COND0, turns: 13 } }, CHARS);
  // 목표 계획이 v1 조합과 같다(planLen = max(30, turns))
  setEnv(ENVS.proc, st.get().team, 13);
  assert.deepEqual(L.presetTarget('pdef', st.get().team[0], 0, st.get().team, 13, st.env()), v1.eval('passiveDefendPlan(CHARS[10421], 30)'));
  assert.deepEqual(L.presetTarget('ult3', st.get().team[1], 1, st.get().team, 13, st.env()), v1.eval('ult3Plan(CHARS[10437], 30)'));
  assert.deepEqual(L.presetTarget('early', st.get().team[2], 2, st.get().team, 13, st.env()), v1.eval('earlyUltPlan(CHARS[10406], 30, allyBasicCounts(team, 2, 30), cdProcSources(CHARS[10406]))'));

  // §9 갱신: 프리셋은 '직접 계획' 토글이 아니라 그 동료의 핀 묶음(줄 교체)이 되고 되돌리기 토큰을 돌려준다.
  // 구체화된 줄(pins.line)이 v1 프리셋 계획과 같아야 페이로드가 v1 과 같다.
  const tokP = st.pins.applyPreset(1, 'pdef');
  assert.ok(tokP);
  assert.deepEqual(st.pins.line(1), v1.eval('passiveDefendPlan(CHARS[10421], 30)'), '필살기 직전 방어 = v1 계획');
  assert.ok(Object.values(st.pins.row(1)).every((v) => v === '궁' || v === '방'), '규칙과 같은 보통 공격은 핀으로 찍지 않는다');
  st.pins.revert(tokP);
  assert.equal(st.pins.count(), 0, '토큰으로 되돌림');
  // 첫 필살기 당기기 → 레오 3·6·9·12.
  // [2026-09-28 성공 가정 정책] 전에는 프리셋이 성공 가정을 스스로 켰다(v1 규칙). 이제 성공 가정은 사용자만 켜고 끈다 —
  //   꺼져 있으면 프리셋 불가(null, UI 는 버튼을 흐리게 + 이유), 켜져 있으면 핀만 찍고 되돌려도 가정은 그대로.
  assert.equal(st.pins.applyPreset(3, 'early'), null, '성공 가정이 꺼져 있으면 불가');
  assert.equal(L.ultOf(st.get().team[2]).assist, false, '성공 가정을 스스로 켜지 않는다');
  st.plan.setAssist(3, true);
  const tokE = st.pins.applyPreset(3, 'early');
  assert.ok(tokE);
  assert.deepEqual(st.pins.line(3).map((x, i) => (x === '궁' ? i + 1 : 0)).filter((t) => t && t <= 13), [3, 6, 9, 12]);
  st.pins.revert(tokE);
  assert.equal(L.ultOf(st.get().team[2]).assist, true, '되돌려도 사용자가 켠 가정은 그대로');
  assert.equal(st.pins.count(), 0);
  // 자동 + 성공 가정 = 핀 없이도 같은 리듬(FEEDBACK_CASES #27)
  assert.deepEqual(st.pins.line(3).map((x, i) => (x === '궁' ? i + 1 : 0)).filter((t) => t && t <= 13), [3, 6, 9, 12], '자동 + 성공 가정 = 3·6·9·12');
  st.plan.setAssist(3, false);
  assert.equal(st.pins.line(3), null, '성공 가정을 끄면 줄 없음(엔진 기본 규칙)');
  // 3턴마다(투명인간 2쿨): 규칙 채움이 끼워 넣을 궁 자리는 평 핀으로 막아 v1 ult3Plan 과 같은 줄
  st.pins.applyPreset(2, 'ult3');
  assert.deepEqual(st.pins.line(2), v1.eval('ult3Plan(CHARS[10437], 30)'));
  assert.equal(st.pins.applyPreset(2, 'pdef'), null, '대상이 아닌 동료');
  // 간격 맞추기: 지금 줄(핀 + 규칙 채움) 기준 v1 reflowFromFirst
  st.pins.set(4, 1, '궁'); st.pins.set(7, 1, '방');
  const before = st.pins.line(1).slice();
  st.pins.applyPreset(1, 'reflow');
  assert.deepEqual(st.pins.line(1), v1.eval(`(() => { const x = ${JSON.stringify(before)}; reflowFromFirst(x, CHARS[10421]); return x; })()`));
  assert.equal(st.pins.undo(), 'preset:reflow:1');
  assert.deepEqual(st.pins.line(1), before, 'undo 스택');
});

test('[신규] 모두 필살기: 쿨이 도는 턴마다 필살기', () => {
  const env0 = L.makeEnv({ chars: CHARS, altar: null });
  const envP = L.makeEnv({ chars: CHARS, altar: ENVS.proc });
  for (const m of CHARS_LIST) {
    if (m.singleUlt || (m.actionsPerTurn || 1) > 1) continue;
    const p = L.allUltPlan(m, 30, null, null, env0);
    const ok = L.ultAvail(p, m, null, null, env0);
    p.forEach((x, i) => { if (ok[i]) assert.equal(x, '궁', `${m.id} ${i + 1}턴은 쿨이 돌았으니 궁`); });
    if (!HOLD(m)) assert.deepEqual(p, L.fillPlan(m, '평', 30, env0), `${m.id}: 일반 동료는 기본 주기와 같다`);
  }
  const mat = L.allUltPlan(CHARS[ID.MATAYA], 10, null, null, env0);
  assert.deepEqual(mat, ['평', '궁', '궁', '궁', '궁', '궁', '궁', '궁', '궁', '궁'], '마타야(1쿨): 2턴부터 매 턴');
  const tae = L.allUltPlan(CHARS[ID.TAEHO], 3, null, null, env0);
  assert.deepEqual(tae, ['궁', '평', '궁', '평', '궁', '평'], '이태호: 턴당 첫 행동 궁');
  const leoA = L.allUltPlan(CHARS[ID.LEO], 13, null, L.cdProcSources(CHARS[ID.LEO], envP), envP);
  assert.ok(leoA.filter((x) => x === '궁').length > L.fillPlan(CHARS[ID.LEO], '평', 13, env0).filter((x) => x === '궁').length, '가정을 켜면 더 자주');
  // 스토어: §9 갱신 — 토글 대신 핀 묶음 + 되돌리기 토큰
  const st = createStore({ storage: mem(), chars: CHARS });
  applyToStore(st, { team: [slot(ID.MATAYA), null, null, null, null] }, CHARS);
  const tok = st.pins.applyPreset(1, 'allUlt');
  assert.equal(st.pins.line(1).filter((x) => x === '궁').length, 29);
  st.pins.revert(tok);
  assert.equal(st.pins.line(1), null, '핀 없음 = 규칙(줄을 보내지 않음)');
});
const HOLD = (m) => m.id === ID.MATAYA;

// §9 갱신: 필살기 방식은 auto|strict|asap 3택. '직접 지정'(manual = v1 usePlan)은 방식이 아니라 핀으로 옮겨진다.
test('필살기 방식 3택 ↔ v1 필드 (옛 manual 은 auto 로 읽힘)', () => {
  const s = slot(ID.RICANO);
  assert.equal(L.ultModeOf(s), 'auto');
  L.setUltMode(s, 'strict'); assert.equal(L.ultModeOf(s), 'strict'); assert.deepEqual(s.ult, { mode: 'strict', keepDef: true });
  L.setUltMode(s, 'asap'); assert.equal(L.ultModeOf(s), 'asap');
  L.setUltMode(s, 'manual'); assert.equal(L.ultModeOf(s), 'auto'); assert.ok(!s.ult, '옛 manual → auto(fixed 기본)');
  const legacy = slot(ID.RICANO, { usePlan: true, plan: ['궁'], ult: { mode: 'strict', keepDef: true } });
  assert.equal(L.ultModeOf(legacy), 'strict', 'usePlan+strict 는 strict 로 보인다(계획은 핀)');
  L.setUltMode(legacy, 'auto'); assert.ok(!('usePlan' in legacy) && !('plan' in legacy), '남은 v1 계획 필드 정리');
  assert.equal(L.ultModeOf(slot(ID.RICANO, { usePlan: true, plan: ['궁'], ult: { mode: 'asap' } })), 'asap');
});

test('완전 수동 재조정: reconcileAll · materialize · missingActors == v1', () => {
  const team = SCENARIOS.default.team;
  const probeA = { plan: { 1: { seq: [{ p: 1, a: '평' }, { p: 2, a: '궁' }], budget: { 1: 1, 2: 1 } }, 2: { seq: [{ p: 1, a: '평' }, { p: 3, a: '평', x: true }], budget: { 1: 2, 3: 1 } }, 3: { seq: [{ p: 4, a: '방' }], budget: { 4: 1 } } } };
  const probeB = { plan: { 1: { budget: { 1: 2, 2: 1 } }, 2: { budget: { 1: 1, 3: 0 } }, 3: { budget: { 4: 1, 5: 2 } } } };
  const plans0 = { 1: [{ p: 1, a: '궁' }, { p: 2, a: '평' }], 2: [{ p: 1, a: '평' }, { p: 1, a: '방' }, { p: 3, a: '평' }] };
  v1.setState(full({ team, advOn: true, turnPlans: plans0, cond: { ...COND0, turns: 3 } }));
  const man = { on: true, plans: clone(plans0), touched: new Set([1, 2]), teamSig: '', prevBudget: {}, probe: null };
  // 1) 첫 프로브 = 기준선 · 빈 턴 채움
  // §9 갱신: v1 advMaterialize(완전 수동 켜짐 동안 빈 턴 자동 채움)는 없어졌다 — 같은 채움을 turnSeqFromProbe 로 재현(= lockAllFromProbe 경로).
  v1.exec(`advProbe = ${JSON.stringify(probeA)}; advMaterialize(); advReconcileAll();`);
  man.plans[3] = L.turnSeqFromProbe(probeA, 3);
  L.reconcileAll(man, probeA);
  assert.deepEqual(man.plans, v1.eval('turnPlans'));
  assert.deepEqual(man.prevBudget, v1.eval('advPrevBudget'));
  // 2) 예산 변화 → 늘어난 만큼 붙이고 줄어든 꼬리를 뺀다
  v1.exec(`advProbe = ${JSON.stringify(probeB)}; advReconcileAll();`);
  const r = L.reconcileAll(man, probeB);
  assert.deepEqual(man.plans, v1.eval('turnPlans'));
  assert.deepEqual(man.prevBudget, v1.eval('advPrevBudget'));
  assert.ok(r.added > 0 && r.removed > 0);
  // 3) 직접 편집 턴(= v2.1 잠긴 턴)에 없는 동료 — §9 갱신: 인자가 manual 객체 → locked
  assert.deepEqual(L.missingActors({ 1: man.plans[1], 2: man.plans[2] }, team, 3, CHARS), v1.eval('advMissingActors()'));
  assert.deepEqual(L.plansFromProbe(probeA, 3), { 1: [{ p: 1, a: '평' }, { p: 2, a: '궁' }], 2: [{ p: 1, a: '평' }], 3: [{ p: 4, a: '방' }] });
});

// §9 갱신: 완전 수동 켜기(refresh·자동 채움) 대신 '모든 턴 고정'(lockAllFromProbe) — 결과 페이로드는 v1 완전 수동과 같은 모양.
test('스토어 잠긴 턴: lockAllFromProbe → 전 턴 잠김 → prepareRun cfg 는 turnPlans 만(가짜 엔진)', async () => {
  const api = { probe: async (cfg) => {
    const plan = {};
    for (let t = 1; t <= cfg.turns; t++) plan[t] = { seq: [...cfg.team.map((s) => ({ p: s.position, a: '평' })), { p: 1, a: '평', x: true }], budget: {}, exec: null };
    return { plan };
  } };
  const st = createStore({ storage: mem(), chars: CHARS, api });
  applyToStore(st, { team: SCENARIOS.default.team, cond: { ...COND0, turns: 3 } }, CHARS);
  const pr = await st.probe();
  assert.equal(st.get().probe, pr);
  assert.equal(st.pins.lockAllFromProbe(pr), 3);
  assert.equal(st.get().locked[2].length, 5, '엔진 자동 행동(x)은 빼고 잠근다');
  assert.ok(st.pins.lockTurn(2, st.get().locked[2].slice(0, 4)));
  assert.equal(st.pins.canUndo(), true);
  const { cfg, warnings } = await st.prepareRun();
  assert.deepEqual(cfg.turnOrders, {});
  assert.equal(Object.keys(cfg.turnPlans).length, 3);
  assert.ok(warnings.some((w) => w.key === 'run.manualMissing'), '잠긴 턴에 빠진 동료 경고');
  st.pins.unlockTurn(3);
  assert.deepEqual(Object.keys(st.buildCfg({ mode: 'run' }).turnPlans), ['1', '2'], '잠금 해제한 턴은 규칙으로');
});

test('편성 변경: 빼기/넣기/교체가 v1 과 같은 규칙(연동·예외 턴·타임라인·우선순위·임부언 1번 금지)', () => {
  const sc = SCENARIOS.everything;
  v1.setState(full(sc));
  v1.exec('benchCache = {}; advTeamSig = advTeamFingerprint();');
  const st = createStore({ storage: mem(), chars: CHARS });
  applyToStore(st, sc, CHARS);
  // §9 갱신: v1 직접 계획은 핀(자리 기준)으로, 타임라인은 잠긴 턴으로 비교한다 — 슬롯의 usePlan/plan 은 v2.1 에 없고,
  // 그 대신 구체화된 줄(effectiveTeam rotation)이 v1 계획 rotation 과 같아야 한다(빼고 다시 넣으면 핀 줄도 복원).
  const strip = (t) => t.map((x) => { if (!x) return null; const n = { ...x }; delete n.usePlan; delete n.plan; n.rotation = ''; return n; });
  const cmp = (label) => {
    const s = st.get();
    assert.deepEqual(s.team, strip(v1.eval('team')), `${label}: team`);
    // [2026-09-28 #27] 핀 없는 자동 + 성공 가정(쿨감 제단) 동료는 당겨진 줄 — 의도적 차이(helpers/samples.js withAssistPullSlot, 임부언 fed carry 제외)
    const env = st.env(), imb = s.team.some((x) => x && x.id === ID.IMBUEON);
    const want = v1.eval("team.map(s => s ? (s.usePlan ? planRotation(s, 30) : '') : null)").map((r, i) => {
      const x = s.team[i];
      if (r !== '' || !x || (imb && i === 0 && x.id !== ID.IMBUEON)) return r;
      return withAssistPullSlot({ id: x.id, rotation: null, ult: L.ultOf(x) }, env, +s.cond.turns).rotation ?? '';
    });
    assert.deepEqual(st.effectiveTeam().map((x) => (x ? x.rotation : null)), want, `${label}: 줄(rotation)`);
    assert.deepEqual(L.normalizeSyncGroups(s.sync), v1.eval('normalizeSyncGroups(syncGroups)'), `${label}: sync`);
    assert.deepEqual(s.overrides, v1.eval('turnOverrides'), `${label}: overrides`);
    assert.deepEqual(s.locked, v1.eval('turnPlans'), `${label}: turnPlans → locked`);
  };
  // 앵커(P3 욱영) 빼기 → 그룹 해제 · 같은 동료 다시 넣기 → 복원
  v1.exec('removeFromTeam(2)'); st.team.remove(2); cmp('remove anchor');
  v1.exec('removeFromTeam(3)'); st.team.remove(3); cmp('remove member');
  v1.exec(`addToTeam(${ID.UK}, null)`); st.team.add(ID.UK); cmp('re-add anchor');
  v1.exec(`addToTeam(${ID.MATAYA}, 3)`); st.team.add(ID.MATAYA, 3); cmp('re-add member');
  v1.exec('removeFromTeam(1)'); st.team.remove(1); cmp('remove imbueon');
  v1.exec(`addToTeam(${ID.LEO}, 1)`); st.team.add(ID.LEO, 1); cmp('add new (priority 뒤)');
  // 임부언은 1번 자리 불가
  const t0 = createStore({ storage: mem(), chars: CHARS });
  applyToStore(t0, { team: [null, slot(ID.RICANO), slot(ID.FAMIDO), slot(ID.LEO), slot(ID.HANIEL)] }, CHARS);
  assert.deepEqual(t0.team.add(ID.IMBUEON), { ok: false, at: -1, reason: 'imbueonP1' });
  // 교체: 포지션 기준 설정이 동료를 따라간다
  const sw = createStore({ storage: mem(), chars: CHARS });
  applyToStore(sw, SCENARIOS.matayaSync, CHARS);
  sw.set({ overrides: { 4: [1, 2, 3] } });
  assert.equal(sw.team.swap(0, 2).ok, true);
  assert.equal(sw.get().team[2].id, ID.MATAYA);
  assert.deepEqual(sw.get().sync, [{ anchor: 2, members: [{ p: 3, order: 'before', base: 'defend' }], miss: 'asap' }]);
  assert.deepEqual(sw.get().overrides, { 4: [3, 2, 1] });
  const im = createStore({ storage: mem(), chars: CHARS });
  applyToStore(im, SCENARIOS.default, CHARS);
  assert.equal(im.team.swap(0, 1).ok, false, '임부언을 1번으로 옮길 수 없다');
});

test('연동 편집 · 욱영 프리셋 == v1', () => {
  const team = [slot(ID.MATAYA), slot(ID.UK), slot(ID.RICANO), null, null];
  v1.setState(full({ team }));
  v1.exec('applySyncPreset("uk")');
  const r = L.applySyncPreset([], team, 'uk');
  assert.deepEqual(r.groups, v1.eval('syncGroups'));
  assert.deepEqual(r.groups[0].members.map((m) => `${m.p}${m.base}`), ['1basic', '3basic']);
  // v1 initAltar 핸들러 본문과 같은 편집을 setSyncGroup 으로 재현해 단계마다 비교
  const V1OPS = {
    setBase: (p, b) => `setSyncGroup(0, g => { const m = g.members.find(x => x.p === ${p}); if (!m) return; const chosen = m.other; if ('${b}' === 'fatal') delete m.base; else { m.base = '${b}'; m.order = 'before'; } if (chosen) m.other = chosen; })`,
    setOther: (p, o) => `setSyncGroup(0, g => { const m = g.members.find(x => x.p === ${p}); if (m) m.other = '${o}' === 'hold' ? 'hold' : 'own'; })`,
    setMiss: (v) => `setSyncGroup(0, g => { g.miss = '${v}' === 'asap' ? 'asap' : 'wait'; })`,
    setOrder: (p, o) => `setSyncGroup(0, g => { const m = g.members.find(x => x.p === ${p}); if (m) m.order = '${o}' === 'after' ? 'after' : 'before'; })`,
    toggleMember: (p) => `setSyncGroup(0, g => { const k = g.members.findIndex(m => m.p === ${p}); if (k >= 0) g.members.splice(k, 1); else g.members.push({ p: ${p}, order: 'before' }); })`,
    setAnchor: (p) => `setSyncGroup(0, g => { g.anchor = ${p}; g.members = g.members.filter(m => m.p !== ${p}); })`,
  };
  const steps = [['setBase', 1, 'defend'], ['setOther', 1, 'hold'], ['setMiss', 'asap'], ['setBase', 1, 'fatal'], ['setOther', 1, 'own'], ['setOrder', 1, 'after'],
    ['setBase', 3, 'defend'], ['setOrder', 3, 'after'], ['toggleMember', 3], ['toggleMember', 4], ['setAnchor', 1]];
  let gs = r.groups;
  for (const [op, ...args] of steps) {
    gs = L.syncOps[op](gs, 0, ...args);
    v1.exec(V1OPS[op](...args));
    assert.deepEqual(gs, v1.eval('normalizeSyncGroups(syncGroups)'), `${op}(${args})`);
  }
  assert.deepEqual(gs, [{ anchor: 1, members: [{ p: 4, order: 'before' }], miss: 'asap' }]);
});

test('요약 파생 · 변경 표식 · 행동 순서', () => {
  const st = createStore({ storage: mem(), chars: CHARS });
  applyToStore(st, SCENARIOS.default, CHARS);
  const s = st.get();
  v1.setState(full(SCENARIOS.default));
  assert.deepEqual(L.deriveOrder(s), v1.eval('teamOrder().map(o => CHARS[o.s.id].name)'));
  assert.equal(L.summary.order(s).key, 'plan.sum.order');
  assert.deepEqual(L.summary.exceptions(s), { key: 'plan.sum.exceptions.none', vars: {} });
  assert.deepEqual(L.summary.sync(s), { key: 'plan.sum.sync.none', vars: {} });
  assert.equal(L.summary.tdmg(s).key, 'cond.tdmg.sum.off');
  assert.equal(L.summary.altar(s).key, 'cond.altar.sum.off');
  // §9 갱신: isDefault.manual → isDefault.pins · isDefault.locked
  for (const k of ['order', 'ults', 'step1', 'exceptions', 'sync', 'pins', 'locked', 'plan', 'tdmg', 'altar']) assert.equal(L.isDefault[k](s), true, `isDefault.${k}`);
  // 2026-09-28: 적 공격 대상 수 기본값 '5' → 'all'(사용자 지시). SCENARIOS.default 는 v1 대조용이라 v1 초기값 '5'(COND0)를 유지 →
  // cond 는 '5' 에서 변경 표식이 켜지고, 'all' 로 바꾸면 기본값이 된다.
  assert.equal(L.isDefault.cond(s), false, 'isDefault.cond (enemyHits 5)');
  assert.equal(L.isDefault.cond({ ...s, cond: { ...s.cond, enemyHits: 'all' } }), true, 'isDefault.cond (enemyHits all)');
  assert.equal(L.COND_DEFAULTS.enemyHits, 'all');
  applyToStore(st, SCENARIOS.everything, CHARS);
  const e = st.get();
  // §9 갱신: 일부 턴만 잠긴 상태는 '완전 수동' 요약이 아니라 규칙 요약 + 핀·잠긴 턴 수
  assert.equal(L.summary.order(e).key, 'plan.sum.order');
  assert.equal(L.summary.order(e).vars.locked, 2);
  assert.ok(L.summary.order(e).vars.pins > 0);
  assert.deepEqual(L.summary.exceptions(e), { key: 'plan.sum.exceptions', vars: { n: 1, turns: [3] } });
  assert.equal(L.summary.sync(e).vars.n, 1);
  assert.deepEqual(L.summary.tdmg(e), { key: 'cond.tdmg.sum.range', vars: { pct: 20, min: 5, max: 20, hits: 3 } });
  assert.deepEqual(L.summary.altar(e).vars.floors, 3);
  assert.equal(L.summary.altar(e).vars.cdPlus, 1);
  assert.equal(L.summary.cond(e).vars.incoming, 20);
  for (const k of ['order', 'exceptions', 'sync', 'pins', 'locked', 'plan', 'cond', 'tdmg', 'altar']) assert.equal(L.isDefault[k](e), false, `!isDefault.${k}`);
  assert.equal(L.isDefault.ult(e.team[4]), true);
  assert.equal(L.isDefault.ult(e.team[2]), false);
  // §9 갱신: 패널을 잠그지 않는다(규칙+핀+잠긴 턴 혼합) — 잠긴 턴 목록만
  assert.deepEqual(L.lockState(e), { order: false, exceptions: false, plans: false, turns: [1, 2] });
  const all = {}; for (let t = 1; t <= 12; t++) all[t] = [];
  assert.equal(L.summary.order({ ...e, locked: all }).key, 'plan.sum.order.manual', '전 턴 잠김 = 완전 수동 요약');
  applyToStore(st, { team: SCENARIOS.default.team, cond: { ...COND0, forceProc: true } }, CHARS);
  assert.equal(L.summary.cond(st.get()).key, 'cond.sum.forced');
});

test('조건: 제단 ON 이면 확률 100% 불가 · 제단 켜면 100% 꺼짐', () => {
  const st = createStore({ storage: mem(), chars: CHARS });
  st.cond.set({ forceProc: true });
  assert.equal(st.get().cond.forceProc, true);
  st.altar.setOn(true);
  assert.equal(st.get().cond.forceProc, false);
  assert.equal(st.cond.set({ forceProc: true }), false);
  assert.equal(st.get().cond.forceProc, false);
  st.altar.setFloor(2, false);
  assert.deepEqual([1, 2, 3].map((f) => st.get().altar.floors[f].on), [true, false, false]);
  st.altar.setFloor(3, true);
  assert.deepEqual([1, 2, 3].map((f) => st.get().altar.floors[f].on), [true, true, true]);
});
