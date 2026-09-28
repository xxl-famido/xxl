/**
 * v2.1 핀·잠긴 턴 계약(ARCHITECTURE §9 · core/README §v2.1).
 *   (a) 핀 → 엔진 입력 구체화가 결정적이고, 핀·잠금 없는 턴은 turnPlans 에 없다(핀은 동료별 줄 rotation 으로)
 *   (b) v1 코드(완전 수동·직접 계획·정해진 턴만 + 워크스루 코드)를 열면 pins/locked/strict 가 상태로 드러나고 run cfg 가 v1 과 같다
 *   (c) 피드백 사례 3종(레오전·마타야·fed carry) 페이로드 유지(공유 코드 왕복 경유)
 *   (d) 쿨감 제단 스위치 quickCd on/off/isQuickCd
 *   (e) 사용자 코드(파미도 평평방궁… + 연동 order=after)
 *   + 코덱 v2 꼬리(pins/locked) 라운드트립 · 기록·초안 · 실제 엔진(8778, 떠 있을 때만) 핀 반영 확인
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadV1, CHARS } from './helpers/v1.js';
import { SCENARIOS, toV1, applyToStore, slot, ID, COND0, rec, withAssistPull } from './helpers/samples.js';
import { createStore, KEYS } from '../src/core/store.js';
import * as L from '../src/core/plan.js';
import * as C from '../src/core/codec.js';
import { createApi } from '../src/core/api.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const v1 = loadV1();
v1.exec(`__cap = []; API.simulate = cfg => { __cap.push(JSON.parse(JSON.stringify(cfg))); return Promise.resolve({ error: 'captured' }); };
  API.probe = cfg => Promise.resolve({ plan: {} });`);
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const clone = (v) => JSON.parse(JSON.stringify(v));
const newStore = (extra = {}) => createStore({ storage: mem(), chars: CHARS, ...extra });
const v1Snap = (sc) => { v1.setState(toV1(sc)); return v1.eval('snapshot()'); };
/** v1 에서 스냅샷을 연(applySnap) 뒤 실행 버튼이 보내는 cfg. */
async function v1RunCfgOf(snap) {
  v1.call('applySnap', clone(snap));
  v1.exec('__cap = []');
  await v1.execAsync('run(false)');
  return v1.eval('__cap[0]');
}
/** v2 에서 공유 코드를 가져와 연 상태의 스토어. */
async function v2Open(code) {
  const st = newStore();
  const r = await st.records.importText(code);
  assert.equal(r.ok, true, '코드 가져오기');
  st.records.restore(st.get().records[0].id);
  return st;
}
const ultTurns = (rot, n) => [...rot].map((c, i) => (c === '궁' ? i + 1 : 0)).filter((t) => t && t <= n);

