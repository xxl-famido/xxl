// ui/plan · ui/turn-edit 공용 보조. 위쪽은 순수 계산(core 이관 후보 — core/README.md 하단 참고), 아래쪽 sortable 만 DOM.
import {
  defaultPlan, syncGroupOf, normalizeSyncGroups, applySyncPreset, adoptLegacyPlans, makeEnv, sortPins, sortLocked,
  ultOf, cdProcSources, syncPayloadOf, ffat, fcd, assistPulls, lineFromPins, pinUltRow, withPinsRow, pinsRowOf,
} from '../core/plan.js';
import { HOLD_ULT_IDS, IMBUEON_ID } from '../core/format.js';
import { createStore } from '../core/store.js';

/** 엔진 행동 토큰 → 화면 칸 클래스·문구 키 조각. */
export const ACT_CLS = Object.freeze({ '평': 'atk', '궁': 'ult', '방': 'def' });   // copy-lint-allow (엔진 토큰)
export const ACT_KEY = Object.freeze({ '평': 'plan.act.atk', '궁': 'plan.act.ult', '방': 'plan.act.def' });   // copy-lint-allow

/**
 * '자동' 옵션에 붙일 기본 필살기 턴(앞 3개, 예 "4·7·10"). 기본 필살기가 없으면 ''.
 * slot 을 주면 성공 가정이 당기는 리듬을 보인다(자동 + 성공 가정 + 쿨감 제단 → "3·6·9", FEEDBACK_CASES #27).
 */
export function autoUltTurns(meta, n, env, max = 3, slot = null) {
  if (!meta) return '';
  const apt = meta.actionsPerTurn || 1;
  if (slot && assistPulls(slot, meta, env)) {
    const line = lineFromPins(slot, {}, n, env, { always: true }) || [];
    const out = [];
    for (let t = 1; t <= Math.min(n, line.length) && out.length < max; t++) if (line[t - 1] === '궁') out.push(t);   // copy-lint-allow
    return out.join('·');
  }
  // 필살기를 아끼는 동료(마타야): defaultPlan 은 궁이 없지만 엔진의 핀 없는 규칙은 '준비되면 쓴다' — 그 턴을 보인다(ADV_AUDIT 모순 1)
  if (apt === 1 && !meta.singleUlt && HOLD_ULT_IDS.has(meta.id)) {
    const out = [];
    for (let t = ffat(meta, env); t <= n && out.length < max; t += Math.max(1, fcd(meta, env))) out.push(t);
    return out.join('·');
  }
  const p = defaultPlan(meta, Math.max(1, n), env);
  const out = [];
  for (let t = 0; t < n && out.length < max; t++) {
    for (let k = 0; k < apt; k++) if (p[t * apt + k] === '궁') { out.push(t + 1); break; }   // copy-lint-allow
  }
  return out.join('·');
}

/** 예외 턴을 같은 순서끼리 묶는다 → [{ turns:[…], order:[pos…] }] (첫 턴 오름차순). */
export function groupExceptions(overrides, maxTurn) {
  const map = new Map();
  Object.keys(overrides || {}).map(Number).filter((t) => t >= 1 && t <= maxTurn && Array.isArray(overrides[t]) && overrides[t].length)
    .sort((a, b) => a - b)
    .forEach((t) => {
      const k = JSON.stringify(overrides[t]);
      if (!map.has(k)) map.set(k, { turns: [], order: [...overrides[t]] });
      map.get(k).turns.push(t);
    });
  return [...map.values()];
}

/** 프로브의 한 턴 seq 에서 자리 pos 의 행동 목록. */
export const actsOf = (probe, t, pos) => (((probe && probe.plan && probe.plan[String(t)]) || {}).seq || []).filter((e) => e.p === pos).map((e) => e.a);

/** 미리보기 칸 클래스: 턴당 행동 수를 넘으면 추가 행동, 아니면 필살기 > 방어 > 보통 공격. 행동이 없으면 ''. */
export function cellClass(acts, apt = 1) {
  if (!acts.length) return 'none';
  if (acts.length > apt) return 'extra';
  if (acts.includes('궁')) return 'ult';   // copy-lint-allow
  if (acts.includes('방')) return 'def';   // copy-lint-allow
  return 'atk';
}

/**
 * 한 칸(동료·턴)에서 한 행동들을 실행 순서대로 조각으로 — [{ a, cls, extra }]. 턴당 행동 수(apt)를 넘는 행동 = 추가 행동
 * (임부언·욱영이 준 행동, 불굴·도장 확률로 이어진 행동). 이태호처럼 턴당 2회인 동료는 두 번째 행동까지가 자기 행동이다.
 */
