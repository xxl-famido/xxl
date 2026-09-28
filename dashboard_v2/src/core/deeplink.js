/**
 * core/deeplink.js — 라운지 → 시뮬 연결 주소 처리. (메인 main.js 에 아직 연결 전 — 연결 방법은 맨 아래 주석)
 *
 *   index.html#code=<공유코드>&run=1   라운지 "시뮬하러 가기": 팀을 불러와 바로 실행
 *   index.html#code=<공유코드>         불러오기만
 *   index.html#add=<동료ID>            라운지 "시뮬에서 편성": 빈 자리에 동료 추가
 *
 * 안전
 *  - 코드 길이 상한 + 압축 해제 크기 상한(256KB): 누가 보낸 링크로 탭이 멈추는 압축 폭탄 방지.
 *  - 모르는 동료가 든 코드, 빈 팀은 적용하지 않는다.
 *  - 적용 전 화면 상태를 undo 로 돌려준다 → 호출부가 "되돌리기" 토스트를 띄워 작업 중이던 초안을 잃지 않게.
 *  - 처리한 뒤 주소에서 #code… 를 지운다(새로고침해도 다시 덮어쓰지 않게).
 */
import { b64urlToBytes, unpackRecords } from './codec.js';

export const DEEPLINK_MAX_CODE = 4000;               // 라운지 LIMITS.code 와 같다
const MAX_INFLATED_BYTES = 256 * 1024;
const CODE_RE = /^[#$*][A-Za-z0-9_-]+$/;

/** location.hash → { code?, run, add? } | null. 형식이 이상하면 null(무시). */
export function parseDeepLink(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw || !/(^|&)(code|add)=/.test(raw)) return null;
  const q = new URLSearchParams(raw);
  const out = { run: q.get('run') === '1' };
  const code = q.get('code');
  if (code != null) {
    const c = code.trim();
    if (!c || c.length > DEEPLINK_MAX_CODE || !CODE_RE.test(c)) return null;
    out.code = c;
  }
  const add = q.get('add');
  if (add != null) {
    if (!/^\d{5}$/.test(add)) return null;
    out.add = +add;
  }
  return out.code || out.add ? out : null;
}

async function inflateBounded(bytes) {
  const ds = new DecompressionStream('deflate');
  const w = ds.writable.getWriter();
  w.write(bytes).catch(() => {});
  w.close().catch(() => {});
  const r = ds.readable.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_INFLATED_BYTES) { await r.cancel().catch(() => {}); throw new Error('too large'); }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  return new TextDecoder().decode(buf);
}

/** 공유 코드 → 첫 기록의 스냅샷. 읽을 수 없으면 에러('bad'|'unknown'|'empty'). */
export async function snapFromCode(code, chars = {}) {
  let recs;
  try {
    const json = JSON.parse(await inflateBounded(b64urlToBytes(code.slice(1))));
    recs = code[0] === '*' ? json : unpackRecords(json, code[0] === '$', chars);
  } catch { throw Object.assign(new Error('bad'), { reason: 'bad' }); }
  const snap = Array.isArray(recs) && recs[0] && recs[0].snap;
  const team = snap && Array.isArray(snap.team) ? snap.team.filter(Boolean) : [];
  if (!team.length) throw Object.assign(new Error('empty'), { reason: 'empty' });
  if (Object.keys(chars).length && team.some((s) => !chars[s.id])) throw Object.assign(new Error('unknown'), { reason: 'unknown' });
  return snap;
}

/**
 * 스토어에 적용. → { applied: 'code'|'add'|null, run, undo?, reason? }
 * store: createStore() 결과(snapshot/applySnap/saveDraft/team.add/get 사용).
 */
export async function applyDeepLink(store, link) {
  if (!link) return { applied: null, run: false };
  const chars = (store.get && store.get().chars) || {};
  if (link.code) {
    let snap;
    try { snap = await snapFromCode(link.code, chars); } catch (e) { return { applied: null, run: false, reason: e.reason || 'bad' }; }
    const undo = store.snapshot();
    store.applySnap(snap);
    store.saveDraft();
    return { applied: 'code', run: !!link.run, undo };
  }
  if (link.add) {
    if (Object.keys(chars).length && !chars[link.add]) return { applied: null, run: false, reason: 'unknown' };
    const r = store.team.add(link.add);
    if (r.ok) store.saveDraft();
    return { applied: r.ok ? 'add' : null, run: false, reason: r.ok ? undefined : r.reason };
  }
  return { applied: null, run: false };
}

/** 주소에서 딥링크 부분을 지운다(뒤로 가기 기록을 남기지 않게 replaceState). */
export function clearDeepLink(loc = globalThis.location, hist = globalThis.history) {
  if (!loc || !hist || !parseDeepLink(loc.hash)) return;
  hist.replaceState(null, '', loc.pathname + loc.search);
}

/*
 * ── main.js 연결 방법(메인 작업이 끝난 뒤, 부트에서 초안 복원 다음에) ──────────────
 *   import { parseDeepLink, applyDeepLink, clearDeepLink } from './core/deeplink.js';
 *   const link = parseDeepLink(location.hash);
 *   if (link) {
 *     const r = await applyDeepLink(store, link);
 *     clearDeepLink();
 *     if (r.applied === 'code') toast(t('deeplink.loaded'), { label: t('common.undo'), run: () => { store.applySnap(r.undo); store.saveDraft(); } });
 *     if (r.reason) toast(t(`deeplink.${r.reason}`));     // bad | empty | unknown | full | dup | imbueonP1
 *     if (r.run) runSimulation();                           // 실행 버튼과 같은 경로(로딩 모션 포함)
 *   }
 * 문구 키(deeplink.loaded/bad/empty/unknown)는 GLOSSARY·i18n 에 추가.
 */