// ── (a) 구체화 ─────────────────────────────────────────────────────────────
test('(a) 핀 → 구체화: 결정적 · 핀 칸 고정 · 핀 없는 동료/턴은 보내지 않음 · 잠긴 턴만 turnPlans', () => {
  const st = newStore();
  applyToStore(st, SCENARIOS.default, CHARS);                 // 아누비로스·임부언·파미도·리카노·하니엘
  assert.deepEqual(st.materialize(), { turnPlans: {}, rotations: {} }, '핀·잠금 없음 = 규칙만');
  assert.deepEqual(st.buildCfg({ mode: 'run' }), st.buildCfg({ mode: 'run' }));
  st.pins.set(4, 5, '방');                                      // 하니엘 4턴 방어
  st.pins.set(6, 3, '궁');                                      // 파미도 6턴 필살기
  const m1 = st.materialize();
  assert.deepEqual(Object.keys(m1.rotations), ['3', '5'], '핀이 있는 동료만 줄');
  assert.deepEqual(m1.turnPlans, {}, '핀 있는 턴도 turnPlans 에 넣지 않는다(턴 전체를 굳히지 않음)');
  // 하니엘: 4 방어 → 준비된 필살기는 5턴, 이후 기본 주기(3)로 8·11…
  assert.equal(m1.rotations[5].slice(0, 11), '평평평방궁평평궁평평궁');
  // 파미도: 첫 필살기 4(규칙) → 6 핀 → 9·12… (핀 뒤로 주기가 이어짐)
  assert.deepEqual(ultTurns(m1.rotations[3], 12), [4, 6, 9, 12]);
  // 결정적: 규칙(우선순위·예외 턴)을 바꿔도 핀 칸은 그대로, 같은 입력이면 같은 출력
  st.plan.setOrder([5, 4, 3, 2, 1]);
  st.plan.setException([4], [1, 2, 3, 4, 5]);
  const m2 = st.materialize();
  assert.deepEqual(m2, m1);
  assert.deepEqual(st.materialize({ plan: { 4: { seq: [{ p: 5, a: '궁' }] } } }), m1, '프로브 인자에 영향받지 않음');
  const cfg = st.buildCfg({ mode: 'run' });
  assert.equal(cfg.team[4].rotation, m1.rotations[5]);
  assert.equal(cfg.team[0].rotation, null, '핀 없는 동료는 규칙');
  assert.deepEqual(cfg.turnPlans, {});
  assert.deepEqual(cfg.turnOrders, { 4: [1, 2, 3, 4, 5] }, '예외 턴 규칙은 살아 있다');
  // rules 모드 = 핀·잠금 없이
  const rules = st.buildCfg({ mode: 'rules' });
  assert.ok(rules.team.every((t) => t.rotation === null));
  assert.equal(rules.runs, 1); assert.equal(rules.forceProc, true);
  // 잠긴 턴: 그 턴만 turnPlans, 현재 턴 수 밖은 제외, 핀보다 우선(엔진이 그 턴 줄을 쓰지 않음)
  st.pins.lockTurn(4, [{ p: 5, a: '궁' }, { p: 1, a: '평' }]);
  st.cond.set({ turns: 12 });
  st.pins.lockTurn(20, []);
  const m3 = st.materialize();
  assert.deepEqual(m3.turnPlans, { 4: [{ p: 5, a: '궁' }, { p: 1, a: '평' }] });
  assert.deepEqual(st.snapshot().locked, { 4: [{ p: 5, a: '궁' }, { p: 1, a: '평' }] }, '스냅샷도 현재 턴 수 안만');
  // 되돌리기 스택
  assert.equal(st.pins.undo(), 'lock:20');
  assert.equal(st.pins.undo(), 'lock:4');
  assert.deepEqual(st.materialize().turnPlans, {});
});

test('(a) 핀 편집 API: 순환 · 검증 · 해제 · 줄 초기화 · 교체/빼기 따라감 · 필살기 가능 판정', () => {
  const st = newStore();
  applyToStore(st, { team: [slot(ID.TAEHO), slot(ID.IMBUEON), slot(ID.FAMIDO), null, slot(ID.HANIEL)] }, CHARS);
  assert.equal(st.pins.cycle(3, 3), '궁');
  assert.equal(st.pins.cycle(3, 3), '방');
  assert.equal(st.pins.cycle(3, 3), '평');
  assert.equal(st.pins.cycle(3, 3), null);
  assert.equal(st.pins.set(3, 4, '궁'), false, '빈 자리');
  assert.equal(st.pins.set(31, 3, '궁'), false, '30턴 밖');
  assert.equal(st.pins.set(3, 3, 'x'), false, '행동 아님');
  assert.equal(st.pins.set(3, 3, '궁평'), false, '단일 행동 동료에 2글자');
  assert.equal(st.pins.set(2, 1, '방궁'), true, '이태호(턴당 2회)는 행동 수만큼');
  assert.equal(st.pins.line(1).slice(2, 4).join(''), '방궁');
  assert.equal(st.pins.ultAllowed(4, 3), true, '파미도 4턴은 쿨이 돈다');
  assert.equal(st.pins.ultAllowed(2, 3), false, '파미도 2턴은 불가');
  st.pins.set(5, 5, '궁'); st.pins.set(7, 5, '방');
  st.team.swap(2, 4);                                        // 파미도(P3) ↔ 하니엘(P5)
  assert.deepEqual(st.pins.row(3), { 5: '궁', 7: '방' }, '핀은 동료를 따라간다');
  st.team.remove(2);                                         // 하니엘 빼기 → 핀 줄 삭제
  assert.deepEqual(st.pins.row(3), {});
  st.team.add(ID.HANIEL, 3);                                  // 다시 넣으면 이번 세션 핀 줄 복원
  assert.deepEqual(st.pins.row(4), { 5: '궁', 7: '방' });
  assert.equal(st.pins.clearRow(4), true);
  assert.equal(st.pins.clearTurn(2), true);
  assert.equal(st.pins.count(), 0);
  assert.equal(st.pins.clearAll(), false);
});

