/**
 * 스냅샷 계약: 같은 상태에서 v2 snapshot() == v1 snapshot()(키·값), applySnap(v1 기록) → snapshot() 라운드트립,
 * 그리고 기록·초안 저장 형식(localStorage 키·모양)이 v1과 같다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadV1, CHARS } from './helpers/v1.js';
import { SCENARIOS, toV1, applyToStore, usesLegacyPlan, v2ShapeOf } from './helpers/samples.js';
import { createStore, KEYS } from '../src/core/store.js';
import { makeLabel } from '../src/core/format.js';

const v1 = loadV1();
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
const v1Snap = (sc) => { v1.setState(toV1(sc)); return v1.eval('snapshot()'); };

// §9 갱신: v1 행동 계획 필드(직접 계획 usePlan · 완전 수동 advOn+turnPlans)를 쓰는 시나리오는 v2.1 에서 핀·잠긴 턴으로
// 옮겨지므로 스냅샷 모양이 v1 과 다르다(slot 의 usePlan/plan 제거 · advOn false · turnPlans {} · pins/locked 추가).
// 그 외 시나리오는 종전대로 v1 과 바이트(키 순서 포함) 동일 — pins/locked 가 비면 생략되기 때문.
for (const [name, sc] of Object.entries(SCENARIOS)) {
  test(`snapshot[${name}]: v2 == v1 (키 순서 포함; v1 계획 필드는 §9 모양)`, () => {
    const a = v1Snap(sc);
    const st = createStore({ storage: mem(), chars: CHARS });
    applyToStore(st, sc, CHARS);
    const b = st.snapshot();
    if (!usesLegacyPlan(sc)) {
      assert.deepEqual(b, a);
      assert.deepEqual(Object.keys(b), Object.keys(a));
      assert.equal(JSON.stringify(b), JSON.stringify(a), '바이트 동일');
      return;
    }
    const hadPlan = sc.team.some((s) => s && s.usePlan && s.plan && s.plan.length);
    assert.equal(!!b.pins, hadPlan, '직접 계획이 있던 시나리오만 pins');
    assert.deepEqual(b, v2ShapeOf(a, b.pins));
    assert.ok(b.team.every((s) => !s || (!('usePlan' in s) && !('plan' in s))), 'usePlan/plan 제거');
  });
  test(`applySnap[${name}]: v1 applySnap→snapshot 과 v2 applySnap→snapshot 동일(§9 모양)`, () => {
    const orig = v1Snap(sc);
    v1.call('applySnap', orig);
    const r1 = v1.eval('snapshot()');
    const st = createStore({ storage: mem(), chars: CHARS });
    st.applySnap(JSON.parse(JSON.stringify(orig)));
    const r2 = st.snapshot();
    // timelineOffKept: v1 은 꺼진 타임라인(advOn=false)을 들고 다녔지만 엔진엔 안 보냈다 → v2.1 은 버린다(§9 읽기 호환).
    assert.deepEqual(r2, v2ShapeOf(r1, r2.pins));
    if (name !== 'legacySkill') assert.deepEqual(r2, v2ShapeOf(orig, r2.pins), '라운드트립에서 값이 변함');
    // v2 스냅샷을 다시 열면 그대로(핀·잠긴 턴 왕복)
    const st2 = createStore({ storage: mem(), chars: CHARS });
    st2.applySnap(JSON.parse(JSON.stringify(r2)));
    assert.deepEqual(st2.snapshot(), r2, 'v2 스냅샷 재적용 왕복');
  });
}

test('applySnap: 옛 기록(altar.groups · 숫자 dummies · 결과 내장 없음)도 v1 과 같은 상태가 된다', () => {
  const old = { team: [{ id: 10428, skill: 9, rune: true, rotation: '' }, { id: 10439, skill: 10, rune: true, rotation: '' }, null, null, null],
    turns: 13, dummies: 2, enemyHits: 'all', dummyElement: 3, runs: 70, forceProc: true, hp10: false, turnOverrides: { 2: [2, 1] },
    incomingOn: true, incomingPct: 55, altar: { on: false, groups: [{ anchor: 2, members: [{ p: 1 }] }] } };
  v1.call('applySnap', JSON.parse(JSON.stringify(old)));
  const r1 = v1.eval('snapshot()');
  const st = createStore({ storage: mem(), chars: CHARS });
  st.applySnap(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(st.snapshot(), r1);
  assert.equal(st.snapshot().sync[0].anchor, 2);
});

test('applySnap: 제단 ON 기록은 확률 100% 를 끈다(v1 syncAltarLock)', () => {
  const s = v1Snap({ team: SCENARIOS.default.team, cond: { runs: 50, turns: 30, dummyElement: 0, dummies: 1, enemyHits: '5', forceProc: true, hp10: false, incomingOn: false, incomingPct: 30 }, altar: { on: true, floors: { 1: { on: true, off: {} }, 2: { on: true, off: {} }, 3: { on: true, off: {} } } } });
  v1.call('applySnap', s);
  const st = createStore({ storage: mem(), chars: CHARS });
  st.applySnap(s);
  assert.equal(st.snapshot().forceProc, false);
  assert.deepEqual(st.snapshot(), v1.eval('snapshot()'));
});

test('기록 저장·복원·초안: localStorage 모양이 v1 과 같다', () => {
  const storage = mem();
  let t = 1760000000000;
  const st = createStore({ storage, chars: CHARS, now: () => t++ });
  st.init({ chars: CHARS });
  assert.equal(st.get().team.filter(Boolean).length, 5);                 // 기본 편성
  applyToStore(st, SCENARIOS.matayaSync, CHARS);
  const snap = st.snapshot();
  const data = { meta: { turns: 7, total: 123456789 }, team: snap.team };
  const r = st.records.save(snap, data);
  assert.equal(r.label, makeLabel(snap.team, 7, 123456789, CHARS));
  assert.equal(r.label, v1.call('makeLabel', snap.team, 7, 123456789));
  const stored = JSON.parse(storage.getItem(KEYS.history));
  assert.deepEqual(Object.keys(stored[0]), ['id', 'label', 'snap', 'total']);
  assert.deepEqual(stored[0].snap, snap);
  st.saveDraft();
  const d = JSON.parse(storage.getItem(KEYS.draft));
  assert.deepEqual(Object.keys(d), ['v', 'rec', 'snap', 'touched']);
  assert.equal(d.rec, r.id);
  // 다른 상태로 바꾼 뒤 복원 → 되돌리기
  applyToStore(st, SCENARIOS.condMix, CHARS);
  const res = st.records.restore(r.id);
  assert.deepEqual(st.snapshot(), snap);
  st.records.revert(res.undo);
  assert.equal(st.snapshot().runs, 120);
  // 새로고침: 초안이 우선
  st.saveDraft();
  const st2 = createStore({ storage, chars: CHARS });
  assert.equal(st2.init({ chars: CHARS }).source, 'draft');
  assert.deepEqual(st2.snapshot(), st.snapshot());
});

test('v1 이 저장한 기록 목록(localStorage)을 v2 가 그대로 읽는다 — data 제거 · 연동 마이그레이션', () => {
  const storage = mem();
  const s1 = v1Snap(SCENARIOS.everything);
  const legacy = [{ id: 5, label: 'a', snap: s1, total: 9, data: { big: true } },
    { id: 4, label: 'b', snap: { ...v1Snap(SCENARIOS.default), altar: { on: false, groups: [{ anchor: 1, members: [{ p: 2 }] }] } }, total: 3, pinned: true, locked: true }];
  storage.setItem(KEYS.history, JSON.stringify(legacy));
  // v1 loadHistory 결과와 비교
  v1.storage.set('woofia_history', JSON.stringify(legacy));
  v1.exec('loadHistory()');
  const v1List = v1.eval('simHistory');
  const st = createStore({ storage, chars: CHARS });
  st.init({ chars: CHARS });
  assert.deepEqual(st.get().records, v1List);
  assert.equal(st.init().source !== undefined, true);
});

test('기록 관리: 40개 한도(핀·잠금 보호) · 이름 · 정렬 · 검색 · 잠금 삭제 보호 · 가져오기/내보내기', async () => {
  const storage = mem();
  let t = 1;
  const st = createStore({ storage, chars: CHARS, now: () => t++ });
  st.set({ chars: CHARS });
  applyToStore(st, SCENARIOS.default, CHARS);
  const snap = st.snapshot();
  for (let k = 0; k < 45; k++) st.records.save(snap, { meta: { turns: 30, total: k * 1e6 }, team: snap.team });
  assert.equal(st.get().records.length, 40);
  const oldest = st.get().records[39].id;
  st.records.pin(oldest, true);
  st.records.lock(st.get().records[38].id, true);
  st.records.save(snap, { meta: { turns: 30, total: 1 }, team: snap.team });
  assert.equal(st.get().records.length, 40);
  assert.ok(st.get().records.some((r) => r.id === oldest), '핀 기록이 한도에서 지워짐');
  st.records.rename(oldest, '  보스전  ');
  assert.equal(st.get().records.find((r) => r.id === oldest).name, '보스전');
  st.records.search('보스');
  assert.deepEqual(st.records.list().map((r) => r.id), [oldest]);
  st.records.search('');
  assert.equal(st.records.list()[0].id, oldest, '핀이 맨 위');
  st.records.sort('dmg');
  const l = st.records.list();
  assert.ok(l[1].total >= l[2].total);
  const locked = st.get().records.find((r) => r.locked).id;
  assert.equal(st.records.remove(locked), 0, '잠긴 기록은 지우지 않는다');
  const code = await st.records.exportCode([oldest]);
  const st2 = createStore({ storage: mem(), chars: CHARS });
  const res = await st2.records.importText(code);
  assert.deepEqual(res, { ok: true, added: 1 });
  assert.equal(st2.get().records[0].name, '보스전');
  const again = st2.records.importJson(st.records.exportJson([oldest]));
  assert.equal(again.added, 0, '중복 id 는 가져오지 않는다');
});
