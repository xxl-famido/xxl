/**
 * lounge/api.js — 화면이 부르는 유일한 데이터 입구. 서버 주소가 있으면 api-remote, 없으면 api-mock.
 *
 * 서버 주소 결정 순서
 *  1) URL ?api=<주소> — **localhost/127.0.0.1 만 허용**(개발용). 남이 보낸 링크로 비밀번호가 다른 서버에 가는 피싱을 막는다.
 *     ?api=mock 은 목, ?api=live 는 기억된 선택을 지우고 meta 주소로. 선택은 이 탭(sessionStorage)에만 유지.
 *  2) <meta name="lounge-api" content="https://…workers.dev"> — 배포용 고정 주소.
 *  3) 없으면 목(localStorage) — 목업 확인용.
 * Turnstile 사이트 키: <meta name="lounge-turnstile" content="…"> (로컬 서버면 공식 테스트 키 자동).
 */
export * from './shared.js';

const SESSION_KEY = 'woofia_lounge_api';
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)$/;
const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content?.trim() || '';

function resolveBase() {
  const q = new URLSearchParams(location.search).get('api');
  if (q === 'live') sessionStorage.removeItem(SESSION_KEY);          // 기억된 테스트 연결을 지우고 라이브(meta) 로
  else if (q === 'mock') sessionStorage.setItem(SESSION_KEY, 'mock');
  else if (q) {
    try {
      const u = new URL(q);
      if (LOCAL_HOST.test(u.hostname) && /^https?:$/.test(u.protocol)) sessionStorage.setItem(SESSION_KEY, u.origin);
      else console.warn('[lounge] ?api= 는 localhost 주소만 받습니다:', q);
    } catch { console.warn('[lounge] ?api= 주소 형식이 잘못됐습니다:', q); }
  }
  const s = sessionStorage.getItem(SESSION_KEY);
  if (s === 'mock') return null;
  if (s) return s;
  const m = meta('lounge-api');
  return /^https:\/\//.test(m) ? m : null;
}

export const API_BASE = resolveBase();
export const MODE = API_BASE ? 'remote' : 'mock';
/** 라이브(meta 주소)가 아닌 곳에 붙어 있으면 true — 화면에 '테스트 데이터' 표시. */
export const IS_TEST = !API_BASE || LOCAL_HOST.test(new URL(API_BASE).hostname);

const impl = API_BASE
  ? await import('./api-remote.js').then((m) => { m.configure(API_BASE, meta('lounge-turnstile')); return m; })
  : await import('./api-mock.js');

export const {
  deviceId, resetMock, chars, charSummary, recentPosts, thread, threadCount, createPost, verifyPin, editPost, deleteItem,
  react, report, tiers, tier, createTier, aggregate, charTier, teams, team, teamByCode, teamCountWith, createTeam, mine,
  isOperator, setOperatorToken, clearOperator, pinPost, editTier, editTeam,
} = impl;
