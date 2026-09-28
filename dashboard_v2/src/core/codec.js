/**
 * core/codec.js — 공유 코드·기록 코덱 (v1 app.js L296-525 · L3217-3220 · L3277-3294 · L3388-3408 · L435-458 이식).
 *
 * 형식: '#' 축약형(v1) / '$' 개선판(타임라인 압축 + 제단·턴 피해·연동 꼬리 + v2.1 핀·잠긴 턴 꼬리) / '*' 전체 JSON 폴백.
 * 새 기능을 안 쓰면 예전과 **바이트까지 같은** '#' 코드가 나오고, 어느 형식이든 왕복 자기검증(looseEq)에
 * 실패하면 '*'로 물러난다. v1이 만든 코드는 v2에서 그대로 열리고, v2 코드도 v1에서 열린다(tests/codec.test.js).
 *
 * 압축은 브라우저/Node 공통 CompressionStream('deflate') + base64url. 라벨은 코드에 싣지 않고 chars 로 재생성한다.
 */
import { specOn, specOf, SPEC_SLOTS, promoteLegacySpec } from './spec.js';
import { ultOf, ultIsDefault, normalizeSyncGroups, syncOtherOf, syncOtherDefault, migrateSnapSync, ALTAR_FLOORS } from './plan.js';
import { makeLabel } from './format.js';

export const CID0 = 10000;
const _TK = '평궁방';
const _PT = '0123456789abcde';

export const encPlan = (p) => (p || []).map((x) => _TK.indexOf(x)).join('');
export const decPlan = (s) => [...String(s)].map((c) => _TK[+c]);
/** 이태호 fed {턴:토큰} → "4궁7방"(평=기본 미저장). */
export const encFed = (f) => Object.keys(f || {}).filter((t) => f[t] && f[t] !== '평').sort((a, b) => a - b).map((t) => t + f[t]).join('');
export const decFed = (s) => { const o = {}; String(s).replace(/(\d+)([궁방])/g, (_, t, k) => (o[t] = k, '')); return o; };
export const trimDef = (a, D) => { while (a.length > 1 && JSON.stringify(a[a.length - 1]) === JSON.stringify(D[a.length - 1])) a.pop(); return a; };

/** 스펙 → "레벨.성급.진화.육성도.스킬(0~8자, 뒤쪽 10=a 생략)". 꺼져 있으면 ''. */
export const encSpec = (s) => {
  if (!specOn(s)) return '';
  const p = specOf(s);
  const lv = SPEC_SLOTS.map((k) => Math.max(1, Math.min(10, p.lv[k] ?? 10)).toString(36)).join('').replace(/a+$/, '');
  return [p.level, p.evo, p.pevo, p.compat, lv].join('.');
};
export const decSpec = (str) => {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)\.([0-9a]{0,8})$/.exec(String(str || ''));
  if (!m) return null;
  const p = { on: true, level: +m[1], evo: +m[2], pevo: +m[3], compat: +m[4], lv: {} };
  const lv = m[5].padEnd(SPEC_SLOTS.length, 'a');
  SPEC_SLOTS.forEach((k, i) => { p.lv[k] = parseInt(lv[i], 36); });
  return p;
};
/** 궁극기 사용 방식: '' 기본 / 'a' 'a!' 's' 'f+' … (방식 첫 글자, '!'=방어 턴 덮음, '+'=확률 감소 성공 가정). */
export const encUlt = (s) => { const u = ultOf(s); if (ultIsDefault(u)) return ''; return u.mode[0] + (u.keepDef ? '' : '!') + (u.assist ? '+' : ''); };
export const decUlt = (str) => {
  const m = /^([fsa])(!?)(\+?)$/.exec(String(str || '')); if (!m) return null;
  const u = { mode: { f: 'fixed', s: 'strict', a: 'asap' }[m[1]], keepDef: !m[2] }; if (m[3]) u.assist = true; return u;
};