export const actSegs = (acts, apt = 1) => (acts || []).map((a, k) => ({ a, cls: ACT_CLS[a] || 'atk', extra: k >= apt }));
/**
 * 대각선 분할 칸(한 턴 여러 행동 — 실행 미리보기 · ④ 격자, CSS 클래스 dsplit)의 인라인 배경. 직접 지정 줄의 이태호 칸과 같은 모양.
 * 왼쪽 위부터 실행 순서로 대각선 띠(띠 색 = var(--pc-<행동>) — 화면마다 CSS 가 정한다) + 띠 경계의 가는 선(var(--ds-line))
 * + 추가 행동 띠가 닿는 아래 변에 막대(두께 var(--ds-bar)). 띠 경계 u = x/w + y/h 가 그라디언트(to bottom right) 위치의 2배라
 * k 번째 경계 = k/n, 첫 추가 행동 띠 e 부터가 아래 변에 닿는 구간 = 오른쪽 1 − max(2e/n − 1, 0). 조각이 1개 이하면 ''.
 */
export function splitStyle(segs) {
  const n = (segs || []).length;
  if (n < 2) return '';
  const pct = (x) => `${+(x * 100).toFixed(3)}%`;
  const bands = [], lines = [];
  segs.forEach((s, k) => {
    const c = `var(--pc-${s.cls})`;
    bands.push(`${c} ${k ? `calc(${pct(k / n)} + .4px)` : '0%'}`, `${c} ${k < n - 1 ? `calc(${pct((k + 1) / n)} - .4px)` : '100%'}`);
    if (k) lines.push(`transparent calc(${pct(k / n)} - .6px)`, `var(--ds-line) ${pct(k / n)}`, `transparent calc(${pct(k / n)} + .6px)`);
  });
  const img = [`linear-gradient(to bottom right, ${lines.join(', ')})`, `linear-gradient(to bottom right, ${bands.join(', ')})`];
  const size = ['auto', 'auto'], at = ['0 0', '0 0'];
  const firstExtra = segs.findIndex((s) => s.extra);
  if (firstExtra >= 0) {
    img.unshift('linear-gradient(var(--text-primary), var(--text-primary))');
    size.unshift(`${pct(1 - Math.max(2 * firstExtra / n - 1, 0))} var(--ds-bar, 3px)`);
    at.unshift('right bottom');
  }
  // 반복 없음도 인라인으로 — 칸 기본 규칙(.pv-cells i · .pg-c)의 background 단축 속성이 repeat 로 되돌린다
  return `background-image:${img.join(',')};background-size:${size.join(',')};background-position:${at.join(',')};background-repeat:no-repeat`;
}
/** 대각선 띠 k(0부터) 가운데 위치(칸 너비·높이에 대한 비율) — ④ 모바일 글자를 그 띠 안에 둔다. */
export const splitCenter = (k, n) => +((2 * k + 1) / (2 * n)).toFixed(4);
/** 조각 비교용 문자열(바뀐 칸 반짝임). */
export const segsKey = (segs) => segs.map((s) => `${s.cls}${s.extra ? '+' : ''}`).join(' ');
/** 칸 설명 문구: '보통 공격 → 필살기(추가 행동)'. 행동이 없으면 '행동 없음'. */
export function actsLabel(t, acts, apt = 1) {
  if (!acts || !acts.length) return t('plan.pv.cell.none');
  return actSegs(acts, apt).map((s) => { const x = t(ACT_KEY[s.a] || 'plan.act.atk'); return s.extra ? t('plan.act.extra.tag', { act: x }) : x; }).join(' → ');
}

/**
 * 칸을 정한 곳(1차 근사 — 엔진이 칸별 출처를 주지 않는다): 잠긴 턴 > 고정 칸 > 맞추기(따라가는 동료가 기준 동료 필살기 턴에 한 행동)
 * > 예외 턴(그 턴 순서) > 규칙(순서·필살기 방식). → 'locked'|'pin'|'sync'|'exc'|'rule'
 */
export function cellSource(state, probe, pos, t) {
  if (state.locked && Array.isArray(state.locked[t]) && t <= +state.cond.turns) return 'locked';
  if (state.pins && state.pins[t] && state.pins[t][pos]) return 'pin';
  const g = syncGroupOf(state.sync, pos);
  if (g && g.role === 'member' && actsOf(probe, t, g.g.anchor).includes('궁')) return 'sync';   // copy-lint-allow
  const ov = state.overrides && state.overrides[t];
  if (Array.isArray(ov) && ov.length) return 'exc';
  return 'rule';
}

/**
 * 맞추기 '뒤에서 필살기' 함정: 따라가는 동료가 추가 행동을 주는 기준 동료(임부언·욱영) 뒤에서 행동하면 받은 추가 행동이 없다.
 * 그 턴에 기준 동료가 필살기를 썼고, 이 동료가 턴당 행동 수를 넘는 행동(= 추가 행동)을 받지 못했으면 기준 동료 자리를 돌려준다. 아니면 0.
 */
