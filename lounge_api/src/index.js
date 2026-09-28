/**
 * XXL 라운지 API — Cloudflare Worker + D1.
 *
 * 응답 원칙
 *  - 싫어요 수, 비밀번호 해시·솔트·실패 횟수, IP 해시는 절대 응답에 싣지 않는다(pub* 함수가 화이트리스트로 고른다).
 *  - 쓰기(글·티어표·팀)는 허용된 출처 + Turnstile + IP 해시별 요청 제한을 모두 통과해야 한다.
 *  - 모든 SQL 은 바인딩 파라미터만 쓴다(문자열 이어 붙이기 금지. IN 목록도 ?n 자리표시자만 이어 붙인다).
 *
 * 요청 형식: POST 본문은 JSON 을 text/plain 으로 받는다 → 브라우저 사전 요청(OPTIONS)이 생기지 않아 하루 요청 한도를 두 배로 쓰지 않는다.
 * 기기 식별(반응 중복 방지)은 GET 은 ?d=, POST 는 본문 dev 로 받는다.
 */
import charsJson from '../../data/chars.json' with { type: 'json' };
import { LIMITS, POST_TAGS, TIER_BASIS, TEAM_BASIS, CURRENT_BUILD, ANTISPAM, OPERATOR, isPin, hotScore, aggregateRows, spamReason } from '../../dashboard_v2/src/lounge/shared.js';
import { HttpError, E, hmacHex, safeEqual, randomId, ipHash, voterOf, pinHash, limit, checkGap, markWrite, bodyKey, checkTurnstile, allowedOrigin, corsHeaders, cleanText } from './security.js';
import { readTeamCode } from './teamcode.js';
import KR from '../../dashboard_v2/i18n/lounge/kr.json' with { type: 'json' };

const CHAR_IDS = Object.keys(charsJson).map(Number).sort((a, b) => a - b);
/** 익명 이름 후보 — 운영자 동료(파미도)는 빼서 '익명의 파미도'가 생기지 않게 한다. */
const ANON_POOL = CHAR_IDS.filter((id) => id !== OPERATOR.anon);
const CHAR_SET = new Set(CHAR_IDS);
const MAX_BODY_BYTES = 16 * 1024;
const PIN_MAX_FAIL = 5;
const PIN_LOCK_MS = 60 * 60 * 1000;
const THREAD_MAX_POSTS = 500;
const LIST_MAX = 200;
const RECENT_MAX = 20;
const ITEMS_MAX = 60;
const TIER_BASIS_KEYS = new Set(TIER_BASIS.map((b) => b.key));
const TEAM_BASIS_KEYS = new Set(TEAM_BASIS.map((b) => b.key));
const TAG_SET = new Set(POST_TAGS);
const RE_ID = { p: /^p[0-9a-z]{12}$/, t: /^t[0-9a-z]{12}$/, m: /^m[0-9a-z]{12}$/ };
const RE_THREAD = /^(char:\d{5}|tier:t[0-9a-z]{12}|team:m[0-9a-z]{12})$/;

// ── 응답 ────────────────────────────────────────────────────────────────
function json(data, status, origin, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...corsHeaders(origin), ...extra },
  });
}

const pubPost = (r, vote = 0) => ({
  id: r.id, thread: r.thread, parent: r.parent || null, replyTo: r.reply_to ?? null, anon: r.anon, anonNo: r.anon_no, op: !!r.op,
  body: r.deleted ? '' : r.body, tags: r.deleted ? [] : JSON.parse(r.tags || '[]'), build: r.build, at: r.created_at,
  edited: r.edited_at || null, deleted: !!r.deleted, pinned: !!r.pinned, likes: r.likes, vote,
});
const pubTier = (r, vote = 0, comments = 0) => ({
  id: r.id, title: r.title, basis: r.basis, rows: JSON.parse(r.rows), descr: r.descr, anon: r.anon, anonNo: r.anon_no, op: !!r.op,
  build: r.build, at: r.created_at, edited: r.edited_at || null, likes: r.likes, vote, comments,
});
const pubTeam = (r, vote = 0, comments = 0) => ({
  id: r.id, code: r.code, ids: r.ids.split(',').map(Number), summary: JSON.parse(r.summary), title: r.title, basis: r.basis, descr: r.descr,
  anon: r.anon, anonNo: r.anon_no, op: !!r.op, build: r.build, at: r.created_at, edited: r.edited_at || null, likes: r.likes, vote, comments,
});

