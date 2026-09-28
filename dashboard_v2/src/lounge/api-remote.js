/**
 * lounge/api-remote.js — 실제 서버(lounge_api Worker) 어댑터. api-mock.js 와 **같은 함수·같은 반환 모양**을 지킨다.
 *
 * - POST 본문은 JSON 을 text/plain 으로 보낸다 → 브라우저 사전 요청(OPTIONS)이 없어 서버 무료 요청 한도를 아낀다.
 * - 기기 난수(dev)는 좋아요 중복 방지용. GET 은 ?d=, POST 는 본문으로.
 * - 글쓰기(의견·티어표·팀)는 Turnstile 토큰(ts)을 붙인다. 평소엔 보이지 않고, 의심스러울 때만 확인 창이 뜬다.
 */
import { isPin } from './shared.js';
import { t, errorText } from './i18n.js';

const DEVICE_KEY = 'woofia_lounge_dev';
const MINE_KEY = 'woofia_lounge_mine';
const OP_KEY = 'woofia_lounge_op';   // 운영자(관리자) 토큰 — 이 브라우저에만. 글쓰기 요청에만 싣는다.
const TS_TEST_SITEKEY = '1x00000000000000000000AA';   // Cloudflare 공식 '항상 통과' 테스트 키(로컬 서버 전용)
const TS_TIMEOUT_MS = 30000;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)$/;

let BASE = '';
let SITEKEY = '';
export function configure(base, sitekey) {
  BASE = base.replace(/\/+$/, '');
  SITEKEY = LOCAL_HOST.test(new URL(BASE).hostname) ? TS_TEST_SITEKEY : (sitekey || '');
}

export function deviceId() {
  let d = localStorage.getItem(DEVICE_KEY);
  if (!/^[0-9a-f]{32}$/.test(d || '')) {
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    d = [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(DEVICE_KEY, d);
  }
  return d;
}
export function resetMock() { /* 서버 모드에서는 할 일 없음 */ }

// ── 요청 ─────────────────────────────────────────────────────────────────
async function get(path, params = {}) {
  const q = new URLSearchParams({ ...params, d: deviceId() });
  return send(`${BASE}${path}?${q}`, { method: 'GET' });
}
async function post(path, body = {}, { turnstile = false, auth = false } = {}) {
  const payload = { ...body, dev: deviceId() };
  const headers = { 'Content-Type': 'text/plain;charset=UTF-8' };
  const op = (turnstile || auth) && isOperator();            // 운영자는 글쓰기(의견·티어표·팀)에서 봇 확인 대신 토큰
  if (op) headers.Authorization = `Bearer ${localStorage.getItem(OP_KEY)}`;
  else if (turnstile) payload.ts = await turnstileToken();
  return send(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(payload) });
}

// ── 운영자 모드 ──
export const isOperator = () => /^[0-9a-f]{64}$/.test(localStorage.getItem(OP_KEY) || '');
/** 토큰이 맞는지 서버에 확인(읽기 전용 관리자 API) 후 이 브라우저에 저장. */
export async function setOperatorToken(tok) {
  tok = String(tok || '').trim();
  if (!/^[0-9a-f]{64}$/.test(tok)) throw new Error(t('err.opTokenFormat'));
  const r = await fetch(`${BASE}/v1/admin/reports`, { headers: { Authorization: `Bearer ${tok}` }, credentials: 'omit' }).catch(() => null);
  if (!r) throw new Error(t('err.network'));
  if (!r.ok) throw new Error(r.status === 401 ? t('err.opTokenBad') : t('err.requestFail', { status: r.status }));
  localStorage.setItem(OP_KEY, tok);
}
export function clearOperator() { localStorage.removeItem(OP_KEY); }
/** 운영자 전용: 최상위 의견 맨 위 고정/해제(관리자 API — 토큰 없으면 서버가 401). */
export async function pinPost(id, on) {
  if (!isOperator()) throw new Error(t('err.opOnly'));
  return send(`${BASE}/v1/admin/moderate`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', Authorization: `Bearer ${localStorage.getItem(OP_KEY)}` }, body: JSON.stringify({ target: 'post:' + id, action: on ? 'pin' : 'unpin' }) });
}
async function send(url, init) {
  let r;
  try { r = await fetch(url, { ...init, credentials: 'omit', mode: 'cors' }); } catch { throw new Error(t('err.network')); }
  let data = {};
  try { data = await r.json(); } catch { /* 본문 없음 */ }
  if (!r.ok) {
    const msg = r.status === 429 && !data.error ? t('err.rateGeneric', { wait: '' }) : errorText(data, t('err.requestFail', { status: r.status }));
    throw Object.assign(new Error(msg), { status: r.status, dupId: data.dupId, retryAfter: data.retryAfter });
  }
  return data;
}

// ── Turnstile ────────────────────────────────────────────────────────────
let tsLoad = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  tsLoad ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => res();
    s.onerror = () => { tsLoad = null; rej(new Error(t('err.tsLoadFail'))); };
    document.head.append(s);
  });
  return tsLoad;
}
async function turnstileToken() {
  if (!SITEKEY) throw new Error(t('err.tsNoKey'));
  await loadTurnstile();
  return new Promise((resolve, reject) => {
    const box = document.createElement('div');
    box.className = 'lg-ts';
    document.body.append(box);
    let wid = null;
    let done = false;
    const finish = (fn, v) => {
      if (done) return; done = true; clearTimeout(timer);
      setTimeout(() => { try { if (wid !== null) window.turnstile.remove(wid); } catch { /* 이미 제거됨 */ } box.remove(); }, 0);
      fn(v);
    };
    const timer = setTimeout(() => finish(reject, new Error(t('err.tsTimeout'))), TS_TIMEOUT_MS);
    wid = window.turnstile.render(box, {
      sitekey: SITEKEY, appearance: 'interaction-only', action: 'lounge-write',
      callback: (t) => finish(resolve, t),
      'error-callback': () => finish(reject, new Error(t('err.tsFailed'))),
      'expired-callback': () => finish(reject, new Error(t('err.tsExpired'))),
    });
  });
}