export function syncAfterNoExtra(state, probe, pos, t, apt = null) {
  const g = syncGroupOf(state.sync, pos);
  if (!g || g.role !== 'member' || !g.g.anchor) return 0;
  const m = g.m || (g.g.members || []).find((x) => x.p === pos) || {};
  if (m.base === 'defend' || m.base === 'basic' || m.order !== 'after') return 0;
  const anchor = state.team[g.g.anchor - 1];
  const am = anchor && state.chars[anchor.id];
  if (!am || !am.grantsExtra) return 0;
  if (!actsOf(probe, t, g.g.anchor).includes('궁')) return 0;   // copy-lint-allow
  const me = state.team[pos - 1];
  const n = apt || ((me && state.chars[me.id]) || {}).actionsPerTurn || 1;   // apt = 도장 잠금해제를 반영한 턴당 행동 수(호출부 env)
  return actsOf(probe, t, pos).length > n ? 0 : g.g.anchor;
}

/**
 * 동료별 '성공 가정' 체크를 켤 수 있는가. [2026-09-28 사용자 결정] 성공 가정은 확률이므로 사용자가 켜고 끈다 —
 * 확률 CD 감소 제단(1012·1013)이 이 동료에게 적용되면 방식(자동·정해진 턴만)·고정 여부와 관계없이 켤 수 있다.
 * 전에는(ADV_AUDIT 모순 4) 고정 칸·맞추기·잠긴 턴이 없으면 'noPlan' 으로 막았다 — 이제 자동 동료도 core 가 당겨진 리듬의 줄을 보내
 * 엔진이 가정을 쓴다(core/plan.js assistFirstUlt·effectiveTeam). 예외: '준비되면 바로'는 엔진이 가정을 쓰지 않는다(engine.py
 * cd_assist = … and ult_mode != 'asap'), 전투당 1회 필살기(제토)는 확률 CD 감소 대상이 아니다.
 * → { live, reason: null|'asap'|'noAltar'|'single' } (pos 1-based)
 */
export function assistEffect(st, pos, env) {
  const s = st.team[pos - 1];
  if (!s) return { live: false, reason: 'noAltar' };
  const meta = st.chars[s.id] || {};
  if (meta.singleUlt) return { live: false, reason: 'single' };
  if (!cdProcSources(meta, env).length) return { live: false, reason: 'noAltar' };
  if (ultOf(s).mode === 'asap') return { live: false, reason: 'asap' };
  return { live: true, reason: null };
}
/** [ADV_REVIEW D8] 임부언이 추가 행동을 주는 1번 자리 동료(fed carry)인가 — core effectiveTeam 이 핀 없이는 당기지 않는 예외. pos 1-based. */
export function isFedCarry(st, pos) {
  const s = st.team[pos - 1];
  return pos === 1 && !!s && s.id !== IMBUEON_ID && st.team.some((x) => x && x.id === IMBUEON_ID);
}
/** [모순 4] '방어 턴 유지'가 엔진에서 쓰이는가: '준비되면 바로' 또는 맞추기 멤버(엔진 slot_ok). 자동·정해진 턴만은 방어 칸을 항상 지킨다. */
export function keepDefEffect(st, pos) {
  const s = st.team[pos - 1];
  if (!s) return false;
  if (ultOf(s).mode === 'asap') return true;
  return (syncPayloadOf(st.sync) || []).some((g) => g.members.some((m) => m.p === pos));
}
/** [모순 6] 욱영 프리셋을 적용하면 지금 있는 (유효한) 맞추기 그룹이 바뀌거나 사라지는가. */
export function ukPresetOverwrites(groups, team) {
  const r = applySyncPreset(groups, team || [], 'uk');
  if (!r.ok) return false;
  const after = new Set(r.groups.map((g) => JSON.stringify(g)));
  return (syncPayloadOf(groups) || []).some((g) => !after.has(JSON.stringify(g)));
}

/**
 * 칸을 '필살기'로 고정(메인 직접 지정 칸 · 고급 ④ 격자 공용). 동료별 규칙은 core pinUltRow:
 * 방어로 CD 가 주는 동료(모이루·히토하)는 앞 턴 방어 자동 배치, 전투당 1회(제토)는 다른 필살기 고정 해제.
 * 되돌리기 스택에는 한 번만 쌓인다(pins.set 이 직전 상태를 저장한 뒤 같은 동료 줄을 통째로 바꾼다).
 * → { status, reason?, defs? } — 'impossible' 이면 아무것도 바꾸지 않는다. pos·turn 1-based.
 */
export function pinUltWithRules(store, pos, turn) {
  const st = store.get();
  const slot = st.team[pos - 1];
  if (!slot) return { status: 'noop' };
  if (store.pins.get(turn, pos) === '궁') return { status: 'noop' };   // copy-lint-allow (엔진 토큰)
  const r = pinUltRow(slot, pos - 1, st.team, st.pins, +st.cond.turns, turn, store.env());
  if (r.status === 'impossible') return r;
  store.pins.set(turn, pos, '궁');   // copy-lint-allow (엔진 토큰) — 되돌리기 한 칸
  if (r.row) store.set({ pins: withPinsRow(store.get().pins, pos, r.row) });
  return r;
}