// ── 공용 조회 ─────────────────────────────────────────────────────────────
const TABLE_OF = { p: 'posts', t: 'tiers', m: 'teams' };
function tableOfId(id) {
  const k = typeof id === 'string' ? id[0] : '';
  if (!RE_ID[k] || !RE_ID[k].test(id)) throw E(400, 'idBad');
  return TABLE_OF[k];
}
async function getItem(env, id) {
  const table = tableOfId(id);
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?1`).bind(id).first();
  if (!row || row.status !== 'ok') throw E(404, 'notFound');
  return { table, row };
}
const threadOfItem = (table, row) => (table === 'posts' ? row.thread : table === 'tiers' ? 'tier:' + row.id : 'team:' + row.id);

async function myVotes(env, voter, targets) {
  const out = new Map();
  for (let i = 0; i < targets.length; i += 90) {
    const part = targets.slice(i, i + 90);
    if (!part.length) continue;
    const ph = part.map((_, k) => `?${k + 2}`).join(',');
    const { results } = await env.DB.prepare(`SELECT target, value FROM votes WHERE voter = ?1 AND target IN (${ph})`).bind(voter, ...part).all();
    for (const r of results) out.set(r.target, r.value);
  }
  return out;
}
async function commentCounts(env, threads) {
  const out = new Map();
  for (let i = 0; i < threads.length; i += 90) {
    const part = threads.slice(i, i + 90);
    if (!part.length) continue;
    const ph = part.map((_, k) => `?${k + 1}`).join(',');
    const { results } = await env.DB.prepare(`SELECT thread, count FROM thread_stats WHERE thread IN (${ph})`).bind(...part).all();
    for (const r of results) out.set(r.thread, r.count);
  }
  return out;
}

/** 스레드가 실제로 있는지(동료 ID 유효 / 티어표·팀 존재). */
async function assertThread(env, key) {
  if (!RE_THREAD.test(key || '')) throw E(400, 'threadBad');
  const [kind, ref] = key.split(':');
  if (kind === 'char') { if (!CHAR_SET.has(+ref)) throw E(404, 'charNotFound'); return kind; }
  const row = await env.DB.prepare(`SELECT status FROM ${kind === 'tier' ? 'tiers' : 'teams'} WHERE id = ?1`).bind(ref).first();
  if (!row || row.status !== 'ok') throw E(404, 'notFound');
  return kind;
}

/** 스레드에서 아직 안 쓰인 동료 이름을 무작위로(다 쓰였으면 번호). idents 에 기록까지. */
async function pickAnon(env, thread) {
  const { results } = await env.DB.prepare('SELECT anon, anon_no FROM idents WHERE thread = ?1').bind(thread).all();
  const used = new Set(results.map((r) => `${r.anon}:${r.anon_no}`));
  const usedChars = new Set(results.map((r) => r.anon));
  const free = ANON_POOL.filter((id) => !usedChars.has(id));
  const rnd = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  let anon, anonNo = 1;
  if (free.length) anon = free[rnd(free.length)];
  else { anon = ANON_POOL[rnd(ANON_POOL.length)]; anonNo = 2; while (used.has(`${anon}:${anonNo}`)) anonNo++; }
  return { anon, anonNo, stmt: env.DB.prepare('INSERT OR IGNORE INTO idents (thread, anon, anon_no) VALUES (?1, ?2, ?3)').bind(thread, anon, anonNo) };
}

/** 비밀번호 확인 + 실패 횟수·잠금. 성공하면 true, 실패는 에러(남은 횟수 포함). */
async function checkPin(env, table, row, pin) {
  if (!isPin(pin)) throw E(400, 'pinFormat');
  const now = Date.now();
  if (row.pin_lock && now < row.pin_lock) throw E(423, 'pinLocked');
  if (safeEqual(await pinHash(env, row.pin_salt, pin), row.pin_hash)) {
    if (row.pin_fail) await env.DB.prepare(`UPDATE ${table} SET pin_fail = 0 WHERE id = ?1`).bind(row.id).run();
    return true;
  }
  const fail = (row.pin_fail || 0) + 1;
  if (fail >= PIN_MAX_FAIL) {
    await env.DB.prepare(`UPDATE ${table} SET pin_fail = 0, pin_lock = ?2 WHERE id = ?1`).bind(row.id, now + PIN_LOCK_MS).run();
    throw E(423, 'pinLocked');
  }
  await env.DB.prepare(`UPDATE ${table} SET pin_fail = ?2 WHERE id = ?1`).bind(row.id, fail).run();
  throw E(403, 'pinWrong', { left: PIN_MAX_FAIL - fail });
}

async function newPin(env, pin) {
  if (!isPin(pin)) throw E(400, 'pinFormat');
  const salt = randomId('', 16);
  return { salt, hash: await pinHash(env, salt, pin) };
}

const EMERGENCY_LOCK_MS = 10 * 60 * 1000;

/**
 * 모든 쓰기(의견·티어표·팀)의 관문. 순서가 중요하다:
 *  1) 관리자 잠금 / 비상 정지 중이면 거절
 *  2) 연속 작성 간격(성공한 글 기준) · IP 분당/하루 · 게시판별 10분 · 종류별 하루 — 모두 이 IP 에만 영향
 *  3) Turnstile(봇 확인)
 *  4) 사이트 전체 분당 쓰기 수 → 넘으면 10분 비상 정지. **봇 확인을 통과한 쓰기만** 세므로, 가짜 요청으로 남의 글쓰기를 멈추게 할 수 없다.
 * 반환값 = 연속 작성 간격 기록 문(작성 batch 에 같이 넣어, 실제로 저장된 경우에만 간격이 시작된다).
 */
async function writeGate(env, req, body, { ih, thread = null, kind }) {
  const now = Date.now();
  const { results } = await env.DB.prepare("SELECT k, v FROM settings WHERE k IN ('write_lock', 'write_lock_until')").all();
  const st = Object.fromEntries(results.map((r) => [r.k, r.v]));
  if (st.write_lock === '1') throw E(503, 'writeLocked');
  if (+st.write_lock_until > now) {
    const retryAfter = Math.ceil((+st.write_lock_until - now) / 1000);
    throw E(503, 'emergencyWait', { sec: retryAfter }, { retryAfter });
  }
  await checkGap(env, req, ih);
  await limit(env, 'writeMin', ih, req);
  await limit(env, 'writeDay', ih, req);
  if (thread) await limit(env, 'threadBurst', `${ih}:${thread}`, req);
  if (kind === 'tier') await limit(env, 'tierDay', ih, req);
  if (kind === 'team') await limit(env, 'teamDay', ih, req);
  await checkTurnstile(env, req, body.ts);
  try {
    await limit(env, 'globalWrite', 'all', req);
  } catch (e) {
    if (e.status !== 429) throw e;
    await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('write_lock_until', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1").bind(String(now + EMERGENCY_LOCK_MS)).run();
    console.warn('[lounge] 비상 정지: 사이트 전체 쓰기 급증');
    throw E(503, 'emergency', { min: EMERGENCY_LOCK_MS / 60000 }, { retryAfter: EMERGENCY_LOCK_MS / 1000 });
  }
  return markWrite(env, req, ih);
}
/**
 * 운영자 요청인가: Authorization: Bearer <ADMIN_TOKEN>. 헤더가 없으면 false, 있는데 틀리면 401(실패 횟수 제한).
 * 운영자 글은 이름 '파미도'(op=1)로 저장되고, 봇 확인·도배 제한을 건너뛴다(초기 글·공지용).
 */
async function isOperator(env, req) {
  if (!req.headers.get('Authorization')) return false;
  await requireAdmin(env, req);
  return true;
}
const OP_WHO = { anon: OPERATOR.anon, anonNo: 1, stmt: null };

/** 도배성 내용이면 400(안내 문구). 빈 문자열은 통과. */
function assertNotSpam(...texts) {
  for (const x of texts) { const why = spamReason(x); if (why) throw E(400, why, { n: why === 'spamLinks' ? ANTISPAM.maxLinks : ANTISPAM.maxRun }); }
}
const statBump = (env, thread, delta, at) => env.DB.prepare(
  'INSERT INTO thread_stats (thread, count, last) VALUES (?1, MAX(?2, 0), ?3) ON CONFLICT(thread) DO UPDATE SET count = MAX(count + ?2, 0), last = MAX(last, ?3)',
).bind(thread, delta, at);

// ── 핸들러: 의견 ───────────────────────────────────────────────────────────
async function charSummary(env) {
  const { results } = await env.DB.prepare("SELECT thread, count, last FROM thread_stats WHERE thread LIKE 'char:%'").all();
  const out = {};
  for (const r of results) if (r.count > 0) out[+r.thread.slice(5)] = { count: r.count, last: r.last };
  return out;
}

async function recentPosts(env, url) {
  const n = Math.min(RECENT_MAX, Math.max(1, +url.searchParams.get('limit') || 6));
  const { results } = await env.DB.prepare(
    "SELECT * FROM posts WHERE kind = 'char' AND parent IS NULL AND deleted = 0 AND status = 'ok' ORDER BY created_at DESC LIMIT ?1",
  ).bind(n).all();
  return results.map((r) => pubPost(r));
}

async function getThread(env, req, url, key) {
  await assertThread(env, key);
  const sort = url.searchParams.get('sort') === 'new' ? 'new' : 'best';
  // 고정 글을 항상 먼저 담고, 나머지는 최신 THREAD_MAX_POSTS 개(글이 아무리 많아져도 고정 글이 잘려 나가지 않게)
  const { results } = await env.DB.prepare("SELECT * FROM posts WHERE thread = ?1 AND status = 'ok' ORDER BY pinned DESC, created_at DESC LIMIT ?2").bind(key, THREAD_MAX_POSTS).all();
  results.sort((a, b) => a.created_at - b.created_at);   // 답글은 작성 순으로 보여 준다
  const voter = await voterOf(env, req, url.searchParams.get('d'));
  const votes = await myVotes(env, voter, results.map((r) => 'post:' + r.id));
  const score = (r) => r.likes - r.dislikes;                 // 싫어요는 정렬에만 쓰고 응답에서는 뺀다
  const tops = results.filter((r) => !r.parent);
  const byScore = sort === 'new' ? (a, b) => b.created_at - a.created_at : (a, b) => (score(b) - score(a)) || (b.created_at - a.created_at);
  tops.sort((a, b) => (b.pinned - a.pinned) || (a.pinned && b.pinned ? a.created_at - b.created_at : byScore(a, b)));   // 고정 글은 정렬·반응과 무관하게 맨 위
  return tops.map((p) => ({
    ...pubPost(p, votes.get('post:' + p.id) || 0),
    replies: results.filter((r) => r.parent === p.id).map((r) => pubPost(r, votes.get('post:' + r.id) || 0)),
  }));
}

async function createPost(env, req, body) {
  const key = body.thread;
  const kind = await assertThread(env, key);
  const op = await isOperator(env, req);
  const text = cleanText(body.body, LIMITS.post, 'body');
  if (!op) assertNotSpam(text);
  const ih = await ipHash(env, req);
  // 같은 내용 반복: 같은 사람(24시간, 어느 게시판이든) 또는 같은 게시판(누구든 24시간)
  const bk = await bodyKey(env, text);
  const dup = await env.DB.prepare('SELECT 1 FROM posts WHERE body_key = ?1 AND created_at > ?2 AND (ip_hash = ?3 OR thread = ?4) LIMIT 1')
    .bind(bk, Date.now() - ANTISPAM.dupHours * 3.6e6, ih, key).first();
  if (dup && !op) throw E(409, 'dupContent');
  let parent = null;
  if (body.parent != null) {
    if (!RE_ID.p.test(body.parent)) throw E(400, 'replyBad');
    const par = await env.DB.prepare('SELECT id, thread, parent, status FROM posts WHERE id = ?1').bind(body.parent).first();
    if (!par || par.thread !== key || par.status !== 'ok') throw E(404, 'replyNotFound');
    parent = par.parent || par.id;                            // 답글의 답글은 같은 최상위 아래로(2단계)
  }
  const replyTo = body.replyTo != null && CHAR_SET.has(+body.replyTo) ? +body.replyTo : null;
  const tags = kind === 'char' && !parent && Array.isArray(body.tags) ? [...new Set(body.tags.filter((t) => TAG_SET.has(t)))].slice(0, LIMITS.tags) : [];

  let who; let pin = body.pin;
  if (op) who = OP_WHO;
  else if (body.asPostId) {
    const src = await getItem(env, body.asPostId);
    if (threadOfItem(src.table, src.row) !== key) throw E(403, 'continueOther');
    if (src.row.op) throw E(403, 'continueOp');   // 비밀번호를 알아도 '파미도' 사칭 불가
    await limit(env, 'verify', ih);
    await checkPin(env, src.table, src.row, body.asPin);
    who = { anon: src.row.anon, anonNo: src.row.anon_no, stmt: null };
    pin = pin ?? body.asPin;
  } else who = await pickAnon(env, key);
  const { salt, hash } = await newPin(env, pin);
  const gapStmt = op ? null : await writeGate(env, req, body, { ih, thread: key, kind: 'post' });
  const id = randomId('p');
  const now = Date.now();
  const stmts = [
    env.DB.prepare(`INSERT INTO posts (id, thread, kind, parent, reply_to, anon, anon_no, body, tags, build, pin_salt, pin_hash, ip_hash, created_at, body_key, op)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)`)
      .bind(id, key, kind, parent, replyTo, who.anon, who.anonNo, text, JSON.stringify(tags), CURRENT_BUILD, salt, hash, ih, now, bk, op ? 1 : 0),
    statBump(env, key, 1, now),
  ];
  if (gapStmt) stmts.push(gapStmt);
  if (who.stmt) stmts.push(who.stmt);
  await env.DB.batch(stmts);
  const row = await env.DB.prepare('SELECT * FROM posts WHERE id = ?1').bind(id).first();
  return pubPost(row);
}

async function verify(env, req, id, body) {
  await limit(env, 'verify', await ipHash(env, req));
  const { table, row } = await getItem(env, id);
  await assertPinnedEditable(env, req, row);   // 수정 창을 여는 비밀번호 확인 단계에서도 운영자 글·고정 글은 막는다
  if (!((row.op || row.pinned) && await isOperator(env, req))) await checkPin(env, table, row, body.pin);
  return { anon: row.anon, anonNo: row.anon_no };
}

/** 고정 글은 비밀번호만으로는 못 바꾼다 — 운영자 토큰이 있어야 한다(누가 비밀번호를 알아내도 첫 댓글이 바뀌지 않게). */
async function assertPinnedEditable(env, req, row) {
  if (row.pinned && !(await isOperator(env, req))) throw E(403, 'pinnedLocked');
  if (row.op && !(await isOperator(env, req))) throw E(403, 'opLocked');   // 운영자('파미도')가 쓴 글·티어표·팀은 비밀번호로 못 바꾼다
}

async function editPost(env, req, id, body) {
  if (!RE_ID.p.test(id)) throw E(400, 'notEditable');
  await limit(env, 'verify', await ipHash(env, req));
  const { table, row } = await getItem(env, id);
  await assertPinnedEditable(env, req, row);
  if (row.deleted) throw E(410, 'deletedPost');
  const text = cleanText(body.body, LIMITS.post, 'body');
  assertNotSpam(text);                                      // 멀쩡한 글을 쓰고 수정으로 도배 내용을 넣는 우회 차단
  await checkPin(env, table, row, body.pin);
  await env.DB.prepare('UPDATE posts SET body = ?2, edited_at = ?3, body_key = ?4 WHERE id = ?1').bind(id, text, Date.now(), await bodyKey(env, text)).run();
  return pubPost(await env.DB.prepare('SELECT * FROM posts WHERE id = ?1').bind(id).first());
}

async function deleteItem(env, req, id, body) {
  await limit(env, 'verify', await ipHash(env, req));
  const { table, row } = await getItem(env, id);
  await assertPinnedEditable(env, req, row);
  await checkPin(env, table, row, body.pin);
  return removeItem(env, table, row);
}
/** 답글이 달린 의견은 자리만 남기고, 티어표·팀은 딸린 의견까지 지운다. 관리자 삭제도 이것을 쓴다. */
async function removeItem(env, table, row) {
  const now = Date.now();
  if (table === 'posts') {
    const child = await env.DB.prepare('SELECT 1 FROM posts WHERE parent = ?1 AND deleted = 0 LIMIT 1').bind(row.id).first();
    const stmts = child
      ? [env.DB.prepare("UPDATE posts SET deleted = 1, body = '', tags = '[]' WHERE id = ?1").bind(row.id)]
      : [env.DB.prepare('DELETE FROM posts WHERE id = ?1').bind(row.id)];
    if (!row.deleted) stmts.push(statBump(env, row.thread, -1, now));
    await env.DB.batch(stmts);
    return { ok: true, kept: !!child };
  }
  const thread = threadOfItem(table, row);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM ${table} WHERE id = ?1`).bind(row.id),
    env.DB.prepare(table === 'tiers' ? 'DELETE FROM tier_pos WHERE tier_id = ?1' : 'DELETE FROM team_char WHERE team_id = ?1').bind(row.id),
    env.DB.prepare('DELETE FROM posts WHERE thread = ?1').bind(thread),
    env.DB.prepare('DELETE FROM thread_stats WHERE thread = ?1').bind(thread),
    env.DB.prepare('DELETE FROM idents WHERE thread = ?1').bind(thread),
  ]);
  return { ok: true };
}

