/**
 * core/store.js — 단일 스토어(상태 + 구독 + snapshot/applySnap + 초안/기록 저장). ARCHITECTURE §2 · §9.
 *
 * v1 app.js 이식 대응: 기록 L69-202·L526-536, 초안 L203-217, snapshot/applySnap L114-202, 편성 변경 L1398-1499,
 * 우선순위 L1527-1535·L2738-2804, 궁극기 사용 방식 L3212, 연동 L3295-3314, 제단 L3346-3387·L3458-3476·L3607-3620,
 * 턴 피해 L2898-2933, 실행 전 점검 L4606-4638.
 * v2.1(ARCHITECTURE §9): 행동 계획 = 규칙 + 핀(state.pins) + 잠긴 턴(state.locked)을 항상 함께 쓴다. 완전 수동 모드(v1 advOn)·
 * 직접 계획(v1 usePlan)은 없다 — 옛 기록·코드는 applySnap 이 핀·잠긴 턴으로 옮긴다(plan.js adoptLegacyPlans).
 * v1이 DOM에서 읽던 값(#turns 등)은 state.cond 에서 읽는다.
 *
 * 변경 규칙: 모든 조작은 바뀐 가지를 새 객체로 바꿔 set 한다 → subscribe(selector) 는 참조 비교(Object.is)로 충분.
 * 사용자 알림은 토스트 대신 onNotice(fn) 로 { key, vars } 를 흘린다(문구는 i18n).
 */
import { makeLabel, IMBUEON_ID, HOLD_ULT_IDS, basePriority } from './format.js';
import { promoteLegacySpec } from './spec.js';
import {
  COND_DEFAULTS, ALTAR_FLOORS, makeEnv, normalizeSyncGroups, syncPayloadOf, migrateSnapSync, syncOps, applySyncPreset,
  detachSync, attachSync, swapSyncPositions, teamOrder, ultOf, setUlt, setUltMode, syncGroupOf, syncOtherOf, presetLen,
  missingActors, plansFromProbe, effectiveTeam, pinsRowOf, withPinsRow, sortPins, sortLocked, lockedWithin,
  adoptLegacyPlans, presetPinsRow, quickCdAltar, isQuickCdAltar, pinCount, planView, PIN_ACTS,
} from './plan.js';
import { altarPayload, tdmgPayload, tdmgClamp, buildCfg } from './payload.js';
import { compressCode, decompressCode } from './codec.js';

export const KEYS = Object.freeze({ history: 'woofia_history', draft: 'woofia_draft', altar: 'woofia_altar', sync: 'woofia_sync', tdmg: 'woofia_tdmg', lang: 'woofia_lang' });
export const HISTORY_MAX = 40;
export const DEFAULT_TEAM = Object.freeze([10401, 10410, 10421, 10428, 10425]);
export const TDMG_DEFAULTS = Object.freeze({ on: false, pct: 10, adv: false, per: {}, hits: 5 });
export const altarDefaults = () => ({ on: false, floors: { 1: { on: true, off: {} }, 2: { on: true, off: {} }, 3: { on: true, off: {} } } });
export const newSlot = (id) => ({ id, skill: 10, rune: true, rotation: '' });
const PLAN_UNDO_MAX = 30;

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const clampInt = (v, lo, hi, dflt) => { const n = Math.round(+v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; };

/** 층은 1..N 접두 구간(아래층이 꺼지면 위층도 꺼짐). 제자리. */
export function normalizeAltarFloors(floors) {
  let open = true;
  ALTAR_FLOORS.forEach((f) => {
    const cfg = floors[f]; if (!cfg) return;
    if (!open) cfg.on = false; else if (!cfg.on) open = false;
  });
  return floors;
}
/** 기록/공유 코드의 altar 스냅샷 → 제단 상태(v1 applyAltarSnap). OFF·옛 기록은 켜짐만 끄고 구성은 유지. */
export function altarFromSnap(a, prev) {
  const out = clone(prev || altarDefaults());
  out.on = !!(a && a.on);
  if (a && a.floors) ALTAR_FLOORS.forEach((f) => {
    const v = a.floors[f] || a.floors[String(f)];
    const off = {};
    (v && Array.isArray(v.off) ? v.off : []).forEach((id) => { if (+id > 0) off[+id] = true; });
    out.floors[f] = { on: v ? v.on !== false : true, off };
  });
  normalizeAltarFloors(out.floors);
  return out;
}
/** 기록의 turnDamage → 턴 피해 상태(v1 applyTdmgSnap). */
export function tdmgFromSnap(t, prev) {
  const out = clone(prev || TDMG_DEFAULTS);
  out.on = !!(t && t.on);
  if (t && t.on) {
    if (Number.isFinite(+t.pct) && +t.pct > 0) out.pct = Math.max(1, tdmgClamp(t.pct));
    const per = (t.per && typeof t.per === 'object') ? t.per : {};
    out.adv = Object.keys(per).length > 0;
    out.per = { ...per };
    out.hits = Number.isFinite(+t.hits) ? Math.max(1, Math.min(5, +t.hits)) : 5;
  }
  return out;
}
/**
 * 편성 변경 뒤 자리 기준 설정 정리(v1 afterTeamChange) → { overrides, pins, locked } 새 객체.
 * 예외 턴: 빈 자리 제거 + 새 자리 뒤에 붙임. 핀: 빠진 자리의 줄 삭제. 잠긴 턴: 빠진 자리 항목 삭제(v1 이 직접 편집 턴에 하던 것).
 */
export function afterTeamChange(team, overrides, pins, locked, removed = []) {
  const present = team.map((x, i) => (x ? i + 1 : 0)).filter(Boolean);
  const ov = clone(overrides || {});
  Object.keys(ov).forEach((t) => {
    const ord = ov[t].filter((p) => team[p - 1]);
    present.forEach((p) => { if (!ord.includes(p)) ord.push(p); });
    ov[t] = ord;
  });
  let pn = sortPins(pins || {});
  const lk = sortLocked(locked || {});
  if (removed.length) {
    removed.forEach((p) => { pn = withPinsRow(pn, p, {}); });
    Object.keys(lk).forEach((t) => { lk[t] = lk[t].filter((e) => !removed.includes(e.p)); });
  }
  return { overrides: ov, pins: pn, locked: lk };
}

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}
function initialState(chars) {
  return {
    chars,
    team: [null, null, null, null, null],
    cond: { ...COND_DEFAULTS },
    tdmg: clone(TDMG_DEFAULTS),
    altar: altarDefaults(),
    sync: [],
    overrides: {},
    pins: {},            // §9 { [turn]: { [pos]: '궁'|'방'|'평' } } — 사용자가 고정한 칸
    locked: {},          // §9 { [turn]: [{p, a}] } — 턴 전체를 직접 짠 턴
    probe: null,         // 마지막 미리보기 프로브(store.probe · prepareRun) — 규칙 + 핀 + 잠긴 턴이 반영된 엔진 결과
    ui: { filterEl: 'all', filterRole: 'all', search: '', lang: 'kr', theme: 'auto', openPanels: [], busy: false,
      pickTarget: null, histSort: 'date', histSearch: '' },
    result: null,
    records: [],
    activeRecId: null,
    draftReady: false,
  };
}