test('(a) 성공 가정 · 방어 턴 유지 · 전원 가정 = v1 ult.assist / keepDef 페이로드', () => {
  const st = newStore();
  applyToStore(st, { team: [slot(ID.LEO), slot(ID.BARD), slot(ID.ANUBIS, { ult: { mode: 'asap', keepDef: true } }), null, null] }, CHARS);
  st.plan.setAssist(1, true);
  st.plan.setKeepDef(2, false);
  let cfg = st.buildCfg({ mode: 'run' });
  assert.deepEqual(cfg.team[0].ult, { mode: 'fixed', keepDef: true, assist: true });
  assert.deepEqual(cfg.team[1].ult, { mode: 'fixed', keepDef: false, assist: false });   // ultOf 전체 모양(v1 동일)
  const undo = st.plan.assistAll(true);
  cfg = st.buildCfg({ mode: 'run' });
  assert.equal(cfg.team[1].ult.assist, true);
  assert.equal(cfg.team[2].ult.assist, false, "'준비되면 바로'는 제외(v1 ultAll('assist'))");
  undo();
  assert.equal(st.buildCfg({ mode: 'run' }).team[1].ult.assist, false);
  st.plan.assistAll(false);
  assert.equal(st.buildCfg({ mode: 'run' }).team[0].ult, null, '전원 끔 → 기본');
});

// ── (b) v1 코드 열기 ───────────────────────────────────────────────────────
const strictPlan = {   // '정해진 턴만' + 직접 계획(워크스루 T10 의 숨은 설정) + 방어 턴 무시
  team: [slot(ID.RICANO, { usePlan: true, plan: ['평', '평', '평', '궁', '평', '평', '궁', '평', '평', '궁', ...Array(20).fill('평')], ult: { mode: 'strict', keepDef: false } }),
    slot(ID.FAMIDO), slot(ID.HANIEL), null, null],
  cond: { ...COND0, turns: 20 },
};
const V1_CASES = {
  '완전 수동(전 턴 타임라인)': SCENARIOS.denseTimeline,
  '직접 계획(레오 3·6·9·12)': SCENARIOS.leoAssist,
  '직접 계획(마타야)': SCENARIOS.matayaSync,
  '직접 계획(짧은 계획 → 기본 주기로 이어 붙임)': SCENARIOS.planShort,
  '이태호 직접 계획 + fed': SCENARIOS.taehoFed,
  '정해진 턴만 + 계획': strictPlan,
  '방식만(정해진 턴만·준비되면 바로·가정)': SCENARIOS.ultModes,
};
for (const [label, sc] of Object.entries(V1_CASES)) {
  test(`(b) v1 코드 열기 — ${label}: 핀/잠긴 턴/방식이 상태로 드러나고 run cfg == v1`, async () => {
    const snap = v1Snap(sc);
    const code = await v1.callAsync('compressCode', [rec(snap, 1700000000001)]);
    const st = await v2Open(code);
    const s = st.get();
    assert.ok(s.team.every((x) => !x || (!('usePlan' in x) && !('plan' in x))), 'usePlan/plan 은 상태에 남지 않는다');
    sc.team.forEach((x, i) => {
      if (!x) return;
      if (x.usePlan) assert.ok(Object.keys(st.pins.row(i + 1)).length > 0, `P${i + 1} 직접 계획 → 핀`);
      else assert.deepEqual(st.pins.row(i + 1), {}, `P${i + 1} 핀 없음`);
      assert.equal(L.ultModeOf(s.team[i]), (x.ult && ['strict', 'asap'].includes(x.ult.mode)) ? x.ult.mode : 'auto', `P${i + 1} 방식`);
    });
    if (sc.advOn) assert.deepEqual(s.locked, snap.turnPlans, '타임라인 → 잠긴 턴');
    else assert.deepEqual(s.locked, {});
    // 직접 계획의 궁·방 칸은 모두 핀
    sc.team.forEach((x, i) => {
      if (!x || !x.usePlan || (CHARS[x.id].actionsPerTurn || 1) > 1) return;
      const row = st.pins.row(i + 1);
      x.plan.forEach((a, k) => { if (a === '궁' || a === '방') assert.equal(row[k + 1], a, `P${i + 1} ${k + 1}턴 ${a}`); });
    });
    // [2026-09-28 #27] 자동 + 성공 가정(쿨감 제단) 동료는 당겨진 줄 — 의도적 차이(helpers/samples.js withAssistPull)
    assert.deepEqual(st.buildCfg({ mode: 'run' }), withAssistPull(await v1RunCfgOf(snap), CHARS, s.altar), 'run cfg');
  });
}

