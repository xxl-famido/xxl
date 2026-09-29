/**
 * lounge/api-mock.js — XXL 라운지 목(mock) 어댑터. api.js 가 서버 주소가 없을 때 이것을 쓴다.
 *
 * 백엔드는 아직 정하지 않았다(docs/community/PLAN.md §9-1). 그때까지 이 파일이 **localStorage 목 어댑터**로
 * 서버 역할을 흉내 낸다. 화면 코드는 여기 export 된 async 함수만 부르므로, 실제 서버가 생기면 이 파일만 fetch 로 바꾼다.
 *
 * 서버 계약을 그대로 흉내 내는 규칙:
 *  - 싫어요 수는 응답에 싣지 않는다(정렬 점수 계산에만 쓴다).
 *  - 비밀번호는 해시만 보관, 대상 글 기준 오답 5회면 1시간 잠금.
 *  - 익명 이름은 스레드마다 새로 뽑고, 같은 스레드에서 이미 쓰인 동료는 피한다(다 차면 번호).
 */
import { SEED } from './seed.js';
import { spamText, errorText } from './i18n.js';
import { LIMITS, isPin, CURRENT_BUILD, aggregateRows, tierPositions, hotScore, spamReason, OPERATOR } from './shared.js';

const KEY = 'woofia_lounge_mock_v1';
const DEVICE_KEY = 'woofia_lounge_dev';
const BUILD = CURRENT_BUILD;
const PIN_MAX_FAIL = 5;
const PIN_LOCK_MS = 60 * 60 * 1000;
const LATENCY_MS = 120;


const wait = () => new Promise((r) => setTimeout(r, LATENCY_MS));
const clone = (o) => JSON.parse(JSON.stringify(o));
/** 서버와 같은 오류 코드 → 현재 언어 문구(i18n/lounge 사전 err.*). */
const fail = (code, vars, extra) => Object.assign(new Error(errorText({ code, vars })), extra || {});

let _db = null;
function db() {
  if (_db) return _db;
  try { _db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { _db = null; }
  if (!_db || !_db.posts) { _db = clone(SEED(Date.now())); save(); }
  return _db;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(_db)); } catch { /* 용량 초과 시 이번 세션만 유지 */ } }
export function resetMock() { localStorage.removeItem(KEY); _db = null; db(); }