/**
 * 예외 턴 순서의 위험(CHAR_SPECIALS §조합): 아군 보통 공격으로 쌓인 스택을 방어로 써서 CD 를 줄이는 동료(cdDefendPerStack — 모이루)가
 * 그 턴에 다른 동료보다 먼저 행동하면 뒤 동료의 보통 공격이 그 턴 방어에 반영되지 않는다(엔진 규칙). 플래너의 CD 모델은
 * '아군 뒤에 행동'을 가정하므로, 방어를 고정해 둔 그런 동료가 예외 턴에서 앞에 오면 id 를 돌려준다(UI 가 경고). order = 자리 배열.
 */
export function stackOrderRisk(st, order) {
  const ids = [];
  (order || []).forEach((p, k) => {
    const s = st.team[p - 1]; if (!s) return;
    const meta = (st.chars || {})[s.id] || {};
    if (!(meta.cdDefendPerStack > 0)) return;
    const after = order.slice(k + 1).some((q) => q !== p && st.team[q - 1]);
    const hasDef = Object.values(pinsRowOf(st.pins, p)).some((v) => String(v).includes('방'));   // copy-lint-allow (엔진 토큰)
    if (after && hasDef) ids.push(s.id);
  });
  return ids;
}

/**
 * 프리셋이 지금 필살기 방식에서 효과가 없는가: '준비되면 바로'는 고정한 보통 공격보다 필살기를 먼저 쓴다(엔진 규칙 — 방어 고정만 지킴)
 * → 보통 공격 칸으로 필살기를 미루는 3턴마다 프리셋은 무시된다. → 'asap' | null
 */
export function presetBlockedByMode(slot, p) {
  return slot && ultOf(slot).mode === 'asap' && (p === 'ult3' || p === 'ult3def') ? 'asap' : null;
}

/** pinUltWithRules 결과 → 토스트 문구(알릴 것이 없으면 null). */
export function pinUltNotice(t, r, name, turn) {
  if (!r) return null;
  if (r.status === 'impossible') return t(`plan.pin.impossible.${r.reason || 'cd'}`, { name, turn });
  if (r.status === 'defended') return t('plan.pin.defended', { name, turn, turns: turnsText(r.defs || []) });
  if (r.status === 'single') return t('plan.pin.single', { name, turn });
  return null;
}
/**
 * 프리셋 버튼·메뉴 툴팁: 동료별 근거 문구(plan.turn.preset.tip.<프리셋>.<id>)가 있으면 그것, 없으면 프리셋 공통 문구.
 * has 가 없는 i18n(테스트 등)이면 공통 문구.
 */
export function presetTip(t, i18n, p, id) {
  const own = `plan.turn.preset.tip.${p}.${id}`;
  return i18n && typeof i18n.has === 'function' && i18n.has(own) ? t(own) : t(`plan.turn.preset.tip.${p}`);
}

/** 두 순서의 동료별 행동 목록이 같은가(순서만 다른가). */
export function sameActs(a, b) {
  const by = (seq) => { const m = {}; (seq || []).forEach((e) => { (m[e.p] = m[e.p] || []).push(e.a); }); return m; };
  const x = by(a), y = by(b);
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of keys) if ((x[k] || []).join('') !== (y[k] || []).join('')) return false;
  return true;
}
/** 순서(seq)에서 처음 나오는 자리 순 + 빠진 자리(present)를 뒤에. 예외 턴 순서용. */
export function orderOfSeq(seq, present) {
  const out = [];
  (seq || []).forEach((e) => { if (!out.includes(e.p) && present.includes(e.p)) out.push(e.p); });
  present.forEach((p) => { if (!out.includes(p)) out.push(p); });
  return out;
}
export const sameSeq = (a, b) => (a || []).length === (b || []).length && (a || []).every((e, k) => e.p === b[k].p && e.a === b[k].a);

/** 맞추기 행동 select 값 ↔ 멤버 필드. */
export const syncActionOf = (m) => (m.base === 'defend' ? 'defend' : m.base === 'basic' ? 'basic' : m.order === 'after' ? 'after' : 'before');

/**
 * 욱영 프리셋 그룹(메인 욱영 행 '아군 필살기 나중' 체크 = v1 이 만든 라이트 맞추기): store.sync.preset('uk') 가 만드는 정확한 형태
 * (기준 = 욱영, 멤버 = 인접 자리 전부, order before · base basic · 평소 기본, miss wait)와 일치하는 그룹 index. 없으면 -1.
 */
export function ukPresetIndex(groups, team) {
  const r = applySyncPreset([], team || [], 'uk');
  if (!r.ok || !r.groups.length) return -1;
  const key = (g) => JSON.stringify({ a: g.anchor, miss: g.miss, m: [...g.members].sort((x, y) => x.p - y.p).map((m) => [m.p, m.order, m.base || '', m.other || '']) });
  const want = key(r.groups[0]);
  return normalizeSyncGroups(groups).findIndex((g) => key(g) === want);
}
/** 욱영 프리셋 그룹을 뺀 맞추기(딥으로 세는 그룹만). */
export const deepSyncGroups = (groups, team) => { const k = ukPresetIndex(groups, team); return normalizeSyncGroups(groups).filter((_, i) => i !== k); };

