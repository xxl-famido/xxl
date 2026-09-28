/**
 * 계약 테스트용 시나리오(메인 상태). v1 은 helpers/v1.js setState 로, v2 는 applyToStore 로 같은 상태를 만든다.
 * 실제 사례: tools/live_smoke.js(마타야 방어→욱영→마타야), tools/uitest_sync.js(연동 꼬리 '21bd*'·욱영 프리셋),
 * tools/uitest_assist.js(레오전 3·6·9·12 — 3쿨 첫 궁 당기기 + 확률 감소 가정), tools/codeccheck.js(밀집 타임라인·스펙).
 */
import { adoptLegacyPlans, makeEnv, earlyUltPlan, cdProcSources, canEarlyUlt, ffat, lineTurns } from '../../src/core/plan.js';

/**
 * [2026-09-28 성공 가정 정책 — FEEDBACK_CASES #27, 의도적 v1 차이] v1 cfg → v2 기대 cfg.
 * v1(과 엔진 harness)은 줄(rotation)이 없는 동료의 성공 가정(ult.assist)을 쓰지 않았다(자동 리듬 그대로 — 체크가 죽은 컨트롤).
 * v2 는 '자동/정해진 턴만 + 성공 가정 + 확률 CD 감소 제단' 이면 v1 「첫 필살기 당기기」 계획(earlyUltPlan)과 같은 줄을 보낸다
 * (CD 3턴 → 3·6·9·12). 그 한 가지만 기대값에 반영한다 — 나머지 필드는 v1 과 그대로 같아야 한다.
 * cfg.team 항목(slotPayload 모양)을 제자리에서 바꾸고 돌려준다. 전 턴 잠김(rotation·priority null 인 v1 완전 수동)은 대상 아님.
 */
export function withAssistPull(cfg, chars, altar) {
  if (!cfg || !Array.isArray(cfg.team)) return cfg;
  const env = makeEnv({ chars, altar });
  const turns = +cfg.turns || 30;
  const fully = cfg.turnPlans && Object.keys(cfg.turnPlans).length && Array.from({ length: turns }, (_, k) => k + 1).every((t) => Array.isArray(cfg.turnPlans[t]));
  if (fully) return cfg;
  const imb = cfg.team.some((sp) => sp && sp.id === ID.IMBUEON);
  cfg.team.forEach((sp) => { if (!(imb && sp && sp.position === 1 && sp.id !== ID.IMBUEON)) withAssistPullSlot(sp, env, turns); });   // 임부언 fed carry 제외
  return cfg;
}
/** slotPayload 하나에 같은 규칙(adv=false 일 때만 부른다). */
export function withAssistPullSlot(sp, env, turns) {
  if (!sp || sp.rotation != null || !sp.ult || !sp.ult.assist || sp.ult.mode === 'asap') return sp;
  const meta = env.chars[sp.id] || {};
  if (!canEarlyUlt(meta, env)) return sp;
  const plan = earlyUltPlan(meta, lineTurns(turns), null, cdProcSources(meta, env), env);
  if (plan.indexOf('궁') + 1 >= ffat(meta, env)) return sp;   // 당길 수 없으면 v1 과 같음
  sp.rotation = plan.join('');
  return sp;
}
export const ID = {
  ANUBIS: 10401, LEO: 10406, IMBUEON: 10410, FAMIDO: 10421, TAEHO: 10423, HANIEL: 10425, RICANO: 10428,
  HITOHA: 10433, MOIRU: 10436, INVIS: 10437, UK: 10439, ZETO: 10441, MATAYA: 10442, MUMEI: 10443, SESUNG: 10431, BARD: 10413,
};
export const COND0 = { runs: 50, turns: 30, dummyElement: 0, dummies: 1, enemyHits: '5', forceProc: false, hp10: false, incomingOn: false, incomingPct: 30 };
export const slot = (id, extra = {}) => ({ id, skill: 10, rune: true, rotation: '', ...extra });
const FLOORS = (f1 = {}, f2 = {}, f3 = {}, on = [true, true, true]) => ({
  1: { on: on[0], off: f1 }, 2: { on: on[1], off: f2 }, 3: { on: on[2], off: f3 },
});
export const SPEC_A = () => ({ on: true, level: 47, evo: 3, pevo: 11, compat: 4,
  lv: { basicAtk: 8, ultimate: 9, sigil: 9, passive0: 10, passive1: 7, passive2: 10, passive3: 10, passive4: 6 } });
