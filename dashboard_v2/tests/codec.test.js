/**
 * 공유 코드 코덱 계약: v1 encode == v2 encode(바이트 동일), v2 decode(v1 code) deepEqual v1 decode.
 * 샘플 스냅샷은 v1 snapshot() 으로 생성한다(helpers/samples.js 시나리오 × v1 상태 주입).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadV1, CHARS } from './helpers/v1.js';
import { SCENARIOS, toV1, rec } from './helpers/samples.js';
import * as C from '../src/core/codec.js';

const v1 = loadV1();
const snapOf = (name) => { v1.setState(toV1(SCENARIOS[name])); return v1.eval('snapshot()'); };
const SAMPLES = Object.keys(SCENARIOS).map((name, i) => ({ name, records: [rec(snapOf(name), 1700000000000 + i)] }));
// 여러 건 · 이름/핀/잠금 · 섞인 형식 · 비교에 쓰이는 두 기록
SAMPLES.push({ name: 'multi-mixed', records: [
  rec(snapOf('default'), 1, { name: '기본 팀', pinned: true }),
  rec(snapOf('denseTimeline'), 2, { locked: true }),
  rec(snapOf('specAll'), 3, { name: 'spec', locked: true, pinned: true }),
] });
SAMPLES.push({ name: 'compare-pair', records: [rec(snapOf('matayaSync'), 11), rec(snapOf('fedCarry'), 12)] });
SAMPLES.push({ name: 'fallback-mixed', records: [rec(snapOf('timelineOutOfRange'), 21), rec(snapOf('altarCdPlus'), 22)] });
SAMPLES.push({ name: 'legacy-shape-no-new-keys', records: [{ id: 31, total: 5, snap: { team: [{ id: 10428, skill: 10, rune: true, rotation: '' }, null, null, null, null], turns: 30, dummies: 1, enemyHits: 'all', dummyElement: 0, runs: 50, forceProc: false, hp10: false, turnOverrides: {}, incomingOn: false, incomingPct: 0 } }] });

test(`샘플 수 ≥ 20 (실제 ${SAMPLES.length})`, () => { assert.ok(SAMPLES.length >= 20); });

for (const s of SAMPLES) {
  test(`codec[${s.name}]: v1 encode == v2 encode, decode 동일`, async () => {
    const code1 = await v1.callAsync('compressCode', s.records);
    const code2 = await C.compressCode(JSON.parse(JSON.stringify(s.records)));
    assert.equal(code2, code1, '코드 바이트 불일치');
    const d1 = JSON.parse(await v1.callAsync('decompressCode', code1));
    const d2 = JSON.parse(await C.decompressCode(code1, CHARS));
    assert.deepEqual(d2, d1, 'v2 decode(v1 code) ≠ v1 decode');
    // 왕복 무결(looseEq) — v2 가 만든 코드를 v2 로 다시 풀어도 값이 같다
    const back = await C.decodeShare(code2, CHARS);
    assert.ok(back.every((r, i) => C.looseEq(s.records[i], r)), '왕복 looseEq 실패');
  });
}

test('형식 선택: 새 기능 미사용 → #, 사용 → $, 표현 밖 → # 또는 *', async () => {
  const tag = async (name) => (await C.compressCode([rec(snapOf(name), 1)]))[0];
  assert.equal(await tag('default'), '#');
  assert.equal(await tag('denseTimeline'), '$');
  assert.equal(await tag('altarCdPlus'), '$');
  assert.equal(await tag('tdmgUniform'), '$');
  assert.equal(await tag('matayaSync'), '$');
  assert.notEqual(await tag('timelineOutOfRange'), '$');
});

test('packSnapV2 꼬리: 연동 "21bd*" (uitest_sync 사례)', () => {
  const sn = snapOf('matayaSync');
  const p1 = v1.call('packSnapV2', sn), p2 = C.packSnapV2(JSON.parse(JSON.stringify(sn)));
  assert.deepEqual(p2, p1);
  assert.equal(p2[p2.length - 1], '21bd*');
});

test('구 코드: 제단 꼬리 안의 연동("3://|12a*") → sync 로 마이그레이션', async () => {
  const sn = snapOf('default');
  const packed = [sn.team.map(C.packSlot), 30, 1, '5', 0, 50, 0, 0, 0, '', '3://|12a*'];
  const u1 = v1.call('unpackSnapV2', packed), u2 = C.unpackSnapV2(JSON.parse(JSON.stringify(packed)));
  assert.deepEqual(u2, u1);
  assert.equal(u2.sync[0].anchor, 1); assert.equal(u2.sync[0].members[0].order, 'after'); assert.equal(u2.sync[0].miss, 'asap');
  assert.ok(!u2.altar.groups);
  // 이 packed 를 '$' 코드로 구워 두 쪽 디코더가 같은 결과를 내는지
  const body = JSON.stringify([[5, '', 0, 0, packed]]);
  const code = '$' + C.bytesToB64url(await C.deflate(body));
  assert.deepEqual(JSON.parse(await C.decompressCode(code, CHARS)), JSON.parse(await v1.callAsync('decompressCode', code)));
});

test("구형식 '#' 에 날것 타임라인이 담긴 기록도 두 쪽이 같게 연다", async () => {
  const r = [rec(snapOf('timelineOffKept'), 7)];
  const legacy = v1.call('packRecords', r, false);
  const body = JSON.stringify(legacy);
  const code = '#' + C.bytesToB64url(await C.deflate(body));
  assert.deepEqual(JSON.parse(await C.decompressCode(code, CHARS)), JSON.parse(await v1.callAsync('decompressCode', code)));
});

test("'*' 전체 JSON 코드도 그대로 열린다", async () => {
  const r = [rec(snapOf('timelineOutOfRange'), 8, { extraField: { keep: true } })];
  const code = '*' + C.bytesToB64url(await C.deflate(JSON.stringify(r)));
  assert.deepEqual(JSON.parse(await C.decompressCode(code)), JSON.parse(await v1.callAsync('decompressCode', code)));
});

test('타임라인 압축: 빈 턴(-)·미지정 턴("") 구분, 범위 밖 → null', () => {
  const tp = { 1: [{ p: 1, a: '궁' }], 3: [], 5: [{ p: 5, a: '방' }] };
  assert.equal(C.encTP(tp), v1.call('_encTP', tp));
  assert.deepEqual(C.decTP(C.encTP(tp)), tp);
  assert.equal(C.encTP({ 1: [{ p: 9, a: '궁' }] }), null);
});

test('필드 코덱: 스펙·궁 방식·fed·제단·턴 피해·연동 — v1 과 문자열 동일', () => {
  const specs = [{ spec: { on: true, level: 60, evo: 5, pevo: 0, compat: 5, lv: {} } }, { spec: { on: true, level: 1, evo: 0, pevo: 0, compat: 0, lv: { basicAtk: 1, passive4: 10 } } }, {}, { spec: { on: false } }];
  for (const s of specs) { assert.equal(C.encSpec(JSON.parse(JSON.stringify(s))), v1.call('_encSpec', s)); }
  for (const u of [undefined, { mode: 'asap' }, { mode: 'strict', keepDef: false }, { mode: 'fixed', assist: true }, { mode: 'x' }]) {
    const s = u ? { ult: u } : {};
    assert.equal(C.encUlt(s), v1.call('_encUlt', s));
    assert.deepEqual(C.decUlt(C.encUlt(s)), v1.call('_decUlt', v1.call('_encUlt', s)));
  }
  const fed = { 4: '궁', 10: '방', 2: '평' };
  assert.equal(C.encFed(fed), v1.call('_encFed', fed));
  assert.deepEqual(C.decFed('4궁10방'), v1.call('_decFed', '4궁10방'));
  const alt = { on: true, floors: { 1: { on: true, off: [1012, 402] }, 2: { on: false, off: [415] }, 3: { on: true, off: [] } } };
  assert.equal(C.encAltar(alt), v1.call('_encAltar', alt));
  for (const s of ['1:402//', '3:1,2/3/4|12a;34bd*', 'bad', '']) assert.deepEqual(C.decAltar(s), v1.call('_decAltar', s));
  for (const t of [{ on: true, pct: 30 }, { on: true, pct: 0.4, per: { 3: 120, 1: -4 }, hits: 3 }, { on: false }]) assert.equal(C.encTdmg(t), v1.call('_encTdmg', t));
  for (const s of ['30', '12;2:40,5:0h2', '100', '5;x', '']) assert.deepEqual(C.decTdmg(s), v1.call('_decTdmg', s));
  const gs = [{ anchor: 2, members: [{ p: 1, order: 'before', base: 'defend', other: 'hold' }, { p: 3, order: 'after' }], miss: 'asap' }];
  assert.equal(C.encGroups(gs), v1.call('_encGroups', gs));
  for (const s of ['21bd*', '12a;34bpx5b', '9;;x', '']) assert.deepEqual(C.decGroups(s), v1.call('_decGroups', s));
});

test('slot pack/unpack: 옛 스킬 레벨 기록은 스펙 켠 상태로 승격(v1 과 동일)', () => {
  for (const s of [{ id: 10428, skill: 7, rune: true }, { id: 10428, skill: 10, rune: false }, { id: 10428, skill: 10, rune: true, usePlan: true, plan: ['평', '궁'] }]) {
    const a = v1.call('packSlot', s);
    assert.deepEqual(C.packSlot(JSON.parse(JSON.stringify(s))), a);
    assert.deepEqual(C.unpackSlot(a), v1.call('unpackSlot', a));
  }
});