/** 맞추기 그룹 gi 에서 member 자리 from → to 교체(설정 유지). → 새 groups */
export function replaceSyncMember(groups, gi, from, to) {
  const gs = JSON.parse(JSON.stringify(normalizeSyncGroups(groups)));
  const g = gs[gi]; if (!g) return gs;
  const m = g.members.find((x) => x.p === from);
  if (m) m.p = to; else g.members.push({ p: to, order: 'before' });
  return normalizeSyncGroups(gs);
}

/** 맞추기에 쓰인 자리(그룹 gi 제외). */
export function syncUsedExcept(groups, gi) {
  const used = new Set();
  normalizeSyncGroups(groups).forEach((g, k) => { if (k === gi) return; if (g.anchor) used.add(g.anchor); g.members.forEach((m) => used.add(m.p)); });
  return used;
}

export { shortName } from '../core/format.js';

/** 턴 목록 표기(12개 넘으면 앞 12개 + …). */
export function turnsText(turns, max = 12) {
  const s = [...turns].sort((a, b) => a - b);
  return s.length > max ? s.slice(0, max).join('·') + '…' : s.join('·');
}

// ── DOM: 도움말 버튼(설명은 툴팁 — DESIGN_PRINCIPLES 6 · ADV_REVIEW #1·#2·#6·#9) ─────────────────────────
/**
 * 조건 패널과 같은 '?' 도움말 버튼(components.tooltip — hover·focus·탭). 화면 읽기용으로 aria-description 에도 같은 문장.
 * 목록을 다시 그려 버튼이 DOM 에서 빠지면 떠 있던 툴팁도 닫는다(mouseleave 가 오지 않는 경우).
 */
export function helpTip(C, text, aria) {
  const b = C.h('button', { type: 'button', class: 'help', 'aria-label': aria, 'aria-description': text }, '?');
  const tip = C.tooltip(b, text);
  let iv = 0;
  const watch = () => {
    clearInterval(iv);
    iv = setInterval(() => { if (!b.isConnected) { tip.hide(); clearInterval(iv); } }, 400);
  };
  const stop = () => clearInterval(iv);
  b.addEventListener('mouseenter', watch); b.addEventListener('focus', watch); b.addEventListener('click', watch);
  b.addEventListener('mouseleave', stop); b.addEventListener('blur', stop);
  return b;
}

// ── DOM: 포인터 드래그 정렬(마우스 = 4px 이동으로 시작, 터치 = 길게 누르기 350ms) ───────────────
const INTERACTIVE = 'button, select, input, textarea, a, label, [data-nodrag]';
/**
 * list 의 직계 자식 중 [data-sort] 인 항목을 끌어서 순서를 바꾼다. 놓으면 onMove(from, to) (항목 index).
 * 끄는 동안은 DOM 만 움직이고(형제는 FLIP), 상태 반영은 onMove 가 한다. 반환: 해제 함수.
 */
export function sortable(list, { onMove, reduced = () => false, duration = 200 } = {}) {
  let drag = null;
  const items = () => [...list.children].filter((el) => el.dataset.sort != null);
  const cleanup = () => {
    if (!drag) return;
    clearTimeout(drag.timer);
    drag.el.classList.remove('dragging');
    drag.el.style.transform = '';
    list.classList.remove('sorting');
    window.removeEventListener('pointermove', onMoveEv);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('touchmove', blockScroll, { passive: false });
    drag = null;
  };
  const blockScroll = (e) => { if (drag && drag.active) e.preventDefault(); };
  const activate = () => {
    if (!drag) return;
    drag.active = true;
    drag.el.classList.add('dragging');
    list.classList.add('sorting');
    if (navigator.vibrate && drag.touch) { try { navigator.vibrate(10); } catch { /* 무시 */ } }
  };
  const onDown = (e) => {
    if (e.button > 0) return;
    const el = e.target.closest('[data-sort]');
    const blocker = e.target.closest(INTERACTIVE);   // 컨트롤 위에서는 끌지 않는다 — 단 손잡이([data-handle])는 끌기용
    if (!el || el.parentElement !== list || (blocker && blocker !== el && !blocker.hasAttribute('data-handle'))) return;
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    drag = { el, touch, active: false, x0: e.clientX, y0: e.clientY, top0: el.offsetTop, from: items().indexOf(el), timer: 0 };
    if (touch) drag.timer = setTimeout(activate, 350);
    window.addEventListener('pointermove', onMoveEv);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    document.addEventListener('touchmove', blockScroll, { passive: false });
  };
  const onMoveEv = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.active) {
      if (drag.touch) { if (Math.hypot(dx, dy) > 8) cleanup(); return; }   // 누르기 전에 움직이면 스크롤로 본다
      if (Math.hypot(dx, dy) < 4) return;
      activate();
    }
    e.preventDefault();
    const el = drag.el;
    const cur = items();
    const center = drag.top0 + dy + el.offsetHeight / 2;
    let to = 0;
    cur.forEach((sib) => { if (sib !== el && center > sib.offsetTop + sib.offsetHeight / 2) to++; });
    const now = cur.indexOf(el);
    if (to !== now) {
      const sibs = cur.filter((x) => x !== el);
      const before = new Map(sibs.map((s) => [s, s.getBoundingClientRect().top]));
      const ref = sibs[to] || null;
      if (ref) list.insertBefore(el, ref); else list.append(el);
      if (!reduced()) sibs.forEach((s) => {
        const d = before.get(s) - s.getBoundingClientRect().top;
        if (d) s.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration, easing: 'cubic-bezier(0.2,0,0,1)' });
      });
    }
    el.style.transform = `translateY(${drag.top0 + dy - el.offsetTop}px)`;
  };
  const onUp = () => {
    if (!drag) return;
    const { el, from, active } = drag;
    const to = items().indexOf(el);
    cleanup();
    if (active) { justDragged = true; setTimeout(() => { justDragged = false; }, 0); }
    if (active && to !== from && to >= 0) onMove && onMove(from, to);
  };
  const onCancel = () => {
    if (!drag) return;
    const { el, from } = drag;
    const cur = items();
    cleanup();
    const ref = cur.filter((x) => x !== el)[from] || null;       // 원래 자리로
    if (ref) list.insertBefore(el, ref); else list.append(el);
  };
  // 끄는 중 클릭(드래그 끝의 click)이 버튼을 누르지 않게
  let justDragged = false;
  const onClickCap = (e) => { if (justDragged || list.classList.contains('sorting')) { e.stopPropagation(); e.preventDefault(); } };
  list.addEventListener('pointerdown', onDown);
  list.addEventListener('click', onClickCap, true);
  list.addEventListener('contextmenu', (e) => { if (drag && drag.touch) e.preventDefault(); });
  return () => { cleanup(); list.removeEventListener('pointerdown', onDown); list.removeEventListener('click', onClickCap, true); };
}

