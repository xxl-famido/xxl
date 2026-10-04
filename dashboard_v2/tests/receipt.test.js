/** core/receipt.js — 실제 엔진 결과(fixtures)의 모든 로그 줄을 펼쳐 곱한 값이 엔진 최종값과 맞는지. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { receiptOf, hitReceipt, incomingReceipt } from '../src/core/receipt.js';

const FIX = ['result_default.json', 'result_barrier.json', 'result_altar.json'].map(f => new URL(`../../tools/redesign/fixtures/${f}`, import.meta.url));

for (const url of FIX) {
  test(`실결과 ${url.pathname.split('/').pop()}: 계산 내역 = 엔진 값(설명되지 않은 차이 0)`, { skip: !existsSync(url) }, () => {
    const d = JSON.parse(readFileSync(url, 'utf8'));
    let n = 0; const bad = [];
    const check = (r, where) => { n++; if (!r.matched) bad.push(`${where}: ${r.computed} vs ${r.final}`); };
    for (const l of d.log) {
      const r = receiptOf(l);
      if (!r) continue;
      check(r, `${l.turn}턴 ${l.text}`);
      for (const c of (l.detail.barrierComp || [])) check(receiptOf({ detail: c.detail }), `${l.turn}턴 배리어 구성 ${c.src}`);
    }
    assert.ok(n > 50, `검사한 줄이 너무 적음: ${n}`);
    assert.deepEqual(bad, []);
  });
}

test('차이가 있으면 숨기지 않고 diff 행을 남긴다', () => {
  const r = hitReceipt({ act: 'x', base: 100, atkTotal: 100, baseAtk: [], atk: [], flat: [], skillPct: 100, dealt: [], eff: [], final: 150, elemMult: 1 });
  assert.equal(r.matched, false);
  assert.equal(r.rows.at(-1).kind, 'diff');
  assert.equal(r.rows.at(-1).mult, 1.5);
});

test('받는 데미지 0 하한: 일반×속성이 음수면 속성 줄에서 0으로 맞춘다', () => {
  const r = incomingReceipt({ raw: 1000, dmg: 0, taken: [{ v: -150 }], takenP: [{ v: 10 }], dealt: [], atkPct: [] });
  assert.equal(r.matched, true);
  assert.equal(r.rows.at(-1).running, 0);
});

test('상성 ×1.5 · 수면 · 스킬 계수 순서', () => {
  const r = hitReceipt({ act: 'x', base: 1000, atkTotal: 1000, baseAtk: [], atk: [], flat: [], skillPct: 200, dealt: [{ v: 50 }], eff: [], elemMult: 1.5, sleepBonus: 20, final: 1000 * 2 * 1.5 * 1.5 * 1.2 });
  assert.deepEqual(r.rows.map(x => x.id), ['base', 'skill', 'dealt', 'elem', 'sleep']);
  assert.equal(r.matched, true);
});

test('열상(코드B): 기초 ATK(부여 시점) × 30% 고정 데미지 — 다른 배율 줄 없음', () => {
  // woofia_sim/engine.py _apply_dmg_taken_flat 의 detail 모양
  const d = { act: '열상', rider: '열상', target: '더미1', final: 8963.44, base: 25981, atkTotal: 29878.15, baseLabel: '기초ATK',
    baseAtk: [{ v: 15 }], atk: [], flat: [], skillPct: 30, skillId: 10306, skillName: '황혼 연사',
    dealt: [], effLabel: '', eff: [], effEx: [], takenG: [], takenP: [], takenEx: [], sleepBonus: 0, dotDealt: [], dotTaken: [], elemMult: 1 };
  const r = receiptOf({ detail: d });
  assert.deepEqual(r.rows.map(x => x.id), ['base', 'skill']);
  assert.equal(r.rows[0].label, '기초ATK');
  assert.equal(r.matched, true);
});

import { createFlatGrantIndex, categoryOf } from '../src/core/receipt.js';

test('고정 ATK 출처 → 부여 줄 추적: 실결과의 모든 고정 ATK 출처가 앞선 부여 줄을 찾는다', { skip: !existsSync(FIX[0]) }, () => {
  const d = JSON.parse(readFileSync(FIX[0], 'utf8'));
  const idx = createFlatGrantIndex(d.log);
  let n = 0; const miss = [];
  d.log.forEach((l, i) => {
    for (const c of ((l.detail && l.detail.flat) || [])) {
      n++;
      const g = idx.find(c, i);
      if (!g || g.index >= i || g.line.srcId !== c.by) miss.push(`${l.turn}턴 ${c.skill} ${c.v}`);
    }
  });
  assert.ok(n > 0, '고정 ATK 출처가 있는 타격이 없음 — fixture 확인');
  assert.deepEqual(miss, []);
});

test('분류: ATK·계수·주는 쪽·받는 쪽·상성·차이', () => {
  const ids = { baseAtk: 'atk', skill: 'skill', dealt: 'amp', eff: 'amp', takenP: 'recv', healRecv: 'recv', elem: 'elem' };
  for (const [id, cat] of Object.entries(ids)) assert.equal(categoryOf({ id, kind: 'mul' }), cat);
  assert.equal(categoryOf({ id: 'diff', kind: 'diff' }), 'diff');
});
