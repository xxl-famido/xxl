/**
 * 엔진 페이로드 계약: slotPayload/fedPayload/ultPayload/planRotation · run cfg · probe cfg · 비교 cfg 가 v1 과 deepEqual.
 * 사례: 레오전 3·6·9·12(assist) · 마타야 방어→욱영 궁→마타야 궁 · 아누비로스·욱영·임부언 fed carry · 이태호 fed · 완전 수동.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadV1, CHARS } from './helpers/v1.js';
import { SCENARIOS, toV1, applyToStore, full, withAssistPull, withAssistPullSlot } from './helpers/samples.js';
import { createStore } from '../src/core/store.js';
import { makeEnv, isFullyLocked, lockedWithin } from '../src/core/plan.js';
import * as P from '../src/core/payload.js';

const v1 = loadV1();
v1.exec(`__cap = []; API.simulate = cfg => { __cap.push(JSON.parse(JSON.stringify(cfg))); return Promise.resolve({ error: 'captured' }); };
  API.probe = cfg => Promise.resolve({ plan: {} });`);
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const storeFor = (sc) => { const st = createStore({ storage: mem(), chars: CHARS }); applyToStore(st, sc, CHARS); return st; };
const clone = (v) => JSON.parse(JSON.stringify(v));

for (const [name, sc] of Object.entries(SCENARIOS)) {
  test(`payload[${name}]: 슬롯별 slot/fed/ult/planRotation == v1`, () => {
    const f = full(sc);
    v1.setState(f);
    // §9: v1 직접 계획은 핀으로 옮겨지고, 엔진 페이로드는 핀을 구체화한 가상 슬롯(effectiveTeam — 동료별 줄)에서 나온다.
    // 이 줄이 v1 plan(=rotation)과 같아야 슬롯 페이로드가 v1 과 같다.
    const st = storeFor(sc), s = { ...st.get(), team: st.effectiveTeam() }, env = makeEnv({ chars: CHARS, altar: st.get().altar });
    const turns = +f.cond.turns;
    s.team.forEach((slot, i) => {
      if (!slot) return;
      // [2026-09-28 #27] 자동 + 성공 가정 + 쿨감 제단 동료는 당겨진 줄(v1 첫 필살기 당기기 계획)을 보낸다 — 의도적 차이(withAssistPull)
      const fedCarry = i === 0 && slot.id !== 10410 && s.team.some((x) => x && x.id === 10410);   // 임부언 fed carry 는 제외
      const pullOf = (sp) => (fedCarry ? sp : withAssistPullSlot(sp, env, turns));
      const pulled = pullOf(v1.eval(`slotPayload(team[${i}], ${i + 1}, team, ${turns}, false)`)).rotation;
      for (const adv of [false, true]) {
        const want = v1.eval(`slotPayload(team[${i}], ${i + 1}, team, ${turns}, ${adv})`);
        assert.deepEqual(P.slotPayload(clone(slot), i + 1, s.team, turns, adv, env), adv ? want : pullOf(want), `slotPayload P${i + 1} adv=${adv}`);
      }
      assert.deepEqual(P.fedPayload(slot, s.team, turns, env), v1.eval(`fedPayload(team[${i}], team, ${turns})`));
      assert.deepEqual(P.ultPayload(slot), v1.eval(`ultPayload(team[${i}])`));
      assert.deepEqual(P.planRotation(slot, turns, env), v1.eval(`planRotation(team[${i}], ${turns})`) ?? pulled);
      assert.deepEqual(P.planRotation(slot, 30, env), v1.eval(`planRotation(team[${i}], 30)`) ?? pulled);
    });
  });
  test(`cfg[${name}]: run/probe/legacy-probe cfg == v1`, async () => {
    const f = full(sc);
    v1.setState(f);
    v1.exec('__cap = []');
    await v1.execAsync('run(false)');
    const st = storeFor(sc);
    const pull = (c) => withAssistPull(c, CHARS, st.get().altar);   // [2026-09-28 #27] 의도적 차이 — helpers/samples.js
    const runCfg = pull(v1.eval('__cap[0]'));
    // §9 갱신: v1 완전 수동의 '일부 턴만' 타임라인(advOn + 전 턴을 덮지 않는 turnPlans)은 v2.1 에서 잠긴 턴 + 나머지 턴 규칙으로
    // 해석한다(v1 은 실행 직전 프로브로 빈 턴을 채우고 우선순위·동료별 줄을 버렸다). 그런 시나리오는 turnPlans 만 v1 과 같고,
    // 동료별 줄·우선순위·예외 턴은 규칙 쪽 값을 보낸다. 전 턴이 잠긴 타임라인(denseTimeline)은 v1 과 완전히 같다.
    const partial = f.advOn && Object.keys(f.turnPlans).length && !isFullyLocked(f.turnPlans, f.cond.turns);
    const run2 = st.buildCfg({ mode: 'run' });
    if (!partial) assert.deepEqual(run2, runCfg, 'run cfg');
    else {
      assert.deepEqual(run2.turnPlans, lockedWithin(runCfg.turnPlans, f.cond.turns), 'run cfg turnPlans');
      assert.deepEqual(run2.turnOrders, st.get().overrides, '잠기지 않은 턴은 예외 턴 규칙');
      const { team: _a, turnPlans: _b, turnOrders: _c, ...rest2 } = run2;
      const { team: _d, turnPlans: _e, turnOrders: _f, ...rest1 } = runCfg;
      assert.deepEqual(rest2, rest1, 'run cfg 나머지');
    }
    if (!partial) assert.deepEqual(st.buildCfg({ mode: 'probe' }), pull(v1.eval('advCfg()')), 'probe cfg');
    // v1 'legacy probe'(advCfg({}, true) — 완전 수동을 무시하고 동료별 계획으로) 자리는 v2.1 에서 잠긴 턴 없는 프로브(plansOverride {})
    assert.deepEqual(st.buildCfg({ mode: 'probe', plansOverride: {} }), pull(v1.eval('advCfg({}, true)')), 'legacy probe cfg');
    if (!f.advOn) {
      const trial = { 1: [{ p: 1, a: '궁' }] };
      assert.deepEqual(st.buildCfg({ mode: 'probe', plansOverride: trial }), pull(v1.eval(`advCfg(${JSON.stringify(trial)})`)), 'probe override');
    }
  });
}

test('레오전 3·6·9·12: 확률 감소 가정(assist)이 페이로드에 실리고 rotation 궁 턴이 3·6·9·12', () => {
  const st = storeFor(SCENARIOS.leoAssist);
  const cfg = st.buildCfg({ mode: 'run' });
  const leo = cfg.team[0];
  assert.deepEqual(leo.ult, { mode: 'fixed', keepDef: true, assist: true });
  const ults = [...leo.rotation].map((c, i) => (c === '궁' ? i + 1 : 0)).filter((t) => t && t <= 13);
  assert.deepEqual(ults, [3, 6, 9, 12]);
  assert.equal(cfg.forceProc, false);
  assert.ok(cfg.altar && cfg.altar.on);
});

test('마타야 방어 → 욱영 궁 → 마타야 궁: sync base=defend · 마타야 계획 rotation', () => {
  const cfg = storeFor(SCENARIOS.matayaSync).buildCfg({ mode: 'run' });
  assert.deepEqual(cfg.sync, [{ anchor: 2, members: [{ p: 1, order: 'before', base: 'defend' }], miss: 'asap' }]);
  assert.equal(cfg.team[0].rotation.slice(0, 7), '방궁궁궁궁궁궁');
  assert.equal(cfg.turns, 7);
});

test('아누비로스·욱영·임부언 fed carry: 두 연동 그룹 + asap', () => {
  const cfg = storeFor(SCENARIOS.fedCarry).buildCfg({ mode: 'run' });
  assert.equal(cfg.sync.length, 2);
  assert.equal(cfg.sync[0].members[0].base, 'basic');
  assert.deepEqual(cfg.team[0].ult, { mode: 'asap', keepDef: true, assist: false });   // ultOf 전체 모양(v1 동일)
});

test('이태호 fed 추가 행동: 임부언 궁 턴(4·7·10…)만 실린다', () => {
  const st = storeFor(SCENARIOS.taehoFed);
  const cfg = st.buildCfg({ mode: 'run' });
  assert.deepEqual(cfg.team[0].fedActions, { 4: '궁', 7: '방' });
  const cfg2 = storeFor(SCENARIOS.taehoNotP1).buildCfg({ mode: 'run' });
  assert.equal(cfg2.team[1].fedActions, null, '1번 자리가 아니면 fed 없음');
});

// §9 갱신: '완전 수동' 모드는 없어졌다. 전 턴이 잠기면 v1 완전 수동과 같은 페이로드, 일부 턴만 잠기면 그 턴만 turnPlans + 규칙.
test('잠긴 턴: 전 턴 잠김 = v1 완전 수동 페이로드(줄·우선순위·예외 턴 생략), 일부만 = 그 턴만 turnPlans', () => {
  const part = storeFor(SCENARIOS.everything).buildCfg({ mode: 'run' });
  assert.deepEqual(Object.keys(part.turnPlans), ['1', '2']);
  assert.deepEqual(part.turnOrders, { 3: [3, 2, 1, 4, 5] }, '잠기지 않은 턴은 예외 턴 규칙이 그대로');
  assert.equal(part.team[0].priority, 2);
  assert.ok(part.team[0].rotation && part.team[3].rotation, '핀(옛 직접 계획)이 동료별 줄로');
  const st = storeFor(SCENARIOS.everything);
  const all = {}; for (let t = 1; t <= 12; t++) all[t] = [{ p: 2, a: '평' }];
  st.set({ locked: all });
  const full12 = st.buildCfg({ mode: 'run' });
  assert.deepEqual(full12.turnOrders, {});
  assert.ok(full12.team.every((t) => t.rotation === null && t.priority === null));
  assert.equal(Object.keys(full12.turnPlans).length, 12);
});

test('팀 비교 cfg: buildCompareCfg == v1 cfgFromTeam (타임라인 켬/끔 · 연동 · 공통 설정)', () => {
  v1.setState(full(SCENARIOS.everything));   // 제단·턴 피해는 메인 설정을 공통 적용
  const sides = {
    a: { roster: clone(SCENARIOS.matayaSync.team), turnOv: { 2: [2, 1, 3] }, adv: null, advOn: false, sync: SCENARIOS.matayaSync.sync },
    b: { roster: clone(SCENARIOS.denseTimeline.team), turnOv: { 3: [1, 2] }, adv: { 1: [{ p: 1, a: '궁' }] }, advOn: true, sync: [] },
  };
  const common = { forceProc: true, hp10: true, dummyElement: 3, dummies: 2, enemyHits: 'all', turns: 13, incomingOn: true, incomingPct: 40 };
  for (const side of ['a', 'b']) {
    const sd = sides[side];
    v1.exec(`cmpTeam.${side} = ${JSON.stringify(sd.roster)}; cmpTurnOv.${side} = ${JSON.stringify(sd.turnOv)};
      cmpAdv.${side} = ${JSON.stringify(sd.adv)}; cmpAdvOn.${side} = ${sd.advOn}; cmpSync.${side} = ${JSON.stringify(sd.sync)};
      cmpCommon = ${JSON.stringify(common)};`);
    const snap = { turns: 9, runs: 70 };
    const s = storeFor(SCENARIOS.everything).get();
    const got = P.buildCompareCfg(sd, snap, common, { chars: CHARS, altar: s.altar, tdmg: s.tdmg, mainTurns: s.cond.turns });
    assert.deepEqual(got, v1.eval(`cfgFromTeam('${side}', ${JSON.stringify(snap)})`), `side ${side}`);
  }
});