/** 타임라인 {턴:[{p,a}]} → 항목 1글자, 턴은 '.'로. ''=미지정 턴, '-'=아무도 행동 안 함. 표현 밖이면 null. */
export function encTP(tp) {
  const keys = Object.keys(tp || {}).map(Number).filter((t) => t >= 1);
  if (!keys.length) return '';
  const out = [];
  for (let t = 1; t <= Math.max(...keys); t++) {
    const seq = tp[t];
    if (seq === undefined) { out.push(''); continue; }
    if (!seq.length) { out.push('-'); continue; }
    let s = '';
    for (const e of seq) {
      const ai = _TK.indexOf(e.a), p = +e.p;
      if (ai < 0 || !(p >= 1 && p <= 5)) return null;
      s += _PT[(p - 1) * 3 + ai];
    }
    out.push(s);
  }
  return out.join('.');
}
export function decTP(str) {
  const o = {};
  if (!str) return o;
  String(str).split('.').forEach((s, i) => {
    if (s === '') return;
    o[i + 1] = s === '-' ? [] : [...s].map((c) => { const k = _PT.indexOf(c); return { p: (k / 3 | 0) + 1, a: _TK[k % 3] }; });
  });
  return o;
}

/** 핀 {턴:{자리:'궁'|'방'|'평'|'궁평'…}} → 타임라인 압축과 같은 문자(자리×행동 1글자, 같은 자리 여러 글자 = 턴당 여러 행동). 표현 밖이면 null. */
export function encPins(pins) {
  const tp = {};
  Object.keys(pins || {}).forEach((t) => {
    const row = pins[t] || {};
    const seq = [];
    Object.keys(row).map(Number).sort((a, b) => a - b).forEach((p) => { [...String(row[p])].forEach((a) => seq.push({ p, a })); });
    if (seq.length) tp[t] = seq;
  });
  return encTP(tp);
}
export function decPins(str) {
  const out = {};
  const tp = decTP(str);
  Object.keys(tp).forEach((t) => {
    const row = {};
    tp[t].forEach((e) => { row[e.p] = (row[e.p] || '') + e.a; });
    if (Object.keys(row).length) out[t] = row;
  });
  return out;
}