// ── DOM: 칸 선택 팝오버(데스크톱 = components.menu 모양, 모바일 = 바텀시트) ─────────────────────────
let openPick = null;
/**
 * 칸 하나의 행동을 고르는 팝오버. items = [{ label, swatch?(범례 클래스), iconName?, current?, disabled?, reason?, danger?, onSelect } | 'sep'
 *   | { row: 줄 이름, note?, choices: [위와 같은 항목…] }].
 * row = 한 턴에 여러 번 행동하는 칸에서 행동 하나를 한 줄로(이름 + 평타·필살·방어 버튼) — 줄마다 고르고, note 는 줄 아래 작은 안내.
 * 키보드: 열리면 현재 값(없으면 첫 항목)에 포커스, 위아래·좌우 화살표·Home·End 로 이동, Enter/Space 선택, Esc 닫고 칸으로 복귀.
 * 모바일(opts.mobile)은 같은 항목을 바텀시트로. → 닫기 함수
 */
export function cellPicker(C, anchor, { title, items, mobile = false, closeLabel = 'close' }) {
  const { h, icon } = C;
  if (openPick) { openPick(); openPick = null; }
  const flat = [], rows = [];   // flat = 메뉴 항목(줄의 버튼도 펼쳐서), rows = 줄마다 { label, note, start, n } (start = 버튼 순번)
  let nBtn = 0;
  items.forEach((it) => {
    if (it === 'sep') { flat.push('sep'); return; }
    if (it && it.row != null) {
      rows.push({ label: it.row, note: it.note || null, start: nBtn, n: it.choices.length });
      it.choices.forEach((c) => flat.push({ ...c, inRow: true }));
      nBtn += it.choices.length;
      return;
    }
    flat.push(it); nBtn++;
  });
  const list = flat.filter((x) => x !== 'sep');
  if (mobile) {
    let sheet = null;
    const opt = (it) => h('button', { type: 'button', class: `btn ${it.danger ? 'btn-ghost' : 'btn-secondary'} pl-opt${it.current ? ' on' : ''}`, disabled: !!it.disabled,
      'aria-pressed': it.current != null ? String(!!it.current) : null, title: it.reason || null, onClick: () => { sheet.close(); it.onSelect(); } },
    it.swatch ? h('i', { class: it.swatch, 'aria-hidden': 'true' }) : it.iconName ? icon(it.iconName) : null, h('span', {}, it.label));
    const body = h('div', { class: 'pl-cellsheet' }, ...items.flatMap((it) => {
      if (it === 'sep') return [];
      if (it && it.row != null) return [h('div', { class: 'pl-sheet-row', role: 'group', 'aria-label': it.row },
        h('span', { class: 'pl-sheet-rl' }, it.row), h('div', { class: 'pl-sheet-seg' }, ...it.choices.map(opt))),
      it.note ? h('p', { class: 'hint' }, it.note) : null];
      return [opt(it), it.disabled && it.reason ? h('p', { class: 'hint' }, it.reason) : null];
    }));
    sheet = C.openSheet({ title, body, ariaLabel: closeLabel });
    return () => sheet.close();
  }
  const ref = C.menu(anchor, flat.map((it) => (it === 'sep' ? 'sep' : { label: it.label, iconName: it.swatch ? null : it.iconName, danger: it.danger,
    onSelect: () => { if (anchor.isConnected) anchor.focus({ preventScroll: true }); it.onSelect(); } })));
  const el = ref.el;
  el.classList.add('pl-pop');
  el.setAttribute('aria-label', title);
  const btns = [...el.querySelectorAll('button')];
  list.forEach((it, k) => {
    const b = btns[k]; if (!b) return;
    if (it.swatch) b.prepend(h('i', { class: `pl-pop-sw ${it.swatch}`, 'aria-hidden': 'true' }));
    if (it.current != null) { b.setAttribute('role', 'menuitemradio'); b.setAttribute('aria-checked', String(!!it.current)); if (it.current) b.classList.add('on'); }
    if (it.disabled) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
    if (it.reason) { b.title = it.reason; if (it.disabled && !it.inRow) b.append(h('small', { class: 'pl-pop-why' }, it.reason)); }
  });
  // 줄: 이름 + 버튼 묶음(버튼은 그대로 옮긴다 — 클릭 처리는 menu 가 붙인 것)
  rows.forEach((r) => {
    const mine = btns.slice(r.start, r.start + r.n);
    if (!mine.length) return;
    const wrap = h('div', { class: 'pl-pop-row', role: 'group', 'aria-label': r.label }, h('span', { class: 'pl-pop-rl' }, r.label));
    mine[0].before(wrap);
    wrap.append(h('span', { class: 'pl-pop-seg' }, ...mine));
    if (r.note) wrap.after(h('small', { class: 'pl-pop-note' }, r.note));
  });
  if (rows.length) el.classList.add('pl-pop-rows');
  const enabled = () => btns.filter((b) => !b.disabled);
  const close = () => { ref.close(); if (openPick === close) openPick = null; };
  el.addEventListener('keydown', (e) => {
    const en = enabled(), i = en.indexOf(document.activeElement);
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (step) { e.preventDefault(); const n = en.length; if (n) en[(i + step + n) % n].focus(); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); const b = e.key === 'Home' ? en[0] : en[en.length - 1]; if (b) b.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); if (anchor.isConnected) anchor.focus({ preventScroll: true }); }
    else if (e.key === 'Tab') { close(); }
  });
  const first = btns.find((b) => b.classList.contains('on') && !b.disabled) || enabled()[0];
  if (first) first.focus();
  openPick = close;
  return close;
}