// ── 반응 · 신고 ───────────────────────────────────────────────────────────
function parseTarget(target) {
  const m = /^(post|tier|team):([ptm][0-9a-z]{12})$/.exec(target || '');
  const prefix = { post: 'p', tier: 't', team: 'm' };
  if (!m || m[2][0] !== prefix[m[1]]) throw E(400, 'targetBad');
  return m[2];
}
async function react(env, req, body) {
  const id = parseTarget(body.target);
  const value = [1, -1, 0].includes(body.value) ? body.value : null;
  if (value === null) throw E(400, 'reactBad');
  const rih = await ipHash(env, req);
  await limit(env, 'react', rih, req);
  await limit(env, 'reactDay', rih, req);
  const { table } = await getItem(env, id);
  const voter = await voterOf(env, req, body.dev);
  const prevRow = await env.DB.prepare('SELECT value FROM votes WHERE target = ?1 AND voter = ?2').bind(body.target, voter).first();
  const prev = prevRow ? prevRow.value : 0;
  const next = prev === value ? 0 : value;                   // 같은 걸 다시 누르면 취소
  const dl = (next === 1) - (prev === 1);
  const dd = (next === -1) - (prev === -1);
  const stmts = [];
  if (next) stmts.push(env.DB.prepare('INSERT INTO votes (target, voter, value) VALUES (?1, ?2, ?3) ON CONFLICT(target, voter) DO UPDATE SET value = ?3').bind(body.target, voter, next));
  else stmts.push(env.DB.prepare('DELETE FROM votes WHERE target = ?1 AND voter = ?2').bind(body.target, voter));
  if (dl || dd) stmts.push(env.DB.prepare(`UPDATE ${table} SET likes = MAX(likes + ?2, 0), dislikes = MAX(dislikes + ?3, 0) WHERE id = ?1`).bind(id, dl, dd));
  await env.DB.batch(stmts);
  const row = await env.DB.prepare(`SELECT likes FROM ${table} WHERE id = ?1`).bind(id).first();
  return { likes: row.likes, vote: next };
}
async function report(env, req, body) {
  const id = parseTarget(body.target);
  await limit(env, 'report', await ipHash(env, req));
  const { table } = await getItem(env, id);
  const reason = cleanText(body.reason, 200, 'reason', { required: false });
  const voter = await voterOf(env, req, body.dev);
  const r = await env.DB.prepare('INSERT OR IGNORE INTO reports (target, voter, reason, created_at) VALUES (?1, ?2, ?3, ?4)').bind(body.target, voter, reason, Date.now()).run();
  const fresh = r.meta.changes > 0;
  if (fresh) await env.DB.prepare(`UPDATE ${table} SET reports = reports + 1 WHERE id = ?1`).bind(id).run();
  return { ok: fresh };
}