test('(b) v1 워크스루 코드(tools/redesign/shots/walkthrough/v1_code.txt): 정해진 턴만+계획·방어 턴 무시·성공 가정이 드러나고 run cfg == v1', async () => {
  const code = fs.readFileSync(path.join(ROOT, 'tools', 'redesign', 'shots', 'walkthrough', 'v1_code.txt'), 'utf8').trim();
  const recs = JSON.parse(await v1.callAsync('decompressCode', code));
  const st = await v2Open(code);
  const s = st.get();
  // 리카노(P5): 정해진 턴만 + 계획 4·7·10 → 방식 select 에 strict, 궁 칸이 핀
  assert.equal(L.ultModeOf(s.team[4]), 'strict');
  assert.deepEqual(Object.entries(st.pins.row(5)).filter(([, v]) => v === '궁').map(([t]) => +t), [4, 7, 10]);
  assert.equal(L.ultOf(s.team[0]).assist, true, '아누비로스 성공 가정');
  assert.equal(L.ultOf(s.team[3]).keepDef, false, '파미도 방어 턴 무시');
  assert.equal(L.ultModeOf(s.team[2]), 'asap');
  assert.deepEqual(s.sync, [{ anchor: 2, members: [{ p: 3, order: 'before', base: 'defend' }], miss: 'wait' }]);   // other:'own' 은 base 가 있을 때 기본값이라 정규화로 빠짐
  // [2026-09-28 #27] 아누비로스(자동 + 성공 가정, 쿨감 제단)는 v2 에서 당겨진 줄을 보낸다 — 의도적 차이(helpers/samples.js withAssistPull)
  assert.deepEqual(st.buildCfg({ mode: 'run' }), withAssistPull(await v1RunCfgOf(recs[0].snap), CHARS, s.altar));
});

test('(b) 일부 턴만 잠긴 v1 타임라인은 그 턴만 잠기고 나머지는 규칙(v1 과 다른 점, core/README)', async () => {
  const snap = v1Snap(SCENARIOS.sparseTimeline);
  const st = await v2Open(await v1.callAsync('compressCode', [rec(snap, 5)]));
  assert.deepEqual(Object.keys(st.get().locked), ['1', '3', '5']);
  const cfg = st.buildCfg({ mode: 'run' });
  assert.deepEqual(cfg.turnPlans, snap.turnPlans);
});

// ── (c) 피드백 사례 3종 ────────────────────────────────────────────────────
for (const name of ['leoAssist', 'matayaSync', 'fedCarry']) {
  test(`(c) 피드백 사례 ${name}: v1 코드 → v2 → v2 코드 → v2 로 두 번 왕복해도 run cfg == v1`, async () => {
    const snap = v1Snap(SCENARIOS[name]);
    const st = await v2Open(await v1.callAsync('compressCode', [rec(snap, 9)]));
    const want = withAssistPull(await v1RunCfgOf(snap), CHARS, st.get().altar);   // [2026-09-28 #27] 의도적 차이(자동 + 성공 가정 → 당겨진 줄)
    assert.deepEqual(st.buildCfg({ mode: 'run' }), want, 'v1 코드 → v2');
    const r2 = st.records.save(st.snapshot(), { meta: { turns: snap.turns, total: 1 } });
    const code2 = await st.records.exportCode([r2.id]);
    assert.equal(code2[0], name === 'fedCarry' ? '$' : '$', "핀·연동이 있으면 '$'");
    const st2 = await v2Open(code2);
    assert.deepEqual(st2.snapshot(), st.snapshot(), 'v2 코드 왕복 무손실');
    assert.deepEqual(st2.buildCfg({ mode: 'run' }), want, 'v2 코드 → v2');
  });
}
test('(c) 사례별 핵심 필드', async () => {
  const leo = newStore(); applyToStore(leo, SCENARIOS.leoAssist, CHARS);
  const c1 = leo.buildCfg({ mode: 'run' });
  assert.deepEqual(ultTurns(c1.team[0].rotation, 13), [3, 6, 9, 12]);
  assert.equal(c1.team[0].ult.assist, true);
  const mat = newStore(); applyToStore(mat, SCENARIOS.matayaSync, CHARS);
  const c2 = mat.buildCfg({ mode: 'run' });
  assert.equal(c2.team[0].rotation.slice(0, 7), '방궁궁궁궁궁궁');
  assert.equal(c2.sync[0].members[0].base, 'defend');
  const fed = newStore(); applyToStore(fed, SCENARIOS.fedCarry, CHARS);
  const c3 = fed.buildCfg({ mode: 'run' });
  assert.equal(c3.sync.length, 2);
  assert.ok(c3.team.every((t) => t.rotation === null), 'fed carry 사례는 핀 없음(규칙 + 연동)');
});