// ── 줄 유틸: 모두 보통 공격 · 모두 방어 · 패턴 반복 (직접 지정 줄 · ④ 행 메뉴 · 칸 메뉴 공용) ─────────────
/** 「모두 보통 공격」「모두 방어」 — 필살기 칸은 그대로. 되돌리기 알림까지. action = '평'|'방'. */
export function fillRowNow(ctx, pos, action, name) {
  const { store, t, components: C } = ctx;
  const tok = store.pins.fill(pos, action);
  if (!tok) return;
  const key = action === '방' ? 'plan.turn.preset.fillDef' : 'plan.turn.preset.fillAtk';   // copy-lint-allow (엔진 토큰)
  C.toast(t('plan.row.preset.done', { name, preset: t(key) }), { action: { label: t('plan.undo'), fn: () => store.pins.revert(tok) } });
}
/**
 * 패턴 반복 시트: 시작 턴 ~ 끝 턴(기본 1 ~ to)을 고르면 그 구간 행동을 끝 턴 다음부터 마지막 턴까지 같은 순서로 고정한다.
 * to 가 없으면 그 동료 줄의 마지막 고정 칸(없으면 3턴). 쿨타임 판정은 엔진 규칙 그대로(설명 문구에 적는다).
 */
export function openRepeatSheet(ctx, pos, name, to = null) {
  const { store, t, components: C } = ctx;
  const { h } = C;
  const n = Math.max(1, +store.get().cond.turns || 30);
  if (n < 2) return;
  const pinned = Object.keys(store.pins.row(pos)).map(Number).filter((x) => x < n);
  let b = Math.max(1, Math.min(n - 1, to != null ? to : (pinned.length ? Math.max(...pinned) : Math.min(3, n - 1))));
  let a = 1;
  const opts = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, k) => lo + k).map((x) => h('option', { value: String(x) }, t('plan.repeat.turn', { turn: x })));
  const fromSel = h('select', { 'aria-label': t('plan.repeat.from') });
  const toSel = h('select', { 'aria-label': t('plan.repeat.to') });
  const desc = h('p', { class: 'hint' });
  const render = () => {
    fromSel.replaceChildren(...opts(1, n - 1)); fromSel.value = String(a);
    toSel.replaceChildren(...opts(a, n - 1)); toSel.value = String(b);
    desc.textContent = t('plan.repeat.desc', { from: a, to: b, next: b + 1, last: n });
  };
  fromSel.addEventListener('change', () => { a = +fromSel.value; if (b < a) b = a; render(); });
  toSel.addEventListener('change', () => { b = +toSel.value; render(); });
  render();
  const body = h('div', { class: 'repeat-sheet' },
    h('div', { class: 'repeat-range' }, h('label', {}, h('span', {}, t('plan.repeat.from')), fromSel), h('span', { class: 'repeat-dash', 'aria-hidden': 'true' }, '~'),
      h('label', {}, h('span', {}, t('plan.repeat.to')), toSel)), desc);
  let sheet = null;
  const apply = () => {
    const tok = store.pins.repeat(pos, a, b);
    sheet.close();
    if (tok) C.toast(t('plan.repeat.done', { name, from: a, to: b, next: b + 1, last: n }), { action: { label: t('plan.undo'), fn: () => store.pins.revert(tok) } });
  };
  sheet = C.openSheet({ title: t('plan.repeat.title', { name }), body, ariaLabel: t('plan.close'),
    foot: [h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => sheet.close() }, t('plan.exc.sheet.cancel')),
      h('button', { type: 'button', class: 'btn btn-primary', onClick: apply }, t('plan.repeat.apply'))] });
}

