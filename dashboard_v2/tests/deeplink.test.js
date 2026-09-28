/**
 * 라운지 → 시뮬 딥링크 계약: 라운지가 만드는 주소(team.js simHref)를 시뮬이 그대로 읽어 같은 팀을 적용한다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeepLink, applyDeepLink, snapFromCode, clearDeepLink, DEEPLINK_MAX_CODE } from '../src/core/deeplink.js';
import { encodeShare, bytesToB64url, deflate } from '../src/core/codec.js';

const CHARS = Object.fromEntries([10401, 10410, 10421, 10428, 10425, 10441].map((id) => [id, { id, name: String(id) }]));
const simHref = (code) => `index.html#code=${encodeURIComponent(code)}&run=1`;   // lounge/team.js 와 같은 식
const snapOf = (ids, turns = 30) => ({ team: ids.map((id) => ({ id, skill: 10, rune: true, rotation: '' })), turns, dummies: 1, enemyHits: 'all', dummyElement: 0, runs: 50 });

function fakeStore() {
  let cur = { team: [null, null, null, null, null], turns: 30 };
  const calls = [];
  return {
    calls,
    get: () => ({ chars: CHARS }),
    snapshot: () => structuredClone(cur),
    applySnap: (s) => { cur = structuredClone(s); calls.push('apply'); },
    saveDraft: () => calls.push('save'),
    team: { add: (id) => { if (cur.team.some((x) => x && x.id === id)) return { ok: false, reason: 'dup' }; const i = cur.team.findIndex((x) => !x); cur.team[i] = { id }; return { ok: true, at: i }; } },
    state: () => cur,
  };
}

test('라운지 "시뮬하러 가기" 주소 → 같은 팀 적용 + 실행 + 되돌리기 토큰', async () => {
  const code = await encodeShare([{ id: 1, snap: snapOf([10401, 10410, 10421, 10428, 10425], 20), total: 0 }]);
  const link = parseDeepLink(new URL(simHref(code), 'https://x/').hash);
  assert.deepEqual({ code: link.code, run: link.run }, { code, run: true });
  const st = fakeStore();
  const r = await applyDeepLink(st, link);
  assert.equal(r.applied, 'code');
  assert.equal(r.run, true);
  assert.deepEqual(st.state().team.map((s) => s.id), [10401, 10410, 10421, 10428, 10425]);
  assert.equal(st.state().turns, 20);
  assert.deepEqual(r.undo.team, [null, null, null, null, null]);
  assert.deepEqual(st.calls, ['apply', 'save']);
});

test('parseDeepLink: 형식 검사', () => {
  assert.equal(parseDeepLink(''), null);
  assert.equal(parseDeepLink('#/c/10441'), null);                 // 라운지 라우트 모양은 무시
  assert.equal(parseDeepLink('#code=%3Cscript%3E'), null);
  assert.equal(parseDeepLink('#code=' + '%23' + 'A'.repeat(DEEPLINK_MAX_CODE + 1)), null);
  assert.equal(parseDeepLink('#add=abc'), null);
  assert.deepEqual(parseDeepLink('#add=10441'), { run: false, add: 10441 });
  assert.equal(parseDeepLink('#code=%23abc').run, false);
});

test('압축 폭탄·빈 팀·모르는 동료는 적용하지 않음', async () => {
  const bomb = '*' + bytesToB64url(await deflate('[' + ' '.repeat(1024 * 1024) + ']'));
  assert.ok(bomb.length < DEEPLINK_MAX_CODE);
  await assert.rejects(snapFromCode(bomb, CHARS), (e) => e.reason === 'bad');
  const empty = await encodeShare([{ id: 1, snap: snapOf([]), total: 0 }]);
  await assert.rejects(snapFromCode(empty, CHARS), (e) => e.reason === 'empty');
  const unknown = '*' + bytesToB64url(await deflate(JSON.stringify([{ snap: snapOf([99999]) }])));
  await assert.rejects(snapFromCode(unknown, CHARS), (e) => e.reason === 'unknown');
  const st = fakeStore();
  const r = await applyDeepLink(st, { code: bomb, run: true });
  assert.equal(r.applied, null);
  assert.equal(r.run, false);                                   // 실패하면 실행하지 않는다
  assert.deepEqual(st.calls, []);
});

test('#add=: 빈 자리에 추가, 중복은 이유와 함께 거절', async () => {
  const st = fakeStore();
  assert.equal((await applyDeepLink(st, { add: 10441 })).applied, 'add');
  assert.equal((await applyDeepLink(st, { add: 10441 })).reason, 'dup');
  assert.equal((await applyDeepLink(st, { add: 99999 })).reason, 'unknown');
});

test('clearDeepLink: 딥링크만 지운다', () => {
  const calls = [];
  const hist = { replaceState: (...a) => calls.push(a[2]) };
  clearDeepLink({ hash: '#code=%23abc&run=1', pathname: '/xxl/index.html', search: '' }, hist);
  clearDeepLink({ hash: '#/c/10441', pathname: '/xxl/lounge.html', search: '' }, hist);
  assert.deepEqual(calls, ['/xxl/index.html']);
});
