// 통합 검사: 로컬 wrangler dev(127.0.0.1:8787)에 실제 요청. 라이브 주소로는 돌리지 않는다.
// 준비: npm run db:local && node scripts/seed_local.mjs && npm run dev   →   node test/smoke.mjs
const BASE = 'http://127.0.0.1:8787';
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(BASE)) throw new Error('로컬 서버에만 실행');
const ORIGIN = 'http://localhost:8779';
const TS = 'XXXX.DUMMY.TOKEN.XXXX';                 // 테스트 비밀키에서 항상 통과하는 더미 토큰
const DEV_A = 'a'.repeat(32), DEV_B = 'b'.repeat(32);

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
let ipSeq = 1;
const freshIp = () => `10.${(ipSeq >> 8) & 255}.${ipSeq++ & 255}.${Math.floor(Math.random() * 250) + 1}`;
async function call(method, path, body, { origin = ORIGIN, headers = {} } = {}) {
  const h = { 'CF-Connecting-IP': freshIp(), ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'text/plain;charset=UTF-8' } : {}), ...headers };
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, text, headers: r.headers };
}
const get = (p, o) => call('GET', p, null, o);
const post = (p, b, o) => call('POST', p, b, o);
const noSecrets = (text) => !/dislike|pin_hash|pin_salt|pin_fail|ip_hash|"voter"/.test(text);

// 동료 페이지 커뮤니티 티어 대조: 서버 /v1/tiers/by-char 답 = 공개 티어표 목록을 shared.js 규칙으로 다시 계산한 값(집계 제외·다른 기준 빼고)
async function charTierMismatches(basis = 'any') {
  const { charTierFrom, tierPositions } = await import('../../dashboard_v2/src/lounge/shared.js');
  const list = (await get(`/v1/tiers?basis=${basis}&sort=new`)).data.filter((t) => !t.fun);
  const byChar = new Map();
  for (const t of list) for (const [cid, pos] of tierPositions(t.rows)) { if (!byChar.has(cid)) byChar.set(cid, []); byChar.get(cid).push({ build: t.build, pos }); }
  const bad = [];
  const seen = { current: 0, prev: 0, all: 0, none: 0 };
  for (const [cid, entries] of byChar) {
    const want = charTierFrom(entries);
    const got = (await get(`/v1/tiers/by-char?id=${cid}&basis=${basis}`)).data.tier;
    if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${cid}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
    seen[want ? want.scope : 'none']++;
  }
  return { bad, seen, chars: byChar.size };
}