const denseTP = () => {
  const tp = {};
  for (let t = 1; t <= 30; t++) {
    const n = 5 + (t % 4 === 0 ? 4 : 0);
    tp[t] = Array.from({ length: n }, (_, i) => ({ p: (i % 5) + 1, a: ['평', '궁', '방'][(t + i) % 3] }));
  }
  return tp;
};
const earlyLeo = () => { const p = Array(30).fill('평'); [3, 6, 9, 12, 15, 18, 21, 24, 27, 30].forEach((t) => { p[t - 1] = '궁'; }); return p; };
const base5 = () => [slot(ID.ANUBIS), slot(ID.IMBUEON), slot(ID.FAMIDO), slot(ID.RICANO), slot(ID.HANIEL)];

/** name → 상태 */
export const SCENARIOS = {
  default: { team: base5() },
  specAll: { team: base5().map((s) => ({ ...s, spec: SPEC_A() })) },
  specFull10: { team: [slot(ID.RICANO, { spec: { on: true, level: 60, evo: 5, pevo: 0, compat: 5, lv: { basicAtk: 10, ultimate: 10, sigil: 10, passive0: 10, passive1: 10, passive2: 10, passive3: 10, passive4: 10 } } }), slot(ID.FAMIDO), null, null, null] },
  specOffKept: { team: [slot(ID.RICANO, { spec: { on: false, level: 30, evo: 2, pevo: 3, compat: 1, lv: { basicAtk: 4 } } }), slot(ID.LEO), null, null, null] },
  legacySkill: { team: [slot(ID.RICANO, { skill: 8 }), slot(ID.FAMIDO, { rune: false }), slot(ID.LEO), null, null] },
  denseTimeline: { team: [slot(10423), slot(10410), slot(10421), slot(10439), slot(10428)], advOn: true, turnPlans: denseTP() },
  sparseTimeline: { team: base5(), advOn: true, turnPlans: { 1: [{ p: 1, a: '궁' }], 3: [], 5: [{ p: 5, a: '방' }, { p: 2, a: '평' }] }, cond: { ...COND0, turns: 6 } },
  timelineOffKept: { team: base5(), advOn: false, turnPlans: { 2: [{ p: 1, a: '궁' }, { p: 3, a: '평' }] } },
  timelineBeyondTurns: { team: base5(), advOn: true, turnPlans: { 1: [{ p: 1, a: '평' }], 9: [{ p: 2, a: '궁' }] }, cond: { ...COND0, turns: 5 } },
  timelineOutOfRange: { team: base5(), advOn: true, turnPlans: { 1: [{ p: 9, a: '궁' }] } },
  matayaSync: {   // live_smoke: 마타야 방어 → 욱영 궁 → 마타야 궁(받은 추가 행동)
    team: [slot(ID.MATAYA, { usePlan: true, plan: ['방', ...Array(29).fill('궁')], rotation: '방' + '궁'.repeat(29) }), slot(ID.UK), slot(ID.RICANO), null, null],
    sync: [{ anchor: 2, members: [{ p: 1, order: 'before', base: 'defend' }], miss: 'asap' }],
    cond: { ...COND0, turns: 7, runs: 1 },
  },
  matayaSyncHold: {
    team: [slot(ID.MATAYA), slot(ID.UK), slot(ID.RICANO), null, null],
    sync: [{ anchor: 2, members: [{ p: 1, order: 'before', base: 'defend', other: 'hold' }], miss: 'wait' }],
    cond: { ...COND0, turns: 7, runs: 1 },
  },
  ukPreset: {
    team: [slot(ID.MATAYA), slot(ID.UK), slot(ID.RICANO), null, null],
    sync: [{ anchor: 2, members: [{ p: 1, order: 'before', base: 'basic' }, { p: 3, order: 'before', base: 'basic' }], miss: 'wait' }],
  },
  syncMulti: {
    team: base5(),
    sync: [{ anchor: 1, members: [{ p: 2, order: 'after' }], miss: 'asap' },
      { anchor: 3, members: [{ p: 4, order: 'before', other: 'own' }, { p: 5, order: 'before', base: 'basic', other: 'hold' }], miss: 'wait' }],
  },
  fedCarry: {   // 아누비로스(P1) · 임부언(P2) · 욱영(P3): 임부언 궁 CD-3 + 추가 행동을 받은 캐리
    team: [slot(ID.ANUBIS, { ult: { mode: 'asap', keepDef: true } }), slot(ID.IMBUEON), slot(ID.UK), slot(ID.FAMIDO), null],
    sync: [{ anchor: 2, members: [{ p: 1, order: 'before', base: 'basic' }], miss: 'wait' }, { anchor: 3, members: [{ p: 4, order: 'before', base: 'basic' }], miss: 'wait' }],
  },
  taehoFed: {
    team: [slot(ID.TAEHO, { usePlan: true, plan: Array(60).fill('평').map((x, i) => (i % 2 === 0 ? '궁' : x)), fedActions: { 4: '궁', 7: '방', 5: '궁', 30: '평' } }),
      slot(ID.IMBUEON), slot(ID.HANIEL), null, slot(ID.FAMIDO)],
  },
  taehoNotP1: { team: [slot(ID.IMBUEON), slot(ID.TAEHO, { usePlan: true, plan: Array(60).fill('평'), fedActions: { 4: '궁' } }), null, null, null] },
  leoAssist: {   // 레오전 3·6·9·12: 3쿨 캐릭 첫 궁 당기기 + 확률 쿨 감소 성공 가정(제단 1012·1013)
    team: [slot(ID.LEO, { usePlan: true, plan: earlyLeo(), rotation: earlyLeo().join(''), ult: { mode: 'fixed', keepDef: true, assist: true } }),
      slot(ID.BARD, { ult: { mode: 'fixed', keepDef: true, assist: true } }), slot(ID.RICANO), null, null],
    altar: { on: true, floors: FLOORS() },
    cond: { ...COND0, turns: 13, runs: 20 },
  },
  altarCdPlus: { team: base5(), altar: { on: true, floors: FLOORS({ 402: true, 1012: true }, { 415: true, 1016: true }, {}, [true, true, false]) } },
  altarOneFloor: { team: base5(), altar: { on: true, floors: FLOORS({ 401: true }, { 414: true }, { 406: true }, [true, false, false]) } },
  altarOffKeepsCfg: { team: base5(), altar: { on: false, floors: FLOORS({ 402: true }) } },
  tdmgUniform: { team: base5(), tdmg: { on: true, pct: 30, adv: false, per: { 3: 50 }, hits: 5 } },
  tdmgAdv: { team: base5(), tdmg: { on: true, pct: 12, adv: true, per: { 2: 40, 5: 0, 31: 9 }, hits: 2 }, cond: { ...COND0, turns: 20 } },
  exceptions: { team: base5(), overrides: { 4: [2, 1, 3, 4, 5], 7: [5, 4, 3, 2, 1], 11: [2, 1, 3, 4, 5] } },
  priorities: { team: base5().map((s, i) => ({ ...s, priority: 5 - i })) },
  seal: { team: [slot(ID.RICANO, { sealOn: true, sealAtk: 12000, sealHp: 8000 }), slot(ID.FAMIDO, { sealAtk: 3000, sealHp: 17000 }), null, null, null] },
  ultModes: {
    team: [slot(ID.ANUBIS, { ult: { mode: 'asap', keepDef: false } }), slot(ID.IMBUEON, { ult: { mode: 'strict', keepDef: true } }),
      slot(ID.FAMIDO, { ult: { mode: 'fixed', keepDef: true, assist: true } }), slot(ID.UK, { allyUltAfter: true }), slot(ID.HANIEL, { ult: { mode: 'asap', keepDef: true, assist: true } })],
  },
  condMix: { team: base5(), cond: { runs: 120, turns: 13, dummyElement: 2, dummies: 3, enemyHits: 'all', forceProc: true, hp10: true, incomingOn: true, incomingPct: 45 } },
  incomingOffSlider: { team: base5(), cond: { ...COND0, incomingOn: false, incomingPct: 77 } },
  gaps: { team: [slot(ID.RICANO), null, slot(ID.FAMIDO), slot(ID.MUMEI), null], cond: { ...COND0, enemyHits: '0', dummyElement: 5 } },
  zeto: { team: [slot(ID.ZETO, { usePlan: true, plan: [...Array(29).fill('평'), '궁'] }), slot(ID.MOIRU, { usePlan: true, plan: Array(30).fill('평') }), slot(ID.HITOHA), null, null] },
  planShort: { team: [slot(ID.RICANO, { usePlan: true, plan: ['평', '평', '평', '궁', '평', '평', '궁', '평', '평', '궁'] }), slot(ID.SESUNG), null, null, null] },
  everything: {
    team: [slot(ID.TAEHO, { usePlan: true, plan: Array(60).fill('평'), fedActions: { 4: '궁' }, spec: SPEC_A(), priority: 2 }), slot(ID.IMBUEON, { sealOn: true, sealAtk: 5000, sealHp: 15000, priority: 1 }),
      slot(ID.UK, { allyUltAfter: true, ult: { mode: 'strict', keepDef: false, assist: true } }), slot(ID.MATAYA, { usePlan: true, plan: ['방', ...Array(29).fill('궁')] }), slot(ID.MUMEI)],
    advOn: true, turnPlans: { 1: [{ p: 2, a: '궁' }, { p: 1, a: '궁' }, { p: 1, a: '평' }], 2: [] },
    sync: [{ anchor: 3, members: [{ p: 4, order: 'before', base: 'defend' }], miss: 'asap' }],
    altar: { on: true, floors: FLOORS({ 402: true }, { 1015: true }) },
    tdmg: { on: true, pct: 20, adv: true, per: { 1: 5 }, hits: 3 },
    overrides: { 3: [3, 2, 1, 4, 5] },
    cond: { runs: 80, turns: 12, dummyElement: 1, dummies: 2, enemyHits: '3', forceProc: false, hp10: true, incomingOn: true, incomingPct: 20 },
  },
};