/**
 * @param {object} [o]
 * @param {Storage} [o.storage]  localStorage 호환(getItem/setItem). 없으면 메모리.
 * @param {object}  [o.api]      core/api.js 인스턴스(미리보기 프로브·실행 전 핀 점검에 사용). 없으면 그 기능은 no-op.
 * @param {object}  [o.chars]    id→meta. 나중에 set({chars}) 로 넣어도 된다.
 * @param {Function}[o.now]      기록 id(시각) 공급자 — 테스트용.
 */
export function createStore(o = {}) {
  const storage = o.storage || globalThis.localStorage || memoryStorage();
  const api = o.api || null;
  const now = o.now || (() => Date.now());
  let state = initialState(o.chars || {});
  const subs = new Set();
  const noticeFns = new Set();
  const benchCache = new Map();               // 이번 세션에 뺀 동료 {id → {slot, sync, pins(그 동료의 핀 줄)}}
  let planUndo = [];                          // 핀·잠긴 턴 되돌리기 스택

  const readJSON = (k) => { try { return JSON.parse(storage.getItem(k) || 'null'); } catch { return null; } };
  const writeJSON = (k, v) => { try { storage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const notice = (key, vars = {}) => noticeFns.forEach((fn) => { try { fn({ key, vars }); } catch { /* noop */ } });
  const env = () => makeEnv({ chars: state.chars, altar: state.altar });

  function set(patch, { silent = false } = {}) {
    state = { ...state, ...patch };
    if (!silent) subs.forEach((s) => {
      let next;
      try { next = s.selector(state); } catch { return; }
      if (!Object.is(next, s.prev)) { const prev = s.prev; s.prev = next; try { s.fn(next, prev); } catch (err) { setTimeout(() => { throw err; }); } }
    });
  }
  function subscribe(selector, fn) {
    const s = { selector: selector || ((x) => x), fn, prev: undefined };
    try { s.prev = s.selector(state); } catch { s.prev = undefined; }
    subs.add(s);
    return () => subs.delete(s);
  }
  const get = () => state;

  // ── 영속: 제단 · 연동 · 턴 피해 (v1 load*/save*State) ─────────────────
  function loadSideStates() {
    const altar = altarDefaults();
    const a = readJSON(KEYS.altar);
    if (a) {
      altar.on = !!a.on;
      ALTAR_FLOORS.forEach((f) => { const v = a.floors && a.floors[f]; if (v) altar.floors[f] = { on: v.on !== false, off: (v.off && typeof v.off === 'object') ? v.off : {} }; });
      normalizeAltarFloors(altar.floors);
    }
    const sv = readJSON(KEYS.sync);
    const sync = Array.isArray(sv) ? normalizeSyncGroups(sv) : normalizeSyncGroups(a && a.groups);
    const tdmg = clone(TDMG_DEFAULTS);
    const t = readJSON(KEYS.tdmg);
    if (t) {
      tdmg.on = !!t.on;
      if (Number.isFinite(+t.pct) && +t.pct > 0) tdmg.pct = Math.max(1, tdmgClamp(t.pct));
      tdmg.adv = !!t.adv;
      tdmg.per = (t.per && typeof t.per === 'object') ? t.per : {};
      if (Number.isFinite(+t.hits)) tdmg.hits = Math.max(1, Math.min(5, +t.hits));
    }
    const lang = storage.getItem(KEYS.lang) || 'kr';
    const cond = { ...state.cond };
    if (altar.on) cond.forceProc = false;
    set({ altar, sync, tdmg, cond, ui: { ...state.ui, lang } }, { silent: true });
  }
  const saveAltar = (altar) => writeJSON(KEYS.altar, { on: altar.on, floors: altar.floors });
  const saveSync = (sync) => writeJSON(KEYS.sync, normalizeSyncGroups(sync));
  const saveTdmg = (t) => writeJSON(KEYS.tdmg, { on: t.on, pct: t.pct, adv: t.adv, per: t.per, hits: t.hits });

  // ── snapshot / applySnap ───────────────────────────────────────────────
  /**
   * v1 과 같은 모양 + v2.1 `pins`·`locked`(비면 생략 → 핀·잠금이 없으면 v1 과 바이트 동일).
   * advOn/turnPlans 는 v1 호환 자리로 항상 false/{} — 쓰지 않고 읽기만 한다(§9).
   * locked 는 현재 턴 수 안만(v1 turnPlans 와 같은 규칙), pins 는 줄 길이(30턴) 전체를 보존한다.
   */
  function snapshot() {
    const c = state.cond, turns = +c.turns;
    const out = {
      team: state.team.map((s) => (s ? clone(s) : null)),
      turns, dummies: String(c.dummies), enemyHits: String(c.enemyHits), dummyElement: String(c.dummyElement),
      runs: +c.runs, forceProc: !!c.forceProc, hp10: !!c.hp10, turnOverrides: clone(state.overrides),
      incomingOn: !!c.incomingOn, incomingPct: c.incomingOn ? +(c.incomingPct || 0) : 0,
      advOn: false,
      altar: altarPayload(state.altar),
      sync: syncPayloadOf(state.sync),
      turnDamage: tdmgPayload(state.tdmg, turns),
      turnPlans: {},
    };
    const pins = sortPins(state.pins);
    if (Object.keys(pins).length) out.pins = pins;
    const locked = lockedWithin(state.locked, turns);
    if (Object.keys(locked).length) out.locked = locked;
    return out;
  }
  function applySnap(s) {
    if (!s || !Array.isArray(s.team)) return false;          // 손상된 기록·초안은 무시(현재 상태 유지)
    const team0 = s.team.map((x) => (x ? promoteLegacySpec(clone(x)) : null));
    while (team0.length < 5) team0.push(null);
    const cond = {
      ...state.cond,
      turns: clampInt(s.turns, 1, 30, COND_DEFAULTS.turns),
      runs: clampInt(s.runs ?? 50, 1, 200, COND_DEFAULTS.runs),
      dummies: s.dummies != null ? +s.dummies : COND_DEFAULTS.dummies,
      enemyHits: s.enemyHits != null ? String(s.enemyHits) : COND_DEFAULTS.enemyHits,
      dummyElement: +(s.dummyElement ?? 0),
      forceProc: !!s.forceProc, hp10: !!s.hp10, incomingOn: !!s.incomingOn,
    };
    if (s.incomingPct) cond.incomingPct = +s.incomingPct;
    const altar = altarFromSnap(s.altar, state.altar);
    if (altar.on) cond.forceProc = false;                       // 제단 ⇄ 확률 100% 상호 배제(v1 syncAltarLock)
    // v1 직접 계획(usePlan+plan) → 핀, v1 완전 수동(advOn+turnPlans) → 잠긴 턴. v2.1 pins/locked 가 있으면 그것이 우선.
    const { team, pins, locked } = adoptLegacyPlans(team0, { advOn: !!s.advOn, turnPlans: s.turnPlans, turns: cond.turns,
      env: makeEnv({ chars: state.chars, altar }), pins: s.pins, locked: s.locked });
    const sync = normalizeSyncGroups(s.sync || (s.altar && s.altar.groups) || null);
    const tdmg = tdmgFromSnap(s.turnDamage, state.tdmg);
    saveAltar(altar); saveSync(sync); saveTdmg(tdmg);
    planUndo = [];
    set({ team, overrides: clone(s.turnOverrides || {}), pins, locked, probe: null, cond, altar, sync, tdmg });
    return true;
  }

  // ── 초안(작업 중 상태) ──────────────────────────────────────────────────
  function saveDraft() {
    if (!state.draftReady) return false;
    // touched: v1 초안 모양 유지(= 잠긴 턴 목록). 읽을 때는 쓰지 않는다.
    return writeJSON(KEYS.draft, { v: 1, rec: state.activeRecId, snap: snapshot(), touched: Object.keys(state.locked).map(Number) });
  }
  function loadDraft() {
    const d = readJSON(KEYS.draft);
    return (d && d.snap && Array.isArray(d.snap.team)) ? d : null;
  }

  // ── 기록 ────────────────────────────────────────────────────────────────
  function trim(list) {
    while (list.length > HISTORY_MAX) {
      let idx = -1;
      for (let i = list.length - 1; i >= 0; i--) if (!list[i].locked && !list[i].pinned) { idx = i; break; }
      if (idx < 0) break;
      list.splice(idx, 1);
    }
    return list;
  }
  function persistRecords(list) {
    if (!writeJSON(KEYS.history, list)) { notice('records.storageFull'); return false; }
    return true;
  }
  function loadRecords() {
    let list = readJSON(KEYS.history);
    if (!Array.isArray(list)) list = [];
    let changed = false;
    for (const r of list) {
      if (!r || typeof r !== 'object') continue;
      if (r.data) { delete r.data; changed = true; }
      if (migrateSnapSync(r.snap)) changed = true;
    }
    list = list.filter((r) => r && typeof r === 'object');
    if (changed) persistRecords(list);
    set({ records: list }, { silent: true });
  }
  const commitRecords = (list, extra = {}) => { persistRecords(list); set({ records: list, ...extra }); };
  const findRec = (id) => state.records.find((r) => r.id == id);   // eslint-disable-line eqeqeq
  const records = {
    /** 검색 + 정렬 + 핀 상단(v1 histView). */
    list() {
      const q = String(state.ui.histSearch || '').trim().toLowerCase();
      const arr = state.records.filter((r) => !q || String(r.name || r.label || '').toLowerCase().includes(q));
      const cmp = { date: (a, b) => b.id - a.id, 'date-asc': (a, b) => a.id - b.id,
        name: (a, b) => String(a.name || a.label).localeCompare(String(b.name || b.label), 'ko'),
        dmg: (a, b) => (b.total || 0) - (a.total || 0) }[state.ui.histSort] || ((a, b) => b.id - a.id);
      arr.sort(cmp);
      arr.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
      return arr;
    },
    /** 실행 결과 저장(결과 본문은 저장하지 않는다 — 재실행 시드 고정). → 새 기록 */
    save(snap, data) {
      const meta = (data && data.meta) || {};
      const label = makeLabel((data && data.team) || snap.team, meta.turns ?? snap.turns, meta.total, state.chars);
      let id = now();
      while (state.records.some((r) => r.id === id)) id++;
      const rec = { id, label, snap, total: meta.total || 0 };
      const list = trim([rec, ...state.records]);
      commitRecords(list, { activeRecId: id });
      return rec;
    },
    /** 기록을 화면 상태로(v1 restoreRecord). 결과 재실행은 호출부. → { rec, undo } | null */
    restore(id) {
      const rec = findRec(id); if (!rec) return null;
      const undo = { snap: snapshot(), rec: state.activeRecId };
      set({ activeRecId: rec.id }, { silent: true });
      if (rec.snap) migrateSnapSync(rec.snap);
      applySnap(rec.snap);
      saveDraft();
      return { rec, undo };
    },
    /** restore 가 돌려준 undo 토큰으로 되돌린다. */
    revert(undo) {
      if (!undo) return;
      set({ activeRecId: undo.rec }, { silent: true });
      applySnap(undo.snap);
      saveDraft();
    },
    /** 잠긴 기록은 지우지 않는다. ids: id 또는 배열. → 지운 개수 */
    remove(ids) {
      const set_ = new Set([].concat(ids).map(String));
      const list = state.records.filter((r) => !(set_.has(String(r.id)) && !r.locked));
      const n = state.records.length - list.length;
      if (n) commitRecords(list, { activeRecId: list.some((r) => r.id === state.activeRecId) ? state.activeRecId : null });
      return n;
    },
    /** 선택 + 잠긴 기록만 남기고 삭제(v1 hDelOther). */
    removeExcept(ids) {
      const keep = new Set([].concat(ids).map(String));
      const list = state.records.filter((r) => keep.has(String(r.id)) || r.locked);
      const n = state.records.length - list.length;
      if (n) commitRecords(list, { activeRecId: list.some((r) => r.id === state.activeRecId) ? state.activeRecId : null });
      return n;
    },
    pin(id, on) { return records._flag(id, 'pinned', on); },
    lock(id, on) { return records._flag(id, 'locked', on); },
    _flag(id, key, on) {
      const list = state.records.map((r) => {
        if (r.id != id) return r;   // eslint-disable-line eqeqeq
        const n = { ...r, [key]: on == null ? !r[key] : !!on };
        if (!n[key]) delete n[key];
        return n;
      });
      commitRecords(list);
      return !!(list.find((r) => r.id == id) || {})[key];   // eslint-disable-line eqeqeq
    },
    rename(id, name) {
      const list = state.records.map((r) => {
        if (r.id != id) return r;   // eslint-disable-line eqeqeq
        const n = { ...r }; const v = String(name ?? '').trim();
        if (v) n.name = v; else delete n.name;
        return n;
      });
      commitRecords(list);
    },
    /** 기록 배열(또는 JSON 문자열) 병합 — 중복 id 제외. → { ok, added } */
    importJson(input) {
      let arr = input;
      if (typeof input === 'string') { try { arr = JSON.parse(input); } catch { return { ok: false, added: 0 }; } }
      if (!Array.isArray(arr)) return { ok: false, added: 0 };
      const have = new Set(state.records.map((r) => r.id));
      const add = arr.filter((r) => r && r.id && r.snap && !have.has(r.id)).map((r) => clone(r));
      add.forEach((r) => migrateSnapSync(r.snap));
      const list = trim([...state.records, ...add].sort((a, b) => b.id - a.id));
      commitRecords(list);
      return { ok: true, added: add.length };
    },
    /** 공유 코드 또는 JSON 텍스트 가져오기(v1 openImportPop/importHistory). */
    async importText(text) {
      const v = String(text || '').trim();
      if (!v) return { ok: false, added: 0 };
      let arr;
      try { arr = JSON.parse(await decompressCode(v, state.chars)); } catch { try { arr = JSON.parse(v); } catch { return { ok: false, added: 0 }; } }
      return records.importJson(arr);
    },
    /** 선택 기록 → 파일용 JSON 문자열(v1 파일 내보내기와 같은 들여쓰기). */
    exportJson(ids) {
      const s = new Set([].concat(ids).map(String));
      return JSON.stringify(state.records.filter((r) => s.has(String(r.id))), null, 1);
    },
    /** 선택 기록 → 공유 코드. */
    async exportCode(ids) {
      const s = new Set([].concat(ids).map(String));
      const out = state.records.filter((r) => s.has(String(r.id)));
      return out.length ? compressCode(out) : '';
    },
    sort(mode) { set({ ui: { ...state.ui, histSort: mode } }); },
    search(q) { set({ ui: { ...state.ui, histSearch: String(q ?? '') } }); },
  };

  // ── 편성 ───────────────────────────────────────────────────────────────
  const commitTeam = (team, { removed = [], sync = state.sync, pins = state.pins } = {}) => {
    const r = afterTeamChange(team, state.overrides, pins, state.locked, removed);
    if (sync !== state.sync) saveSync(sync);
    set({ team, overrides: r.overrides, pins: r.pins, locked: r.locked, sync });
  };
  const team = {
    /** 동료 추가(v1 addToTeam). i = 선호 자리(0-based). 이번 세션에 뺐던 동료면 설정·연동·핀 줄 복원. → { ok, at, reason?:'imbueonP1'|'full'|'dup' } */
    add(id, i) {
      const t = state.team.slice();
      if (t.some((x) => x && x.id === id)) return { ok: false, at: -1, reason: 'dup' };
      const okAt = (k) => k >= 0 && k < t.length && !t[k] && !(id === IMBUEON_ID && k === 0);
      const at = (i != null && okAt(i)) ? i : t.findIndex((_, k) => okAt(k));
      if (at < 0) {
        const reason = (id === IMBUEON_ID && t.some((x) => !x)) ? 'imbueonP1' : 'full';
        if (reason === 'imbueonP1') notice('team.imbueonP1');
        return { ok: false, at: -1, reason };
      }
      const cached = benchCache.get(id);
      const slot = cached ? clone(cached.slot) : newSlot(id);
      benchCache.delete(id);
      const others = t.map((x, k) => (x ? { x, k } : null)).filter(Boolean);
      if (others.some((q) => q.x.priority != null)) {
        slot.priority = Math.max(...others.map((q) => q.x.priority ?? basePriority(q.x, q.k + 1, state.chars))) + 1;
      } else delete slot.priority;
      t[at] = slot;
      const sync = (cached && cached.sync) ? attachSync(state.sync, t, cached.sync, at + 1) : state.sync;
      const pins = (cached && cached.pins && Object.keys(cached.pins).length) ? withPinsRow(state.pins, at + 1, cached.pins) : state.pins;
      commitTeam(t, { sync, pins });
      return { ok: true, at };
    },
    /** 자리 i(0-based) 비우기(v1 removeFromTeam). 같은 동료를 다시 넣으면 설정·연동·핀 줄 복원. */
    remove(i) {
      const s = state.team[i]; if (!s) return false;
      const pos = i + 1;
      const d = detachSync(state.sync, state.team, pos);
      if (d.anchorRemoved) notice('sync.anchorRemoved');
      benchCache.set(s.id, { slot: clone(s), sync: d.out, pins: pinsRowOf(state.pins, pos) });
      const t = state.team.slice(); t[i] = null;
      commitTeam(t, { removed: [pos], sync: d.out ? d.groups : state.sync });
      return true;
    },
    /** 로스터에서 고르기: 이미 있으면 빼고, 없으면 pickTarget(또는 첫 빈 자리)에 넣는다(v1 pick). */
    pick(id) {
      const at = state.team.findIndex((s) => s && s.id === id);
      let r;
      if (at >= 0) r = { ok: team.remove(at), at, removed: true };
      else r = team.add(id, state.ui.pickTarget);
      set({ ui: { ...state.ui, pickTarget: null } });
      return r;
    },
    setPickTarget(i) { set({ ui: { ...state.ui, pickTarget: i == null ? null : i } }); },
    /** 두 자리 교체 — 예외 턴·잠긴 턴·핀·연동 포지션도 따라간다(v1 cmpSwapSlots 규칙). → { ok, reason? } */
    swap(a, b) {
      if (a === b) return { ok: true };
      const t = state.team.slice();
      if ((t[a] && t[a].id === IMBUEON_ID && b === 0) || (t[b] && t[b].id === IMBUEON_ID && a === 0)) {
        notice('team.imbueonP1');
        return { ok: false, reason: 'imbueonP1' };
      }
      [t[a], t[b]] = [t[b], t[a]];
      const p1 = a + 1, p2 = b + 1, sw = (p) => (p === p1 ? p2 : (p === p2 ? p1 : p));
      const overrides = clone(state.overrides);
      for (const k in overrides) overrides[k] = overrides[k].map(sw);
      const locked = sortLocked(state.locked);
      for (const k in locked) locked[k] = locked[k].map((e) => ({ ...e, p: sw(e.p) }));
      let pins = withPinsRow(state.pins, p1, pinsRowOf(state.pins, p2));
      pins = withPinsRow(pins, p2, pinsRowOf(state.pins, p1));
      const sync = swapSyncPositions(state.sync, p1, p2);
      saveSync(sync);
      set({ team: t, overrides, pins, locked, sync });
      return { ok: true };
    },
    /** 슬롯 스펙 교체(spec = { on, level, evo, pevo, compat, lv }). */
    setSpec(i, spec) { team.update(i, (s) => { if (spec) s.spec = clone(spec); else delete s.spec; }); },
    /** 슬롯 필드 수정 — fn(slotCopy) 또는 patch 객체(sealOn/sealAtk/sealHp/allyUltAfter …). */
    update(i, fnOrPatch) {
      const s = state.team[i]; if (!s) return false;
      const t = state.team.slice();
      const n = clone(s);
      if (typeof fnOrPatch === 'function') fnOrPatch(n); else Object.assign(n, fnOrPatch);
      t[i] = n;
      set({ team: t });
      return true;
    },
    /** 초기 편성(기록·초안이 없을 때). */
    setDefault(ids = DEFAULT_TEAM) {
      const t = [null, null, null, null, null];
      ids.slice(0, 5).forEach((id, k) => { t[k] = newSlot(id); });
      set({ team: t });
    },
    bench: () => new Map(benchCache),
  };

  // ── 조건 · 제단 · 턴 피해 · 연동 ────────────────────────────────────────
  const cond = {
    /** 전투 조건 부분 수정. 제단이 켜져 있으면 확률 100% 는 켤 수 없다(→ false). */
    set(patch) {
      const next = { ...state.cond, ...patch };
      const rejected = !!(patch.forceProc && state.altar.on);
      if (rejected) { next.forceProc = false; notice('cond.forceLockedByAltar'); }
      if ('turns' in patch) next.turns = clampInt(patch.turns, 1, 30, state.cond.turns);
      if ('runs' in patch) next.runs = clampInt(patch.runs, 1, 200, state.cond.runs);
      if ('incomingPct' in patch) next.incomingPct = clampInt(patch.incomingPct, 1, 99, state.cond.incomingPct);
      if ('enemyHits' in patch) next.enemyHits = String(patch.enemyHits);
      set({ cond: next });
      return !rejected;
    },
    reset() { set({ cond: { ...COND_DEFAULTS } }); },
  };
  const altar = {
    setOn(on) {
      const a = clone(state.altar); a.on = !!on;
      const c = a.on && state.cond.forceProc ? { ...state.cond, forceProc: false } : state.cond;
      saveAltar(a); set({ altar: a, cond: c });
    },
    /** N층 켜면 아래층도, 끄면 위층도(v1 setAltarFloor). */
    setFloor(floor, on) {
      const a = clone(state.altar);
      ALTAR_FLOORS.forEach((f) => { const cfg = a.floors[f]; if (!cfg) return; if (on && f <= floor) cfg.on = true; else if (!on && f >= floor) cfg.on = false; });
      normalizeAltarFloors(a.floors);
      saveAltar(a); set({ altar: a });
    },
    /** 제단 하나 체크/해제(v1 toggleAltarRow). → 켜짐(체크) 여부 */
    toggle(floor, id) {
      const a = clone(state.altar); const cfg = a.floors[floor]; if (!cfg) return null;
      if (cfg.off[id]) delete cfg.off[id]; else cfg.off[id] = true;
      saveAltar(a); set({ altar: a });
      return !cfg.off[id];
    },
    apply(snapAltar) { const a = altarFromSnap(snapAltar, state.altar); saveAltar(a); set({ altar: a, cond: a.on ? { ...state.cond, forceProc: false } : state.cond }); },
    /**
     * §9 쿨감 제단 스위치. on: 제단 사용 · 전 층 사용 · 별 제단 전부 점등 · 달 제단은 1012·1013 만 점등(사용자 APK '길드전 모드').
     * off: 제단 사용만 끈다(구성은 남음 — setOn(false) 와 같다). → 이전 제단 상태(되돌리기: altar.restore(prev))
     */
    quickCd(on) {
      const before = clone(state.altar);
      const a = on ? quickCdAltar() : { ...clone(state.altar), on: false };
      saveAltar(a);
      set({ altar: a, cond: a.on && state.cond.forceProc ? { ...state.cond, forceProc: false } : state.cond });
      return before;
    },
    /** 지금 제단이 정확히 '쿨감 제단만' 구성인가(스위치 표시). */
    isQuickCd: () => isQuickCdAltar(state.altar),
    /** quickCd 가 돌려준 이전 상태로 복원. */
    restore(prev) {
      if (!prev || !prev.floors) return;
      const a = clone(prev);
      normalizeAltarFloors(a.floors);
      saveAltar(a);
      set({ altar: a, cond: a.on && state.cond.forceProc ? { ...state.cond, forceProc: false } : state.cond });
    },
  };
  const tdmg = {
    set(patch) {
      const t = { ...clone(state.tdmg), ...patch };
      if ('pct' in patch) t.pct = Math.max(1, tdmgClamp(patch.pct));
      if ('hits' in patch) t.hits = Math.max(1, Math.min(5, +patch.hits || 5));
      if ('adv' in patch) t.adv = !!patch.adv;
      if ('on' in patch) t.on = !!patch.on;
      saveTdmg(t); set({ tdmg: t });
    },
    /** 턴별 값(v === '' 또는 null 이면 비움). */
    setTurn(turn, v) {
      const t = clone(state.tdmg);
      if (v === '' || v == null) delete t.per[turn]; else t.per[turn] = tdmgClamp(v);
      saveTdmg(t); set({ tdmg: t });
    },
    clearTurns() { tdmg.set({ per: {} }); },
    apply(snapT) { const t = tdmgFromSnap(snapT, state.tdmg); saveTdmg(t); set({ tdmg: t }); },
  };
  const commitSync = (groups) => { const g = normalizeSyncGroups(groups); saveSync(g); set({ sync: g }); return g; };
  const sync = {
    set: commitSync,
    /** syncOps 이름으로 편집: op('setAnchor', gi, p) · ('toggleMember', gi, p) · ('setBase', gi, p, base) … */
    op(name, ...args) {
      if (!syncOps[name]) throw new Error('unknown sync op: ' + name);
      const before = clone(state.sync);
      const g = commitSync(syncOps[name](state.sync, ...args));
      return { groups: g, undo: before };
    },
    preset(kind = 'uk') {
      const before = clone(state.sync);
      const r = applySyncPreset(state.sync, state.team, kind);
      if (r.ok) commitSync(r.groups); else if (r.reason === 'full') notice('sync.presetFull');
      return { ...r, undo: before };
    },
    groupOf: (pos) => syncGroupOf(state.sync, pos),
  };

  // ── 행동 계획: 순서 · 예외 턴 · 동료별 필살기 방식(규칙) ───────────────────
  const updSlot = (i, fn) => team.update(i, fn);
  const slotAtPos = (pos) => state.team[pos - 1] || null;
  const plan = {
    order: () => teamOrder(state.team, state.chars),
    /** 우선순위를 자리 순서 배열(1-based pos)대로 1..n 으로 매긴다(v1 renderPrio apply). */
    setOrder(positions) {
      const t = state.team.map((s) => (s ? clone(s) : null));
      positions.forEach((p, k) => { if (t[p - 1]) t[p - 1].priority = k + 1; });
      set({ team: t });
    },
    /** 순서 목록 k번째를 dir(-1 위 / +1 아래)로. */
    move(k, dir) {
      const ord = plan.order().map((o) => o.i + 1), to = k + dir;
      if (to < 0 || to >= ord.length) return false;
      const [m] = ord.splice(k, 1); ord.splice(to, 0, m);
      plan.setOrder(ord);
      return true;
    },
    resetOrder() { set({ team: state.team.map((s) => { if (!s) return null; const n = clone(s); delete n.priority; return n; }) }); },
    /** 예외 턴: turns 배열에 같은 순서(1-based pos 배열)를 적용. */
    setException(turns, order) {
      const ov = clone(state.overrides);
      [].concat(turns).forEach((t) => { ov[t] = [...order]; });
      set({ overrides: ov });
    },
    clearException(turns) {
      const ov = clone(state.overrides);
      [].concat(turns).forEach((t) => { delete ov[t]; });
      set({ overrides: ov });
    },
    resetExceptions() { set({ overrides: {} }); },
    /** v1 '전부 기본값으로'(우선순위 + 특정 턴 순서). */
    resetAll() { plan.resetOrder(); plan.resetExceptions(); },
    /** 필살기 방식 3택: 'auto'|'strict'|'asap' (i = 0-based 자리 index — 기존 API 유지). 옛 'manual' 은 'auto'. */
    setUltMode(i, mode) { updSlot(i, (s) => setUltMode(s, mode)); },
    /** ult 필드 부분 수정(keepDef/assist) — i = 0-based. */
    setUlt(i, patch) { updSlot(i, (s) => setUlt(s, { ...ultOf(s), ...patch })); },
    /** §9 동료별 '확률 쿨 감소 성공 가정'(v1 ult.assist). pos = 1-based. */
    setAssist(pos, on) { return !!slotAtPos(pos) && updSlot(pos - 1, (s) => setUlt(s, { ...ultOf(s), assist: !!on })); },
    /** §9 동료별 '방어 턴 유지'(v1 ult.keepDef). pos = 1-based. */
    setKeepDef(pos, on) { return !!slotAtPos(pos) && updSlot(pos - 1, (s) => setUlt(s, { ...ultOf(s), keepDef: !!on })); },
    /** §9 전원 성공 가정: on 이면 '준비되면 바로'가 아닌 전원 켬(v1 ultAll('assist')), off 면 전원 끔. → undo 함수 */
    assistAll(on) {
      const before = state.team.map((s) => (s ? ultOf(s) : null));
      set({ team: state.team.map((s) => {
        if (!s) return null;
        const n = clone(s), u = ultOf(n);
        if (on) { if (u.mode !== 'asap') setUlt(n, { ...u, assist: true }); } else setUlt(n, { ...u, assist: false });
        return n;
      }) });
      return () => set({ team: state.team.map((s, k) => { if (!s || !before[k]) return s; const n = clone(s); setUlt(n, before[k]); return n; }) });
    },
    /** 일괄: 'assist'(asap 제외 전원 가정 켬) | 'asap'(아끼는 연동 멤버 제외 전원). → undo 함수 */
    ultAll(kind) {
      if (kind === 'assist') return plan.assistAll(true);
      const before = state.team.map((s) => (s ? ultOf(s) : null));
      const t = state.team.map((s, k) => {
        if (!s) return null;
        const n = clone(s);
        const g = syncGroupOf(state.sync, k + 1);
        if (!(g && g.role === 'member' && syncOtherOf(g.m) !== 'own')) setUlt(n, { ...ultOf(n), mode: 'asap' });
        return n;
      });
      set({ team: t });
      return () => set({ team: state.team.map((s, k) => { if (!s || !before[k]) return s; const n = clone(s); setUlt(n, before[k]); return n; }) });
    },
    /** 이태호 fed 추가 행동(평=기본 → 저장 안 함). 핀이 있는 이태호 줄에만 실린다(v1: 직접 계획일 때만). i = 0-based. */
    setFed(i, turn, a) {
      updSlot(i, (s) => { s.fedActions = s.fedActions || {}; if (a === '평') delete s.fedActions[turn]; else s.fedActions[turn] = a; });
    },
    setAllyUltAfter(i, on) { updSlot(i, (s) => { s.allyUltAfter = !!on; }); },
    presetLen: () => presetLen(state.cond.turns),
  };

  // ── §9 핀 · 잠긴 턴 ────────────────────────────────────────────────────
  const planToken = (label) => ({ label, pins: clone(state.pins), locked: clone(state.locked), ults: state.team.map((s) => (s ? ultOf(s) : null)) });
  const pushUndo = (label) => {
    const tok = planToken(label);
    planUndo.push(tok);
    if (planUndo.length > PLAN_UNDO_MAX) planUndo.shift();
    return tok;
  };
  const restoreToken = (tok) => {
    const t = state.team.map((s, k) => { if (!s || !tok.ults || !tok.ults[k]) return s; const n = clone(s); setUlt(n, tok.ults[k]); return n; });
    set({ pins: sortPins(tok.pins), locked: sortLocked(tok.locked), team: t });
  };
  const aptAt = (pos) => { const s = slotAtPos(pos); return s ? ((state.chars[s.id] || {}).actionsPerTurn || 1) : 1; };
  const validAct = (pos, act) => {
    const v = String(act || '');
    if (!/^[궁방평]+$/.test(v)) return false;
    return v.length === 1 || v.length === aptAt(pos);
  };
  const pins = {
    /** 칸 하나 고정/해제. act: '궁'|'방'|'평'(턴당 2회 동료는 '궁평' 같은 행동 수만큼의 문자열도 가능) | null(해제). → 바뀌었으면 true */
    set(turn, pos, act) {
      const t = Math.round(+turn), p = Math.round(+pos);
      if (!(t >= 1 && t <= 30) || !slotAtPos(p)) return false;
      const cur = (state.pins[t] || {})[p] || null;
      if (act == null || act === '') {
        if (!cur) return false;
        pushUndo(`pin:${t}:${p}`);
        const row = pinsRowOf(state.pins, p); delete row[t];
        set({ pins: withPinsRow(state.pins, p, row) });
        return true;
      }
      if (!validAct(p, act) || cur === act) return false;
      pushUndo(`pin:${t}:${p}`);
      set({ pins: withPinsRow(state.pins, p, { ...pinsRowOf(state.pins, p), [t]: String(act) }) });
      return true;
    },
    /** 칸 순환(제안서 §2): 해제 → 필살기 → 방어 → 보통 공격 → 해제. → 새 값 | null */
    cycle(turn, pos) {
      const order = [null, ...PIN_ACTS];
      const cur = (state.pins[turn] || {})[pos] || null;
      const next = order[(order.indexOf(order.includes(cur) ? cur : null) + 1) % order.length];
      pins.set(turn, pos, next);
      return next;
    },
    get: (turn, pos) => (state.pins[turn] || {})[pos] || null,
    /** 한 동료의 핀 줄 { turn: 값 }. */
    row: (pos) => pinsRowOf(state.pins, pos),
    /** 한 동료의 구체화된 줄(엔진 rotation 토큰 배열) | null(핀 없음 = 규칙). */
    line: (pos) => { const s = slotAtPos(pos); return s ? (effectiveTeam(state.team, state.pins, +state.cond.turns, env())[pos - 1].plan || null) : null; },
    /**
     * 이 칸에 필살기 핀이 가능한가(쿨 모델, 성공 가정·제단 반영 — v1 플래너 lockUlt 규칙). 방어로 쿨이 줄어드는 동료는 항상 true.
     */
    ultAllowed(turn, pos) {
      const s = slotAtPos(pos); if (!s) return false;
      const n = +state.cond.turns;
      const eff = effectiveTeam(state.team, state.pins, n, env());
      const pv = planView(eff[pos - 1], pos - 1, eff, Math.max(n, +turn), env());
      return pv.apt > 1 || !pv.lockUlt[turn - 1];
    },
    count: () => pinCount(state.pins),
    clearTurn(turn) {
      if (!state.pins[turn]) return false;
      pushUndo(`clearTurn:${turn}`);
      const p = { ...state.pins }; delete p[turn];
      set({ pins: sortPins(p) });
      return true;
    },
    clearRow(pos) {
      if (!Object.keys(pinsRowOf(state.pins, pos)).length) return false;
      pushUndo(`clearRow:${pos}`);
      set({ pins: withPinsRow(state.pins, pos, {}) });
      return true;
    },
    clearAll() {
      if (!pinCount(state.pins)) return false;
      pushUndo('clearAll');
      set({ pins: {} });
      return true;
    },
    presetAvailable: (pos, name) => { const s = slotAtPos(pos); return !!s && presetPinsRow(name, s, pos - 1, state.team, state.pins, +state.cond.turns, env()) !== null; },
    /**
     * 프리셋 → 그 동료의 핀 묶음(줄 교체). name: 'allUlt'|'ult3'|'early'|'pdef'|'reflow'.
     * 'early'(첫 필살기 당기기)는 그 동료의 성공 가정이 켜져 있어야 한다 → 꺼져 있으면 null.
     * [2026-09-28 성공 가정 정책] 전에는 'early' 가 성공 가정을 스스로 켰다(v1 규칙, notice 'plan.assistOnByEarly').
     *   성공 가정은 확률이므로 사용자만 켜고 끈다 — 자동으로 켜지는 경로를 없앴다(UI 는 버튼을 흐리게 + 이유).
     * → 되돌리기 토큰(pins.revert) | null(불가)
     */
    applyPreset(pos, name) {
      const s = slotAtPos(pos); if (!s) return null;
      if (name === 'early' && !ultOf(s).assist) return null;
      const n = +state.cond.turns;
      const tok = planToken(`preset:${name}:${pos}`);
      const row = presetPinsRow(name, s, pos - 1, state.team, state.pins, n, makeEnv({ chars: state.chars, altar: state.altar }));
      if (!row) return null;
      planUndo.push(tok); if (planUndo.length > PLAN_UNDO_MAX) planUndo.shift();
      set({ pins: withPinsRow(state.pins, pos, row) });
      return tok;
    },
    /** 토큰(applyPreset·undo 스택 항목)으로 핀·잠긴 턴·필살기 방식 필드를 되돌린다. */
    revert(tok) { if (tok) restoreToken(tok); },
    undo() { const u = planUndo.pop(); if (!u) return null; restoreToken(u); return u.label; },
    canUndo: () => planUndo.length > 0,
    /** 턴 전체 잠금(턴 편집 시트 확정). seq = [{p, a}] — 빈 배열 = 아무도 행동하지 않는 턴. */
    lockTurn(turn, seq) {
      const t = Math.round(+turn);
      if (!(t >= 1 && t <= 30) || !Array.isArray(seq)) return false;
      pushUndo(`lock:${t}`);
      set({ locked: sortLocked({ ...state.locked, [t]: seq.map((e) => ({ p: +e.p, a: e.a })) }) });
      return true;
    },
    unlockTurn(turn) {
      if (!state.locked[turn]) return false;
      pushUndo(`unlock:${turn}`);
      const l = { ...state.locked }; delete l[turn];
      set({ locked: sortLocked(l) });
      return true;
    },
    unlockAll() {
      if (!Object.keys(state.locked).length) return false;
      pushUndo('unlockAll');
      set({ locked: {} });
      return true;
    },
    /** "모든 턴 고정": 프로브(미리보기 결과)의 1..turns 순서를 전부 잠근다(= v1 완전 수동 페이로드). → 잠근 턴 수 */
    lockAllFromProbe(probe) {
      const next = plansFromProbe(probe || state.probe, +state.cond.turns);
      if (!Object.keys(next).length) return 0;
      pushUndo('lockAll');
      set({ locked: sortLocked({ ...state.locked, ...next }) });
      return Object.keys(next).length;
    },
  };

  /**
   * §9 구체화 — 지금 상태가 엔진에 보낼 행동 계획. → { turnPlans, rotations }
   *   turnPlans = 현재 턴 수 안의 잠긴 턴(그대로). 핀·잠금 없는 턴은 없다(규칙이 진행).
   *   rotations = { pos: rotation 문자열 } — 핀이 있는 동료만(핀 칸 + 규칙 채움). 핀 없는 동료는 없다.
   * 핀은 턴 전체를 굳히지 않고 그 동료의 줄로 간다(v1 직접 계획과 같은 엔진 경로 → v1 페이로드 동일, core/README §v2.1).
   * probeRulesOnly 인자는 받지만 쓰지 않는다(호환 — 구체화에 프로브가 필요 없다).
   */
  function materialize(probeRulesOnly) { // eslint-disable-line no-unused-vars
    const n = +state.cond.turns;
    const eff = effectiveTeam(state.team, state.pins, n, env());
    const rotations = {};
    eff.forEach((s, i) => { if (s && s.usePlan) rotations[i + 1] = s.rotation; });
    return { turnPlans: lockedWithin(state.locked, n), rotations };
  }

  /** 핀 중 프로브(규칙 + 핀 + 잠긴 턴 반영)에서 실제 행동이 달랐던 칸 → [{ pos, id, turns:[…] }]. 잠긴 턴은 제외. */
  function pinsIgnored(probe) {
    const n = +state.cond.turns, out = [];
    if (!probe || !probe.plan) return out;
    state.team.forEach((s, i) => {
      if (!s) return;
      const pos = i + 1, apt = (state.chars[s.id] || {}).actionsPerTurn || 1, bad = [];
      Object.entries(pinsRowOf(state.pins, pos)).forEach(([t, v]) => {
        if (+t > n || state.locked[t]) return;
        const pl = probe.plan[String(t)];
        if (!pl || !Array.isArray(pl.seq)) return;
        const acts = pl.seq.filter((e) => e.p === pos && !e.x).map((e) => e.a);
        const ok = apt > 1 ? acts.slice(0, apt).join('') === v : acts.includes(v);
        if (!ok) bad.push(+t);
      });
      if (bad.length) out.push({ pos, id: s.id, turns: bad.sort((a, b) => a - b) });
    });
    return out;
  }

  /** 미리보기 프로브(규칙 + 핀 + 잠긴 턴, 확률 100%·1회). state.probe 에 보관. mode:'rules' 면 규칙만(보관하지 않음). */
  async function probe({ mode = 'probe' } = {}) {
    if (!api) return null;
    const r = await api.probe(buildCfg(state, { mode }));
    if (mode === 'probe') set({ probe: r });
    return r;
  }

  // ── 실행 ───────────────────────────────────────────────────────────────
  /**
   * 실행 전 점검 + cfg(v1 run 앞부분). → { cfg, warnings:[{key, vars}] } | null(편성 비어 있음)
   * 핀은 동료별 줄로, 잠긴 턴은 turnPlans 로 구체화된다(buildCfg). api 가 있고 핀이 있으면 프로브 한 번으로
   * 엔진이 따르지 않은 핀(쿨 미충족·맞추기·준비되면 바로 등)을 'run.pinIgnored' 로 알린다.
   */
  async function prepareRun() {
    const picked = state.team.filter(Boolean);
    if (!picked.length) return null;
    const warnings = [];
    const n = +state.cond.turns;
    const unplanned = state.team.find((s, i) => s && (((state.chars[s.id] || {}).actionsPerTurn || 1) > 1 || HOLD_ULT_IDS.has(s.id))
      && !Object.keys(pinsRowOf(state.pins, i + 1)).length);
    if (unplanned) warnings.push({ key: 'run.recommendPlan', vars: { id: unplanned.id } });
    const hp = picked.find((s) => (state.chars[s.id] || {}).hpSchedule);
    if (hp && !state.cond.hp10) warnings.push({ key: 'run.hpSchedule', vars: { id: hp.id } });
    const miss = missingActors(lockedWithin(state.locked, n), state.team, n, state.chars);
    if (miss.length) warnings.push({ key: 'run.manualMissing', vars: { names: miss } });
    if (api && pinCount(state.pins)) {
      try {
        const pr = await probe({ mode: 'probe' });
        pinsIgnored(pr).forEach((x) => warnings.push({ key: 'run.pinIgnored', vars: x }));
      } catch (err) { warnings.push({ key: 'manual.probeFailed', vars: { message: err && err.message } }); }
    }
    return { cfg: buildCfg(state, { mode: 'run' }), warnings };
  }
  /** 결과 반영(+ save 면 기록 저장). */
  function setResult(data, { save = false } = {}) {
    set({ result: data });
    if (save && data && !data.error) records.save(snapshot(), data);
  }

  // ── 부트 ───────────────────────────────────────────────────────────────
  /**
   * v1 init 순서: 제단·연동·턴 피해·기록 로드 → 초안이 있으면 그대로, 없으면 최근 기록, 그것도 없으면 기본 편성.
   * → { source: 'draft'|'record'|'default', rec? } — 결과 실행은 호출부(main.js).
   */
  function init({ chars } = {}) {
    if (chars) set({ chars }, { silent: true });
    loadSideStates();
    loadRecords();
    let out;
    const draft = loadDraft();
    if (draft) {
      migrateSnapSync(draft.snap);
      set({ activeRecId: state.records.some((r) => r.id === draft.rec) ? draft.rec : null }, { silent: true });
      applySnap(draft.snap);
      out = { source: 'draft' };
    } else if (state.records.length) {
      const rec = state.records[0];
      set({ activeRecId: rec.id }, { silent: true });
      migrateSnapSync(rec.snap);
      applySnap(rec.snap);
      out = { source: 'record', rec };
    } else {
      team.setDefault();
      out = { source: 'default' };
    }
    set({ draftReady: true });
    saveDraft();
    return out;
  }

  return {
    get, set, subscribe, snapshot, applySnap, saveDraft, loadDraft, init,
    records, team, cond, altar, tdmg, sync, plan, pins,
    materialize, pinsIgnored, probe, prepareRun, setResult,
    /** §9 buildCfg({mode:'rules'|'probe'|'run', plansOverride}) */
    buildCfg: (opts) => buildCfg(state, opts),
    /** 엔진에 보낼 편성(핀 → 동료별 줄이 들어간 가상 슬롯). 미리보기·테스트용. */
    effectiveTeam: () => effectiveTeam(state.team, state.pins, +state.cond.turns, env()),
    env,
    onNotice(fn) { noticeFns.add(fn); return () => noticeFns.delete(fn); },
    /** 언어(woofia_lang)·테마 등 UI 설정 저장. */
    setLang(lang) { try { storage.setItem(KEYS.lang, lang); } catch { /* noop */ } set({ ui: { ...state.ui, lang } }); },
  };
}
