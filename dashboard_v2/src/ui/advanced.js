// 「고급 설정」 창 — 행동 계획의 모든 편집을 한 창에서(메인 패널은 켜진 동안 요약 카드로 접힌다).
//   머리: 제목 · 배지(메인 요약 한 줄과 같은 목록 — advLineParts). 본문 맨 위: 사용 스위치 행(설명은 ⓘ 툴팁 + 방탈출 제단 강제 시 잠금 사유).
//   [ADV_REVIEW 2026-09-28] 우선순위 한 줄은 ④ 머리 ⓘ + 충돌(주황 점·가려진 고정)이 있을 때만 범례 아래 한 줄. 확률 제단 안내에 「전원 성공 가정」 버튼.
//   본문(세로): ① 순서와 필살기 · ② 예외 턴(ui/plan.js 의 'adv' 모양) → ③ 맞추기 → ④ N턴 고정 격자(프로브·경고 칸).
//   꺼짐 = ①~④ 흐리게 + inert(.is-dimmed). 처음 켤 때(이전 값 없음) 스위치 아래 인라인 선택지(가져오기·기본 설정)를 한 번 보인다.
// 사용 스위치(UI 상태 — core 가 아니라 localStorage 'woofia_adv' = { on, last }):
//   끄면 딥 값(방식·성공 가정·방어 턴 유지·맞추기(욱영 프리셋 제외)·잠긴 턴)을 last 에 저장하고 스토어를 라이트 값으로 되돌린다.
//   켜면 last 를 복원(동료는 id 로 다시 찾는다). 핀(직접 지정)·순서·예외 턴·욱영 프리셋 맞추기는 라이트 범위라 건드리지 않는다.
import {
  ultOf, setUlt, syncOtherOf, normalizeSyncGroups, syncOps, summary, pinCount, lockedWithin, sortLocked, turnSeqFromProbe, makeEnv, taehoFedTurns,
  immuneFor,
} from '../core/plan.js';
import { UK_ID, IMBUEON_ID } from '../core/format.js';
import {
  ACT_KEY, actsOf, cellClass, cellSource, syncAfterNoExtra, syncActionOf, helpTip,
  replaceSyncMember, syncUsedExcept, shortName, ukPresetIndex, deepSyncGroups, getBaseCtx, scopeSession, sheetSession, cellPicker,
  assistEffect, ukPresetOverwrites, isFedCarry, ACT_CLS, ACT_CYCLE, pinUltWithRules, pinUltNotice, presetTip, presetBlockedByMode,
} from './plan-helpers.js';
import { openTurnEdit } from './turn-edit.js';

const ADV_KEY = 'woofia_adv';
// [ADV_REVIEW D1] 창의 프리셋은 ④ 동료 행 머리 메뉴에서(① 직접 지정 칸 줄 삭제). [D3] 「첫 필살기 당기기」 삭제.
// 동료별 프리셋(메인 직접 지정과 같은 목록 — CHAR_SPECIALS.md)은 해당 동료 행에만 보인다(store.pins.presetAvailable).
const GRID_PRESETS = [['allUlt', 'plan.turn.preset.allUlt'], ['ult3', 'plan.turn.preset.every3'], ['ult3def', 'plan.turn.preset.ult3def'], ['pdef', 'plan.turn.preset.defBefore'],
  ['defRush', 'plan.turn.preset.defRush'], ['reflow', 'plan.turn.preset.realign']];
const SYNC_ACTIONS = [['before', 'plan.sync.action.before'], ['after', 'plan.sync.action.after'], ['defend', 'plan.sync.action.defend'], ['basic', 'plan.sync.action.basic']];
const PROBE_DEBOUNCE = 300;
const ULT = '궁', DEF = '방', ATK = '평';   // copy-lint-allow (엔진 토큰)
const MOBILE_MQ = '(max-width: 900px)';
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

// ═════════════════════════════════════════════════════════════════════════════
// 사용 상태(UI) — { on, last: { at, ids, ults, sync, locked } | null }
// ═════════════════════════════════════════════════════════════════════════════
const listeners = new Set();
let mem = null;
function readState() {
  try {
    const v = JSON.parse((globalThis.localStorage && localStorage.getItem(ADV_KEY)) || 'null');
    if (v && typeof v === 'object') return { on: !!v.on, last: v.last && typeof v.last === 'object' ? v.last : null };
  } catch { /* 손상된 값은 기본으로 */ }
  return { on: false, last: null };
}
const cur = () => (mem || (mem = readState()));
function commit(next) {
  mem = { on: !!next.on, last: next.last || null };
  try { localStorage.setItem(ADV_KEY, JSON.stringify(mem)); } catch { /* 저장 못 해도 동작 */ }
  listeners.forEach((f) => { try { f(mem); } catch (err) { console.error('[advanced]', err); } });
}
export const advIsOn = () => cur().on;
export const advLast = () => cur().last;
export function onAdvChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** 방탈출 제단이 켜져 있으면 고급 설정을 끌 수 없다(행동 계획은 고급 설정 창에서만 편집). */
export const advForced = (st) => !!(st && st.altar && st.altar.on);
/** 딥 설정 개수(메인에는 성공 가정을 켜는 경로가 없으므로 성공 가정은 모두 딥). */
export function deepInfo(st) {
  let modes = 0, assist = 0, assistDeep = 0, noKeep = 0;
  const env = makeEnv({ chars: st.chars || {}, altar: st.altar });
  (st.team || []).forEach((s, i) => {
    if (!s) return;
    const u = ultOf(s);
    if (u.mode === 'strict' || u.mode === 'asap') modes++;
    // assist = 화면 배지·요약 수(엔진이 실제로 쓰는 것만 — 모순 4), assistDeep = 페이로드에 실리는 수(고급 설정 자동 켜기 판정)
    if (u.assist && u.mode !== 'asap') { assistDeep++; if (assistEffect(st, i + 1, env).live) assist++; }
    if (!u.keepDef) noKeep++;
  });
  // 욱영 프리셋 그룹(메인 욱영 체크)은 라이트 — 딥 맞추기로 세지 않는다
  const sy = summary.sync({ ...st, sync: deepSyncGroups(st.sync, st.team || []) });
  return { modes, assist, assistDeep, noKeep, sync: sy.key === 'plan.sum.sync' ? sy.vars.n : 0,
    locked: Object.keys(lockedWithin(st.locked || {}, +st.cond.turns || 30)).length, pins: pinCount(st.pins) };
}
/** 엔진에 가는 딥 설정이 있는가(꺼진 상태에서 기록·공유 코드로 들어왔는지 판정). */
export const hasDeep = (st) => { const d = deepInfo(st); return !!(d.modes || d.noKeep || d.sync || d.locked || d.assistDeep); };
/** 메인 패널 요약 한 줄 조각 → [[key, vars]] */
export function advLineParts(st) {
  const d = deepInfo(st);
  return [['plan.adv.line.modes', d.modes], ['plan.adv.line.sync', d.sync], ['plan.adv.line.pins', d.pins], ['plan.adv.line.locked', d.locked],
    ['plan.adv.line.assist', d.assist], ['plan.adv.line.noKeep', d.noKeep]].filter(([, n]) => n > 0).map(([k, n]) => [k, { n }]);
}