// ── (d) 쿨감 제단 스위치 ──────────────────────────────────────────────────
test('(d) quickCd on/off/isQuickCd — 별 전부 점등 · 달 1012·1013 만 · altars.json 과 id 일치', () => {
  const data = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'altars.json'), 'utf8'));
  data.floors.forEach((f) => assert.deepEqual([...L.ALTAR_MOON_IDS[f.floor]], f.moon.map((a) => a.id), `${f.floor}층 달의 제단 id`));
  const st = newStore();
  st.cond.set({ forceProc: true });
  assert.equal(st.altar.isQuickCd(), false);
  const prev = st.altar.quickCd(true);
  const a = st.get().altar;
  assert.equal(st.altar.isQuickCd(), true);
  assert.equal(a.on, true);
  data.floors.forEach((f) => {
    assert.equal(a.floors[f.floor].on, true);
    f.star.forEach((x) => assert.ok(!a.floors[f.floor].off[x.id], `별 ${x.id} 점등`));
    f.moon.forEach((x) => assert.equal(!a.floors[f.floor].off[x.id], [1012, 1013].includes(x.id), `달 ${x.id}`));
  });
  assert.deepEqual(L.altarProcCdActive(a), [1012, 1013]);
  assert.equal(L.cdPlusOf(a), 0, '402(별) 점등 = 최대 CD +1 차단');
  assert.equal(st.get().cond.forceProc, false, '제단 ⇄ 확률 100% 상호 배제');
  assert.deepEqual(st.buildCfg({ mode: 'run' }).altar, { on: true, floors: { 1: { on: true, off: [1011] }, 2: { on: true, off: [1014, 1015, 1016, 1017] }, 3: { on: true, off: [1018, 1019, 1020, 1021, 1022] } } });
  st.altar.toggle(2, 1015);
  assert.equal(st.altar.isQuickCd(), false, '달 하나 더 켜면 쿨감 제단만이 아님');
  st.altar.toggle(2, 1015);
  st.altar.setFloor(3, false);
  assert.equal(st.altar.isQuickCd(), false, '3층 꺼짐');
  st.altar.quickCd(true);
  st.altar.quickCd(false);
  assert.equal(st.get().altar.on, false);
  assert.equal(st.altar.isQuickCd(), false);
  st.altar.restore(prev);
  assert.deepEqual(st.get().altar, prev, '되돌리기');
});