// ── 티어표 ────────────────────────────────────────────────────────────────
function sortRows(rows, sort) {
  const now = Date.now();
  return sort === 'new' ? rows.sort((a, b) => b.created_at - a.created_at)
    : rows.sort((a, b) => hotScore(b.likes - b.dislikes, now - b.created_at) - hotScore(a.likes - a.dislikes, now - a.created_at));
}
async function listTiers(env, req, url) {
  const basis = url.searchParams.get('basis');
  const sort = url.searchParams.get('sort') === 'new' ? 'new' : 'best';
  const q = TIER_BASIS_KEYS.has(basis)
    ? env.DB.prepare("SELECT * FROM tiers WHERE status = 'ok' AND basis = ?1 ORDER BY created_at DESC LIMIT ?2").bind(basis, LIST_MAX)
    : env.DB.prepare("SELECT * FROM tiers WHERE status = 'ok' ORDER BY created_at DESC LIMIT ?1").bind(LIST_MAX);
  const rows = sortRows((await q.all()).results, sort);
  const voter = await voterOf(env, req, url.searchParams.get('d'));
  const [votes, counts] = await Promise.all([myVotes(env, voter, rows.map((r) => 'tier:' + r.id)), commentCounts(env, rows.map((r) => 'tier:' + r.id))]);
  return rows.map((r) => pubTier(r, votes.get('tier:' + r.id) || 0, counts.get('tier:' + r.id) || 0));
}
async function getTier(env, req, url, id) {
  const { row } = await getItem(env, id);
  const voter = await voterOf(env, req, url.searchParams.get('d'));
  const votes = await myVotes(env, voter, ['tier:' + id]);
  return pubTier(row, votes.get('tier:' + id) || 0);
}
/** 티어표 입력 검사(작성·수정 공용). → { title, basis, descr, rows } */
function parseTierInput(body, op) {
  const title = cleanText(body.title, LIMITS.title, 'title');
  const basis = TIER_BASIS_KEYS.has(body.basis) ? body.basis : null;
  if (!basis) throw E(400, 'basisNeeded');
  const descr = cleanText(body.descr, LIMITS.tierDesc, 'descr', { required: false });
  if (!Array.isArray(body.rows) || body.rows.length < 2 || body.rows.length > LIMITS.tierRows) throw E(400, 'tierRows', { min: 2, max: LIMITS.tierRows });
  const seen = new Set();
  const rows = body.rows.map((r) => {
    const label = cleanText(r && r.label, LIMITS.tierLabel, 'rowLabel', { required: false }) || '-';
    const ids = (Array.isArray(r && r.ids) ? r.ids : []).map(Number);
    for (const id of ids) {
      if (!CHAR_SET.has(id) || seen.has(id)) throw E(400, 'tierBadChar');
      seen.add(id);
    }
    return { label, ids };
  });
  if (!seen.size) throw E(400, 'tierEmpty');
  if (!op) assertNotSpam(title, descr, ...rows.map((r) => r.label));
  return { title, basis, descr, rows };
}
const tierPosStmts = (env, id, rows) => rows.flatMap((r, i) => r.ids.map((cid) =>
  env.DB.prepare('INSERT INTO tier_pos (tier_id, char_id, pos) VALUES (?1, ?2, ?3)').bind(id, cid, rows.length > 1 ? i / (rows.length - 1) : 0)));