function captureDeep(st) {
  const ults = {};
  st.team.forEach((s, i) => { if (s) ults[i + 1] = ultOf(s); });
  return { at: Date.now(), ids: st.team.map((s) => (s ? s.id : null)), ults, sync: deepSyncGroups(st.sync, st.team), locked: clone(st.locked || {}) };
}
function lightReset(store) {
  const st = store.get();
  const team = st.team.map((s) => {
    if (!s) return null;
    const n = clone(s);
    setUlt(n, { mode: 'fixed', keepDef: true, assist: false });
    return n;
  });
  const k = ukPresetIndex(st.sync, st.team);
  store.set({ team, locked: {} });
  store.sync.set(k >= 0 ? [normalizeSyncGroups(st.sync)[k]] : []);   // 욱영 프리셋 그룹(라이트)은 남긴다
}
function restoreDeep(store, last) {
  const st = store.get();
  const posOf = {};
  st.team.forEach((s, i) => { if (s) posOf[s.id] = i + 1; });
  const map = (p) => { const id = (last.ids || [])[p - 1]; return id != null && posOf[id] ? posOf[id] : 0; };
  const team = st.team.map((s) => (s ? clone(s) : null));
  Object.entries(last.ults || {}).forEach(([p, u]) => {
    const np = map(+p);
    if (np && team[np - 1] && u) setUlt(team[np - 1], { mode: ['fixed', 'strict', 'asap'].includes(u.mode) ? u.mode : 'fixed', keepDef: u.keepDef !== false, assist: !!u.assist });
  });
  const locked = {};
  Object.entries(last.locked || {}).forEach(([tt, seq]) => {
    if (!Array.isArray(seq)) return;
    const m = seq.map((e) => ({ p: map(+e.p), a: e.a }));
    if (m.every((e) => e.p)) locked[tt] = m;
  });
  const sync = (last.sync || []).map((g) => ({ ...g, anchor: map(g.anchor), members: (g.members || []).map((m) => ({ ...m, p: map(m.p) })).filter((m) => m.p) }))
    .filter((g) => g.anchor);
  const k = ukPresetIndex(st.sync, st.team);
  const keep = k >= 0 ? [normalizeSyncGroups(st.sync)[k]] : [];     // 지금의 욱영 프리셋 그룹(라이트)이 먼저 — 겹치는 자리는 복원 쪽이 빠진다
  store.set({ team, locked: sortLocked(locked) });
  store.sync.set(normalizeSyncGroups([...keep, ...sync]));
}
/**
 * 사용 스위치. on: keep=true 면 지금 스토어 그대로 켠다(가져오기·기록으로 들어온 딥 값), 아니면 last 를 복원.
 * off: 딥 값을 last 에 저장하고 라이트 값으로 되돌린다. → 되돌리기 함수
 */
export function advSetOn(store, on, { keep = false } = {}) {
  const prev = cur();
  if (on) {
    if (!keep && prev.last) restoreDeep(store, prev.last);
    commit({ on: true, last: prev.last });
    return () => advSetOn(store, false);
  }
  if (advForced(store.get())) return () => {};
  const last = captureDeep(store.get());
  lightReset(store);
  commit({ on: false, last });
  return () => advSetOn(store, true);
}

// ═════════════════════════════════════════════════════════════════════════════
// 창
// ═════════════════════════════════════════════════════════════════════════════
/** 메인 스토어로 고급 설정 창을 연다. 하위 시트(턴 편집·예외 턴·칸 시트)를 닫으면 이 창이 다시 열린다(스크롤 위치 유지). */
export function openAdvanced(base) {
  const { t, components: C } = base;
  let dispose = null, gen = 0, scrollTop = 0;
  const sess = sheetSession(base, base.store, { reopen: () => openRoot(), onEnd: () => { gen++; if (dispose) dispose(); dispose = null; } });
  function openRoot() {
    const my = ++gen;
    if (dispose) { dispose(); dispose = null; }
    const host = C.h('div', { class: 'adv' });
    const sheet = sess.ctx.components.openSheet({ root: true, title: t('plan.adv.title'), body: host, size: 'sheet-lg adv-sheet', ariaLabel: t('plan.close') });
    let d = () => {};
    try { d = mountAdvanced(host, sess.ctx, { sheet, restoreScroll: () => { if (sheet.body) sheet.body.scrollTop = scrollTop; } }); }
    catch (err) { showFail(host, err); }
    if (my === gen) dispose = d; else d();
    if (sheet.body) { sheet.body.scrollTop = scrollTop; sheet.body.addEventListener('scroll', () => { scrollTop = sheet.body.scrollTop; }, { passive: true }); }
  }
  openRoot();
  return { store: base.store, end: () => sess.end() };
}

/**
 * 비교군 범위(팀 비교의 「행동 계획 편집」). 메인 스토어는 건드리지 않는다.
 * scope = { team, turns, sync, overrides, pins, locked, altar?, tdmg?, chars?, label?, commit({team, sync, overrides, pins, locked}), onClose }
 * 같은 창(항상 사용)을 스코프 스토어 위에 올린다. commit 은 창을 닫을 때 한 번.
 */
export function openAdvancedFor(scope = {}) {
  const base = getBaseCtx();
  if (!base) return null;
  const { h } = base.components;
  let dispose = null, gen = 0, scrollTop = 0;
  const sess = scopeSession(base, { team: scope.team, turns: scope.turns, sync: scope.sync, overrides: scope.overrides, pins: scope.pins, locked: scope.locked,
    plans: scope.plans, on: scope.manualOn, altar: scope.altar, tdmg: scope.tdmg, chars: scope.chars }, {
    reopen: () => openRoot(),
    onEnd: (st) => {
      gen++; if (dispose) dispose(); dispose = null;
      if (scope.commit) scope.commit({ team: clone(st.team), sync: normalizeSyncGroups(st.sync), overrides: clone(st.overrides), pins: clone(st.pins), locked: clone(lockedWithin(st.locked, 30)) });
      if (scope.onClose) scope.onClose();
    },
  });
  function openRoot() {
    const my = ++gen;
    if (dispose) { dispose(); dispose = null; }
    const host = h('div', { class: 'adv' });
    const sheet = sess.ctx.components.openSheet({ root: true, title: base.t('plan.title') + (scope.label ? ` · ${scope.label}` : ''), body: host, size: 'sheet-lg adv-sheet', ariaLabel: base.t('plan.close') });
    const d = mountAdvanced(host, sess.ctx, { sheet, scoped: true, restoreScroll: () => { if (sheet.body) sheet.body.scrollTop = scrollTop; } });
    if (my === gen) dispose = d; else d();
    if (sheet.body) { sheet.body.scrollTop = scrollTop; sheet.body.addEventListener('scroll', () => { scrollTop = sheet.body.scrollTop; }, { passive: true }); }
  }
  openRoot();
  return { store: sess.store, end: () => sess.end() };
}

