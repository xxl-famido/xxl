// 단위 검사(서버 없이): 요청 제한·입력 정리·비교·공유 코드 판독(압축 폭탄 포함).
// 실행: node test/unit.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { limit, cleanText, safeEqual, HttpError, pinHash, rateScale } from '../src/security.js';
import { spamReason, normalizeForDup, tierPositions, aggregateRows, AGG_LABELS, AGG_VERSION_MIN, aggScope, BUILDS, CURRENT_BUILD, CHAR_SINCE, buildRank, tierBuildFor } from '../../dashboard_v2/src/lounge/shared.js';
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
// 같은 행 안 순서: 왼쪽일수록 앞(높음) · 칸은 바뀌지 않음
{
  for (let n = 1; n <= 8; n++) {
    const rows = Array.from({ length: n }, (_, i) => ({ label: String(i), ids: Array.from({ length: 12 }, (_, j) => 10401 + i * 12 + j) }));
    const pos = new Map(tierPositions(rows));
    const bandOk = rows.every((r, i) => { const b = new Set(r.ids.map((id) => Math.min(4, Math.floor(pos.get(id) * 5)))); return b.size === 1; });
    const orderOk = rows.every((r) => r.ids.every((id, j) => j === 0 || pos.get(r.ids[j - 1]) < pos.get(id)));
    ok(bandOk && orderOk, `${n}행 × 12명: 행 안 순서 반영 · 칸 유지`);
  }
  const byChar = {};
  const add = (ids) => tierPositions([{ label: 'S', ids }, { label: 'A', ids: [] }, { label: 'B', ids: [] }, { label: 'C', ids: [] }, { label: 'D', ids: [] }])
    .forEach(([cid, p]) => (byChar[cid] ||= []).push(p));
  add([10401, 10402, 10403]); add([10401, 10403, 10402]); add([10402, 10401, 10403]);
  const s = aggregateRows(byChar, 3).rows[0].items.map((x) => x.id).join(',');
  ok(s === '10401,10402,10403', `평균 티어 같은 칸 안 순서 = 행 안 순서의 중앙값 (${s})`);
}

// 빌드 기록(builds.js): 라이브 빌드 = 목록 마지막, 신규 동료 빌드는 목록 안 · 실제 동료
{
  const charIds = new Set(Object.keys(JSON.parse(readFileSync(new URL('../../data/chars.json', import.meta.url), 'utf8'))).map(Number));
  ok(BUILDS.length > 0 && CURRENT_BUILD === BUILDS[BUILDS.length - 1] && new Set(BUILDS).size === BUILDS.length, `라이브 빌드 = 목록 마지막 (${CURRENT_BUILD})`);
  ok(BUILDS.every((b) => /^\d{4}$/.test(b)), '빌드는 MMDD 네 자리');
  ok(Object.entries(CHAR_SINCE).every(([id, b]) => buildRank(b) > 0 && charIds.has(+id)), '신규 동료 빌드: 첫 빌드 뒤 · 목록 안 · data/chars.json 에 있는 동료');
}
// 티어표 빌드 갱신(끌올): 늦게 들어온 동료를 넣으면 그 동료의 빌드로, 아니면 그대로
{
  const [first] = BUILDS;
  const late = Object.entries(CHAR_SINCE).sort((a, b) => buildRank(b[1]) - buildRank(a[1]));
  const rows = (ids) => [{ label: 'S', ids }, { label: 'A', ids: [] }];
  ok(tierBuildFor(first, rows([10401, 10441])) === first, '처음부터 있던 동료만 → 빌드 그대로');
  if (late.length) {
    const [lateId, lateBuild] = late[0];
    ok(tierBuildFor(first, rows([10401, +lateId])) === lateBuild, `늦게 들어온 동료(${lateId}) → 그 빌드 ${lateBuild}`);
    ok(tierBuildFor(lateBuild, rows([+lateId])) === lateBuild, '이미 그 빌드면 그대로(다시 끌올하지 않음)');
    ok(tierBuildFor(first, rows(late.map(([id]) => +id))) === lateBuild, '여러 명이면 가장 늦은 빌드');
    ok(tierBuildFor('0101', rows([10401])) === '0101' && tierBuildFor('0101', rows([+lateId])) === lateBuild, '목록에 없는 옛 빌드: 늦은 동료가 들어올 때만 올림');
  }
  if (late.length > 1 && buildRank(late[0][1]) > buildRank(late[late.length - 1][1])) {
    const [, newest] = late[0];
    ok(tierBuildFor(newest, rows([+late[late.length - 1][0]])) === newest, '더 이른 동료를 넣어도 빌드를 내리지 않음');
  }
}
// 평균 티어 범위: 자동 선택은 이번 버전 티어표가 최소 개수 이상일 때만 이번 버전
{
  ok(aggScope('auto', AGG_VERSION_MIN) === 'current' && aggScope('auto', AGG_VERSION_MIN - 1) === 'all', `자동: ${AGG_VERSION_MIN}개 이상 → 이번 버전, 미만 → 전체 버전`);
  ok(aggScope('current', 0) === 'current' && aggScope('all', 99) === 'all', '직접 고른 범위는 그대로');
}
// 마이그레이션 0008: 0922 로 남은 티어표 중 늦게 들어온 동료가 든 것만 빌드를 올리고, 수정된 적 있으면 그 시각에 끌올
{
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_init', '0002_antispam', '0003_operator', '0004_pinned', '0005_edit_lists', '0006_tier_fun_rowpos', '0007_tier_inrow_order', '0008_tier_bump']) {
    if (f === '0008_tier_bump') {
      const ins = db.prepare("INSERT INTO tiers (id, title, basis, rows, anon, anon_no, build, pin_salt, pin_hash, ip_hash, created_at, edited_at) VALUES (?, 't', 'all', ?, 10401, 1, '0922', 's', 'h', 'i', 1000, ?)");
      ins.run('tA', JSON.stringify([{ label: 'S', ids: [10444, 10401] }, { label: 'A', ids: [10301] }]), 5000);
      ins.run('tB', JSON.stringify([{ label: 'S', ids: [10306] }, { label: 'A', ids: [] }]), 4000);
      ins.run('tC', JSON.stringify([{ label: 'S', ids: [10444] }, { label: 'A', ids: [] }]), null);
      ins.run('tD', JSON.stringify([{ label: 'S', ids: [10401] }, { label: 'A', ids: [] }]), 3000);
    }
    db.exec(readFileSync(new URL(`../migrations/${f}.sql`, import.meta.url), 'utf8'));
  }
  const got = Object.fromEntries(db.prepare('SELECT id, build, bumped_at FROM tiers').all().map((r) => [r.id, `${r.build}/${r.bumped_at}`]));
  ok(got.tA === '1006/5000', `하쿠이 + 시바히코 → 1006, 수정 시각에 끌올 (${got.tA})`);
  ok(got.tB === '0924/4000', `코드B → 0924 (${got.tB})`);
  ok(got.tC === '1006/null', `처음부터 하쿠이 → 빌드만 1006, 끌올 없음 (${got.tC})`);
  ok(got.tD === '0922/null', `늦게 들어온 동료 없음 → 그대로 (${got.tD})`);
}

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