// ── 연동 · 제단 · 턴 피해 꼬리 필드 ────────────────────────────────────────
const _SYNC_BASE_CH = { defend: 'd', basic: 'p' }, _SYNC_CH_BASE = { d: 'defend', p: 'basic' };
/** "12b3a;45bd*" — 앵커 + 멤버[포지션 + b/a + d/p + x(기본과 다른 '그 밖의 턴')] + '*'(미준비 시 바로). */
export function encGroups(gs) {
  return (gs || []).filter((g) => g && g.anchor && g.members && g.members.length)
    .map((g) => g.anchor + g.members.map((m) => m.p + (m.order === 'after' ? 'a' : 'b') + (_SYNC_BASE_CH[m.base] || '')
      + (syncOtherOf(m) !== syncOtherDefault(m) ? 'x' : '')).join('') + (g.miss === 'asap' ? '*' : '')).join(';');
}
export function decGroups(str) {
  if (!str) return [];
  return normalizeSyncGroups(String(str).split(';').map((t) => {
    const m = /^(\d)((?:\d[ab][dp]?x?)*)(\*?)$/.exec(t); if (!m) return null;
    return { anchor: +m[1], members: (m[2].match(/\d[ab][dp]?x?/g) || []).map((x) => {
      const base = _SYNC_CH_BASE[x[2]], mem = { p: +x[0], order: x[1] === 'a' ? 'after' : 'before', base };
      if (x.endsWith('x')) mem.other = syncOtherDefault(mem) === 'own' ? 'hold' : 'own';
      return mem;
    }), miss: m[3] ? 'asap' : 'wait' };
  }).filter(Boolean));
}
/** ''=OFF / 'N:off1/off2/off3' (N=켜진 층 수). 입력은 altarPayload 형식(off 배열). */
export function encAltar(a) {
  if (!a || !a.on) return '';
  let n = 0;
  for (const f of ALTAR_FLOORS) { const v = a.floors && a.floors[f]; if (v && v.on !== false) n = f; else break; }
  const offs = ALTAR_FLOORS.map((f) => ((a.floors && a.floors[f] && a.floors[f].off) || []).map(Number).filter((x) => x > 0).sort((x, y) => x - y).join(','));
  return n + ':' + offs.join('/');
}
export function decAltar(str) {
  if (!str || typeof str !== 'string') return null;
  const m = /^(\d):([^|]*)(?:\|(.*))?$/.exec(str); if (!m) return null;
  const n = +m[1], parts = m[2].split('/');
  const floors = {};
  ALTAR_FLOORS.forEach((f, i) => {
    floors[f] = { on: f <= n, off: (parts[i] || '').split(',').map(Number).filter((x) => x > 0).sort((a, b) => a - b) };
  });
  const out = { on: true, floors };
  const groups = decGroups(m[3]).filter((g) => g.anchor && g.members.length);   // 구 코드의 '|그룹' 꼬리
  if (groups.length) out.groups = groups;
  return out;
}
/** ''=OFF / 'P' / 'P;t:v,…' / + 'hN'(대상 수 5 미만). */
export function encTdmg(t) {
  if (!t || !t.on) return '';
  const pct = Math.max(1, Math.min(99, Math.round(+t.pct || 0)));
  const per = Object.entries(t.per || {}).map(([k, v]) => [+k, Math.max(0, Math.min(99, Math.round(+v)))])
    .filter(([k, v]) => k >= 1 && Number.isFinite(v)).sort((a, b) => a[0] - b[0]);
  const hits = Math.max(1, Math.min(5, Math.round(+t.hits || 5)));
  return String(pct) + (per.length ? ';' + per.map(([k, v]) => k + ':' + v).join(',') : '') + (hits < 5 ? 'h' + hits : '');
}
export function decTdmg(str) {
  if (!str || typeof str !== 'string') return null;
  const m = /^(\d{1,2})(?:;([\d:,]*))?(?:h([1-5]))?$/.exec(str); if (!m) return null;
  const pct = +m[1]; if (!(pct >= 1 && pct <= 99)) return null;
  const out = { on: true, pct };
  if (m[2]) {
    const per = {};
    m[2].split(',').forEach((kv) => { const [k, v] = kv.split(':').map(Number); if (k >= 1 && v >= 0 && v <= 99) per[k] = v; });
    if (Object.keys(per).length) out.per = per;
  }
  if (m[3]) out.hits = +m[3];
  return out;
}