// ── 내 활동(이 기기에서 쓴 글 ID) ─────────────────────────────────────────
function mineList() { try { return JSON.parse(localStorage.getItem(MINE_KEY) || '[]'); } catch { return []; } }
function remember(kind, id) {
  const list = mineList().filter((m) => m.id !== id);
  list.unshift({ kind, id, at: Date.now() });
  localStorage.setItem(MINE_KEY, JSON.stringify(list.slice(0, 200)));
}
function forget(id) { localStorage.setItem(MINE_KEY, JSON.stringify(mineList().filter((m) => m.id !== id))); }

// ── 동료 ──────────────────────────────────────────────────────────────────
let _chars = null;
export async function chars() {
  if (_chars) return _chars;
  const r = await fetch('lounge_chars.json');
  if (!r.ok) throw new Error(t('err.charsLoadFail', { status: r.status }));
  _chars = await r.json();
  return _chars;
}

// ── 의견 ──────────────────────────────────────────────────────────────────
export const charSummary = () => get('/v1/chars/summary');
export const recentPosts = (limit = 6) => get('/v1/posts/recent', { limit });
export const thread = (key, sort = 'best') => get(`/v1/threads/${encodeURIComponent(key)}`, { sort });
export async function threadCount(key) {
  const t = await thread(key);
  return t.reduce((s, p) => s + (p.deleted ? 0 : 1) + p.replies.filter((r) => !r.deleted).length, 0);
}
export async function createPost(args) {
  if (!isPin(args.pin ?? args.asPin)) throw new Error(t('err.pinFormat'));
  const p = await post('/v1/posts', args, { turnstile: true });
  remember('post', p.id);
  return p;
}
export const verifyPin = (id, pin) => post(`/v1/items/${id}/verify`, { pin });
export const editPost = (id, pin, body) => post(`/v1/posts/${id}/edit`, { pin, body }, { auth: true });
export async function deleteItem(id, pin) {
  const r = await post(`/v1/items/${id}/delete`, { pin }, { auth: true });
  forget(id);
  return r;
}
export const react = (target, value) => post('/v1/react', { target, value });
export async function report(target, reason = '') { return (await post('/v1/report', { target, reason })).ok; }

// ── 티어표 ────────────────────────────────────────────────────────────────
export const tiers = ({ basis = 'any', sort = 'best' } = {}) => get('/v1/tiers', { basis, sort });
export async function tier(id) {
  try { return await get(`/v1/tiers/${id}`); } catch (e) { if (e.status === 404 || e.status === 400) return null; throw e; }
}
/** 티어표·팀 수정(운영자는 토큰, 그 외 작성 때 비밀번호). */
export const editTier = (id, pin, data) => post(`/v1/tiers/${id}/edit`, { pin, ...data }, { auth: true });
export const editTeam = (id, pin, data) => post(`/v1/teams/${id}/edit`, { pin, ...data }, { auth: true });

export async function createTier(args) {
  const t = await post('/v1/tiers', args, { turnstile: true });
  remember('tier', t.id);
  return t;
}
export const aggregate = (basis = 'all') => get('/v1/tiers/aggregate', { basis });
export async function charTier(cid, basis = 'all') {
  const a = await aggregate(basis);
  for (const r of a.rows) { const it = r.items.find((x) => x.id === cid); if (it) return { label: r.label, n: it.n }; }
  return null;
}

// ── 팀 ────────────────────────────────────────────────────────────────────
export const teams = ({ withIds = [], basis = 'any', sort = 'best' } = {}) => get('/v1/teams', { with: withIds.join(','), basis, sort });
export async function team(id) {
  try { return await get(`/v1/teams/${id}`); } catch (e) { if (e.status === 404 || e.status === 400) return null; throw e; }
}
export async function teamByCode(code) { return (await get('/v1/teams/by-code', { code })).team; }
export async function teamCountWith(cid) { return (await get('/v1/teams/count', { with: cid })).count; }
/** ids·summary 는 보내지 않는다 — 서버가 코드를 다시 읽어 정한다. */
export async function createTeam({ code, title, basis, descr, pin }) {
  const t = await post('/v1/teams', { code, title, basis, descr, pin }, { turnstile: true });
  remember('team', t.id);
  return t;
}

// ── 내 활동 ───────────────────────────────────────────────────────────────
export async function mine() {
  const list = mineList();
  if (!list.length) return [];
  const found = await get('/v1/items', { ids: list.map((m) => m.id).join(',') });
  const byId = new Map(found.map((f) => [f.item.id, f]));
  return list.filter((m) => byId.has(m.id)).map((m) => ({ ...m, item: byId.get(m.id).item, thread: byId.get(m.id).item.thread }));
}
