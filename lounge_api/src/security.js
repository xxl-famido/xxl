/**
 * security.js — 해시·요청 제한·봇 확인·출처 제한·입력 정리.
 * 비밀값(env.PIN_PEPPER, env.TURNSTILE_SECRET, env.ADMIN_TOKEN)은 `wrangler secret put` 으로만 들어온다(저장소에 없음).
 */

import { ANTISPAM, normalizeForDup } from '../../dashboard_v2/src/lounge/shared.js';
import KR from '../../dashboard_v2/i18n/lounge/kr.json' with { type: 'json' };

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

/**
 * 오류는 코드로 던진다: 응답 { error: 한국어 문구, code, vars } — 화면이 code 를 사용자 언어로 바꿔 보여 준다(없으면 error).
 * 한국어 문구의 원본은 라운지 사전(i18n/lounge/kr.json 의 err.*) 한 곳.
 * vars.sec(남은 초) → {wait}, vars.field(필드 코드) → {field} 는 여기서 한국어로 채우고, 화면은 자기 언어로 다시 채운다.
 */
const fillKr = (tpl, v) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (v[k] ?? m));
export function E(status, code, vars = {}, extra = {}) {
  const kv = { ...vars };
  if (vars.sec != null) kv.wait = retryText(vars.sec);
  if (vars.field) kv.field = KR[`field.name.${vars.field}`] || vars.field;
  return new HttpError(status, fillKr(KR[`err.${code}`] || code, kv), { code, vars, ...extra });
}