// ── 슬롯 · 스냅샷 · 기록 ──────────────────────────────────────────────────
export function packSlot(s) {
  if (!s) return 0;
  const flags = (s.rune ? 1 : 0) | (s.sealOn ? 2 : 0) | (s.usePlan ? 4 : 0) | (s.allyUltAfter ? 8 : 0);
  return trimDef([s.id - CID0, flags, s.skill ?? 10, s.priority ?? 0, s.sealAtk || 0, s.sealHp || 0, encPlan(s.plan), encFed(s.fedActions), encSpec(s), encUlt(s)],
    [null, 1, 10, 0, 0, 0, '', '', '', '']);
}
export function unpackSlot(a) {
  if (!a) return null;
  const [idD, flags = 1, skill = 10, priority = 0, sealAtk = 0, sealHp = 0, plan = '', fed = '', spec = '', ult = ''] = a;
  const s = { id: idD + CID0, skill, rune: !!(flags & 1) };
  const up = decUlt(ult); if (up) s.ult = up;
  const dec = decSpec(spec);
  if (dec) s.spec = dec; else promoteLegacySpec(s);
  if (priority) s.priority = priority;
  if (sealAtk) s.sealAtk = sealAtk;
  if (sealHp) s.sealHp = sealHp;
  if (flags & 2) s.sealOn = true;
  if (plan) s.plan = decPlan(plan);
  if (flags & 4) { s.usePlan = true; s.rotation = (s.plan || []).join(''); } else s.rotation = '';
  if (flags & 8) s.allyUltAfter = true;
  if (fed && typeof fed === 'string') { const fa = decFed(fed); if (Object.keys(fa).length) s.fedActions = fa; }
  return s;
}
const snapFlags = (s) => (s.forceProc ? 1 : 0) | (s.hp10 ? 2 : 0) | (s.incomingOn ? 4 : 0) | (s.advOn ? 8 : 0);
export function packSnap(s) {
  const to = s.turnOverrides && Object.keys(s.turnOverrides).length ? s.turnOverrides : 0;
  const tp = s.turnPlans && Object.keys(s.turnPlans).length ? s.turnPlans : 0;
  return trimDef([s.team.map(packSlot), +s.turns, +s.dummies, s.enemyHits, +s.dummyElement, +s.runs, snapFlags(s), to, +(s.incomingPct || 0), tp],
    [null, 30, 1, 'all', 0, 50, 0, 0, 0, 0]);
}
export function unpackSnap(a) {
  const [team, turns = 30, dummies = 1, enemyHits = 'all', dummyElement = 0, runs = 50, flags = 0, to = 0, incomingPct = 0, tp = 0] = a;
  return { team: team.map(unpackSlot), turns, dummies, enemyHits, dummyElement, runs, forceProc: !!(flags & 1), hp10: !!(flags & 2), incomingOn: !!(flags & 4), incomingPct, turnOverrides: to || {},
    advOn: !!(flags & 8), turnPlans: tp || {} };
}
/** '$' 형식. 꼬리 13·14번 = v2.1 핀·잠긴 턴(없으면 잘려 나가 예전과 바이트 동일, v1 디코더는 모르는 꼬리를 무시). */
export function packSnapV2(s) {
  const tpStr = encTP(s.turnPlans);
  const pinStr = encPins(s.pins);
  const lockStr = encTP(s.locked);
  if (tpStr === null || pinStr === null || lockStr === null) return null;
  const to = s.turnOverrides && Object.keys(s.turnOverrides).length ? s.turnOverrides : 0;
  return trimDef([s.team.map(packSlot), +s.turns, +s.dummies, s.enemyHits, +s.dummyElement, +s.runs, snapFlags(s), to, +(s.incomingPct || 0), tpStr, encAltar(s.altar), encTdmg(s.turnDamage), encGroups(s.sync), pinStr, lockStr],
    [null, 30, 1, 'all', 0, 50, 0, 0, 0, '', '', '', '', '', '']);
}
export function unpackSnapV2(a) {
  const [team, turns = 30, dummies = 1, enemyHits = 'all', dummyElement = 0, runs = 50, flags = 0, to = 0, incomingPct = 0, tp = '', alt = '', td = '', sy = '', pn = '', lk = ''] = a;
  const out = { team: team.map(unpackSlot), turns, dummies, enemyHits, dummyElement, runs,
    forceProc: !!(flags & 1), hp10: !!(flags & 2), incomingOn: !!(flags & 4), incomingPct,
    turnOverrides: to || {}, advOn: !!(flags & 8), turnPlans: decTP(tp) };
  const altar = decAltar(alt);
  if (altar) out.altar = altar;
  const tdm = decTdmg(td);
  if (tdm) out.turnDamage = tdm;
  const sg = decGroups(sy).filter((g) => g.anchor && g.members.length);
  if (sg.length) out.sync = sg;
  const pins = typeof pn === 'string' ? decPins(pn) : {};
  if (Object.keys(pins).length) out.pins = pins;
  const locked = typeof lk === 'string' ? decTP(lk) : {};
  if (Object.keys(locked).length) out.locked = locked;
  migrateSnapSync(out);
  return out;
}
export function packRecords(arr, v2) {
  const packSn = v2 ? packSnapV2 : packSnap;
  const out = [];
  for (const r of arr) {
    const sn = packSn(r.snap);
    if (sn === null) return null;
    out.push(trimDef([r.id, r.name || '', r.total || 0, (r.locked ? 1 : 0) | (r.pinned ? 2 : 0), sn], [null, '', 0, 0, null]));
  }
  return out;
}
export function unpackRecords(arr, v2, chars = {}) {
  const unpackSn = v2 ? unpackSnapV2 : unpackSnap;
  return arr.map((a) => {
    const [id, name = '', total = 0, flags = 0, snap] = a;
    const sn = unpackSn(snap), r = { id, label: makeLabel(sn.team, sn.turns, total, chars), snap: sn, total };
    if (name) r.name = name; if (flags & 1) r.locked = true; if (flags & 2) r.pinned = true; return r;
  });
}
/** 새 기능(스펙·타임라인·제단·연동·턴 피해·핀·잠긴 턴)을 쓰는 기록인가 — 쓰면 '$' 우선. */
export function usesNewFeatures(r) {
  const sn = (r && r.snap) || {};
  if (sn.turnPlans && Object.keys(sn.turnPlans).length) return true;
  if (sn.pins && Object.keys(sn.pins).length) return true;
  if (sn.locked && Object.keys(sn.locked).length) return true;
  if (sn.altar && sn.altar.on) return true;
  if (Array.isArray(sn.sync) && sn.sync.length) return true;
  if (sn.turnDamage && sn.turnDamage.on) return true;
  return (sn.team || []).some((t) => t && t.spec && t.spec.on);
}
const _isEmpty = (x) => x == null || x === 0 || x === '' || x === false || (Array.isArray(x) && !x.length) || (typeof x === 'object' && !Object.keys(x).length);
/** 누락 ≈ 0/''/false/[]/{} · 숫자/문자 느슨 비교 · label 제외. */
export function looseEq(a, b) {
  // eslint-disable-next-line eqeqeq
  if (a == b) return true;
  if (_isEmpty(a) && _isEmpty(b)) return true;
  // eslint-disable-next-line eqeqeq
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return a == b;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { if (k === 'label') continue; if (!looseEq(a[k], b[k])) return false; }
  return true;
}