/** 창 내용(머리 배지·스위치 포함). → 해제 함수 */
function mountAdvanced(host, ctx, { sheet, scoped = false, restoreScroll }) {
  const { store, api, t, i18n, motion, components: C } = ctx;
  const { h, icon } = C;
  C.ensureStyle('css/plan.css');
  const unsubs = [];
  const S = () => store.get();
  const fullName = (id) => (i18n.nameOf ? i18n.nameOf(id) : String(id));
  const nameOf = (id) => shortName(fullName(id));
  const turnsN = () => Math.max(1, +S().cond.turns || 30);
  const present = (st = S()) => st.team.map((s, i) => (s ? i + 1 : 0)).filter(Boolean);
  const isMobile = () => typeof matchMedia === 'function' && matchMedia(MOBILE_MQ).matches;
  const undoToast = (msg, fn) => C.toast(msg, fn ? { action: { label: t('plan.undo'), fn } } : undefined);
  const iconBtn = (name, label, attrs = {}) => h('button', { type: 'button', class: 'btn-icon', 'aria-label': label, title: label, ...attrs }, icon(name));
  const select = (attrs, options, value) => {
    const el = h('select', attrs, ...options.map(([v, label, extra = {}]) => h('option', { value: String(v), ...extra }, label)));
    el.value = String(value);
    return el;
  };
  const actText = (acts) => (acts.length ? acts.map((a) => t(ACT_KEY[a] || 'plan.act.atk')).join(' → ') : t('plan.pv.cell.none'));
  const isOn = () => scoped || advIsOn();
  const keepFocus = (fn) => {
    const a = document.activeElement;
    const fk = a && host.contains(a) ? (a.closest('[data-fk]') || {}).dataset?.fk : null;
    fn();
    if (fk) { const el = host.querySelector(`[data-fk="${CSS.escape(fk)}"]`); if (el && el !== document.activeElement && !el.disabled) el.focus({ preventScroll: true }); }
  };

  // ── 머리: 배지 · 사용 스위치 · (제단) 끌 수 없는 이유 ───────────────────────
  const badges = h('span', { class: 'adv-badges' });
  // 사용 스위치는 본문 맨 위 큰 행(머리에는 배지만). 꺼져 있으면 ①~④ 를 흐리게 + inert.
  const sw = scoped ? null : C.toggle({ label: h('b', { class: 'adv-switch-label' }, t('plan.adv.use.label')), checked: advIsOn(), onChange: (v) => onSwitch(v) });
  const forced = scoped ? null : h('p', { class: 'adv-forced', hidden: true }, icon('lock'), h('span', {}, t('plan.adv.forced')));
  if (sw) { sw.classList.add('adv-use'); sw.input.dataset.fk = 'advUse'; }
  const headEl = sheet && sheet.el && sheet.el.querySelector('.sheet-head');
  if (headEl) headEl.insertBefore(badges, headEl.lastElementChild);
  let showChoices = false;     // 처음 켤 때(이전 고급 값 없음) 한 번만 보이는 인라인 선택지

  function onSwitch(v) {
    if (!v && advForced(S())) { sw.set(true); C.toast(t('plan.adv.forced')); return; }
    if (v) {
      const hadLast = !!advLast();
      const undo = advSetOn(store, true, { keep: !hadLast });
      showChoices = !hadLast;
      undoToast(t(hadLast ? 'plan.adv.resume.done' : 'plan.adv.on.done'), undo);
      if (showChoices) refresh();
    } else {
      showChoices = false;
      const undo = advSetOn(store, false);
      undoToast(t('plan.adv.off.done'), undo);
    }
  }

  // ── 골격 ─────────────────────────────────────────────────────────────────
  const start = h('div', { class: 'adv-start', hidden: true });
  const work = h('div', { class: 'adv-work dim-able' });
  // [ADV_REVIEW #1] 박스 없이 한 줄(아래 구분선) · 설명은 ⓘ 툴팁. 제단 강제 사유는 상태라 계속 보인다.
  const swRow = scoped ? null : h('div', { class: 'adv-switch' },
    h('div', { class: 'adv-switch-row' }, sw, helpTip(C, t('plan.adv.use.desc'), t('plan.adv.help.aria', { what: t('plan.adv.use.label') }))), forced, start);
  // [ADV_REVIEW #3] 확률 CD 감소 제단 안내 + 「전원 성공 가정」(사용자가 누를 때만 — 자동으로 켜지 않음)
  const assistAllBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-fk': 'assistAll', onClick: () => toggleAssistAll() }, h('span', {}));
  const procNote = h('div', { class: 'adv-note', hidden: true }, icon('info'), h('span', { class: 'adv-note-text' }, t('plan.adv.proc.note')), assistAllBtn);
  // 모순 3: 엔진이 실제로 쓰는 우선순위(ADV_AUDIT §4-A 실측) — [ADV_REVIEW #2] ④ 머리 ⓘ + 충돌 칸이 있을 때만 범례 아래 한 줄
  const prioLine = h('p', { class: 'adv-prio', hidden: true }, icon('list-ordered'), h('span', {}, t('plan.adv.prio')));
  const planHost = h('div', { class: 'adv-plan' });
  // ③ 맞추기
  const syncList = h('div', { class: 'sync-list' });
  const syncAdd = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'data-fk': 'syncAdd', onClick: addSyncGroup }, icon('plus'), h('span', {}, t('plan.sync.add')));
  const syncPreset = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: applyUkPreset }, icon('sparkles'), h('span', {}));
  const syncNote = h('p', { class: 'hint sync-note', hidden: true });
  // [ADV_REVIEW #7] 창의 구역은 접히지 않으므로 머리 요약(kv)은 두지 않는다(바로 아래 목록과 같은 값)
  const secSync = h('section', { class: 'adv-sec', 'aria-labelledby': 'adv-h-sync' },
    h('div', { class: 'adv-sec-h' }, h('h3', { id: 'adv-h-sync' }, h('span', { class: 'step-n' }, '3'), t('plan.step3.title'))),
    h('p', { class: 'hint' }, t('plan.sync.hint.short')), syncList, h('div', { class: 'sync-tools' }, syncAdd, syncPreset), syncNote);
  // ④ N턴 고정
  const gridTitle = h('span', {});
  const grid = h('div', { class: 'pg', role: 'grid', 'aria-label': '' });
  grid.addEventListener('click', onGridClick);
  grid.addEventListener('keydown', onGridKey);
  grid.addEventListener('focusin', (e) => { const c = e.target.closest('[data-cell]'); if (c) setRoving(c); });
  const legend = h('p', { class: 'pl-legend' },
    ...[['rule-ult', 'plan.act.ult'], ['def', 'plan.act.def'], ['atk', 'plan.act.atk'], ['x', 'plan.legend.extra'], ['pin', 'plan.legend.pin'], ['warn', 'plan.legend.warn'], ['lock', 'plan.legend.locked'], ['masked', 'plan.legend.masked']]
      .map(([k, key]) => h('span', { class: 'lg-item' }, h('i', { class: `pl-sw-${k}`, 'aria-hidden': 'true' }), t(key))));
  const undoBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-fk': 'gUndo', onClick: doUndo }, icon('rotate-ccw'), h('span', {}, t('plan.undo')));
  const clearBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-fk': 'gClear', onClick: clearAll }, icon('x'), h('span', {}, t('plan.adv.grid.clear')));
  const lockAllBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-fk': 'gLockAll', title: t('plan.te.lockAll.tip'), onClick: lockAll }, icon('lock'), h('span', {}, t('plan.te.lockAll')));
  const pvMsg = h('p', { class: 'hint pv-msg', hidden: true });
  const fedBox = h('div', { class: 'adv-fed', hidden: true });   // 이태호가 임부언에게 받은 추가 행동(① 직접 지정 줄에서 옮겨 옴)
  const secGrid = h('section', { class: 'adv-sec', 'aria-labelledby': 'adv-h-grid' },
    h('div', { class: 'adv-sec-h' }, h('h3', { id: 'adv-h-grid' }, h('span', { class: 'step-n' }, '4'), gridTitle),
      helpTip(C, t('plan.adv.prio'), t('plan.adv.help.aria', { what: t('plan.adv.prio.what') })), h('span', { class: 'adv-tools' }, undoBtn, clearBtn, lockAllBtn)),
    h('p', { class: 'hint' }, t('plan.adv.grid.hint')), legend, prioLine,
    h('div', { class: 'pl adv-pl' }, h('div', { class: 'pg-wrap' }, grid)), fedBox, pvMsg);
  work.append(procNote, planHost);
  host.replaceChildren(...(swRow ? [swRow] : []), work);

  // ── ①② + 미리보기: ui/plan.js 'adv' 모양(③④ 는 이 창이 만든 구역을 끼운다) ─────
  let planDispose = null, planGen = 0, planBusy = false;
  // ① 직접 지정 칸이 ④ 와 같은 실행 결과를 칠하도록 프로브를 나눠 준다(모순 3)
  const probeSubs = new Set();
  const advProbe = { get: () => lastProbe, on: (fn) => { probeSubs.add(fn); return () => probeSubs.delete(fn); } };
  async function mountPlan() {
    if (planDispose || planBusy) return;
    planBusy = true;
    const my = ++planGen;
    try {
      const mod = await import('./plan.js');
      const d = await mod.mount(planHost, { ...ctx, planVariant: 'adv', planExtra: [secSync, secGrid], advProbe });
      if (my !== planGen) { d(); return; }
      planDispose = d;
      if (restoreScroll) restoreScroll();
    } catch (err) { console.error('[advanced] plan.js', err); showFail(planHost, err); } finally { if (my === planGen) planBusy = false; }
  }
  function unmountPlan() { planGen++; planBusy = false; if (planDispose) { planDispose(); planDispose = null; } planHost.replaceChildren(); }

  // ── 출발점 3택(꺼져 있을 때) ────────────────────────────────────────────────
  function lastSummary(last) {
    const d = { modes: 0, assist: 0, sync: normalizeSyncGroups(last.sync || []).filter((g) => g.anchor && g.members.length).length, locked: Object.keys(last.locked || {}).length };
    Object.values(last.ults || {}).forEach((u) => { if (u && (u.mode === 'strict' || u.mode === 'asap')) d.modes++; if (u && u.assist) d.assist++; });
    const parts = [['plan.adv.line.modes', d.modes], ['plan.adv.line.sync', d.sync], ['plan.adv.line.locked', d.locked], ['plan.adv.line.assist', d.assist]]
      .filter(([, n]) => n > 0).map(([k, n]) => t(k, { n }));
    let date = '';
    try { date = new Date(last.at).toLocaleDateString({ kr: 'ko', en: 'en', ja: 'ja', zh: 'zh-Hant' }[i18n.lang] || 'ko', { month: 'long', day: 'numeric' }); } catch { /* 날짜 없이 */ }
    return t('plan.adv.start.resume.desc', { date, parts: parts.length ? parts.join(' · ') : t('plan.adv.line.none') });
  }
  function renderStart() {
    start.hidden = !showChoices;
    if (!showChoices) { start.replaceChildren(); return; }
    const last = advLast();
    const done = () => { showChoices = false; refresh(); };
    const choice = (cls, title, desc, fk, onClick) => h('button', { type: 'button', class: `adv-choice${cls}`, 'data-fk': fk, title: desc, onClick: () => { onClick(); done(); } }, h('b', {}, title), h('span', {}, desc));
    start.replaceChildren(...[
      choice(' rec', t('plan.adv.start.import'), t('plan.adv.start.import.desc'), 'stImport', () => {}),
      choice('', t('plan.adv.start.basic'), t('plan.adv.start.basic.desc'), 'stBasic', startBasic),
      last ? choice('', t('plan.adv.start.resume'), lastSummary(last), 'stResume', () => restoreDeepNow()) : null].filter(Boolean));
  }
  function restoreDeepNow() { const l = advLast(); if (l) { restoreDeep(store, l); undoToast(t('plan.adv.resume.done')); } }
  function startBasic() {
    const st = S();
    const prev = { team: clone(st.team), overrides: clone(st.overrides), pins: clone(st.pins), locked: clone(st.locked), sync: normalizeSyncGroups(st.sync) };
    store.plan.resetAll();
    S().team.forEach((s, i) => {
      if (!s) return;
      store.plan.setUltMode(i, 'auto');
      store.plan.setUlt(i, { keepDef: true, assist: false });
      if (s.allyUltAfter) store.plan.setAllyUltAfter(i, false);
    });
    store.set({ pins: {}, locked: {} });
    store.sync.set([]);
    commit({ on: true, last: advLast() });
    undoToast(t('plan.adv.basic.done'), () => {
      const now = S();
      const same = now.team.length === prev.team.length && now.team.every((s, k) => (s ? s.id : 0) === (prev.team[k] ? prev.team[k].id : 0));
      store.set({ ...(same ? { team: prev.team } : {}), overrides: prev.overrides, pins: prev.pins, locked: prev.locked });
      store.sync.set(prev.sync);
    });
  }

  // ── 머리 배지 · 표시 전환 ─────────────────────────────────────────────────
  function renderHead() {
    const on = isOn();
    const f = !scoped && advForced(S());
    if (sw) { sw.set(on); sw.input.disabled = f && on; }
    if (forced) forced.hidden = !f;
    work.classList.toggle('is-dimmed', !on);
    work.inert = !on;
    // [ADV_REVIEW #23] 배지 = 메인 요약 한 줄과 같은 목록·문구(고정 칸과 잠긴 턴을 따로, 방식 변경·방어 턴 무시 포함)
    badges.replaceChildren(...(on ? advLineParts(S()) : []).map(([k, v]) => h('span', { class: 'adv-badge' }, t(k, v))));
    procNote.hidden = !(on && store.env().procIds.length && S().team.some(Boolean));
    if (!procNote.hidden) {
      const { eligible, allOn } = assistTargets();
      assistAllBtn.hidden = !eligible.length;
      assistAllBtn.querySelector('span').textContent = t(allOn ? 'plan.adv.assistAll.off' : 'plan.adv.assistAll.on');
    }
  }
  /** 성공 가정을 켤 수 있는 동료(assistEffect.live)와 그들이 전부 켜져 있는지. */
  function assistTargets() {
    const st = S(), env = store.env();
    const eligible = present(st).filter((p) => assistEffect(st, p, env).live);
    return { eligible, allOn: eligible.length > 0 && eligible.every((p) => ultOf(st.team[p - 1]).assist) };
  }
  function toggleAssistAll() {
    const { eligible, allOn } = assistTargets();
    if (!eligible.length) return;
    const prev = S().team.map((s) => (s ? clone(s) : null));
    const ids = prev.map((s) => (s ? s.id : 0)).join(',');
    eligible.forEach((p) => store.plan.setAssist(p, !allOn));
    undoToast(t(allOn ? 'plan.adv.assistAll.offDone' : 'plan.adv.assistAll.onDone', { n: eligible.length }), () => {
      if (S().team.map((s) => (s ? s.id : 0)).join(',') === ids) store.set({ team: prev });
    });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ③ 맞추기(문장형)
  // ═════════════════════════════════════════════════════════════════════════════
  function renderSync() {
    const st = S();
    const gs = normalizeSyncGroups(st.sync);
    const pres = present(st);
    syncList.replaceChildren(...gs.map((g, gi) => syncGroupEl(g, gi, st, pres)));
    const used = syncUsedExcept(gs, -1);
    const free = pres.filter((p) => !used.has(p));
    syncAdd.disabled = gs.length >= 3 || free.length < 1 || pres.length < 2;
    syncNote.hidden = !(pres.length < 2 || gs.length >= 3);
    syncNote.textContent = pres.length < 2 ? t('plan.sync.needTwo') : t('plan.sync.max');
    const uk = st.team.find((s) => s && s.id === UK_ID);
    syncPreset.hidden = !uk || pres.length < 2 || ukPresetIndex(st.sync, st.team) >= 0;
    if (uk) {
      syncPreset.querySelector('span').textContent = t('plan.sync.preset.uk', { name: nameOf(UK_ID) });
      syncPreset.title = t('plan.sync.preset.uk.tip', { name: nameOf(UK_ID) });
    }
  }
  function syncGroupEl(g, gi, st, pres) {
    if (gi === ukPresetIndex(st.sync, st.team)) {   // 욱영 프리셋('아군 필살기 나중' 체크) — 여기서는 읽기 전용
      const nmP = (p) => nameOf(st.team[p - 1].id);
      // [ADV_REVIEW D2] 창에서는 ①의 욱영 체크가 없으므로 여기서 지운다(옛 allyUltAfter 도 함께)
      const del = iconBtn('trash-2', t('plan.sync.remove.aria'), { class: 'btn-icon s-del', onClick: () => {
        const prev = normalizeSyncGroups(S().sync);
        const ui = S().team.findIndex((x) => x && x.id === UK_ID);
        const hadFlag = ui >= 0 && !!S().team[ui].allyUltAfter;
        store.sync.set(prev.filter((_, j) => j !== gi));
        if (hadFlag) store.plan.setAllyUltAfter(ui, false);
        undoToast(t('plan.sync.removed'), () => { store.sync.set(prev); if (hadFlag) store.plan.setAllyUltAfter(ui, true); });
      } });
      return h('div', { class: 'sentence sync-group sync-ro', role: 'group', 'aria-label': t('plan.sync.group.aria', { n: gi + 1 }) },
        h('div', { class: 's-line' }, h('b', {}, t('plan.adv.sync.ukPreset', { name: nmP(g.anchor) })), del),
        h('p', { class: 'hint' }, t('plan.adv.sync.ukPreset.desc', { anchor: nmP(g.anchor), names: g.members.map((m) => nmP(m.p)).join(', ') })));
    }
    const used = syncUsedExcept(st.sync, gi);
    const nm = (p) => nameOf(st.team[p - 1].id);
    const memberPs = g.members.map((m) => m.p);
    const anchorOpts = pres.filter((p) => !used.has(p) && (p === g.anchor || !memberPs.includes(p))).map((p) => [p, nm(p)]);
    if (!g.anchor) anchorOpts.unshift([0, t('plan.sync.anchor.pick'), { disabled: true }]);
    const anchorSel = select({ 'aria-label': t('plan.sync.anchor.aria'), 'data-fk': `sa:${gi}`, onChange: (e) => store.sync.op('setAnchor', gi, +e.target.value) }, anchorOpts, g.anchor || 0);
    // [ADV_REVIEW #11] 조각 문구는 조사를 붙이지 않는다(받침에 따라 '욱영는'처럼 틀림) — 빈 조각은 그리지 않음
    const word = (key) => { const x = t(key); return x ? h('span', {}, x) : null; };
    const lines = [h('div', { class: 's-line' }, anchorSel, word('plan.sync.text.onUlt'),
      iconBtn('trash-2', t('plan.sync.remove.aria'), { class: 'btn-icon s-del', onClick: () => {
        const r = store.sync.op('removeGroup', gi);
        undoToast(t('plan.sync.removed'), () => store.sync.set(r.undo));
      } }))];
    g.members.forEach((m) => {
      const opts = pres.filter((p) => p === m.p || (!used.has(p) && p !== g.anchor && !memberPs.includes(p))).map((p) => [p, nm(p)]);
      const memSel = select({ 'aria-label': t('plan.sync.member.aria'), 'data-fk': `sm:${gi}:${m.p}`, onChange: (e) => store.sync.set(replaceSyncMember(S().sync, gi, m.p, +e.target.value)) }, opts, m.p);
      const actSel = select({ 'aria-label': t('plan.sync.action.aria'), 'data-fk': `sx:${gi}:${m.p}`, onChange: (e) => setSyncAction(gi, m.p, e.target.value) },
        SYNC_ACTIONS.map(([v, k]) => [v, t(k)]), syncActionOf(m));
      const otherSel = select({ 'aria-label': t('plan.sync.other.aria'), 'data-fk': `so:${gi}:${m.p}`, onChange: (e) => store.sync.op('setOther', gi, m.p, e.target.value) },
        [['own', t('plan.sync.other.own')], ['hold', t('plan.sync.other.hold')]], syncOtherOf(m));
      const anchorMeta = g.anchor && st.team[g.anchor - 1] ? st.chars[st.team[g.anchor - 1].id] : null;
      const afterNote = syncActionOf(m) === 'after' && anchorMeta && anchorMeta.grantsExtra
        ? h('p', { class: 'hint s-note' }, icon('info'), t('plan.sync.afterNote', { anchor: nm(g.anchor), name: nm(m.p) })) : null;
      lines.push(h('div', { class: 's-line s-member', dataset: { member: String(m.p) } },
        memSel, word('plan.sync.text.topic'), actSel, word('plan.sync.text.otherwise'), otherSel,
        iconBtn('x', t('plan.sync.member.remove.aria', { name: nm(m.p) }), { class: 'btn-icon s-x', onClick: () => store.sync.op('toggleMember', gi, m.p) })));
      if (afterNote) lines.push(afterNote);
    });
    const free = pres.filter((p) => !used.has(p) && p !== g.anchor && !memberPs.includes(p));
    if (g.anchor && free.length) {
      const addSel = select({ 'aria-label': t('plan.sync.member.add'), class: 's-add', 'data-fk': `sadd:${gi}`, onChange: (e) => { if (+e.target.value) store.sync.op('toggleMember', gi, +e.target.value); } },
        [[0, `+ ${g.members.length ? t('plan.sync.member.add') : t('plan.sync.member.pick')}`], ...free.map((p) => [p, nm(p)])], 0);
      lines.push(h('div', { class: 's-line' }, addSel));
    }
    const missSel = select({ 'aria-label': t('plan.sync.miss.aria'), 'data-fk': `smiss:${gi}`, onChange: (e) => store.sync.op('setMiss', gi, e.target.value) },
      [['wait', t('plan.sync.miss.wait')], ['asap', t('plan.sync.miss.asap')]], g.miss === 'asap' ? 'asap' : 'wait');
    lines.push(h('div', { class: 's-line s-miss' }, h('span', {}, t('plan.sync.text.miss')), missSel));
    return h('div', { class: 'sentence sync-group', role: 'group', 'aria-label': t('plan.sync.group.aria', { n: gi + 1 }) }, ...lines);
  }
  function setSyncAction(gi, p, v) {
    if (v === 'defend' || v === 'basic') { store.sync.op('setBase', gi, p, v); return; }
    store.sync.set(syncOps.setOrder(syncOps.setBase(S().sync, gi, p, 'fatal'), gi, p, v));
  }
  function addSyncGroup() {
    const st = S(), gs = normalizeSyncGroups(st.sync);
    const used = syncUsedExcept(gs, -1);
    const free = present(st).filter((p) => !used.has(p));
    if (gs.length >= 3 || !free.length) return;
    store.sync.set([...gs, { anchor: free[0], members: [], miss: 'wait' }]);
    const sel = syncList.querySelector(`[data-fk="sadd:${gs.length}"]`) || syncList.querySelector(`[data-fk="sa:${gs.length}"]`);
    if (sel) sel.focus();
  }
  function applyUkPreset() {
    const apply = () => {
      const r = store.sync.preset('uk');
      if (r.ok) undoToast(t('plan.sync.preset.done'), () => store.sync.set(r.undo));
    };
    // 모순 6: 지금 맞추기(욱영 기준 그룹 · 인접 동료가 든 그룹)를 바꾸게 되면 먼저 묻는다
    if (!ukPresetOverwrites(S().sync, S().team)) { apply(); return; }
    const msg = t('plan.sync.preset.confirm', { name: nameOf(UK_ID) });
    cellPicker(C, syncPreset, { title: msg, mobile: isMobile(), closeLabel: t('plan.close'), items: [
      { label: msg, disabled: true, onSelect: () => {} }, 'sep',
      { label: t('plan.sync.preset.confirm.replace'), iconName: 'sparkles', onSelect: apply },
      { label: t('plan.sync.preset.confirm.keep'), iconName: 'x', onSelect: () => {} },
    ] });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ④ N턴 고정 격자 — 칸 = (동료, 턴). 칸 클릭 = 선택 팝오버, 턴 번호 = 턴 편집(잠긴 턴)
  // ═════════════════════════════════════════════════════════════════════════════
  let prevCells = null, roving = null, lastProbe = null;
  /**
   * 칸 모델(모순 3): 색 = 실제 실행(프로브의 그 동료 기본 행동), 고정 칸 = 테두리 + 점(고정 값은 툴팁), 실행이 고정과 다르면 경고 점.
   * 잠긴 턴에 가려진 고정은 masked(모순 5). 프로브 전에는 고정 값으로 대신 칠한다.
   */
  function cellModel(st, probe, ignored, pos, tt, apt, n) {
    const acts = probe ? actsOf(probe, tt, pos) : [];
    const pinRaw = (st.pins[tt] || {})[pos] || null;
    const locked = Array.isArray(st.locked[tt]) && tt <= n;
    const own = probe ? acts.slice(0, apt) : (pinRaw && !locked ? [...pinRaw] : []);
    let kind = own.length ? cellClass(own, apt) : (probe ? 'none' : 'atk');
    if (kind === 'extra') kind = own.includes(ULT) ? 'ult' : own.includes(DEF) ? 'def' : 'atk';
    const extra = acts.length > apt;
    const warnIgnored = !!(pinRaw && !locked && ignored.get(pos) && ignored.get(pos).has(tt));
    const syncAnchor = probe && !locked ? syncAfterNoExtra(st, probe, pos, tt) : 0;
    return { acts, pin: locked ? null : pinRaw, masked: locked ? pinRaw : null, locked, kind, extra, warnIgnored, syncAnchor };
  }
  function renderGrid(probe) {
    const st = S(), n = turnsN();
    const order = store.plan.order();
    gridTitle.textContent = t('plan.adv.sec.grid', { n });
    grid.style.setProperty('--n', String(n));
    grid.style.setProperty('--rows', String(order.length));
    grid.setAttribute('aria-label', t('plan.grid.aria', { n: order.length, turns: n }));
    grid.setAttribute('aria-rowcount', String(order.length + 1));
    undoBtn.disabled = !store.pins.canUndo();
    clearBtn.disabled = !pinCount(st.pins) && !Object.keys(st.locked || {}).length;
    lockAllBtn.disabled = !probe;
    if (!order.length) { grid.replaceChildren(); prioLine.hidden = true; showMsg(t('plan.pv.empty')); prevCells = null; return; }
    const ignored = new Map();
    if (probe) store.pinsIgnored(probe).forEach((x) => ignored.set(x.pos, new Set(x.turns)));
    const kids = [h('span', { class: 'pg-corner', 'aria-hidden': 'true' })];
    for (let tt = 1; tt <= n; tt++) {
      const locked = Array.isArray(st.locked[tt]);
      const exc = Array.isArray(st.overrides[tt]) && st.overrides[tt].length > 0;
      const label = t(locked ? 'plan.grid.th.locked' : exc ? 'plan.grid.th.exc' : 'plan.grid.th', { turn: tt });
      kids.push(h('button', { class: `pg-th${locked ? ' lock' : ''}${exc ? ' exc' : ''}`, style: `--c:${tt}`, title: label, type: 'button', 'data-cell': `0:${tt}`, 'data-th': String(tt), tabindex: '-1', 'aria-label': label },
        locked ? icon('lock') : h('span', {}, String(tt))));
    }
    const next = new Map(), cellEls = new Map();
    let conflict = false;
    const immune = immuneTurnsOf(st, n);   // 임부언 CD 변동 면역(1번 자리 동료) — 쿨타임 칸 사유
    order.forEach((o, r) => {
      const pos = o.i + 1, meta = st.chars[o.s.id] || {}, apt = meta.actionsPerTurn || 1, name = nameOf(o.s.id);
      // [ADV_REVIEW D1] 행 머리 = 그 동료 줄 메뉴(프리셋 · 이 줄 고정 해제). [D8] 임부언 1번 자리 예외는 툴팁으로.
      const nmTip = [t('plan.grid.row.menu', { name: fullName(o.s.id) })];
      if (isFedCarry(st, pos) && ultOf(o.s).assist && !Object.keys(store.pins.row(pos)).length) nmTip.push(t('plan.row.assist.fedCarry', { name: nameOf(IMBUEON_ID) }));
      kids.push(h('button', { type: 'button', class: 'pg-nm', style: `--r:${r}`, title: nmTip.join('\n'), 'aria-haspopup': 'menu', 'data-row': String(pos),
        'aria-label': t('plan.grid.row.aria', { name: fullName(o.s.id) }) }, h('img', { src: `icons/${o.s.id}.png`, alt: '' }), h('span', {}, name)));
      for (let tt = 1; tt <= n; tt++) {
        const m = cellModel(st, probe, ignored, pos, tt, apt, n);
        if (m.warnIgnored || m.syncAnchor || m.masked) conflict = true;
        const nocd = !m.locked && !store.pins.ultAllowed(tt, pos);
        const lines = [t('plan.pv.cell', { turn: tt, name, acts: actText(m.acts) }) + (m.extra ? ` (${t('plan.pv.cell.extra')})` : '')];
        if (m.pin) lines.push(t('plan.grid.pinned', { act: actText([...m.pin]) }));
        lines.push(t('plan.grid.src', { src: t(`plan.grid.src.${cellSource(st, probe, pos, tt)}`) }));
        if (m.warnIgnored) lines.push(t('plan.grid.ignored', { acts: actText(m.acts) }));
        if (m.syncAnchor) lines.push(t('plan.grid.syncAfter', { anchor: nameOf(st.team[m.syncAnchor - 1].id), name }));
        if (m.masked) lines.push(t('plan.grid.masked', { act: actText([...m.masked]) }));
        if (m.locked) lines.push(t('plan.grid.locked.cell'));
        else if (nocd) lines.push(pos === 1 && immune.has(tt) ? t('plan.grid.immune', { name: nameOf(IMBUEON_ID) }) : t('plan.grid.nocd'));
        const cls = ['pg-c', m.kind, m.pin ? 'pin' : 'rule', m.masked ? 'masked' : '', m.locked ? 'lock' : '', m.extra ? 'x' : '', (m.warnIgnored || m.syncAnchor) ? 'warn' : ''].filter(Boolean).join(' ');
        const key = `${pos}:${tt}`;
        const c = h('button', { class: cls, style: `--r:${r};--c:${tt}`, 'data-pos': String(pos), 'data-t': String(tt), title: lines.join('\n'),
          type: 'button', 'data-cell': `${r + 1}:${tt}`, tabindex: '-1', 'aria-haspopup': 'menu', 'aria-label': lines.join(' · ') },
        h('span', { class: 'pg-ab' }, m.kind === 'none' ? '' : t(`plan.cell.abbr.${m.kind}`)));
        next.set(key, cls); cellEls.set(key, c);
        kids.push(c);
      }
    });
    prioLine.hidden = !conflict;
    const focusKey = roving;
    const hadFocus = grid.contains(document.activeElement);
    grid.replaceChildren(...kids);
    if (prevCells) {
      const keys = [...next.keys()].filter((k) => prevCells.has(k));
      motion.flashChanged(keys.map((k) => cellEls.get(k)), keys.map((k) => prevCells.get(k)), keys.map((k) => next.get(k)));
    }
    prevCells = next;
    const target = (focusKey && grid.querySelector(`[data-cell="${focusKey}"]`)) || grid.querySelector('[data-cell="1:1"]') || grid.querySelector('[data-cell]');
    if (target) { setRoving(target); if (hadFocus) target.focus({ preventScroll: true }); }
    if (probe) pvMsg.hidden = true;
  }
  function showMsg(text, err = false) { pvMsg.hidden = false; pvMsg.classList.toggle('err', err); pvMsg.textContent = text; }
  function setRoving(c) {
    grid.querySelectorAll('[data-cell][tabindex="0"]').forEach((x) => { if (x !== c) x.tabIndex = -1; });
    c.tabIndex = 0;
    roving = c.dataset.cell;
  }
  function onGridKey(e) {
    const c = e.target.closest('[data-cell]'); if (!c) return;
    const [r, tt] = c.dataset.cell.split(':').map(Number);
    const rows = store.plan.order().length, n = turnsN();
    const mob = isMobile();                                 // 모바일은 격자가 전치(행 = 턴)
    let nr = r, nt = tt;
    const k = e.key;
    const right = mob ? 'ArrowDown' : 'ArrowRight', left = mob ? 'ArrowUp' : 'ArrowLeft', down = mob ? 'ArrowRight' : 'ArrowDown', up = mob ? 'ArrowLeft' : 'ArrowUp';
    if (k === right) nt = Math.min(n, tt + 1);
    else if (k === left) nt = Math.max(1, tt - 1);
    else if (k === down) nr = Math.min(rows, r + 1);
    else if (k === up) nr = Math.max(0, r - 1);
    else if (k === 'Home') nt = 1;
    else if (k === 'End') nt = n;
    else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); if (c.dataset.pos && !c.classList.contains('lock')) store.pins.set(+c.dataset.t, +c.dataset.pos, null); return; }
    else return;
    e.preventDefault();
    const nx = grid.querySelector(`[data-cell="${nr}:${nt}"]`);
    if (nx) { setRoving(nx); nx.focus(); }
  }
  function onGridClick(e) {
    const rowBtn = e.target.closest('[data-row]');
    if (rowBtn) { pickRowMenu(rowBtn, +rowBtn.dataset.row); return; }
    const th = e.target.closest('[data-th]');
    if (th) { openTurn(+th.dataset.th); return; }
    const c = e.target.closest('.pg-c'); if (!c) return;
    setRoving(c);
    pickGridCell(c, +c.dataset.pos, +c.dataset.t);
  }
  /** 격자 칸 팝오버: 보통 공격 / 필살기 / 방어 / 고정 해제 / 이 턴 전체 편집 / 이 턴 잠금·해제. 모바일은 바텀시트. */
  function pickGridCell(anchor, pos, tt) {
    const st = S(), slot = st.team[pos - 1]; if (!slot) return;
    const name = nameOf(slot.id);
    const locked = Array.isArray(st.locked[tt]);
    const curPin = locked ? null : store.pins.get(tt, pos);
    const ultOk = locked || store.pins.ultAllowed(tt, pos);
    const apt = (st.chars[slot.id] || {}).actionsPerTurn || 1;
    const set = (a) => keepFocus(() => {
      if (a === ULT && apt === 1) { const msg = pinUltNotice(t, pinUltWithRules(store, pos, tt), name, tt); if (msg) C.toast(msg); return; }   // 동료별 규칙 — core pinUltRow
      store.pins.set(tt, pos, a);
    });
    const cdDef = ((st.chars[slot.id] || {}).cdDefendReduce || 0) > 0;
    const acts = locked ? [] : [
      { label: t('plan.act.atk'), swatch: 'pl-sw-pin-atk', current: curPin === ATK, onSelect: () => set(ATK) },
      { label: t('plan.act.ult'), swatch: 'pl-sw-pin-ult', current: curPin === ULT, disabled: !ultOk,
        reason: ultOk ? (cdDef ? t('plan.pin.defHint') : null) : (pos === 1 && immuneTurnsOf(st, turnsN()).has(tt) ? t('plan.grid.immune', { name: nameOf(IMBUEON_ID) }) : t('plan.grid.nocd')), onSelect: () => set(ULT) },
      { label: t('plan.act.def'), swatch: 'pl-sw-pin-def', current: curPin === DEF, onSelect: () => set(DEF) },
      { label: t('plan.cellSheet.clear'), iconName: 'x', disabled: !curPin, onSelect: () => set(null) },
      'sep',
    ];
    const items = [...acts,
      { label: t('plan.cellSheet.turn'), iconName: 'sliders-horizontal', onSelect: () => openTurn(tt, pos) },
      locked
        ? { label: t('plan.cellSheet.unlock'), iconName: 'lock', onSelect: () => { if (store.pins.unlockTurn(tt)) undoToast(t('plan.te.unlocked', { turn: tt }), () => store.pins.undo()); } }
        : { label: t('plan.cellSheet.lock'), iconName: 'lock', disabled: !lastProbe, onSelect: () => lockTurnNow(tt) },
    ];
    if (locked) items.unshift({ label: t('plan.grid.locked.cell'), disabled: true, onSelect: () => {} }, 'sep');
    cellPicker(C, anchor, { title: t('plan.cellSheet.title', { turn: tt, name }), items, mobile: isMobile(), closeLabel: t('plan.close') });
  }
  /** 1번 자리 동료의 임부언 CD 변동 면역 턴(core immuneFor — 구체화된 편성 기준). 없으면 빈 Set. */
  function immuneTurnsOf(st, n) {
    const eff = store.effectiveTeam();
    return (eff[0] && immuneFor(eff[0], 0, eff, Math.max(30, n), store.env())) || new Set();
  }
  /** ④ 행 머리 메뉴: 그 동료 줄의 프리셋(핀 묶음 교체) · 이 줄 고정 전부 해제. */
  function pickRowMenu(anchor, pos) {
    const st = S(), slot = st.team[pos - 1]; if (!slot) return;
    const name = nameOf(slot.id);
    const items = GRID_PRESETS.filter(([p]) => store.pins.presetAvailable(pos, p)).map(([p, key]) => ({ label: t(key), iconName: 'sparkles',
      disabled: !!presetBlockedByMode(slot, p), reason: presetBlockedByMode(slot, p) ? t('plan.row.preset.asap') : presetTip(t, i18n, p, slot.id), onSelect: () => {
      const tok = store.pins.applyPreset(pos, p);
      if (tok) undoToast(t('plan.row.preset.done', { name, preset: t(key) }), () => store.pins.revert(tok));
    } }));
    const hasRow = Object.keys(store.pins.row(pos)).length > 0;
    items.push('sep', { label: t('plan.grid.row.clear'), iconName: 'x', disabled: !hasRow, onSelect: () => {
      if (store.pins.clearRow(pos)) undoToast(t('plan.mode.clear.done', { name }), () => store.pins.undo());
    } });
    cellPicker(C, anchor, { title: t('plan.grid.row.menu', { name }), items, mobile: isMobile(), closeLabel: t('plan.close') });
  }
  /** 이태호가 임부언에게 받은 추가 행동 칸(그 줄에 고정 칸이 있을 때만 엔진에 실린다 — core fedPayload). */
  function renderFed() {
    const st = S(), n = turnsN();
    const pos = st.team.findIndex((x) => x && taehoFedTurns(x, st.team, n, store.env())) + 1;
    const slot = pos ? st.team[pos - 1] : null;
    if (!slot || !Object.keys(store.pins.row(pos)).length) { fedBox.hidden = true; fedBox.replaceChildren(); return; }
    const eff = store.effectiveTeam();
    const turns = [...(taehoFedTurns(eff[pos - 1], eff, n, store.env()) || [])].filter((x) => x <= n).sort((a, b) => a - b);
    if (!turns.length) { fedBox.hidden = true; fedBox.replaceChildren(); return; }
    const fed = slot.fedActions || {};
    const label = t('plan.grid.fed.title', { name: nameOf(IMBUEON_ID) });
    fedBox.hidden = false;
    fedBox.replaceChildren(h('span', { class: 'plan-label' }, `${nameOf(slot.id)} · ${label}`),
      h('div', { class: 'plan-cells fed', role: 'group', 'aria-label': label }, ...turns.map((tt) => {
        const a = fed[tt] || ATK;
        return h('button', { type: 'button', class: ACT_CLS[a], 'data-fk': `afed:${tt}`, 'aria-label': t('plan.fed.cell.aria', { turn: tt, action: t(ACT_KEY[a]) }),
          onClick: () => keepFocus(() => store.plan.setFed(pos - 1, tt, ACT_CYCLE[a])) }, String(tt));
      })));
  }
  function lockTurnNow(tt) {
    const seq = turnSeqFromProbe(lastProbe, tt);
    if (!seq) return;
    store.pins.lockTurn(tt, seq);
    undoToast(t('plan.te.saved.lock', { turn: tt }), () => store.pins.undo());
  }
  function openTurn(tt, pos) { openTurnEdit(ctx, tt, { probe: lastProbe, pos }); }
  function doUndo() {
    const label = store.pins.undo();
    C.toast(label ? t('plan.undo.done') : t('plan.undo.none'));
  }
  function clearAll() {
    const st = S();
    const prev = { pins: clone(st.pins), locked: clone(st.locked) };
    if (!pinCount(prev.pins) && !Object.keys(prev.locked || {}).length) return;
    store.set({ pins: {}, locked: {} });
    undoToast(t('plan.adv.grid.clear.done'), () => store.set(prev));
  }
  function lockAll() {
    if (!lastProbe) return;
    const n = store.pins.lockAllFromProbe(lastProbe);
    undoToast(t('plan.te.lockAll.done', { n }), () => store.pins.undo());
  }

  // ── 프로브(격자용) ─────────────────────────────────────────────────────────
  let probeSeq = 0, probeTimer = 0;
  function schedule() {
    clearTimeout(probeTimer);
    grid.classList.add('loading'); grid.setAttribute('aria-busy', 'true');
    probeTimer = setTimeout(runProbe, PROBE_DEBOUNCE);
  }
  async function runProbe() {
    const my = ++probeSeq;
    const done = () => { if (my === probeSeq) { grid.classList.remove('loading'); grid.removeAttribute('aria-busy'); } };
    if (!S().team.some(Boolean)) { lastProbe = null; renderGrid(null); done(); return; }
    try {
      const r = await api.probe(store.buildCfg({ mode: 'probe' }));
      if (my !== probeSeq) return;
      if (!r || r.error) throw new Error((r && r.error) || 'probe');
      lastProbe = r;
      store.set({ probe: r }, { silent: true });
      keepFocus(() => renderGrid(r));
      probeSubs.forEach((f) => { try { f(r); } catch (err) { console.error('[advanced] probe sub', err); } });
    } catch (err) {
      if (my !== probeSeq) return;
      showMsg(t('plan.pv.error', { message: (err && err.message) || '' }), true);
    } finally { done(); }
  }

  function refresh() {
    keepFocus(() => {
      renderHead();
      renderStart();
      mountPlan();
      renderSync(); renderGrid(lastProbe); renderFed();
    });
  }

  refresh();
  schedule();
  const condKey = (s) => { const c = s.cond; return [c.turns, c.hp10, c.dummies, c.enemyHits, c.dummyElement, c.incomingOn, c.incomingPct].join('|'); };
  const onChange = () => { refresh(); schedule(); };
  unsubs.push(
    store.subscribe((s) => s.team, onChange),
    store.subscribe(condKey, onChange),
    store.subscribe((s) => s.sync, onChange),
    store.subscribe((s) => s.overrides, onChange),
    store.subscribe((s) => s.altar, onChange),
    store.subscribe((s) => s.pins, onChange),
    store.subscribe((s) => s.locked, onChange),
    store.subscribe((s) => s.tdmg, schedule),
    store.subscribe((s) => s.chars, onChange));
  if (!scoped) unsubs.push(onAdvChange(onChange));
  if (typeof matchMedia === 'function') {
    const mq = matchMedia(MOBILE_MQ);
    const onMq = () => { if (isOn()) renderGrid(lastProbe); };
    mq.addEventListener('change', onMq);
    unsubs.push(() => mq.removeEventListener('change', onMq));
  }
  return () => { clearTimeout(probeTimer); probeSeq++; unmountPlan(); unsubs.forEach((u) => { try { u && u(); } catch { /* noop */ } }); };
}

/** 창 내용을 그리다 실패하면 빈 창 대신 오류를 보여 준다(기기별 브라우저 문제를 사용자가 캡처해 알릴 수 있게). */
function showFail(host, err) {
  console.error('[advanced]', err);
  const msg = String((err && (err.stack || err.message)) || err).split('
').slice(0, 3).join('
');
  host.replaceChildren(Object.assign(document.createElement('pre'), { className: 'adv-fail', textContent: `고급 설정을 불러오지 못했습니다.
${navigator.userAgent}
${msg}` }));
}