async function createTier(env, req, body) {
  const op = await isOperator(env, req);
  const ih = await ipHash(env, req);
  const { title, basis, descr, rows } = parseTierInput(body, op);
  const { salt, hash } = await newPin(env, body.pin);
  const gapStmt = op ? null : await writeGate(env, req, body, { ih, kind: 'tier' });
  const id = randomId('t');
  const who = op ? OP_WHO : await pickAnon(env, 'tier:' + id);
  const stmts = [
    env.DB.prepare(`INSERT INTO tiers (id, title, basis, rows, descr, anon, anon_no, build, pin_salt, pin_hash, ip_hash, created_at, op)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`)
      .bind(id, title, basis, JSON.stringify(rows), descr, who.anon, who.anonNo, CURRENT_BUILD, salt, hash, ih, Date.now(), op ? 1 : 0),
    who.stmt,
    gapStmt,
    ...tierPosStmts(env, id, rows),
  ];
  await env.DB.batch(stmts.filter(Boolean));
  return pubTier(await env.DB.prepare('SELECT * FROM tiers WHERE id = ?1').bind(id).first());
}
/** 티어표 수정: 작성 때 정한 비밀번호(운영자는 토큰). 배치가 바뀌면 평균 티어 집계용 위치도 다시 쓴다. */
async function editTier(env, req, id, body) {
  await limit(env, 'verify', await ipHash(env, req));
  const { table, row } = await getItem(env, id);
  const op = await isOperator(env, req);
  if (row.op && !op) throw E(403, 'opLocked');
  if (!op) await checkPin(env, table, row, body.pin);
  const { title, basis, descr, rows } = parseTierInput(body, op);
  await env.DB.batch([
    env.DB.prepare('UPDATE tiers SET title = ?2, basis = ?3, rows = ?4, descr = ?5, edited_at = ?6 WHERE id = ?1').bind(id, title, basis, JSON.stringify(rows), descr, Date.now()),
    env.DB.prepare('DELETE FROM tier_pos WHERE tier_id = ?1').bind(id),
    ...tierPosStmts(env, id, rows),
  ]);
  return pubTier(await env.DB.prepare('SELECT * FROM tiers WHERE id = ?1').bind(id).first());
}

