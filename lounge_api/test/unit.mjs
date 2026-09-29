// 단위 검사(서버 없이): 요청 제한·입력 정리·비교·공유 코드 판독(압축 폭탄 포함).
// 실행: node test/unit.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { limit, cleanText, safeEqual, HttpError, pinHash, rateScale } from '../src/security.js';
import { spamReason, normalizeForDup, tierPositions, aggregateRows, AGG_LABELS } from '../../dashboard_v2/src/lounge/shared.js';
import { readTeamCode } from '../src/teamcode.js';
import { bytesToB64url, deflate } from '../../dashboard_v2/src/core/codec.js';

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const throwsStatus = async (fn, status) => { try { await fn(); return false; } catch (e) { return e instanceof HttpError && e.status === status; } };

// D1 흉내: node:sqlite 위에 prepare().bind().first()/run()/all()
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  return { prepare: (sql) => ({ bind: (...a) => ({
    first: async () => db.prepare(sql).get(...a) ?? null,
    run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: r.changes } }; },
    all: async () => ({ results: db.prepare(sql).all(...a) }),
  }) }) };
}

// 1) 요청 제한: 분당 3건 → 4번째 429, 다른 IP 는 영향 없음, RATE_SCALE 은 1~100 정수만
{
  const env = { DB: fakeD1() };
  for (let i = 0; i < 3; i++) await limit(env, 'writeMin', 'ipA');
  ok(await throwsStatus(() => limit(env, 'writeMin', 'ipA'), 429), '쓰기 분당 3건 초과 → 429');
  let other = true; try { await limit(env, 'writeMin', 'ipB'); } catch { other = false; }
  ok(other, '다른 IP 는 따로 센다');
  const env2 = { DB: fakeD1(), RATE_SCALE: '999999' };
  for (let i = 0; i < 3; i++) await limit(env2, 'writeMin', 'ipA');
  ok(await throwsStatus(() => limit(env2, 'writeMin', 'ipA'), 429), 'RATE_SCALE 비정상 값은 무시(배수 1)');
}

// 2) 입력 정리
{
  ok(cleanText('  a\r\nb\u0000c‮d  ', 10, 'x') === 'a\nbcd', '제어문자·방향 조작 문자 제거, CRLF 정리');
  ok(cleanText('a\n\n\n\n\n\nb', 20, 'x') === 'a\n\n\nb', '빈 줄 과다 축약');
  ok(await throwsStatus(() => cleanText('x'.repeat(11), 10, 'x'), 400), '길이 초과 400');
  ok(await throwsStatus(() => cleanText('   ', 10, 'x'), 400), '빈 값 400');
  ok(cleanText(undefined, 10, 'x', { required: false }) === '', '선택 항목 빈 값 허용');
  ok(cleanText({ a: 1 }, 10, 'x', { required: false }) === '', '문자열 아닌 값은 빈 값');
}

// 3) 비교·해시
{
  ok(safeEqual('abc', 'abc') && !safeEqual('abc', 'abd') && !safeEqual('abc', 'abcd'), 'safeEqual');
  const env = { PIN_PEPPER: 'p'.repeat(32) };
  const h1 = await pinHash(env, 's1', '1234'), h2 = await pinHash(env, 's2', '1234'), h3 = await pinHash({ PIN_PEPPER: 'q'.repeat(32) }, 's1', '1234');
  ok(h1 !== h2 && h1 !== h3 && /^[0-9a-f]{64}$/.test(h1), '비밀번호 해시: 솔트·pepper 가 다르면 다른 값');
}