// ── 비교군 스코프: 메인 스토어를 건드리지 않는 '작은 스토어' + 시트 세션 ─────────────────────────
// 같은 core/store.js 인스턴스를 메모리 저장소로 하나 더 만들어(woofia_* localStorage 에 쓰지 않음) 패널·편집기를
// 그대로 재사용한다. 프로브는 이 스토어의 buildCfg(mode:'probe') = 스코프 기준.
let baseCtx = null;
/** 메인 ctx 등록(ui/plan.js mount). compare.js 는 ctx 없이 openAdvancedFor 를 부르므로 여기서 꺼낸다. */
export const setBaseCtx = (c) => { baseCtx = c; };
export const getBaseCtx = () => baseCtx || (typeof window !== 'undefined' ? window.__woofia : null) || null;

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}

/**
 * init = { team, turns, sync, overrides, pins, locked, altar, tdmg, chars } → 스코프 스토어를 만든다.
 * 조건(적 수·HP 10% 등)은 메인 값을 쓰고 턴 수만 스코프 값으로 바꾼다. 제단·턴 데미지는 init 에 없으면 메인 값.
 * 읽기 호환: 편성에 v1 직접 계획(usePlan+plan)이 남아 있거나 init.plans(+ init.on = v1 완전 수동)가 오면 핀·잠긴 턴으로 옮긴다.
 */
export function createScopeStore(base, init) {
  const main = base.store.get();
  const chars = init.chars || main.chars;
  const store = createStore({ storage: memStorage(), api: base.api, chars });
  const team0 = (init.team || []).slice(0, 5).map((x) => (x ? clone(x) : null));
  while (team0.length < 5) team0.push(null);
  const turns = Math.max(1, Math.min(30, Math.round(+init.turns || +main.cond.turns || 30)));
  const altar = clone(init.altar || main.altar);
  const { team, pins, locked } = adoptLegacyPlans(team0, { advOn: !!init.on, turnPlans: init.plans || null, turns,
    env: makeEnv({ chars, altar, team: team0 }), pins: sortPins(clone(init.pins || {}) || {}), locked: sortLocked(clone(init.locked || {}) || {}) });
  store.set({
    chars, team, cond: { ...main.cond, turns }, sync: normalizeSyncGroups(clone(init.sync) || []), overrides: clone(init.overrides || {}) || {},
    altar, tdmg: clone(init.tdmg || main.tdmg), pins, locked, probe: null,
  }, { silent: true });
  return store;
}

/**
 * 시트 세션. 공용 openSheet 는 한 번에 하나라 하위 시트(턴 편집·예외 턴·칸 메뉴)를 열면 루트 시트가 닫힌다 →
 * 하위 시트가 '교체 없이' 닫히면 reopen() 으로 루트를 다시 열고, 루트가 닫히면 onEnd(state) 로 세션을 끝낸다.
 * store 는 메인 스토어(고급 설정 창) 또는 스코프 스토어(팀 비교). → { store, ctx(components.openSheet 가 감싸여 있음), opened(), end() }
 */
export function sheetSession(base, store, { onEnd, reopen, scoped = false } = {}) {
  const C = base.components;
  let opening = false, open = 0, ended = false, count = 0;
  const end = () => { if (ended) return; ended = true; try { onEnd && onEnd(store.get()); } catch (err) { setTimeout(() => { throw err; }); } };
  const openSheet = (o) => {
    const isRoot = !!o.root;
    const { root, ...rest } = o;
    opening = true;
    let r;
    try {
      r = C.openSheet({ ...rest, onClose: () => {
        try { if (rest.onClose) rest.onClose(); } finally {
          open--;
          if (!opening && !ended) setTimeout(() => {
            if (open > 0 || ended) return;
            if (!isRoot && reopen) reopen(); else end();
          }, 0);
        }
      } });
    } finally { opening = false; }
    open++; count++;
    return r;
  };
  const ctx = { ...base, store, components: { ...C, openSheet }, scoped };
  return { store, ctx, opened: () => count > 0, end };
}

/** 스코프 시트 세션(팀 비교): 스코프 스토어를 만들고 sheetSession 을 씌운다. */
export function scopeSession(base, init, opts = {}) {
  return sheetSession(base, createScopeStore(base, init), { ...opts, scoped: true });
}