async function aggregate(env, url) {
  const basis = url.searchParams.get('basis');
  const filtered = TIER_BASIS_KEYS.has(basis);
  const pos = filtered
    ? await env.DB.prepare("SELECT tp.char_id, tp.pos FROM tier_pos tp JOIN tiers t ON t.id = tp.tier_id WHERE t.status = 'ok' AND t.basis = ?1").bind(basis).all()
    : await env.DB.prepare("SELECT tp.char_id, tp.pos FROM tier_pos tp JOIN tiers t ON t.id = tp.tier_id WHERE t.status = 'ok'").all();
  const cnt = filtered
    ? await env.DB.prepare("SELECT COUNT(*) AS n FROM tiers WHERE status = 'ok' AND basis = ?1").bind(basis).first()
    : await env.DB.prepare("SELECT COUNT(*) AS n FROM tiers WHERE status = 'ok'").first();
  const byChar = {};
  for (const r of pos.results) (byChar[r.char_id] ||= []).push(r.pos);
  return aggregateRows(byChar, cnt.n);
}

// ── 팀 ────────────────────────────────────────────────────────────────────
function withIdsOf(url) {
  return [...new Set((url.searchParams.get('with') || '').split(',').map(Number).filter((x) => CHAR_SET.has(x)))].slice(0, 3);
}
async function listTeams(env, req, url) {
  const basis = TEAM_BASIS_KEYS.has(url.searchParams.get('basis')) ? url.searchParams.get('basis') : null;
  const sort = url.searchParams.get('sort') === 'new' ? 'new' : 'best';
  const withIds = withIdsOf(url);
  const binds = [];
  let sql = "SELECT * FROM teams WHERE status = 'ok'";
  if (basis) { binds.push(basis); sql += ` AND basis = ?${binds.length}`; }
  if (withIds.length) {
    const ph = withIds.map((id) => { binds.push(id); return `?${binds.length}`; }).join(',');
    binds.push(withIds.length);
    sql += ` AND id IN (SELECT team_id FROM team_char WHERE char_id IN (${ph}) GROUP BY team_id HAVING COUNT(*) = ?${binds.length})`;
  }
  binds.push(LIST_MAX);
  sql += ` ORDER BY created_at DESC LIMIT ?${binds.length}`;
  const rows = sortRows((await env.DB.prepare(sql).bind(...binds).all()).results, sort);
  const voter = await voterOf(env, req, url.searchParams.get('d'));
  const [votes, counts] = await Promise.all([myVotes(env, voter, rows.map((r) => 'team:' + r.id)), commentCounts(env, rows.map((r) => 'team:' + r.id))]);
  return rows.map((r) => pubTeam(r, votes.get('team:' + r.id) || 0, counts.get('team:' + r.id) || 0));
}
async function teamCount(env, url) {
  const withIds = withIdsOf(url);
  if (withIds.length !== 1) throw E(400, 'oneCharNeeded');
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM team_char tc JOIN teams t ON t.id = tc.team_id WHERE tc.char_id = ?1 AND t.status = 'ok'").bind(withIds[0]).first();
  return { count: r.n };
}
async function teamByCode(env, url) {
  const code = (url.searchParams.get('code') || '').trim();
  if (!code || code.length > LIMITS.code) return { team: null };
  const r = await env.DB.prepare("SELECT id, title FROM teams WHERE code = ?1 AND status = 'ok'").bind(code).first();
  return { team: r ? { id: r.id, title: r.title } : null };
}
async function getTeam(env, req, url, id) {
  const { row } = await getItem(env, id);
  const voter = await voterOf(env, req, url.searchParams.get('d'));
  const votes = await myVotes(env, voter, ['team:' + id]);
  return pubTeam(row, votes.get('team:' + id) || 0);
}
async function createTeam(env, req, body) {
  const { code, ids, summary } = await readTeamCode(body.code, CHAR_SET);   // 봇 확인 전에 싼 검사부터
  const dup = await env.DB.prepare('SELECT id FROM teams WHERE code = ?1').bind(code).first();
  if (dup) throw E(409, 'teamDup', {}, { dupId: dup.id });
  const op = await isOperator(env, req);
  const ih = await ipHash(env, req);
  const title = cleanText(body.title, LIMITS.title, 'title');
  const basis = TEAM_BASIS_KEYS.has(body.basis) ? body.basis : null;
  if (!basis) throw E(400, 'basisNeeded');
  const descr = cleanText(body.descr, LIMITS.teamDesc, 'descr', { required: false });
  if (!op) assertNotSpam(title, descr);
  const { salt, hash } = await newPin(env, body.pin);
  const gapStmt = op ? null : await writeGate(env, req, body, { ih, kind: 'team' });
  const id = randomId('m');
  const who = op ? OP_WHO : await pickAnon(env, 'team:' + id);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO teams (id, code, ids, summary, title, basis, descr, anon, anon_no, build, pin_salt, pin_hash, ip_hash, created_at, op)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`)
      .bind(id, code, ids.join(','), JSON.stringify(summary), title, basis, descr, who.anon, who.anonNo, CURRENT_BUILD, salt, hash, ih, Date.now(), op ? 1 : 0),
    who.stmt,
    gapStmt,
    ...ids.map((cid) => env.DB.prepare('INSERT OR IGNORE INTO team_char (team_id, char_id) VALUES (?1, ?2)').bind(id, cid)),
  ].filter(Boolean));
  return pubTeam(await env.DB.prepare('SELECT * FROM teams WHERE id = ?1').bind(id).first());
}

/** 팀 수정: 제목·기준·설명만(공유 코드 = 팀 구성은 못 바꾼다 — 바꾸려면 새로 올리기). */
async function editTeam(env, req, id, body) {
  await limit(env, 'verify', await ipHash(env, req));
  const { table, row } = await getItem(env, id);
  const op = await isOperator(env, req);
  if (row.op && !op) throw E(403, 'opLocked');
  if (!op) await checkPin(env, table, row, body.pin);
  const title = cleanText(body.title, LIMITS.title, 'title');
  const basis = TEAM_BASIS_KEYS.has(body.basis) ? body.basis : null;
  if (!basis) throw E(400, 'basisNeeded');
  const descr = cleanText(body.descr, LIMITS.teamDesc, 'descr', { required: false });
  if (!op) assertNotSpam(title, descr);
  await env.DB.prepare('UPDATE teams SET title = ?2, basis = ?3, descr = ?4, edited_at = ?5 WHERE id = ?1').bind(id, title, basis, descr, Date.now()).run();
  return pubTeam(await env.DB.prepare('SELECT * FROM teams WHERE id = ?1').bind(id).first());
}

/** 내 활동: 이 기기가 기억하는 글 ID 들을 한 번에. */
async function items(env, url) {
  const ids = [...new Set((url.searchParams.get('ids') || '').split(',').filter(Boolean))].slice(0, ITEMS_MAX);
  const out = [];
  for (const prefix of ['p', 't', 'm']) {
    const part = ids.filter((id) => RE_ID[prefix].test(id));
    if (!part.length) continue;
    const ph = part.map((_, k) => `?${k + 1}`).join(',');
    const { results } = await env.DB.prepare(`SELECT * FROM ${TABLE_OF[prefix]} WHERE id IN (${ph}) AND status = 'ok'`).bind(...part).all();
    for (const r of results) out.push(prefix === 'p' ? { kind: 'post', item: pubPost(r) } : prefix === 't' ? { kind: 'tier', item: pubTier(r) } : { kind: 'team', item: pubTeam(r) });
  }
  return out;
}

// ── 관리자 ────────────────────────────────────────────────────────────────
async function requireAdmin(env, req) {
  const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32) throw E(503, 'adminOff');
  if (!tok || !safeEqual(tok, env.ADMIN_TOKEN)) {
    await limit(env, 'adminFail', await ipHash(env, req));
    throw E(401, 'adminBad');
  }
}
async function adminReports(env) {
  const { results } = await env.DB.prepare('SELECT target, reason, created_at FROM reports ORDER BY created_at DESC LIMIT 200').all();
  const grouped = new Map();
  for (const r of results) {
    const g = grouped.get(r.target) || { target: r.target, count: 0, reasons: [], last: 0 };
    g.count++; if (r.reason) g.reasons.push(r.reason); g.last = Math.max(g.last, r.created_at);
    grouped.set(r.target, g);
  }
  const out = [];
  for (const g of grouped.values()) {
    const id = g.target.split(':')[1];
    const row = await env.DB.prepare(`SELECT * FROM ${tableOfId(id)} WHERE id = ?1`).bind(id).first();
    out.push({ ...g, status: row ? row.status : 'gone', preview: row ? (row.body ?? row.title ?? '').slice(0, 200) : '' });
  }
  return out;
}
async function adminModerate(env, body) {
  const id = parseTarget(body.target);
  const table = tableOfId(id);
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?1`).bind(id).first();
  if (!row) throw E(404, 'notFound');
  if (body.action === 'hide' || body.action === 'show') {
    await env.DB.prepare(`UPDATE ${table} SET status = ?2 WHERE id = ?1`).bind(id, body.action === 'hide' ? 'hidden' : 'ok').run();
    return { ok: true };
  }
  if (body.action === 'delete') return removeItem(env, table, row);
  if (body.action === 'pin' || body.action === 'unpin') {
    if (table !== 'posts' || row.parent) throw E(400, 'pinTopOnly');
    await env.DB.prepare('UPDATE posts SET pinned = ?2 WHERE id = ?1').bind(id, body.action === 'pin' ? 1 : 0).run();
    return { ok: true, pinned: body.action === 'pin' };
  }
  throw E(400, 'actionBad');
}
async function adminLock(env, body) {
  const stmts = [env.DB.prepare("INSERT INTO settings (k, v) VALUES ('write_lock', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1").bind(body.on ? '1' : '0')];
  if (!body.on) stmts.push(env.DB.prepare("DELETE FROM settings WHERE k = 'write_lock_until'"));   // 풀 때는 비상 정지도 해제
  await env.DB.batch(stmts);
  return { writeLock: !!body.on };
}