/** 빈 필드를 채운 완전한 시나리오. */
export function full(sc) {
  return {
    team: sc.team, cond: { ...COND0, ...(sc.cond || {}) }, overrides: sc.overrides || {},
    advOn: !!sc.advOn, turnPlans: sc.turnPlans || {}, touched: sc.touched,
    sync: sc.sync || [], altar: sc.altar || null, tdmg: sc.tdmg || null,
  };
}

/**
 * v2 스토어에 같은 상태를 넣는다(조작 함수를 거치지 않는 직접 주입 — 스냅샷 비교용).
 * v2.1(§9): v1 필드(usePlan+plan · advOn+turnPlans)는 applySnap 과 같은 규칙(adoptLegacyPlans)으로 핀·잠긴 턴이 된다.
 */
export function applyToStore(store, scIn, chars) {
  const sc = full(scIn);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const team0 = sc.team.map((x) => (x ? clone(x) : null));
  while (team0.length < 5) team0.push(null);
  const altar = sc.altar ? clone(sc.altar) : { on: false, floors: { 1: { on: true, off: {} }, 2: { on: true, off: {} }, 3: { on: true, off: {} } } };
  const { team, pins, locked } = adoptLegacyPlans(team0, { advOn: sc.advOn, turnPlans: clone(sc.turnPlans), turns: +sc.cond.turns,
    env: makeEnv({ chars, altar }), pins: scIn.pins, locked: scIn.locked });
  store.set({
    chars,
    team,
    cond: { ...sc.cond },
    overrides: clone(sc.overrides),
    pins, locked, probe: null,
    sync: clone(sc.sync),
    altar,
    tdmg: sc.tdmg ? { pct: 10, adv: false, per: {}, hits: 5, ...clone(sc.tdmg) } : { on: false, pct: 10, adv: false, per: {}, hits: 5 },
  });
}
/** 시나리오가 v1 행동 계획 필드(직접 계획·완전 수동 타임라인)를 쓰는가 — 이런 시나리오는 v2.1 스냅샷 모양이 v1 과 다르다(§9). */
export const usesLegacyPlan = (sc) => (sc.team || []).some((s) => s && s.usePlan && s.plan && s.plan.length)
  || !!(sc.turnPlans && Object.keys(sc.turnPlans).length);
/**
 * v1 스냅샷 → v2.1 이 같은 상태에서 낼 스냅샷 중 '핀 외' 부분(핀 내용은 payload.test 가 rotation 동일성으로 검증).
 * 슬롯의 usePlan/plan 제거·rotation '' · advOn false · turnPlans {} · advOn 이던 turnPlans → locked.
 */
export function v2ShapeOf(v1snap, pins) {
  const out = JSON.parse(JSON.stringify(v1snap));
  out.team = out.team.map((s) => { if (!s) return null; const n = { ...s }; delete n.usePlan; delete n.plan; n.rotation = ''; return n; });
  const locked = v1snap.advOn ? (v1snap.turnPlans || {}) : {};
  out.advOn = false; out.turnPlans = {};
  if (pins && Object.keys(pins).length) out.pins = pins;
  if (Object.keys(locked).length) out.locked = JSON.parse(JSON.stringify(locked));
  return out;
}
/** v1 setState 입력. */
export const toV1 = (sc) => full(sc);

/** 기록 샘플(스냅샷은 v1 snapshot() 결과로 채운다). */
export const rec = (snap, id, extra = {}) => ({ id, label: 'x', snap, total: 1234567 + id, ...extra });