// 4) 공유 코드
{
  const valid = new Set([10401, 10410, 10421, 10428, 10425, 10441, 10439, 10443, 10415, 10442, 10431]);
  const r = await readTeamCode('#eJyLjjbUUVLSMdAx0ImOjjYxMIzViTYxNACRRmC2kQWYNI0FAQACxguo', valid);
  ok(r.ids.join() === '10401,10410,10421,10428,10425' && r.summary.turns === 30, `정상 코드 판독 ${r.ids}`);
  ok(await throwsStatus(() => readTeamCode('#eJyLjjbUUVLSMdAx0ImOjjYxMIzViTYxNACRRmC2kQWYNI0FAQACxguo', new Set([10401])), 400), '모르는 동료 포함 → 400');
  ok(await throwsStatus(() => readTeamCode('#잘못된코드', valid), 400), '형식 오류 → 400');
  ok(await throwsStatus(() => readTeamCode('', valid), 400), '빈 코드 → 400');
  ok(await throwsStatus(() => readTeamCode('#' + 'A'.repeat(5000), valid), 400), '길이 초과 → 400');
  const bomb = '*' + bytesToB64url(await deflate('[' + ' '.repeat(1024 * 1024) + ']'));   // 1MB 로 풀리는 짧은 코드(길이 제한은 통과)
  ok(bomb.length < 4000, `압축 폭탄 코드 길이 ${bomb.length}자`);
  ok(await throwsStatus(() => readTeamCode(bomb, valid), 400), '압축 폭탄 → 256KB 에서 중단, 400');
  const dupe = '*' + bytesToB64url(await deflate(JSON.stringify([{ snap: { team: [{ id: 10401 }, { id: 10401 }] } }])));
  ok(await throwsStatus(() => readTeamCode(dupe, valid), 400), '같은 동료 중복 → 400');
}

// 5) 도배 방지 규칙
{
  const req = (h) => ({ headers: new Map(Object.entries(h)) });
  ok(rateScale({}, req({ 'X-Test-Rate-Scale': '1' })) === 1 && rateScale({}, req({ 'X-Test-Rate-Scale': '100' })) === 1, '라이브(RATE_SCALE 없음)에서는 검사용 헤더를 완전히 무시');
  ok(rateScale({ RATE_SCALE: '30' }, req({})) === 30 && rateScale({ RATE_SCALE: '30' }, req({ 'X-Test-Rate-Scale': '1' })) === 1, '로컬에서만 헤더로 배수 조절');
  for (const [t, bad] of [['좋은 캐릭터입니다', false], ['ㅋ'.repeat(19), false], ['ㅋ'.repeat(20), true], ['도배'.repeat(8), true], ['ㅁㄴㅇㄹ'.repeat(12), true],
    ['http://a http://b', false], ['http://a http://b http://c', true], ['a' + String.fromCharCode(10) + 'b'.repeat(0), false], [('a' + String.fromCharCode(10)).repeat(45), true], ['필살기가 전투당 한 번이라 언제 쓰느냐가 전부입니다. '.repeat(3), false]]) {
    ok(!!spamReason(t) === bad, `spamReason ${JSON.stringify(t.slice(0, 16))} → ${bad ? '차단' : '허용'}`);
  }
  ok(normalizeForDup('같은 내용  검사!!') === normalizeForDup('같은내용검사'), '중복 판정: 띄어쓰기·문장부호 무시');
  ok(normalizeForDup('ＡＢＣ') === normalizeForDup('abc'), '중복 판정: 전각·대소문자 무시');
}

// 평균 티어 5칸 분포: 행 수가 몇이든 행 구간 가운데 → S~D 에 고르게
{
  const bandsOf = (n) => {
    const rows = Array.from({ length: n }, (_, i) => ({ label: String(i), ids: [10401 + i] }));
    const byChar = {};
    for (const [cid, p] of tierPositions(rows)) byChar[cid] = [p, p, p];     // 표본 3개(최소 표본 넘김)
    const agg = aggregateRows(byChar, 3);
    return rows.map((r) => AGG_LABELS[agg.rows.findIndex((x) => x.items.some((it) => it.id === r.ids[0]))]).join('');
  };
  ok(bandsOf(2) === 'AC', `2행 → A·C (${bandsOf(2)})`);
  ok(bandsOf(3) === 'SBD', `3행 → S·B·D (${bandsOf(3)})`);
  ok(bandsOf(5) === 'SABCD', `5행 → S~D 그대로 (${bandsOf(5)})`);
  ok(bandsOf(8) === 'SSABBCDD', `8행 → 고르게 (${bandsOf(8)})`);
  ok(new Set(bandsOf(6)).size === 5 && new Set(bandsOf(7)).size === 5, '6·7행 → 5칸 모두 사용');
}

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