// ── (e) 사용자 코드 ────────────────────────────────────────────────────────
const USER_CODE = '$eJzNkDsKw0AQQ-8ytbClnZ395CrLFMa5_xmCHZIufZB4hUAqtJb6ZPTWuosTZqiqI5rK5gFirVWpxKrixSIERLxlZNFP0-7GuBmZcEKwMBDxnThno28fDvr2PLqq_j5qdIP5Y9_t-s2KDsvMF2ZtS_o';
test('(e) 사용자 코드: 파미도 계획(평평방궁…) → 핀, 연동 order=after 유지, run cfg 의 파미도 rotation == v1', async () => {
  const recs = JSON.parse(await v1.callAsync('decompressCode', USER_CODE));
  const v1Snap0 = recs[0].snap;
  assert.equal(v1Snap0.team[2].usePlan, true);
  const st = await v2Open(USER_CODE);
  const row = st.pins.row(3);
  // 방 3·6·…·27, 궁 4·7·…·28 이 핀(평 칸은 규칙 채움과 같아 핀 없음)
  assert.deepEqual(Object.keys(row).map(Number).filter((t) => row[t] === '방'), [3, 6, 9, 12, 15, 18, 21, 24, 27]);
  assert.deepEqual(Object.keys(row).map(Number).filter((t) => row[t] === '궁'), [4, 7, 10, 13, 16, 19, 22, 25, 28]);
  assert.ok(!Object.values(row).includes('평'));
  assert.deepEqual(st.get().sync, [{ anchor: 2, members: [{ p: 1, order: 'after' }], miss: 'wait' }]);
  assert.deepEqual(st.get().locked, {}, '꺼져 있던(advOn=false) 타임라인은 잠긴 턴이 되지 않는다');
  const want = await v1RunCfgOf(v1Snap0);
  const got = st.buildCfg({ mode: 'run' });
  assert.equal(got.team[2].rotation, want.team[2].rotation);
  assert.equal(got.team[2].rotation, '평평방궁평방궁평방궁평방궁평방궁평방궁평방궁평방궁평방궁평평');
  assert.deepEqual(got.sync, want.sync);
  assert.deepEqual(got, want, 'run cfg 전체');
});

// ── 코덱 · 기록 · 초안 ───────────────────────────────────────────────────
test('코덱 v2 꼬리: pins/locked 라운드트립 · 없으면 예전과 바이트 동일 · 기존 코드는 그대로 열림', async () => {
  const st = newStore();
  applyToStore(st, SCENARIOS.default, CHARS);
  const plain = st.snapshot();
  assert.ok(!('pins' in plain) && !('locked' in plain), '비면 생략');
  const codePlain = await C.compressCode([rec(plain, 1)]);
  assert.equal(codePlain, await v1.callAsync('compressCode', [rec(v1Snap(SCENARIOS.default), 1)]), '핀·잠금 없으면 v1 과 같은 코드');
  st.pins.set(4, 5, '방'); st.pins.set(9, 2, '궁');
  st.pins.lockTurn(2, [{ p: 3, a: '궁' }, { p: 1, a: '평' }]);
  st.pins.lockTurn(6, []);
  const sn = st.snapshot();
  assert.deepEqual(sn.pins, { 4: { 5: '방' }, 9: { 2: '궁' } });
  const packed = C.packSnapV2(sn);
  assert.equal(packed.length, 15, '꼬리 13·14번');
  assert.deepEqual(C.decPins(packed[13]), sn.pins);
  assert.deepEqual(C.decTP(packed[14]), sn.locked);
  const code = await C.compressCode([rec(sn, 2)]);
  assert.equal(code[0], '$');
  const back = await C.decodeShare(code, CHARS);
  assert.deepEqual(back[0].snap.pins, sn.pins);
  assert.deepEqual(back[0].snap.locked, sn.locked);
  const st2 = newStore(); st2.applySnap(back[0].snap);
  assert.deepEqual(st2.snapshot(), sn);
  // 기존 v1 '$' 코드(꼬리 13개)도 그대로 — pins/locked 는 빈 것
  const old = await v1.callAsync('compressCode', [rec(v1Snap(SCENARIOS.matayaSync), 3)]);
  const d = await C.decodeShare(old, CHARS);
  assert.ok(!('pins' in d[0].snap) && !('locked' in d[0].snap));
  // v1 디코더는 모르는 꼬리를 무시하고 연다(핀은 잃지만 나머지는 그대로)
  const v1d = JSON.parse(await v1.callAsync('decompressCode', code));
  assert.equal(v1d[0].snap.turns, sn.turns);
  // 턴당 2회 핀('궁평')도 왕복
  assert.deepEqual(C.decPins(C.encPins({ 3: { 1: '궁평', 4: '방' } })), { 3: { 1: '궁평', 4: '방' } });
  assert.equal(C.encPins({ 1: { 7: '궁' } }), null, '표현 밖 → null(코덱이 * 로 물러남)');
});