// ── 라우터 ────────────────────────────────────────────────────────────────
async function readBody(req) {
  const len = +(req.headers.get('Content-Length') || 0);
  if (len > MAX_BODY_BYTES) throw E(413, 'tooLarge');
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw E(413, 'tooLarge');
  try { const v = JSON.parse(text || '{}'); if (!v || typeof v !== 'object' || Array.isArray(v)) throw 0; return v; } catch { throw E(400, 'badRequest'); }
}

async function route(env, req, url) {
  const p = url.pathname.replace(/\/+$/, '');
  const m = (re) => re.exec(p);
  let r;
  if (req.method === 'GET') {
    if (p === '/v1/health') return { ok: true, build: CURRENT_BUILD };
    if (p === '/v1/chars/summary') return charSummary(env);
    if (p === '/v1/posts/recent') return recentPosts(env, url);
    if ((r = m(/^\/v1\/threads\/([^/]+)$/))) return getThread(env, req, url, decodeURIComponent(r[1]));
    if (p === '/v1/tiers') return listTiers(env, req, url);
    if (p === '/v1/tiers/aggregate') return aggregate(env, url);
    if ((r = m(/^\/v1\/tiers\/(t[0-9a-z]{12})$/))) return getTier(env, req, url, r[1]);
    if (p === '/v1/teams') return listTeams(env, req, url);
    if (p === '/v1/teams/count') return teamCount(env, url);
    if (p === '/v1/teams/by-code') return teamByCode(env, url);
    if ((r = m(/^\/v1\/teams\/(m[0-9a-z]{12})$/))) return getTeam(env, req, url, r[1]);
    if (p === '/v1/items') return items(env, url);
    if (p === '/v1/admin/reports') { await requireAdmin(env, req); return adminReports(env); }
  }
  if (req.method === 'POST') {
    const body = await readBody(req);
    if (p.startsWith('/v1/admin/')) {
      await requireAdmin(env, req);
      if (p === '/v1/admin/moderate') return adminModerate(env, body);
      if (p === '/v1/admin/lock') return adminLock(env, body);
    }
    if (p === '/v1/posts') return createPost(env, req, body);
    if ((r = m(/^\/v1\/posts\/(p[0-9a-z]{12})\/edit$/))) return editPost(env, req, r[1], body);
    if ((r = m(/^\/v1\/tiers\/(t[0-9a-z]{12})\/edit$/))) return editTier(env, req, r[1], body);
    if ((r = m(/^\/v1\/teams\/(m[0-9a-z]{12})\/edit$/))) return editTeam(env, req, r[1], body);
    if ((r = m(/^\/v1\/items\/([ptm][0-9a-z]{12})\/verify$/))) return verify(env, req, r[1], body);
    if ((r = m(/^\/v1\/items\/([ptm][0-9a-z]{12})\/delete$/))) return deleteItem(env, req, r[1], body);
    if (p === '/v1/react') return react(env, req, body);
    if (p === '/v1/report') return report(env, req, body);
    if (p === '/v1/tiers') return createTier(env, req, body);
    if (p === '/v1/teams') return createTeam(env, req, body);
  }
  throw E(404, 'noRoute');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = allowedOrigin(env, req);
    if (origin === false) return json({ error: KR['err.originBad'], code: 'originBad' }, 403, null);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    // 브라우저 쓰기는 반드시 허용된 출처에서(관리자 API 는 토큰으로 따로 보호)
    if (req.method === 'POST' && !origin && !url.pathname.startsWith('/v1/admin/')) return json({ error: KR['err.originBad'], code: 'originBad' }, 403, null);
    try {
      return json(await route(env, req, url), 200, origin);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status, origin);
      console.error('[lounge]', e && e.stack || e);
      return json({ error: KR['err.server'], code: 'server' }, 500, origin);
    }
  },
};