(async () => {
  // 출처·기본
  ok((await get('/v1/health')).data.ok === true, 'health');
  ok((await get('/v1/health', { origin: 'https://evil.example' })).status === 403, '허용 안 된 출처 → 403');
  ok((await post('/v1/posts', { thread: 'char:10441' }, { origin: null })).status === 403, '출처 없는 POST → 403');
  const pre = await call('OPTIONS', '/v1/posts', null);
  ok(pre.status === 204 && pre.headers.get('access-control-allow-origin') === ORIGIN, '사전 요청 응답 + CORS 헤더');

  // 목록 · 비밀 필드 비노출
  const summary = await get('/v1/chars/summary');
  ok(summary.data['10441']?.count >= 6, `동료별 의견 수 (제토 ${summary.data['10441']?.count})`);
  const th = await get('/v1/threads/char%3A10441?sort=best&d=' + DEV_A);
  ok(Array.isArray(th.data) && th.data.length >= 5, '스레드 조회');
  ok(noSecrets(th.text), '스레드 응답에 싫어요·비밀번호·IP 해시 없음');
  ok(th.data[th.data.length - 1].body.startsWith('솔직히'), '추천순: 점수 낮은 글이 맨 아래');
  const tiers = await get('/v1/tiers?basis=any&sort=best');
  ok(tiers.data.length === 8 && noSecrets(tiers.text), '티어표 목록 + 비밀 필드 없음');
  const teams = await get('/v1/teams?with=10443&basis=any');
  ok(teams.data.length === 1 && noSecrets(teams.text), '팀 필터(무명 포함 1개)');
  const agg = await get('/v1/tiers/aggregate?basis=any');
  ok(agg.data.rows.length === 5 && agg.data.sampleCount === 8, '평균 티어 집계');
  // 평균 티어 범위(예시 데이터는 전부 이전 빌드): 자동이면 전체 버전으로 대신 보여 주고, 이번 버전을 직접 고르면 표본 0
  const { CURRENT_BUILD, CHAR_SINCE } = await import('../../dashboard_v2/src/lounge/shared.js');
  ok(agg.data.scope === 'all' && agg.data.build === CURRENT_BUILD, `범위를 안 주면 전체 버전(예전 호출 그대로, 빌드 ${CURRENT_BUILD})`);
  const aggAuto = (await get('/v1/tiers/aggregate?basis=any&scope=auto')).data;
  ok(aggAuto.scope === 'all' && aggAuto.fallback === true && aggAuto.currentCount === 0 && aggAuto.sampleCount === 8, '자동 범위: 이번 버전 티어표 0개 → 전체 버전으로 대신 보여 줌');
  const aggCur = (await get('/v1/tiers/aggregate?basis=any&scope=current')).data;
  ok(aggCur.scope === 'current' && aggCur.fallback === false && aggCur.sampleCount === 0, '이번 버전 직접 고름 → 표본 0 그대로');
  ok((await get('/v1/tiers/aggregate?basis=any&scope=nope')).data.scope === 'all', '모르는 범위 값 → 전체 버전');
  {
    // 버전별(지난 라운지 버전 하나): 예시 데이터는 첫 버전(2.0) 7개 + 목록에 없는 옛 버전 1.7 1개
    const { BUILDS } = await import('../../dashboard_v2/src/lounge/shared.js');
    const first = BUILDS[0];
    const byBuild = (await get(`/v1/tiers/aggregate?basis=any&scope=build&build=${first}`)).data;
    const listed = (await get('/v1/tiers?basis=any')).data.filter((t) => !t.fun && t.build === first).length;
    ok(byBuild.scope === 'build' && byBuild.scopeBuild === first && byBuild.sampleCount === listed && listed > 0 && byBuild.fallback === false, `버전 ${first} 범위 → 그 버전 티어표만 (${byBuild.sampleCount}개)`);
    const outside = (await get('/v1/tiers/aggregate?basis=any&scope=build&build=1.7')).data;
    ok(outside.scope === 'all' && outside.scopeBuild === null && outside.sampleCount === 8, '목록에 없는 버전 → 전체 버전');
    ok((await get('/v1/tiers/aggregate?basis=any&scope=build')).data.scope === 'all', '빌드 값 없는 빌드 범위 → 전체 버전');
    ok(aggCur.scopeBuild === null && agg.data.scopeBuild === null, '빌드 범위가 아니면 scopeBuild 없음');
  }
  {
    const r = await charTierMismatches('any');
    ok(r.chars > 0 && r.bad.length === 0, `동료 커뮤니티 티어 = 공개 목록 재계산 (${r.chars}명, 불일치 ${r.bad.length}${r.bad.length ? ' — ' + r.bad.slice(0, 3).join(' / ') : ''})`);
    // 예시 데이터는 첫 버전(2.0) + 더 옛 버전뿐 → 이번 버전 0명. 2.0 이 바로 이전 버전인 동안은 대부분 이전 버전으로 나온다.
    const { PREV_BUILD: prevBuild, BUILDS: allBuilds } = await import('../../dashboard_v2/src/lounge/shared.js');
    ok(r.seen.current === 0 && r.seen.prev + r.seen.all > 0 && (prevBuild !== allBuilds[0] || r.seen.prev > 0),
      `예시 데이터(지난 버전뿐) → 이번 버전 0 · 이전 버전 ${r.seen.prev} · 전체 버전 ${r.seen.all} · 표본 부족 ${r.seen.none}`);
    ok((await charTierMismatches('boss')).bad.length === 0, '동료 커뮤니티 티어: 기준(보스전) 필터도 같은 값');
    ok((await get('/v1/tiers/by-char?id=99999&basis=any')).status === 404 && (await get('/v1/tiers/by-char?id=1%20OR%201%3D1')).status === 404, '동료 커뮤니티 티어: 없는 동료·주입 모양 id → 404');
    const unknownBasis = (await get('/v1/tiers/by-char?id=10421&basis=nope')).data;
    const anyBasis = (await get('/v1/tiers/by-char?id=10421&basis=any')).data;
    ok(unknownBasis && 'tier' in unknownBasis && JSON.stringify(unknownBasis) === JSON.stringify(anyBasis), '모르는 기준 값 → 기준 없이(모든 기준) 계산');
  }
  ok((await get('/v1/threads/char%3A99999')).status === 404, '없는 동료 스레드 → 404');
  ok((await get("/v1/threads/char%3A10441'%20OR%201%3D1--")).status === 400, 'SQL 주입 모양 스레드 키 → 400');

  // 작성 검증
  ok((await post('/v1/posts', { thread: 'char:10421', body: 'x', pin: '1234', dev: DEV_A })).status === 403, 'Turnstile 토큰 없음 → 403');
  ok((await post('/v1/posts', { thread: 'char:10421', body: '', pin: '1234', ts: TS })).status === 400, '빈 내용 → 400');
  ok((await post('/v1/posts', { thread: 'char:10421', body: 'x'.repeat(1001), pin: '1234', ts: TS })).status === 400, '1000자 초과 → 400');
  ok((await post('/v1/posts', { thread: 'char:10421', body: 'x', pin: '12a4', ts: TS })).status === 400, '비밀번호 형식 오류 → 400');
  ok((await call('POST', '/v1/posts', null, { headers: { 'Content-Type': 'text/plain' } })).status === 400, '빈 본문 → 400');
  const junk = await fetch(BASE + '/v1/posts', { method: 'POST', headers: { Origin: ORIGIN }, body: '[1,2' });
  ok(junk.status === 400, 'JSON 아님 → 400');
  const big = await fetch(BASE + '/v1/posts', { method: 'POST', headers: { Origin: ORIGIN }, body: 'x'.repeat(20000) });
  ok(big.status === 413, '16KB 초과 요청 → 413');

  const p1 = await post('/v1/posts', { thread: 'char:10421', body: '<img src=x onerror=alert(1)> 통합 검사 의견', tags: ['육성', '가짜태그', '보스전', '방탈출'], pin: '1234', ts: TS, dev: DEV_A });
  ok(p1.status === 200 && /^p[0-9a-z]{12}$/.test(p1.data.id), `의견 작성 (${p1.data.anon}#${p1.data.anonNo})`);
  ok(JSON.stringify(p1.data.tags) === '["육성","보스전"]', '태그: 없는 태그 제거·최대 2개');
  ok(p1.data.body.startsWith('<img'), '본문은 원문 그대로 저장(화면이 글자로만 그림 — 스크립트 실행 없음)');
  ok(noSecrets(p1.text), '작성 응답에 비밀 필드 없음');

  // 답글 · 답글의 답글(2단계로 평탄화) · 이어 쓰기
  const r1 = await post('/v1/posts', { thread: 'char:10421', parent: p1.data.id, body: '답글', pin: '5555', ts: TS });
  const r2 = await post('/v1/posts', { thread: 'char:10421', parent: r1.data.id, replyTo: r1.data.anon, body: '답글의 답글', pin: '5555', ts: TS });
  ok(r2.data.parent === p1.data.id && r2.data.replyTo === r1.data.anon, '답글의 답글 → 최상위 아래로 + @대상');
  ok(r1.data.anon !== p1.data.anon || r1.data.anonNo !== p1.data.anonNo, '다른 사람 답글은 다른 익명 이름');
  const cont = await post('/v1/posts', { thread: 'char:10421', parent: p1.data.id, body: '이어 쓰기', pin: '1234', asPostId: p1.data.id, asPin: '1234', ts: TS });
  ok(cont.data.anon === p1.data.anon && cont.data.anonNo === p1.data.anonNo, '비밀번호로 이어 쓰기 → 같은 이름');
  const cross = await post('/v1/posts', { thread: 'char:10441', body: '다른 게시판 사칭', pin: '1234', asPostId: p1.data.id, asPin: '1234', ts: TS });
  ok(cross.status === 403, '다른 게시판에서 이름 이어 쓰기 → 403');
  const wrongAs = await post('/v1/posts', { thread: 'char:10421', body: '틀린 이어 쓰기', pin: '1234', asPostId: p1.data.id, asPin: '0000', ts: TS });
  ok(wrongAs.status === 403, '이어 쓰기 비밀번호 틀림 → 403');

  // 수정 · 비밀번호 잠금
  ok((await post(`/v1/posts/${p1.data.id}/edit`, { pin: '1234', body: '수정됨' })).data.edited, '비밀번호로 수정');
  const target = await post('/v1/posts', { thread: 'char:10421', body: '잠금 검사', pin: '7777', ts: TS });
  let last;
  for (let i = 0; i < 5; i++) last = await post(`/v1/items/${target.data.id}/verify`, { pin: '0000' });
  ok(last.status === 423, `5회 틀리면 잠금 (${last.data.error})`);
  ok((await post(`/v1/items/${target.data.id}/verify`, { pin: '7777' })).status === 423, '잠긴 동안은 맞는 비밀번호도 거부');

  // 좋아요 · 싫어요
  const a1 = await post('/v1/react', { target: 'post:' + p1.data.id, value: 1, dev: DEV_A });
  const a2 = await post('/v1/react', { target: 'post:' + p1.data.id, value: 1, dev: DEV_B });
  const a3 = await post('/v1/react', { target: 'post:' + p1.data.id, value: -1, dev: DEV_A });
  const a4 = await post('/v1/react', { target: 'post:' + p1.data.id, value: -1, dev: DEV_A });
  ok(a1.data.likes === 1 && a2.data.likes === 2 && a3.data.likes === 1 && a3.data.vote === -1 && a4.data.vote === 0, '좋아요·싫어요 전환·취소');
  ok(noSecrets(a3.text), '반응 응답에 싫어요 수 없음');
  ok((await post('/v1/react', { target: 'post:../../x', value: 1 })).status === 400, '잘못된 대상 → 400');
  ok((await post('/v1/react', { target: 'post:' + p1.data.id, value: 5 })).status === 400, '잘못된 값 → 400');

  // 신고
  const rep1 = await post('/v1/report', { target: 'post:' + p1.data.id, reason: '검사', dev: DEV_A });
  const rep2 = await post('/v1/report', { target: 'post:' + p1.data.id, reason: '검사', dev: DEV_A });
  ok(rep1.data.ok === true && rep2.data.ok === false, '같은 기기 중복 신고 무시');

  // 티어표
  const bad1 = await post('/v1/tiers', { title: 't', basis: 'all', rows: [{ label: 'S', ids: [10441] }, { label: 'A', ids: [10441] }], pin: '1111', ts: TS });
  ok(bad1.status === 400, '같은 동료 두 행 → 400');
  const bad2 = await post('/v1/tiers', { title: 't', basis: 'all', rows: [{ label: 'S', ids: [99999] }, { label: 'A', ids: [] }], pin: '1111', ts: TS });
  ok(bad2.status === 400, '없는 동료 → 400');
  const bad3 = await post('/v1/tiers', { title: 't', basis: 'nope', rows: [{ label: 'S', ids: [10441] }, { label: 'A', ids: [] }], pin: '1111', ts: TS });
  ok(bad3.status === 400, '잘못된 기준 → 400');
  const t1 = await post('/v1/tiers', { title: '통합 검사 티어', basis: 'boss', rows: [{ label: 'S', ids: [10441, 10443] }, { label: 'A', ids: [10401] }, { label: 'B', ids: [] }], descr: '설명', pin: '1111', ts: TS });
  ok(t1.status === 200 && t1.data.rows.length === 3, '티어표 공개');
  const tc = await post('/v1/posts', { thread: 'tier:' + t1.data.id, body: '티어표 의견', pin: '1111', asPostId: t1.data.id, asPin: '1111', ts: TS });
  ok(tc.data.anon === t1.data.anon, '티어표 작성자 이름으로 의견 이어 쓰기');
  // 집계 제외 티어표: 목록에는 보이지만 평균 티어 집계(표본 수)에서는 빠진다
  const aggBefore = (await get('/v1/tiers/aggregate?basis=any')).data.sampleCount;
  const tf = await post('/v1/tiers', { title: '집계 제외 검사 티어', basis: 'free', rows: [{ label: '웃김', ids: [10441] }, { label: '안 웃김', ids: [] }], fun: true, pin: '1111', ts: TS },
    { headers: { 'X-Test-Gap-Scale': '100', 'X-Test-Rate-Scale': '100' } });
  ok(tf.status === 200 && tf.data.fun === true, '집계 제외 티어표 공개(fun 표시)');
  ok((await get('/v1/tiers/aggregate?basis=any')).data.sampleCount === aggBefore, '집계 제외 티어표는 평균 티어에서 제외');
  ok((await get('/v1/tiers?basis=any&sort=new')).data.some((x) => x.id === tf.data.id), '집계 제외 티어표도 목록에는 보임');

  // 팀
  const dup = await post('/v1/teams', { code: '#eJyLjjbUUVLSMdAx0ImOjjYxMIzViTYxNACRRmC2kQWYNI0FAQACxguo', title: 'x', basis: 'boss', pin: '2222', ts: TS });
  ok(dup.status === 409 && /^m/.test(dup.data.dupId), '이미 공유된 코드 → 409 + dupId');
  const badCode = await post('/v1/teams', { code: '#AAAA', title: 'x', basis: 'boss', pin: '2222', ts: TS });
  ok(badCode.status === 400, '잘못된 코드 → 400');
  const { encodeShare } = await import('../../dashboard_v2/src/core/codec.js');
  const fresh = await encodeShare([{ id: 1, snap: { team: [10443, 10401, 10421, 10428, 10425].map((id) => ({ id, skill: 10, rune: true, rotation: '' })), turns: 20, dummies: 2, enemyHits: 'all', dummyElement: 0, runs: 50 }, total: 0 }]);
  const m1 = await post('/v1/teams', { code: fresh, ids: [10417], summary: { turns: 999 }, title: '통합 검사 팀', basis: 'boss', descr: '설명', pin: '2222', ts: TS });
  ok(m1.status === 200 && m1.data.ids.join() === '10443,10401,10421,10428,10425' && m1.data.summary.turns === 20, '팀 올리기: 동료·요약은 서버가 코드에서 다시 정함(클라이언트 값 무시)');
  ok((await get('/v1/teams/count?with=10443')).data.count === 2, '동료 포함 팀 수');
  ok((await get('/v1/teams/by-code?code=' + encodeURIComponent(fresh))).data.team.id === m1.data.id, '코드로 팀 찾기');

  // 삭제
  const delWrong = await post(`/v1/items/${m1.data.id}/delete`, { pin: '0000' });
  ok(delWrong.status === 403, '틀린 비밀번호 삭제 거부');
  ok((await post(`/v1/items/${p1.data.id}/delete`, { pin: '1234' })).data.kept === true, '답글 있는 의견 삭제 → 자리만 남김');
  const th2 = await get('/v1/threads/char%3A10421');
  const kept = th2.data.find((p) => p.id === p1.data.id);
  ok(kept && kept.deleted && kept.body === '' && kept.replies.length === 3, '삭제 자리 + 답글 유지');
  ok((await post(`/v1/items/${m1.data.id}/delete`, { pin: '2222' })).data.ok, '팀 삭제');
  ok((await get(`/v1/teams/${m1.data.id}`)).status === 404, '삭제된 팀 → 404');

  // 내 활동
  const it = await get(`/v1/items?ids=${[t1.data.id, r1.data.id, 'pzzzzzzzzzzzz', "x' OR 1=1"].join(',')}`);
  ok(it.data.length === 2 && noSecrets(it.text), '내 활동 조회(없는·이상한 ID 무시)');

  // 관리자
  ok((await post('/v1/admin/lock', { on: true }, { headers: { Authorization: 'Bearer wrong' } })).status === 401, '관리자 토큰 틀림 → 401');
  ok((await get('/v1/admin/reports')).status === 401, '관리자 토큰 없음 → 401');

  // 관리자(로컬 .dev.vars 토큰 — 화면에 출력하지 않음)
  const { readFileSync } = await import('node:fs');
  const adminTok = (/^ADMIN_TOKEN=(.+)$/m.exec(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')) || [])[1]?.trim();
  const A = { headers: { Authorization: 'Bearer ' + adminTok } };
  const reps = await get('/v1/admin/reports', A);
  ok(reps.status === 200 && reps.data.some((g) => g.target === 'post:' + p1.data.id), '관리자: 신고 목록');
  ok((await post('/v1/admin/lock', { on: true }, A)).data.writeLock === true, '관리자: 글쓰기 잠금');
  ok((await post('/v1/posts', { thread: 'char:10421', body: '잠금 중', pin: '1234', ts: TS })).status === 503, '잠금 중 작성 → 503');
  ok((await post('/v1/admin/lock', { on: false }, A)).data.writeLock === false, '관리자: 잠금 해제');
  ok((await post('/v1/admin/moderate', { target: 'post:' + r1.data.id, action: 'hide' }, A)).data.ok, '관리자: 숨김');
  const th3 = await get('/v1/threads/char%3A10421');
  ok(!JSON.stringify(th3.data).includes(r1.data.id), '숨긴 글은 목록에서 빠짐');
  ok((await post('/v1/admin/moderate', { target: 'post:' + r1.data.id, action: 'show' }, A)).data.ok, '관리자: 다시 보이기');

  // ── 운영자 글 보호: 비밀번호를 알아도 운영자('파미도') 글은 토큰 없이 못 바꾼다 ──
  const opPost = await post('/v1/posts', { thread: 'char:10406', body: '운영자 보호 검사 글', pin: '4321', ts: TS }, A);
  ok(opPost.status === 200 && opPost.data.op, '운영자 글 작성');
  const opEdit = await post(`/v1/posts/${opPost.data.id}/edit`, { pin: '4321', body: '비밀번호로 바꾸기 시도' });
  ok(opEdit.status === 403 && opEdit.data.code === 'opLocked', `운영자 글: 맞는 비밀번호로 수정 → 403 opLocked (${opEdit.status} ${opEdit.data.code})`);
  const opDel = await post(`/v1/items/${opPost.data.id}/delete`, { pin: '4321' });
  ok(opDel.status === 403 && opDel.data.code === 'opLocked', `운영자 글: 맞는 비밀번호로 삭제 → 403 opLocked (${opDel.status} ${opDel.data.code})`);
  const opEdit2 = await post(`/v1/posts/${opPost.data.id}/edit`, { pin: '4321', body: '운영자 토큰으로 수정' }, A);
  ok(opEdit2.status === 200, `운영자 토큰으로는 수정 가능 (${opEdit2.status})`);

  // ── 도배 방지 ──
  const as = (ip, extra = {}) => ({ headers: { 'CF-Connecting-IP': ip, 'X-Test-Rate-Scale': '1', 'X-Test-Gap-Scale': '1', ...extra } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 연속 작성 간격 15초
  const g1 = await post('/v1/posts', { thread: 'char:10402', body: '간격 검사 첫 글', pin: '1234', ts: TS }, as('20.0.0.1'));
  const g2 = await post('/v1/posts', { thread: 'char:10403', body: '간격 검사 두 번째 글', pin: '1234', ts: TS }, as('20.0.0.1'));
  ok(g1.status === 200 && g2.status === 429 && g2.data.retryAfter > 0 && g2.data.retryAfter <= 15, `연속 작성 15초 간격 (${g2.data.error})`);
  const g3 = await post('/v1/posts', { thread: 'char:10403', body: '빈 내용 실패는 간격을 시작하지 않음', pin: '1234', ts: TS }, as('20.0.0.2'));
  ok(g3.status === 200, '실패한 요청 없이 첫 글은 바로 가능');
  // 내용 도배
  ok((await post('/v1/posts', { thread: 'char:10404', body: 'ㅋ'.repeat(25), pin: '1234', ts: TS }, as('20.0.0.3'))).status === 400, '같은 글자 반복 → 400');
  ok((await post('/v1/posts', { thread: 'char:10404', body: '도배도배도배도배도배도배도배도배', pin: '1234', ts: TS }, as('20.0.0.4'))).status === 400, '같은 말 반복 → 400');
  ok((await post('/v1/posts', { thread: 'char:10404', body: 'http://a.io http://b.io http://c.io', pin: '1234', ts: TS }, as('20.0.0.5'))).status === 400, '링크 3개 → 400');
  ok((await post('/v1/posts', { thread: 'char:10404', body: 'ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ 이건 정상 의견', pin: '1234', ts: TS }, as('20.0.0.6'))).status === 200, '보통 수준의 ㅋㅋ 는 허용');
  const sp = await post('/v1/posts', { thread: 'char:10404', body: '멀쩡한 글', pin: '1234', ts: TS }, as('20.0.0.7'));
  ok((await post(`/v1/posts/${sp.data.id}/edit`, { pin: '1234', body: 'ㅋ'.repeat(30) }, as('20.0.0.7'))).status === 400, '수정으로 도배 내용 넣기 → 400');
  // 같은 내용 반복(24시간)
  const d1 = await post('/v1/posts', { thread: 'char:10405', body: '같은 내용 검사 문장입니다', pin: '1234', ts: TS }, as('20.0.1.1'));
  const d2 = await post('/v1/posts', { thread: 'char:10405', body: '같은 내용  검사 문장입니다!!', pin: '1234', ts: TS }, as('20.0.1.2'));
  ok(d1.status === 200 && d2.status === 409, '같은 게시판에 같은 내용(띄어쓰기·문장부호만 다름) → 409');
  await post('/v1/posts', { thread: 'char:10406', body: '다른 게시판 복붙 검사', pin: '1234', ts: TS }, as('20.0.1.3', { 'X-Test-Gap-Scale': '100' }));
  const d4 = await post('/v1/posts', { thread: 'char:10407', body: '다른 게시판 복붙 검사', pin: '1234', ts: TS }, as('20.0.1.3', { 'X-Test-Gap-Scale': '100' }));
  ok(d4.status === 409, '같은 사람이 다른 게시판에 같은 글 → 409');
  // 한 게시판 10분 5개 (간격 끔)
  const burst = [];
  for (let i = 0; i < 6; i++) burst.push((await post('/v1/posts', { thread: 'char:10408', body: `게시판 몰아쓰기 검사 ${i} 번째 내용`, pin: '1234', ts: TS }, as(`20.0.2.${1 + (i >> 1)}`, { 'X-Test-Gap-Scale': '100', 'X-Test-Rate-Scale': '100' }))).status);
  ok(burst.every((s) => s === 200), `서로 다른 사람은 제한 없음 (${burst.join(',')})`);
  const one = [];
  for (let i = 0; i < 6; i++) one.push((await post('/v1/posts', { thread: 'char:10409', body: `한 사람 몰아쓰기 ${i} 번째 의견`, pin: '1234', ts: TS }, { headers: { 'CF-Connecting-IP': '20.0.3.1', 'X-Test-Gap-Scale': '100', 'X-Test-Rate-Scale': '2' } })).status);
  ok(one.slice(0, 5).every((s) => s === 200) || one.includes(429), `한 사람 한 게시판 연속 (${one.join(',')})`);
  // 분당 3개(간격 끔, 서로 다른 게시판)
  const wm = [];
  for (let i = 0; i < 4; i++) wm.push((await post('/v1/posts', { thread: `char:104${11 + i}`, body: `분당 한도 검사 ${i} 번째`, pin: '1234', ts: TS }, as('20.0.4.1', { 'X-Test-Gap-Scale': '100' }))).status);
  ok(JSON.stringify(wm) === '[200,200,200,429]', `IP 분당 3개 (${wm.join(',')})`);
  // 사이트 전체 급증 → 10분 비상 정지 → 관리자 해제
  let tripped = null;
  for (let i = 0; i < 80 && !tripped; i++) {
    const r = await post('/v1/posts', { thread: `char:${[10415, 10416, 10417, 10418, 10419][i % 5]}`, body: `급증 검사 ${i}번 ${Math.random()}`, pin: '1234', ts: TS }, { headers: { 'X-Test-Rate-Scale': '1', 'X-Test-Gap-Scale': '100' } });
    if (r.status === 503) tripped = { i, r };
  }
  ok(!!tripped, `사이트 전체 분당 60 초과 → 503 비상 정지 (${tripped && tripped.i}번째, ${tripped && tripped.r.data.error})`);
  ok((await post('/v1/posts', { thread: 'char:10421', body: '정지 중 다른 사람 글 ' + Math.random(), pin: '1234', ts: TS })).status === 503, '비상 정지 동안은 누구도 쓰기 불가');
  ok((await post('/v1/react', { target: 'post:' + g1.data.id, value: 1 })).status === 200, '비상 정지 중에도 읽기·반응은 됨');
  ok((await post('/v1/admin/lock', { on: false }, A)).data.writeLock === false, '관리자 unlock 이 비상 정지도 해제');
  ok((await post('/v1/posts', { thread: 'char:10421', body: '해제 후 글 ' + Math.random(), pin: '1234', ts: TS })).status === 200, '해제 후 쓰기 가능');

  // ── 운영자(파미도) — 사이트 전체 분당 한도 검사 뒤에 둔다(익명 45명이 전체 카운터를 채우므로) ──
  const OPH = { headers: { ...A.headers, 'X-Test-Gap-Scale': '100' } };
  const op1 = await post('/v1/posts', { thread: 'char:10426', body: '운영자 첫 글입니다', pin: '4321' }, OPH);   // 봇 확인 토큰 없이
  ok(op1.status === 200 && op1.data.op === true && op1.data.anon === 10421, `운영자 글 → op, 파미도(10421) (${op1.status})`);
  const opBad = await post('/v1/posts', { thread: 'char:10426', body: '가짜 운영자', pin: '4321', ts: TS }, { headers: { Authorization: 'Bearer ' + 'f'.repeat(64) } });
  ok(opBad.status === 401, '틀린 토큰으로 운영자 글 → 401(일반 글로 올라가지 않음)');
  const opCont = await post('/v1/posts', { thread: 'char:10426', parent: op1.data.id, body: '파미도 사칭 시도', pin: '4321', asPostId: op1.data.id, asPin: '4321', ts: TS });
  ok(opCont.status === 403, '운영자 글 비밀번호를 알아도 이름 이어 쓰기 불가');
  const opTier = await post('/v1/tiers', { title: '운영자 티어표', basis: 'all', rows: [{ label: 'S', ids: [10441] }, { label: 'A', ids: [] }], pin: '4321' }, OPH);
  ok(opTier.data.op === true && opTier.data.anon === 10421, '운영자 티어표');
  // 익명 이름 후보에 파미도 없음: 후보(동료 수 − 파미도)보다 많이 써도 10421 이 안 나오고, 후보를 다 쓰면 번호가 붙는다
  const POOL = Object.keys(JSON.parse(readFileSync(new URL('../../data/chars.json', import.meta.url), 'utf8'))).length - 1;
  const WRITERS = POOL + 4;
  const names = [];
  for (let i = 0; i < WRITERS; i++) {
    const r = await post('/v1/posts', { thread: 'char:10427', body: `익명 이름 검사 ${i} 번째 사람 ${Math.random()}`, pin: '1234', ts: TS }, { headers: { 'X-Test-Gap-Scale': '100', 'X-Test-Rate-Scale': '100' } });
    if (r.status === 200) names.push(`${r.data.anon}:${r.data.anonNo}`);
  }
  ok(names.length === WRITERS && !names.some((n) => n.startsWith('10421:')), `익명 ${WRITERS}명 중 파미도 0 (${names.length}명)`);
  ok(new Set(names).size === WRITERS && names.filter((n) => n.endsWith(':1')).length === POOL, `${POOL}종 소진 후 번호 이름 (${names.filter((n) => !n.endsWith(':1')).join(',')})`);
  const th4 = await get('/v1/threads/char%3A10426');
  ok(th4.data.some((p) => p.op && p.anon === 10421) && !th4.data.some((p) => !p.op && p.anon === 10421), '목록에서 op 표시는 운영자 글에만');

  // ── 고정 의견 ──
  const pinP = await post('/v1/posts', { thread: 'char:10421', body: '고정 검사 운영자 글', pin: '4321' }, OPH);
  ok((await post('/v1/admin/moderate', { target: 'post:' + pinP.data.id, action: 'pin' }, A)).data.pinned === true, '관리자: 고정');
  for (const sort of ['best', 'new']) {
    const t = await get(`/v1/threads/char%3A10421?sort=${sort}`);
    ok(t.data[0].id === pinP.data.id && t.data[0].pinned === true && t.data.filter((x) => x.pinned).length === 1, `고정 글이 ${sort} 정렬에서도 맨 위`);
  }
  for (let i = 0; i < 3; i++) await post('/v1/react', { target: 'post:' + pinP.data.id, value: -1, dev: String(i).repeat(32) });
  ok((await get('/v1/threads/char%3A10421?sort=best')).data[0].id === pinP.data.id, '싫어요를 받아도 맨 위 유지');
  ok((await post(`/v1/posts/${pinP.data.id}/edit`, { pin: '4321', body: '바꿔치기 시도' })).status === 403, '고정 글: 비밀번호만으로 수정 불가');
  ok((await post(`/v1/items/${pinP.data.id}/delete`, { pin: '4321' })).status === 403, '고정 글: 비밀번호만으로 삭제 불가');
  ok((await post(`/v1/posts/${pinP.data.id}/edit`, { pin: '4321', body: '운영자가 고친 고정 글' }, A)).data.body === '운영자가 고친 고정 글', '고정 글: 운영자 토큰이면 수정 가능');
  const rep = await post('/v1/posts', { thread: 'char:10421', parent: pinP.data.id, body: '고정 글에 단 답글', pin: '1234', ts: TS }, { headers: { 'X-Test-Gap-Scale': '100', 'X-Test-Rate-Scale': '100' } });
  ok(rep.status === 200, '고정 글에 답글은 가능');
  ok((await post('/v1/admin/moderate', { target: 'post:' + rep.data.id, action: 'pin' }, A)).status === 200, '답글도 고정 가능');
  {
    const th = (await get('/v1/threads/char%3A10421')).data;
    const top = (th.posts || th).find((x) => x.id === pinP.data.id);
    const r = top && top.replies.find((x) => x.id === rep.data.id);
    ok(!!r && r.pinned === true && top.pinned === true, '답글 고정은 그 답글에만 표시');
  }
  ok((await post('/v1/admin/moderate', { target: 'post:' + rep.data.id, action: 'unpin' }, A)).status === 200, '답글 고정 해제');
  ok((await post('/v1/admin/moderate', { target: 'post:' + pinP.data.id, action: 'pin' }, { headers: { Authorization: 'Bearer ' + 'e'.repeat(64) } })).status === 401, '관리자 토큰 없이는 고정·해제 불가');
  ok((await post('/v1/admin/moderate', { target: 'post:' + pinP.data.id, action: 'unpin' })).status === 401, '토큰 없이 고정 해제 시도 → 401');
  for (let i = 0; i < 12; i++) await post('/v1/report', { target: 'post:' + pinP.data.id, reason: '신고 폭주', dev: (i + 10).toString(16).padStart(32, '0') });
  ok((await get('/v1/threads/char%3A10421')).data[0].id === pinP.data.id, '신고가 몰려도 자동으로 숨겨지지 않고 맨 위');
  ok((await post('/v1/admin/moderate', { target: 'post:' + pinP.data.id, action: 'unpin' }, A)).data.pinned === false, '관리자: 고정 해제');

  // ── 티어표·팀 수정 ──
  const ET = { headers: { 'X-Test-Gap-Scale': '100', 'X-Test-Rate-Scale': '100' } };
  const et = await post('/v1/tiers', { title: '수정 검사 티어', basis: 'boss', rows: [{ label: 'S', ids: [10443] }, { label: 'A', ids: [10401] }], pin: '2468', ts: TS }, ET);
  ok((await post(`/v1/tiers/${et.data.id}/edit`, { pin: '0000', title: '가로채기', basis: 'boss', rows: [{ label: 'S', ids: [10401] }, { label: 'A', ids: [] }] })).status === 403, '티어표 수정: 틀린 비밀번호 거부');
  const et2 = await post(`/v1/tiers/${et.data.id}/edit`, { pin: '2468', title: '수정된 티어', basis: 'escape', rows: [{ label: 'S', ids: [10401] }, { label: 'A', ids: [10443, 10441] }, { label: 'B', ids: [] }], descr: '고침' });
  ok(et2.status === 200 && et2.data.title === '수정된 티어' && et2.data.basis === 'escape' && et2.data.rows.length === 3 && et2.data.edited, '티어표 수정: 제목·기준·행·배치 반영 + 수정됨');
  ok((await get(`/v1/tiers/${et.data.id}`)).data.rows[1].ids.join() === '10443,10441', '티어표 수정 내용 조회');
  ok((await post(`/v1/tiers/${et.data.id}/edit`, { pin: '2468', title: 'x', basis: 'boss', rows: [{ label: 'S', ids: [10401] }, { label: 'A', ids: [10401] }] })).status === 400, '티어표 수정: 같은 동료 두 번 → 400');
  ok((await post(`/v1/tiers/${et.data.id}/edit`, { title: '운영자가 고침', basis: 'all', rows: [{ label: 'S', ids: [10401] }, { label: 'A', ids: [] }] }, A)).data.title === '운영자가 고침', '티어표 수정: 운영자 토큰(비밀번호 없이)');
  const em = await post('/v1/teams', { code: await encodeShare([{ id: 1, snap: { team: [10441, 10401, 10421].map((id) => ({ id, skill: 10, rune: true, rotation: '' })), turns: 30, dummies: 1, enemyHits: 'all', dummyElement: 0, runs: 50 }, total: 0 }]), title: '수정 검사 팀', basis: 'boss', descr: '처음 설명', pin: '1357', ts: TS }, ET);
  ok((await post(`/v1/teams/${em.data.id}/edit`, { pin: '0000', title: 'x', basis: 'boss', descr: '' })).status === 403, '팀 수정: 틀린 비밀번호 거부');
  const em2 = await post(`/v1/teams/${em.data.id}/edit`, { pin: '1357', title: '수정된 팀', basis: 'free', descr: '바뀐 설명', code: '#무시' });
  ok(em2.data.title === '수정된 팀' && em2.data.basis === 'free' && em2.data.descr === '바뀐 설명' && em2.data.code === em.data.code && em2.data.edited, '팀 수정: 제목·기준·설명만 바뀌고 코드는 그대로');

  // ── 티어표 끌올: 이번 빌드에 들어온 동료를 이전 빌드 티어표에 넣으면 빌드가 올라가고 최신순 맨 위로 ──
  {
    const lateId = +(Object.entries(CHAR_SINCE).find(([, b]) => b === CURRENT_BUILD) || [])[0];
    const oldT = (await get('/v1/tiers?basis=any&sort=new')).data
      .filter((x) => x.build !== CURRENT_BUILD && !x.op && !x.rows.some((r) => r.ids.includes(lateId))).pop();
    ok(!!lateId && !!oldT, `끌올 검사 준비: 이번 빌드 동료 ${lateId} · 이전 빌드 티어표 ${oldT && oldT.build}`);
    if (lateId && oldT) {
      const edit = (rows) => post(`/v1/tiers/${oldT.id}/edit`, { title: oldT.title, basis: oldT.basis, rows, descr: oldT.descr, fun: oldT.fun }, A);
      const plain = (await edit(oldT.rows)).data;
      ok(plain.build === oldT.build && !plain.bumped && plain.edited, '새 동료 없이 수정 → 빌드 그대로 · 끌올 없음');
      ok((await get('/v1/tiers?basis=any&sort=new')).data[0].id !== oldT.id, '끌올 없는 수정은 목록 순서 그대로');
      const withLate = oldT.rows.map((r, i) => (i === 0 ? { ...r, ids: [...r.ids, lateId] } : r));
      const up = (await edit(withLate)).data;
      ok(up.build === CURRENT_BUILD && up.bumped > oldT.at && up.at === oldT.at, `이번 빌드 동료를 넣음 → 빌드 ${oldT.build} → ${up.build} + 끌올(작성 시각은 그대로)`);
      ok((await get('/v1/tiers?basis=any&sort=new')).data[0].id === oldT.id, '끌올된 티어표가 최신순 맨 위');
      const again = (await edit(withLate.map((r) => ({ ...r, label: r.label })))).data;
      ok(again.bumped === up.bumped && again.build === CURRENT_BUILD, '이미 올라간 티어표를 다시 수정해도 끌올 시각 그대로');
      const cur = (await get(`/v1/tiers/aggregate?basis=any&scope=current`)).data;
      ok(cur.currentCount >= 1 && cur.sampleCount === cur.currentCount, `끌올된 티어표는 이번 버전 평균에 들어감 (이번 버전 ${cur.currentCount}개)`);
    }
  }

  // ── 동료 커뮤니티 티어: 이번 버전 티어표가 최소 개수만큼 쌓인 동료는 이번 버전 값 ──
  {
    const { AGG_MIN_SAMPLES } = await import('../../dashboard_v2/src/lounge/shared.js');
    const ET = { headers: { 'X-Test-Gap-Scale': '100', 'X-Test-Rate-Scale': '100' } };
    const cid = 10405;
    for (let i = 0; i < AGG_MIN_SAMPLES; i++) {
      const rows = [{ label: 'S', ids: [cid] }, { label: 'A', ids: [] }, { label: 'B', ids: [] }, { label: 'C', ids: [] }, { label: 'D', ids: [] }];
      const made = await post('/v1/tiers', { title: `버전 검사 ${i + 1}`, basis: 'free', rows, pin: '1470', ts: TS }, ET);
      ok(made.status === 200 && made.data.build === CURRENT_BUILD, `버전 검사 티어표 ${i + 1} (빌드 ${made.data.build})`);
    }
    const t = (await get(`/v1/tiers/by-char?id=${cid}&basis=any`)).data.tier;
    ok(t && t.scope === 'current' && t.build === CURRENT_BUILD && t.n >= AGG_MIN_SAMPLES, `이번 버전 표본이 차면 이번 버전 (${JSON.stringify(t)})`);
    const r = await charTierMismatches('any');
    ok(r.bad.length === 0 && r.seen.current > 0, `끌올·새 티어표 뒤에도 공개 목록 재계산과 같음 (이번 버전 ${r.seen.current} · 이전 버전 ${r.seen.prev} · 전체 버전 ${r.seen.all} · 불일치 ${r.bad.length})`);
  }

  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL exception', e); process.exit(1); });