test('기록·초안: 핀·잠긴 턴이 저장되고 새로고침 뒤 그대로', () => {
  const storage = mem();
  let t = 1760000000000;
  const st = createStore({ storage, chars: CHARS, now: () => t++ });
  st.init({ chars: CHARS });
  st.pins.set(4, 5, '방');
  st.pins.lockTurn(1, [{ p: 1, a: '평' }]);
  const snap = st.snapshot();
  const r = st.records.save(snap, { meta: { turns: 30, total: 5 }, team: snap.team });
  assert.deepEqual(JSON.parse(storage.getItem(KEYS.history))[0].snap.pins, { 4: { 5: '방' } });
  st.saveDraft();
  const d = JSON.parse(storage.getItem(KEYS.draft));
  assert.deepEqual(Object.keys(d), ['v', 'rec', 'snap', 'touched'], '초안 모양 v1 과 같음');
  assert.deepEqual(d.snap.locked, { 1: [{ p: 1, a: '평' }] });
  const st2 = createStore({ storage, chars: CHARS });
  assert.equal(st2.init({ chars: CHARS }).source, 'draft');
  assert.deepEqual(st2.snapshot(), snap);
  st2.pins.clearAll(); st2.pins.unlockAll();
  st2.records.restore(r.id);
  assert.deepEqual(st2.snapshot(), snap, '기록 복원');
});

test('prepareRun: 엔진이 따르지 않은 핀을 알린다(가짜 프로브) · 핀 없는 이태호/마타야 권장 경고', async () => {
  const api = { probe: async (cfg) => {
    const plan = {};
    for (let t = 1; t <= cfg.turns; t++) plan[t] = { seq: cfg.team.map((s) => ({ p: s.position, a: t === 2 && s.position === 3 ? '평' : (s.rotation ? s.rotation[t - 1] : '평') })) };
    return { plan };
  } };
  const st = newStore({ api });
  applyToStore(st, { team: [slot(ID.MATAYA), null, slot(ID.FAMIDO), null, null], cond: { ...COND0, turns: 5 } }, CHARS);
  st.pins.set(2, 3, '궁');                                    // 파미도 2턴 궁 — 가짜 엔진은 평으로 실행
  st.pins.set(4, 3, '방');
  const r = await st.prepareRun();
  assert.deepEqual(r.warnings.find((w) => w.key === 'run.pinIgnored').vars, { pos: 3, id: ID.FAMIDO, turns: [2] });
  assert.ok(r.warnings.some((w) => w.key === 'run.recommendPlan' && w.vars.id === ID.MATAYA));
  assert.ok(st.get().probe, '미리보기 프로브 보관');
  assert.equal(r.cfg.runs, 50);
});

// ── 실제 엔진(8778) — 서버가 떠 있을 때만 ──────────────────────────────────
async function liveApi() {
  try {
    const api = createApi({ port: '8778', base: 'http://localhost:8778' });
    const chars = await Promise.race([api.chars(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500))]);
    return Array.isArray(chars) && chars.length ? { api, chars: Object.fromEntries(chars.map((c) => [c.id, c])) } : null;
  } catch { return null; }
}
test('실제 엔진(8778): 하니엘 4턴 방어 핀 → 4턴 방어·5턴 필살기(규칙이 핀 뒤로 이어짐), 쿨 안 찬 궁 핀은 경고', async (t) => {
  const live = await liveApi();
  if (!live) { t.skip('8778 서버 없음'); return; }
  const st = createStore({ storage: mem(), chars: live.chars, api: live.api });
  st.team.setDefault();
  st.cond.set({ turns: 10 });
  st.pins.set(4, 5, '방');
  const pr = await st.probe();
  const acts = (tn, p) => pr.plan[tn].seq.filter((e) => e.p === p && !e.x).map((e) => e.a);
  assert.deepEqual(acts(4, 5), ['방']);
  assert.deepEqual(acts(5, 5), ['궁']);
  assert.deepEqual(acts(8, 5), ['궁']);
  assert.deepEqual(st.pinsIgnored(pr), []);
  st.pins.set(2, 4, '궁');
  const r = await st.prepareRun();
  assert.deepEqual(r.warnings.find((w) => w.key === 'run.pinIgnored').vars.turns, [2]);
});