// ── 바이트 ↔ 코드 ────────────────────────────────────────────────────────
const _btoa = (s) => (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'));
const _atob = (s) => (typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'));
export const bytesToB64url = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return _btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const b64urlToBytes = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = _atob(s), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
export async function deflate(str) {
  const cs = new CompressionStream('deflate'); const w = cs.writable.getWriter();
  w.write(new TextEncoder().encode(str)); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
export async function inflate(bytes) {
  const ds = new DecompressionStream('deflate'); const w = ds.writable.getWriter();
  w.write(bytes); w.close();
  return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer());
}
function tryPack(records, v2) {
  const packed = packRecords(records, v2);
  if (packed === null) return null;
  const back = unpackRecords(JSON.parse(JSON.stringify(packed)), v2);
  return records.every((r, i) => looseEq(r, back[i])) ? packed : null;
}
/** records 배열 → 최단 코드('#'|'$'|'*' + base64url(deflate)). v1 compressCode 와 바이트 동일. */
export async function compressCode(records) {
  let body = null, tag = '*';
  try {
    const order = records.some(usesNewFeatures) ? [true, false] : [false];
    for (const v2 of order) {
      const packed = tryPack(records, v2);
      if (packed) { body = JSON.stringify(packed); tag = v2 ? '$' : '#'; break; }
    }
  } catch { body = null; }
  if (body === null) { body = JSON.stringify(records); tag = '*'; }
  return tag + bytesToB64url(await deflate(body));
}
/** 코드 → records JSON 문자열(v1 decompressCode). chars 가 있으면 라벨을 이름으로 재생성. */
export async function decompressCode(code, chars = {}) {
  code = String(code).trim();
  const tag = code[0], json = await inflate(b64urlToBytes(code.slice(1)));
  if (tag === '#') return JSON.stringify(unpackRecords(JSON.parse(json), false, chars));
  if (tag === '$') return JSON.stringify(unpackRecords(JSON.parse(json), true, chars));
  return json;
}
/** 편의: 기록 배열 ↔ 공유 코드. */
export const encodeShare = (records) => compressCode(records);
export async function decodeShare(code, chars = {}) { return JSON.parse(await decompressCode(code, chars)); }