export function deviceId() {
  let d = localStorage.getItem(DEVICE_KEY);
  if (!d) {
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    d = [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(DEVICE_KEY, d);
  }
  return d;
}

async function hashPin(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ── 동료 ──────────────────────────────────────────────────────────────────
let _chars = null;
export async function chars() {
  if (_chars) return _chars;
  const r = await fetch('lounge_chars.json');
  if (!r.ok) throw fail('charsLoadFail', { status: r.status });
  _chars = await r.json();
  return _chars;
}

// ── 익명 이름 ──────────────────────────────────────────────────────────────
function pickAnon(thread, charIds) {
  const used = new Map();
  for (const p of db().posts) if (p.thread === thread) used.set(p.anon + ':' + p.anonNo, true);
  for (const t of [...db().tiers, ...db().teams]) if ('tier:' + t.id === thread || 'team:' + t.id === thread) used.set(t.anon + ':' + t.anonNo, true);
  charIds = charIds.filter((id) => id !== OPERATOR.anon);   // 운영자 이름은 익명 뽑기에서 제외
  const free = charIds.filter((id) => ![...used.keys()].some((k) => k.startsWith(id + ':')));
  if (free.length) return { anon: free[Math.floor(Math.random() * free.length)], anonNo: 1 };
  const anon = charIds[Math.floor(Math.random() * charIds.length)];
  let n = 2; while (used.has(anon + ':' + n)) n++;
  return { anon, anonNo: n };
}

// ── 점수 ──────────────────────────────────────────────────────────────────
const score = (x) => (x.likes || 0) - (x.dislikes || 0);
/** 목록용 추천순: 새 글이 묻히지 않게 시간 감쇠. */
const hot = (x, now) => hotScore(score(x), now - x.at);
const myVote = (target) => db().votes[target] || 0;
/** 응답용 사본 — 싫어요·비밀번호 해시는 절대 싣지 않는다. */
function pub(x, kind) {
  const { dislikes, pinHash, pinSalt, pinFail, pinLock, ...rest } = x;
  return { ...rest, vote: myVote(kind + ':' + x.id) };
}

// ── 의견 스레드 ────────────────────────────────────────────────────────────
export async function charSummary() {
  await wait();
  const out = {};
  for (const p of db().posts) {
    if (!p.thread.startsWith('char:') || p.deleted) continue;
    const id = +p.thread.slice(5);
    const o = out[id] || (out[id] = { count: 0, last: 0 });
    o.count++; o.last = Math.max(o.last, p.at);
  }
  return out;
}

export async function recentPosts(limit = 6) {
  await wait();
  return db().posts.filter((p) => p.thread.startsWith('char:') && !p.deleted && !p.parent)
    .sort((a, b) => b.at - a.at).slice(0, limit).map((p) => pub(p, 'post'));
}

/** sort: 'best' | 'new'. 최상위는 정렬, 답글은 작성순. */
export async function thread(key, sort = 'best') {
  await wait();
  const all = db().posts.filter((p) => p.thread === key);
  const tops = all.filter((p) => !p.parent);
  tops.sort(sort === 'new' ? (a, b) => b.at - a.at : (a, b) => (score(b) - score(a)) || (b.at - a.at));
  return tops.map((p) => ({
    ...pub(p, 'post'),
    replies: all.filter((r) => r.parent === p.id).sort((a, b) => a.at - b.at).map((r) => pub(r, 'post')),
  }));
}

export async function threadCount(key) {
  return db().posts.filter((p) => p.thread === key && !p.deleted).length;
}

/**
 * 의견 작성. asPostId 가 있으면 그 글의 비밀번호로 이미 확인한 "이어 쓰기" — 같은 익명 이름을 쓴다.
 * 이어 쓰기 확인은 서버라면 짧은 토큰으로 주고받는다. 목에서는 pinOf 로 다시 확인한다.
 */
export async function createPost({ thread: key, parent = null, body, tags = [], pin, asPostId = null, asPin = null, replyTo = null }) {
  await wait();
  body = String(body || '').trim();
  if (!body) throw fail('fieldEmpty', { field: 'body' });
  if (body.length > LIMITS.post) throw fail('fieldTooLong', { field: 'body', max: LIMITS.post });
  const why = spamReason(body);
  if (why) throw new Error(spamText(why));
  if (!isPin(pin)) throw fail('pinFormat');
  const ids = (await chars()).map((c) => c.id);
  let who;
  if (asPostId) {
    const src = findAny(asPostId);
    const srcThread = src && (src.thread || (db().tiers.includes(src) ? 'tier:' + src.id : 'team:' + src.id));
    if (!src || srcThread !== key || !(await checkPin(src, asPin))) throw fail('continuePin');
    who = { anon: src.anon, anonNo: src.anonNo };
  } else who = pickAnon(key, ids);
  const salt = newId('s');
  const p = { id: newId('p'), thread: key, parent, replyTo, body, tags: tags.slice(0, 2), build: BUILD, at: Date.now(),
    likes: 0, dislikes: 0, ...who, pinSalt: salt, pinHash: await hashPin(pin, salt), pinFail: 0, pinLock: 0 };
  db().posts.push(p);
  db().mine.push({ kind: 'post', id: p.id, thread: key, at: p.at });
  save();
  return pub(p, 'post');
}

function findAny(id) {
  const d = db();
  return d.posts.find((x) => x.id === id) || d.tiers.find((x) => x.id === id) || d.teams.find((x) => x.id === id) || null;
}

async function checkPin(x, pin) {
  if (!isPin(pin)) return false;
  if (x.pinLock && Date.now() < x.pinLock) throw fail('pinLocked');
  const ok = (await hashPin(pin, x.pinSalt)) === x.pinHash;
  if (ok) x.pinFail = 0;
  else if (++x.pinFail >= PIN_MAX_FAIL) { x.pinLock = Date.now() + PIN_LOCK_MS; x.pinFail = 0; }
  save();
  return ok;
}

/** 비밀번호 확인만(이어 쓰기·수정 진입 전). 틀리면 남은 횟수와 함께 에러. */
export async function verifyPin(id, pin) {
  await wait();
  const x = findAny(id);
  if (!x) throw fail('notFound');
  const ok = await checkPin(x, pin);
  if (!ok) throw fail('pinWrong', { left: PIN_MAX_FAIL - x.pinFail });
  return { anon: x.anon, anonNo: x.anonNo };
}

export async function editPost(id, pin, body) {
  await wait();
  const p = db().posts.find((x) => x.id === id);
  if (!p) throw fail('notFound');
  body = String(body || '').trim();
  if (!body) throw fail('fieldEmpty', { field: 'body' });
  if (!(await checkPin(p, pin))) throw fail('pinWrongPlain');
  p.body = body.slice(0, LIMITS.post); p.edited = Date.now(); save();
  return pub(p, 'post');
}

/** 답글이 달린 글은 자리만 남기고 본문을 지운다(대화 흐름 보존). */
export async function deleteItem(id, pin) {
  await wait();
  const d = db();
  const x = findAny(id);
  if (!x) throw fail('notFound');
  if (!(await checkPin(x, pin))) throw fail('pinWrongPlain');
  if (d.posts.includes(x)) {
    if (d.posts.some((r) => r.parent === id && !r.deleted)) { x.deleted = true; x.body = ''; }
    else d.posts.splice(d.posts.indexOf(x), 1);
  } else if (d.tiers.includes(x)) d.tiers.splice(d.tiers.indexOf(x), 1);
  else d.teams.splice(d.teams.indexOf(x), 1);
  d.mine = d.mine.filter((m) => m.id !== id);
  save();
}

// ── 반응 · 신고 ────────────────────────────────────────────────────────────
/** target = 'post:ID' | 'tier:ID' | 'team:ID', value = 1 | -1 | 0(취소). 같은 값을 다시 누르면 취소. */
export async function react(target, value) {
  const [kind, id] = target.split(':');
  const d = db();
  const x = kind === 'post' ? d.posts.find((p) => p.id === id) : kind === 'tier' ? d.tiers.find((p) => p.id === id) : d.teams.find((p) => p.id === id);
  if (!x) throw fail('notFound');
  const prev = d.votes[target] || 0;
  const next = prev === value ? 0 : value;
  if (prev === 1) x.likes--; if (prev === -1) x.dislikes--;
  if (next === 1) x.likes++; if (next === -1) x.dislikes++;
  if (next) d.votes[target] = next; else delete d.votes[target];
  save();
  return { likes: x.likes, vote: next };
}

export async function report(target, reason = '') {
  await wait();
  const d = db();
  if (d.reports.some((r) => r.target === target)) return false;
  d.reports.push({ target, reason, at: Date.now() });
  save();
  return true;
}

// ── 티어표 ────────────────────────────────────────────────────────────────

export async function tiers({ basis = 'any', sort = 'best' } = {}) {
  await wait();
  const now = Date.now();
  const list = db().tiers.filter((t) => basis === 'any' || t.basis === basis);
  list.sort(sort === 'new' ? (a, b) => b.at - a.at : (a, b) => hot(b, now) - hot(a, now));
  return Promise.all(list.map(async (t) => ({ ...pub(t, 'tier'), comments: await threadCount('tier:' + t.id) })));
}
export async function tier(id) {
  await wait();
  const t = db().tiers.find((x) => x.id === id);
  return t ? pub(t, 'tier') : null;
}
export async function createTier({ title, basis, rows, descr, pin, fun = false }) {
  await wait();
  title = String(title || '').trim();
  if (!title) throw fail('fieldEmpty', { field: 'title' });
  if (!rows.some((r) => r.ids.length)) throw fail('tierEmpty');
  if (!isPin(pin)) throw fail('pinFormat');
  const ids = (await chars()).map((c) => c.id);
  const id = newId('t');
  const salt = newId('s');
  const t = { id, title: title.slice(0, LIMITS.title), basis, rows: clone(rows), descr: String(descr || '').slice(0, LIMITS.tierDesc), fun: fun === true, build: BUILD, at: Date.now(),
    likes: 0, dislikes: 0, ...pickAnon('tier:' + id, ids), pinSalt: salt, pinHash: await hashPin(pin, salt), pinFail: 0, pinLock: 0 };
  db().tiers.push(t); db().mine.push({ kind: 'tier', id, at: t.at }); save();
  return pub(t, 'tier');
}

/** 커뮤니티 평균 티어(집계 규칙은 shared.js — 서버와 동일). */
export async function aggregate(basis = 'all') {
  await wait();
  const list = db().tiers.filter((t) => !t.fun && (basis === 'any' || t.basis === basis));   // 집계 제외 표시한 티어표는 빼고
  const pos = {};
  for (const t of list) for (const [cid, v] of tierPositions(t.rows)) (pos[cid] ||= []).push(v);
  return aggregateRows(pos, list.length);
}

/** 동료 한 명의 평균 티어(동료 페이지 요약 띠용). */
export async function charTier(cid, basis = 'all') {
  const a = await aggregate(basis);
  for (const r of a.rows) { const it = r.items.find((x) => x.id === cid); if (it) return { label: r.label, n: it.n }; }
  return null;
}

// ── 팀 공유 ───────────────────────────────────────────────────────────────

export async function teams({ withIds = [], basis = 'any', sort = 'best' } = {}) {
  await wait();
  const now = Date.now();
  const list = db().teams.filter((t) => (basis === 'any' || t.basis === basis) && withIds.every((id) => t.ids.includes(id)));
  list.sort(sort === 'new' ? (a, b) => b.at - a.at : (a, b) => hot(b, now) - hot(a, now));
  return Promise.all(list.map(async (t) => ({ ...pub(t, 'team'), comments: await threadCount('team:' + t.id) })));
}
export async function team(id) {
  await wait();
  const t = db().teams.find((x) => x.id === id);
  return t ? pub(t, 'team') : null;
}
export async function teamByCode(code) {
  const t = db().teams.find((x) => x.code === code);
  return t ? { id: t.id, title: t.title } : null;
}
export async function teamCountWith(cid) { return db().teams.filter((t) => t.ids.includes(cid)).length; }

/** ids·summary 는 서버가 코드를 다시 판독해 정한다(클라이언트 값을 믿지 않음). 목에서는 호출부 판독 결과를 쓴다. */
export async function createTeam({ code, ids, summary, title, basis, descr, pin }) {
  await wait();
  title = String(title || '').trim();
  if (!ids || ids.length === 0) throw fail('codeEmpty');
  if (!title) throw fail('fieldEmpty', { field: 'title' });
  if (!isPin(pin)) throw fail('pinFormat');
  const dup = await teamByCode(code);
  if (dup) throw fail('teamDup', {}, { dupId: dup.id });
  const cids = (await chars()).map((c) => c.id);
  const id = newId('m');
  const salt = newId('s');
  const t = { id, code, ids, summary, title: title.slice(0, LIMITS.title), basis, descr: String(descr || '').slice(0, LIMITS.teamDesc), build: BUILD, at: Date.now(),
    likes: 0, dislikes: 0, ...pickAnon('team:' + id, cids), pinSalt: salt, pinHash: await hashPin(pin, salt), pinFail: 0, pinLock: 0 };
  db().teams.push(t); db().mine.push({ kind: 'team', id, at: t.at }); save();
  return pub(t, 'team');
}

// ── 내 활동 ───────────────────────────────────────────────────────────────
export async function mine() {
  await wait();
  const d = db();
  return d.mine.slice().sort((a, b) => b.at - a.at).map((m) => {
    const x = findAny(m.id);
    return x ? { ...m, item: m.kind === 'post' ? pub(x, 'post') : pub(x, m.kind) } : null;
  }).filter(Boolean);
}

// 운영자 모드는 실제 서버에서만(관리자 토큰 확인이 서버에 있음).
export const isOperator = () => false;
export async function setOperatorToken() { throw fail('mockOp'); }
export function clearOperator() {}
export async function pinPost() { throw fail('mockPin'); }

// 티어표·팀 수정(목업): 비밀번호 확인 후 필드만 바꾼다.
export async function editTier(id, pin, { title, basis, rows, descr, fun = false }) {
  await wait();
  const t = db().tiers.find((x) => x.id === id);
  if (!t) throw fail('tierNotFound');
  if (!(await checkPin(t, pin))) throw fail('pinWrongPlain');
  Object.assign(t, { title: String(title || '').trim().slice(0, LIMITS.title) || t.title, basis, rows: clone(rows), descr: String(descr || '').slice(0, LIMITS.tierDesc), fun: fun === true, edited: Date.now() });
  save();
  return pub(t, 'tier');
}
export async function editTeam(id, pin, { title, basis, descr }) {
  await wait();
  const t = db().teams.find((x) => x.id === id);
  if (!t) throw fail('teamNotFound');
  if (!(await checkPin(t, pin))) throw fail('pinWrongPlain');
  Object.assign(t, { title: String(title || '').trim().slice(0, LIMITS.title) || t.title, basis, descr: String(descr || '').slice(0, LIMITS.teamDesc), edited: Date.now() });
  save();
  return pub(t, 'team');
}