// ── HMAC ────────────────────────────────────────────────────────────────
const _keys = new Map();
async function hmacKey(secret) {
  if (!secret || secret.length < 16) throw E(500, 'serverConfig');
  if (!_keys.has(secret)) {
    _keys.set(secret, await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
  }
  return _keys.get(secret);
}
export async function hmacHex(secret, msg) {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** 길이가 같으면 끝까지 비교(타이밍으로 일치 길이를 새지 않게). */
export function safeEqual(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function randomId(prefix, len = 12) {
  const a = new Uint8Array(len); crypto.getRandomValues(a);
  return prefix + [...a].map((b) => (b % 36).toString(36)).join('');
}

export const utcDay = () => new Date().toISOString().slice(0, 10);
export const clientIp = (req) => req.headers.get('CF-Connecting-IP') || '0.0.0.0';
/** IP 원문은 저장하지 않는다. 일자별 해시(다음 날이면 같은 IP 라도 다른 값). */
export const ipHash = (env, req) => hmacHex(env.PIN_PEPPER, `ip:${clientIp(req)}:${utcDay()}`);
/** 반응 중복 방지용 투표자 식별: 브라우저 기기 난수(32 hex)가 있으면 그것, 없으면 IP 해시. */
export async function voterOf(env, req, dev) {
  if (typeof dev === 'string' && /^[0-9a-f]{32}$/.test(dev)) return hmacHex(env.PIN_PEPPER, `dev:${dev}`);
  return 'ip' + (await ipHash(env, req));
}
export const pinHash = (env, salt, pin) => hmacHex(env.PIN_PEPPER, `pin:${salt}:${pin}`);

// ── 요청 제한 (D1 고정 창) ────────────────────────────────────────────────
export const RATE = Object.freeze({
  writeMin: { limit: 3, win: 60 },                          // 글·티어표·팀 작성: IP 분당 3
  writeDay: { limit: 50, win: 86400 },                      //                  IP 하루 50
  threadBurst: { limit: ANTISPAM.threadBurst, win: 600 },   // 한 게시판: IP 10분 5
  tierDay: { limit: ANTISPAM.dailyTiers, win: 86400 },      // 티어표 공개: IP 하루 5
  teamDay: { limit: ANTISPAM.dailyTeams, win: 86400 },      // 팀 올리기: IP 하루 5
  globalWrite: { limit: 60, win: 60 },                      // 사이트 전체 쓰기: 분당 60 넘으면 비상 정지
  react: { limit: 40, win: 60 },                            // 좋아요/싫어요: IP 분당 40
  reactDay: { limit: 600, win: 86400 },                     //                IP 하루 600
  verify: { limit: 20, win: 600 },                          // 비밀번호 확인: 10분 20 (글마다 5회 잠금과 별개)
  report: { limit: 10, win: 3600 },                         // 신고: 시간당 10
  adminFail: { limit: 5, win: 3600 },                       // 관리자 토큰 실패: 시간당 5
});
const RATE_CLEAN_CHANCE = 0.02;

/**
 * 로컬 자동 검사 전용 배수. .dev.vars 의 RATE_SCALE 이 있을 때만 켜지고(라이브에는 없음 → 항상 1),
 * 그때에 한해 요청 헤더 X-Test-Rate-Scale 로 검사마다 바꿀 수 있다(제한 자체를 검사하려면 1).
 */
export function rateScale(env, req, header = 'X-Test-Rate-Scale') {
  const ok = (v) => { const k = Number(v); return Number.isInteger(k) && k >= 1 && k <= 100 ? k : null; };
  const base = ok(env.RATE_SCALE);
  if (!base) return 1;
  return ok(req && req.headers.get(header)) || base;
}
/** 연속 작성 간격(초). 라이브 = ANTISPAM.gapSec. 로컬 검사에서 배수가 크면 0(간격 없음). */
const gapSeconds = (env, req) => Math.floor(ANTISPAM.gapSec / rateScale(env, req, 'X-Test-Gap-Scale'));
/** 한국어 대기 시간(서버 문구용). 화면은 i18n 에서 자기 언어로 만든다. */
const retryText = (sec) => (sec >= 3600 ? `${Math.ceil(sec / 3600)}시간` : sec >= 60 ? `${Math.ceil(sec / 60)}분` : `${sec}초`);

/** 고정 창 요청 제한. 넘으면 429 + retryAfter(초). */
export async function limit(env, kind, who, req) {
  const { limit: base, win } = RATE[kind];
  const max = base * rateScale(env, req);
  const now = Math.floor(Date.now() / 1000);
  const w = Math.floor(now / win);
  const row = await env.DB.prepare('INSERT INTO rate (k, n, exp) VALUES (?1, 1, ?2) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n')
    .bind(`${kind}:${who}:${w}`, (w + 1) * win).first();
  if (Math.random() < RATE_CLEAN_CHANCE) await env.DB.prepare('DELETE FROM rate WHERE exp < ?1').bind(now).run();
  if (row.n > max) {
    const retryAfter = Math.max(1, (w + 1) * win - now);
    const code = { writeMin: 'rateWriteMin', writeDay: 'rateWriteDay', threadBurst: 'rateThread', tierDay: 'rateTierDay', teamDay: 'rateTeamDay' }[kind] || 'rateGeneric';
    throw E(429, code, { sec: retryAfter, n: base }, { retryAfter });
  }
}

/** 연속 작성 간격: 마지막으로 **성공한** 글 뒤 gapSec 이 안 지났으면 429. 검사만 한다(기록은 markWrite). */
export async function checkGap(env, req, who) {
  const row = await env.DB.prepare('SELECT exp FROM rate WHERE k = ?1').bind(`gap:${who}`).first();
  const now = Math.floor(Date.now() / 1000);
  if (row && row.exp > now) {
    const retryAfter = row.exp - now;
    throw E(429, 'rateGap', { sec: retryAfter, gap: ANTISPAM.gapSec }, { retryAfter });
  }
}
export function markWrite(env, req, who) {
  const exp = Math.floor(Date.now() / 1000) + gapSeconds(env, req);
  return env.DB.prepare('INSERT INTO rate (k, n, exp) VALUES (?1, 1, ?2) ON CONFLICT(k) DO UPDATE SET n = 1, exp = ?2').bind(`gap:${who}`, exp);
}

/** 중복 판정 키(정규화 본문의 HMAC 앞 16자). */
export const bodyKey = async (env, text) => (await hmacHex(env.PIN_PEPPER, 'body:' + normalizeForDup(text))).slice(0, 16);

// ── Turnstile ───────────────────────────────────────────────────────────
export async function checkTurnstile(env, req, token) {
  if (typeof token !== 'string' || !token || token.length > 2048) throw E(403, 'tsNeeded');
  if (!env.TURNSTILE_SECRET) throw E(500, 'serverConfig');
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  form.append('remoteip', clientIp(req));
  let data;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    data = await r.json();
  } catch { throw E(503, 'tsUnavailable'); }
  if (!data.success) throw E(403, 'tsFailed');
}

// ── 출처(CORS) ───────────────────────────────────────────────────────────
export function allowedOrigin(env, req) {
  const o = req.headers.get('Origin');
  if (!o) return null;
  return String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).includes(o) ? o : false;
}
export function corsHeaders(origin) {
  const h = { 'Vary': 'Origin' };
  if (origin) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

// ── 입력 정리 ────────────────────────────────────────────────────────────
/** 제어문자 제거(줄바꿈·탭 유지), CRLF 정리, 빈 줄 3개 이상 축약, 앞뒤 공백 제거. 길이 초과는 에러. */
export function cleanText(v, max, name, { required = true } = {}) {
  let s = typeof v === 'string' ? v : '';
  s = s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/\n{4,}/g, '\n\n\n').trim();
  if (required && !s) throw E(400, 'fieldEmpty', { field: name });
  if (s.length > max) throw E(400, 'fieldTooLong', { field: name, max });
  return s;
}
