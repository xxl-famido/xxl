// 팀 비교(시트 sheet-lg) — v1 app.js L607-1378 이식. ARCHITECTURE §7 E.
// 스코프 격리: 비교 팀의 편성·행동 순서·맞추기·고정 칸·잠긴 턴은 전부 이 모듈 안의 사본(st.side.a/b)이다.
// 메인 스토어는 읽기만 한다(기록 목록, 동료 메타, 제단·턴마다 받는 데미지 = 두 팀 공통 적용). 메인 상태는 바꾸지 않는다.
// 차트 색: A = 강조색, B = 중립(회색). 속성색은 쓰지 않는다(동료 구분은 이름·초상).
import { fmt, fmtShort, IMBUEON_ID, DUMMY_EL } from '../core/format.js';
import { buildCompareCfg } from '../core/payload.js';
import { normalizeSyncGroups, swapSyncPositions, teamOrder, adoptLegacyPlans, effectiveTeam, lockedWithin, isFullyLocked, makeEnv, withPinsRow, pinsRowOf } from '../core/plan.js';
import { promoteLegacySpec } from '../core/spec.js';

const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
const HITS = ['0', '1', '2', '3', '4', '5', 'all'];
const SIDES = ['a', 'b'];
// pins = 고정 칸 { 턴: { 자리: 행동 } }, locked = 잠긴 턴 { 턴: [{p, a}] } — 메인 행동 계획과 같은 모양(ARCHITECTURE §9)
const emptySide = () => ({ recId: null, roster: [null, null, null, null, null], turnOv: {}, pins: {}, locked: {}, sync: [], runs: 50, turns: 30 });
/** 1..turns 가 전부 잠겼는가(= 행동 순서를 쓰지 않는 v1 완전 수동 모양). */
const fullyLocked = (s, turns) => { const l = lockedWithin(s.locked, turns); return Object.keys(l).length > 0 && isFullyLocked(l, turns); };
const EMPTY_RESULT = turns => ({ meta: { total: 0, totalMid: 0, runs: 0, turns }, perChar: [], chart: [], team: [], empty: true });

export function install(ctx) {
  ctx.openCompare = (prev) => openCompare(ctx, prev && prev.side ? prev : null);
}

function openCompare(ctx, prev) {
  const { store, api, t, i18n, components: C } = ctx;
  const { h } = C;
  C.ensureStyle('css/compare.css');
  const S = () => store.get();
  const cur = S().cond;
  const st = prev || {
    sel: { a: '', b: '' },
    side: { a: emptySide(), b: emptySide() },
    // 공통 조건은 메인 전투 조건에서 시작한다(v1은 고정 기본값). 비교 화면에서 고쳐도 메인은 그대로.
    common: { forceProc: !!cur.forceProc && !S().altar.on, hp10: !!cur.hp10, dummyElement: +cur.dummyElement, dummies: +cur.dummies,
      enemyHits: String(cur.enemyHits), turns: 30, incomingOn: !!cur.incomingOn, incomingPct: +cur.incomingPct },
    turnsManual: false, manualPos: false,
    data: { a: null, b: null }, pending: false, running: false, error: '', ver: 0, queued: false,
    panel: null,                                    // { type:'pick', side, idx|null } | { type:'order', side }
  };
  const nameOf = id => (i18n.nameOf ? i18n.nameOf(id) : String(id));
  const chars = () => S().chars || {};
  const recOf = id => S().records.find(r => String(r.id) === String(id)) || null;
  const recLabel = r => r.name || r.label || String(r.id);

  // ── 비교 팀 사본 ──
  function loadSide(sd, recId) {
    const side = emptySide();
    const rec = recId ? recOf(recId) : null;
    if (rec && rec.snap) {
      const snap = rec.snap;
      const roster0 = (snap.team || []).slice(0, 5).map(x => (x ? promoteLegacySpec(clone(x)) : null));
      while (roster0.length < 5) roster0.push(null);
      side.runs = +snap.runs || 50; side.turns = +snap.turns || 30;
      // v1 직접 계획 → 고정 칸, v1 완전 수동 → 잠긴 턴(메인 applySnap 과 같은 읽기 호환)
      const env = makeEnv({ chars: chars(), altar: S().altar });
      const { team, pins, locked } = adoptLegacyPlans(roster0, { advOn: !!snap.advOn, turnPlans: snap.turnPlans, turns: side.turns, env, pins: snap.pins, locked: snap.locked });
      side.recId = rec.id; side.roster = team; side.pins = pins; side.locked = locked;
      side.turnOv = clone(snap.turnOverrides || {});
      side.sync = normalizeSyncGroups(clone(snap.sync || (snap.altar && snap.altar.groups) || []));
    }
    st.side[sd] = side;
    st.data[sd] = null;
    st.ver++;
  }
  // 자리의 동료가 바뀌면 그 자리의 고정 칸·잠긴 턴 항목은 이전 동료 기준이 된다 — 조용히 틀리는 대신 지우고 알린다(v1 cmpAdvInvalidate).
  const invalidateAdv = (sd, pos) => {
    const s = st.side[sd];
    const hadPins = Object.keys(pinsRowOf(s.pins, pos)).length > 0;
    const hadLock = Object.values(s.locked || {}).some(seq => seq.some(e => e.p === pos));
    if (!hadPins && !hadLock) return;
    s.pins = withPinsRow(s.pins, pos, {});
    for (const tn of Object.keys(s.locked || {})) s.locked[tn] = s.locked[tn].filter(e => e.p !== pos);
    C.toast(t('cmp.pinsCleared'));
  };
  const dropSyncAt = (sd, pos) => {
    const s = st.side[sd];
    s.sync = normalizeSyncGroups((s.sync || []).filter(g => g.anchor !== pos).map(g => ({ ...g, members: g.members.filter(m => m.p !== pos) }))).filter(g => g.members.length);
  };
  function swapSlots(sd, k, j) {
    const s = st.side[sd], arr = s.roster;
    if ((arr[k] && arr[k].id === IMBUEON_ID && j === 0) || (arr[j] && arr[j].id === IMBUEON_ID && k === 0)) { C.toast(t('cmp.imbueonP1')); return false; }
    [arr[k], arr[j]] = [arr[j], arr[k]];
    const p1 = k + 1, p2 = j + 1, sw = p => (p === p1 ? p2 : p === p2 ? p1 : p);
    for (const tn of Object.keys(s.turnOv)) s.turnOv[tn] = s.turnOv[tn].map(sw);
    for (const tn of Object.keys(s.locked || {})) s.locked[tn] = s.locked[tn].map(e => ({ ...e, p: sw(e.p) }));
    const r1 = pinsRowOf(s.pins, p1), r2 = pinsRowOf(s.pins, p2);
    s.pins = withPinsRow(withPinsRow(s.pins, p1, r2), p2, r1);
    s.sync = swapSyncPositions(s.sync, p1, p2);
    return true;
  }
  const members = sd => st.side[sd].roster.map((x, i) => (x ? { id: x.id, slot: x, idx: i, pos: i + 1, side: sd } : null)).filter(Boolean);
  const dmgOf = (sd, id) => { const d = st.data[sd]; if (!d || st.pending) return null; const c = (d.perChar || []).find(x => x.id === id); return c ? c.damage : (d.empty ? null : 0); };

  // 매칭: 같은 동료 1:1 → 남은 동료는 자리 순 → 단독 (수동이면 자리 순 그대로)
  function pairs() {
    const A = members('a'), B = members('b');
    if (st.manualPos) { const n = Math.max(A.length, B.length); return Array.from({ length: n }, (_, i) => ({ a: A[i] || null, b: B[i] || null })); }
    const rows = [], used = new Set();
    for (const ca of A) {
      const j = B.findIndex((cb, k) => !used.has(k) && cb.id === ca.id);
      if (j >= 0) { rows.push({ a: ca, b: B[j] }); used.add(j); } else rows.push({ a: ca, b: null });
    }
    for (const cb of B.filter((_, k) => !used.has(k))) { const r = rows.find(x => !x.b); if (r) r.b = cb; else rows.push({ a: null, b: cb }); }
    return rows;
  }

  // ── 시트 뼈대 ──
  const root = h('div', { class: 'cmp' });
  const pickRow = h('div', { class: 'cmp-pick' });
  const commonBox = h('details', { class: 'cmp-common' });
  const bar = h('div', { class: 'cmp-bar' });
  const result = h('div', { class: 'cmp-result', 'aria-live': 'polite' });
  root.append(pickRow, commonBox, bar, result);
  const sheet = C.openSheet({ title: t('cmp.title'), body: root, size: 'sheet-lg', ariaLabel: t('common.close') });

  // ── 기록 선택 ──
  function renderPick() {
    const recs = store.records.list();
    pickRow.replaceChildren(...SIDES.map(sd => {
      const sel = h('select', { 'aria-label': t(sd === 'a' ? 'cmp.pick.a' : 'cmp.pick.b') },
        h('option', { value: '' }, t(sd === 'a' ? 'compare.label.groupEmpty' : 'compare.label.groupBEmpty')),
        ...recs.map(r => h('option', { value: String(r.id) }, recLabel(r))));
      sel.value = st.sel[sd];
      sel.addEventListener('change', () => { st.sel[sd] = sel.value; loadSide(sd, sel.value); st.manualPos = false; st.panel = null; run(); renderPick(); });
      const r = st.sel[sd] ? recOf(st.sel[sd]) : null;
      const detail = r ? t('cmp.pick.detail', { turns: r.snap.turns, runs: r.snap.runs, date: new Date(+r.id).toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) })
        : t('cmp.pick.custom');
      return h('div', { class: `cmp-pickcol side-${sd}` },
        h('div', { class: 'cmp-pickhead' }, h('span', { class: `cmp-tag ${sd}` }, sd.toUpperCase()), sel),
        h('p', { class: 'cmp-pickdetail' }, detail));
    }));
  }

  // ── 공통 조건 ──
  function renderCommon() {
    const c = st.common, altarOn = !!S().altar.on;
    const dirty = () => { markDirty(); renderCommonSummary(); };
    const turnsSl = C.slider({ id: 'cmp-turns', min: 1, max: 30, value: c.turns, ariaLabel: t('cond.turns.label'),
      onCommit: v => { c.turns = v; st.turnsManual = true; dirty(); } });
    turnsSl.querySelector('.field-row').prepend(h('label', { for: 'cmp-turns' }, t('cond.turns.label')));
    const proc = C.toggle({ label: t('cond.proc.label'), checked: c.forceProc && !altarOn, onChange: v => { c.forceProc = v; dirty(); } });
    proc.input.disabled = altarOn;
    const hp = C.toggle({ label: t('cond.hp10.label'), checked: c.hp10, onChange: v => { c.hp10 = v; dirty(); } });
    const el = C.segment({ full: true, ariaLabel: t('cond.enemy.element.label'), value: c.dummyElement,
      options: DUMMY_EL.map((k, i) => ({ value: i, el: k, label: k === 'none' ? t('element.none') : h('span', { class: 'seg-el' }, C.dot(k), t(`element.${k}`)) })), onChange: v => { c.dummyElement = +v; dirty(); } });
    const cnt = C.segment({ full: true, ariaLabel: t('cond.enemy.count.label'), value: c.dummies,
      options: [1, 2, 3, 4, 5].map(n => ({ value: n, label: String(n) })), onChange: v => { c.dummies = +v; dirty(); } });
    const hits = C.segment({ full: true, ariaLabel: t('cond.incoming.hits.label'), value: c.enemyHits,
      options: HITS.map(v => ({ value: v, label: v === 'all' ? t('cond.incoming.hits.all') : v })), onChange: v => { c.enemyHits = String(v); dirty(); } });
    const incSw = C.toggle({ label: t('cond.incoming.dmg.label'), checked: c.incomingOn, onChange: v => { c.incomingOn = v; inc.classList.toggle('dim', !v); inc.num.disabled = inc.range.disabled = !v; dirty(); } });
    const inc = C.slider({ id: 'cmp-inc', min: 1, max: 99, value: c.incomingPct, unit: t('cond.unit.hpPct'), ariaLabel: t('cond.incoming.dmg.aria'), onCommit: v => { c.incomingPct = v; dirty(); } });
    inc.querySelector('.field-row').prepend(incSw);
    inc.classList.toggle('dim', !c.incomingOn); inc.num.disabled = inc.range.disabled = !c.incomingOn;
    const field = (label, node) => h('div', { class: 'field' }, h('div', { class: 'field-row' }, h('span', { class: 'label' }, label)), node);
    commonBox.replaceChildren(
      h('summary', {}, h('span', { class: 'acc-title' }, t('compare.label.commonBattleSettings')), h('span', { class: 'acc-sum cmp-csum' }), C.icon('chevron-down', 'ic acc-chev')),
      h('div', { class: 'cmp-cbody' },
        turnsSl,
        h('div', { class: 'cmp-switches' }, proc, hp),
        altarOn && h('p', { class: 'hint' }, t('altar.lock')),
        field(t('cond.enemy.element.label'), el), field(t('cond.enemy.count.label'), cnt), field(t('cond.incoming.hits.label'), hits),
        inc,
        h('p', { class: 'hint' }, t('cmp.shared.note'))));
    renderCommonSummary();
  }
  function renderCommonSummary() {
    const c = st.common, altarOn = !!S().altar.on;
    const box = commonBox.querySelector('.cmp-csum'); if (!box) return;
    const items = [t('cond.runs.sum.turns', { n: c.turns }),
      +c.dummyElement ? C.elTag(DUMMY_EL[+c.dummyElement], t(`element.${DUMMY_EL[+c.dummyElement]}`)) : t('element.none.long'),
      t('cond.enemy.sum.count', { n: c.dummies }),
      c.enemyHits === 'all' ? t('cond.incoming.sum.all') : t('cond.incoming.sum.hits', { n: c.enemyHits })];
    if (c.forceProc && !altarOn) items.push(t('cond.sum.forced'));
    if (c.hp10) items.push(t('cond.sum.hp10'));
    if (c.incomingOn) items.push(t('cond.sum.incoming', { n: c.incomingPct }));
    box.replaceChildren(...items.map(x => h('span', { class: 'kv' }, x)));
  }

  // ── 실행 줄 ──
  function renderBar() {
    const status = st.running ? t('compare.status.reRunningBothTeams') : st.error ? st.error : st.pending ? t('cmp.pending') : '';
    const runBtn = C.button({ tier: 'primary', iconName: 'play', label: t('compare.label.compare'), onClick: () => run() });
    runBtn.classList.add('btn-run');
    if (st.running) { runBtn.classList.add('running'); runBtn.setAttribute('aria-busy', 'true'); }   // 누르면 끝난 뒤 다시 계산(큐)
    bar.replaceChildren(h('span', { class: `cmp-status${st.pending && !st.running ? ' pending' : ''}${st.error ? ' err' : ''}` },
      st.pending && !st.running && C.icon('rotate-ccw'), status), runBtn);
  }
  function markDirty() { st.ver++; st.pending = true; st.error = ''; renderBar(); renderResult(); }

  // ── 결과 ──
  function totalOf(d) { if (!d || d.empty) return 0; const m = d.meta; return m.runs > 1 ? (m.totalMid ?? m.total) : m.total; }
  function renderResult() {
    const A = members('a'), B = members('b');
    if (!A.length && !B.length && !st.panel) {
      result.replaceChildren(C.empty(t('compare.label.pleasePickSomethingCompare')), lane());
      return;
    }
    const ta = totalOf(st.data.a), tb = totalOf(st.data.b);
    const have = !st.pending && st.data.a && st.data.b;
    const mx = Math.max(ta, tb, 1);
    const headCol = sd => {
      const d = st.data[sd], tot = sd === 'a' ? ta : tb, other = sd === 'a' ? tb : ta;
      const win = have && tot > other && other > 0;
      const m = d && d.meta;
      const band = have && m && m.totalFloor != null ? t('cmp.band', { min: fmtShort(m.totalFloor), max: fmtShort(m.totalCeil) }) : '';
      return h('div', { class: `cmp-head side-${sd}` },
        h('div', { class: 'cmp-hh' }, h('span', { class: `cmp-tag ${sd}` }, sd.toUpperCase()),
          h('span', { class: 'cmp-names' }, members(sd).map(x => nameOf(x.id)).join('·') || t('cmp.emptyTeam'))),
        h('p', { class: 'cmp-num' }, have && !d.empty ? fmt(tot) : '—', win && h('span', { class: 'cmp-win' }, C.icon('arrow-up'), `+${pct(tot, other)}%`)),
        h('p', { class: 'cmp-sub' }, have && m && m.runs > 1 ? t('result.headline.median', { runs: m.runs }) : have && m && m.runs === 1 ? t('result.headline.forced') : '', band && ` · ${band}`),
        h('span', { class: 'cmp-hbar' }, h('i', { style: { width: have ? `${tot / mx * 100}%` : '0%' } })));
    };
    const diff = have && ta && tb && ta !== tb
      ? h('p', { class: 'cmp-diff' }, t('cmp.diff', { side: ta > tb ? 'A' : 'B', pct: pct(Math.max(ta, tb), Math.min(ta, tb)), v: fmtShort(Math.abs(ta - tb)) }))
      : have && ta && ta === tb ? h('p', { class: 'cmp-diff' }, t('records.label.same')) : null;
    const tools = h('div', { class: 'cmp-tools' }, ...SIDES.map(sd => sideTools(sd)),
      st.manualPos && C.button({ tier: 'ghost', size: 'sm', iconName: 'list-restart', label: t('cmp.autoMatch'), onClick: () => { st.manualPos = false; renderResult(); } }));
    result.replaceChildren(
      h('div', { class: 'cmp-heads' }, headCol('a'), headCol('b')),
      diff || '',
      lane(),
      panelEl() || '',
      tools,
      have ? chartEl() : '');
  }
  const pct = (a, b) => (b > 0 ? Math.round((a / b - 1) * 1000) / 10 : 0);

  function lane() {
    const rows = pairs();
    const all = [...members('a').map(x => dmgOf('a', x.id)), ...members('b').map(x => dmgOf('b', x.id))].filter(v => v != null);
    const mx = Math.max(1, ...all);
    const cell = (c, sd) => {
      if (!c) return h('div', { class: 'cmp-cell empty' });
      const v = dmgOf(sd, c.id);
      const list = members(sd), k = list.findIndex(x => x.idx === c.idx);
      const open = e => {
        C.menu(e.currentTarget, [
          { label: t('compare.label.swapCompanion'), iconName: 'chevrons-up-down', onSelect: () => openPanel({ type: 'pick', side: sd, idx: c.idx }) },
          { label: t('records.label.exclude'), iconName: 'x', danger: true, onSelect: () => { invalidateAdv(sd, c.pos); dropSyncAt(sd, c.pos); st.side[sd].roster[c.idx] = null; markDirty(); } },
        ]);
      };
      return h('div', { class: 'cmp-cell' },
        h('button', { type: 'button', class: 'cmp-cbtn', 'aria-label': t('cmp.cell.aria', { name: nameOf(c.id), pos: c.pos }), onClick: open },
          h('img', { src: `icons/${c.id}.png`, alt: '' }),
          h('span', { class: 'cmp-cn' }, nameOf(c.id), h('small', {}, t('cmp.pos', { n: c.pos }))),
          h('span', { class: 'cmp-cv' }, v == null ? '—' : fmtShort(v)),
          h('span', { class: 'cmp-cbar' }, h('i', { style: { width: v == null ? '0%' : `${v / mx * 100}%` } }))),
        h('span', { class: 'cmp-mv' },
          h('button', { type: 'button', class: 'btn-icon', 'aria-label': t('cmp.moveUp'), disabled: k <= 0, onClick: () => move(sd, c.idx, -1) }, C.icon('chevron-up')),
          h('button', { type: 'button', class: 'btn-icon', 'aria-label': t('cmp.moveDown'), disabled: k >= list.length - 1, onClick: () => move(sd, c.idx, 1) }, C.icon('chevron-down'))));
    };
    const mid = r => {
      if (!(r.a && r.b)) return h('div', { class: 'cmp-mid solo' }, t('compare.label.solo'));
      const da = dmgOf('a', r.a.id), db = dmgOf('b', r.b.id);
      if (st.pending || da == null || db == null) return h('div', { class: 'cmp-mid pend' }, '…');
      if (!da || !db || da === db) return h('div', { class: 'cmp-mid eq' }, '=');
      const aWin = da > db;
      return h('div', { class: `cmp-mid ${aWin ? 'win-a' : 'win-b'}` }, C.icon('chevron-right', aWin ? 'ic flip' : 'ic'),
        h('b', {}, `${aWin ? 'A' : 'B'} +${pct(Math.max(da, db), Math.min(da, db))}%`));
    };
    const addCell = sd => {
      const s = st.side[sd];
      if (s.roster.filter(Boolean).length >= 5) return h('div');
      return h('button', { type: 'button', class: 'cmp-add', onClick: () => openPanel({ type: 'pick', side: sd, idx: null }) }, C.icon('plus'), t('cmp.add'));
    };
    return h('div', { class: 'cmp-lane' },
      h('div', { class: 'cmp-row cmp-lhead' }, h('span', {}, 'A'), h('span', {}, t('cmp.diff.col')), h('span', {}, 'B')),
      ...rows.map(r => h('div', { class: 'cmp-row' }, cell(r.a, 'a'), mid(r), cell(r.b, 'b'))),
      h('div', { class: 'cmp-row cmp-addrow' }, addCell('a'), h('span'), addCell('b')));
  }

  function move(sd, idx, dir) {
    const list = members(sd), k = list.findIndex(x => x.idx === idx), o = list[k + dir];
    if (!o) return;
    st.manualPos = true;
    if (swapSlots(sd, idx, o.idx)) markDirty();
  }

  function sideTools(sd) {
    const s = st.side[sd];
    if (!s.roster.some(Boolean)) return h('span');
    return h('div', { class: `cmp-stools side-${sd}` }, h('span', { class: `cmp-tag ${sd}` }, sd.toUpperCase()),
      C.button({ tier: 'secondary', size: 'sm', iconName: 'sliders-horizontal', label: t('cmp.plan'), onClick: () => openPlan(sd) }),
      C.button({ tier: 'ghost', size: 'sm', iconName: 'arrow-down', label: t('cmp.order'), onClick: () => openPanel({ type: 'order', side: sd }) }));
  }

  // ── 인라인 패널(시트 안 — 시트 중첩 대신) ──
  function openPanel(p) { st.panel = p; renderResult(); requestAnimationFrame(() => result.querySelector('.cmp-panel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); }
  const closePanel = () => { st.panel = null; renderResult(); };
  function panelEl() {
    const p = st.panel; if (!p) return null;
    const s = st.side[p.side];
    const head = title => h('div', { class: 'cmp-ph' }, h('span', { class: `cmp-tag ${p.side}` }, p.side.toUpperCase()), h('b', {}, title),
      C.button({ tier: 'ghost', iconName: 'x', iconOnly: true, label: t('common.close'), onClick: closePanel }));
    if (p.type === 'pick') {
      const inTeam = new Set(s.roster.filter(Boolean).map(x => x.id));
      const curId = p.idx != null && s.roster[p.idx] ? s.roster[p.idx].id : null;
      const list = Object.values(chars()).sort((x, y) => nameOf(x.id).localeCompare(nameOf(y.id), i18n.lang === 'kr' ? 'ko' : i18n.lang));
      const grid = h('div', { class: 'cmp-grid' }, ...list.map(ch => h('button', { type: 'button', class: `cmp-pc${ch.id === curId ? ' cur' : ''}`,
        disabled: inTeam.has(ch.id) && ch.id !== curId, onClick: () => pickChar(p, ch.id) },
        h('img', { src: `icons/${ch.id}.png`, alt: '', loading: 'lazy' }), h('span', {}, nameOf(ch.id)))));
      return h('div', { class: 'cmp-panel' }, head(p.idx == null ? t('cmp.add') : t('compare.label.swapCompanion')), grid);
    }
    // 행동 순서(우선순위) — 비교 팀 사본에만 적용
    const ord = teamOrder(s.roster, chars());
    const allLocked = fullyLocked(s, st.common.turns);
    const apply = arr => { arr.forEach((o, k) => { o.s.priority = k + 1; }); markDirty(); };
    const li = ord.map((o, k) => h('li', {},
      h('span', { class: 'prio-n' }, String(k + 1)), h('img', { src: `icons/${o.s.id}.png`, alt: '' }), h('span', { class: 'prio-name' }, nameOf(o.s.id)),
      h('span', { class: 'mv' },
        h('button', { type: 'button', class: 'btn-icon', 'aria-label': t('cmp.moveUp'), disabled: k === 0 || allLocked, onClick: () => { const a = teamOrder(s.roster, chars()); [a[k - 1], a[k]] = [a[k], a[k - 1]]; apply(a); } }, C.icon('chevron-up')),
        h('button', { type: 'button', class: 'btn-icon', 'aria-label': t('cmp.moveDown'), disabled: k === ord.length - 1 || allLocked, onClick: () => { const a = teamOrder(s.roster, chars()); [a[k + 1], a[k]] = [a[k], a[k + 1]]; apply(a); } }, C.icon('chevron-down')))));
    const ovN = Object.keys(s.turnOv || {}).length;
    return h('div', { class: 'cmp-panel' }, head(t('cmp.order')),
      allLocked && h('p', { class: 'hint' }, t('cmp.order.lockedAll')),
      h('ol', { class: 'prio' }, ...li),
      ovN ? h('p', { class: 'hint' }, t('cmp.order.turns', { n: ovN })) : '',
      C.button({ tier: 'ghost', size: 'sm', iconName: 'rotate-ccw', label: t('cmp.order.reset'), disabled: allLocked,
        onClick: () => { s.roster.forEach(x => { if (x) delete x.priority; }); s.turnOv = {}; markDirty(); } }));
  }
  function pickChar(p, id) {
    const s = st.side[p.side];
    let idx = p.idx;
    if (idx == null) idx = s.roster.findIndex(x => !x);
    if (idx < 0) { C.toast(t('compare.msg.comparisonGroupFullMax')); return; }
    if (id === IMBUEON_ID && idx === 0) { C.toast(t('cmp.imbueonP1')); return; }
    if (s.roster[idx] && s.roster[idx].id === id) { closePanel(); return; }
    invalidateAdv(p.side, idx + 1);
    if (s.roster[idx]) dropSyncAt(p.side, idx + 1);
    s.roster[idx] = { id, skill: 10, rune: true, rotation: '' };
    st.panel = null;
    markDirty();
  }

  // ── 행동 계획(비교 팀 스코프) — ui/advanced.js openAdvancedFor(행동 계획 + 고급 설정 한 창) ──
  // 스코프 = 이 비교 팀의 사본. 편집기 시트가 열리면 비교 시트는 닫히고(시트는 한 번에 하나), 닫힐 때 commit → 같은 상태로 다시 연다.
  const shared = () => ({ altar: clone(S().altar), tdmg: clone(S().tdmg), chars: chars() });
  const touched = () => { st.ver++; st.pending = true; st.error = ''; st.panel = null; };
  async function openPlan(sd) {
    const s = st.side[sd];
    let mod = null;
    try { mod = await import('./advanced.js'); } catch (err) { console.error('[compare] advanced.js', err); }
    const r = mod && typeof mod.openAdvancedFor === 'function' && mod.openAdvancedFor({
      label: sd.toUpperCase(), team: clone(s.roster), turns: st.common.turns, sync: clone(s.sync), overrides: clone(s.turnOv),
      pins: clone(s.pins || {}), locked: clone(s.locked || {}), ...shared(),
      commit: ({ team, sync, overrides, pins, locked }) => {
        const roster = (team || []).slice(0, 5).map(x => x || null);
        while (roster.length < 5) roster.push(null);
        s.roster = roster;
        s.sync = normalizeSyncGroups(sync || []);
        s.turnOv = overrides || {};
        s.pins = pins || {};
        s.locked = locked || {};
        touched();
      },
      onClose: () => ctx.openCompare(st),
    });
    if (!r) C.toast(t('cmp.plan.unavailable'));
  }

  // ── 누적 데미지 선 차트(같은 축) ──
  function chartEl() {
    const A = (st.data.a && st.data.a.chart) || [], B = (st.data.b && st.data.b.chart) || [];
    const n = Math.min(A.length || Infinity, B.length || Infinity);
    if (!Number.isFinite(n) || n < 1) return '';
    const cum = arr => { let s = 0; return arr.slice(0, n).map(x => (s += x.total || 0)); };
    const ca = A.length ? cum(A) : null, cb = B.length ? cum(B) : null;
    const mx = Math.max(1, ...(ca || [0]), ...(cb || [0]));
    const xp = i => (n === 1 ? 50 : i / (n - 1) * 100);
    const yp = v => 100 - v / mx * 100;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
    const line = (arr, cls) => { if (!arr) return; const pl = document.createElementNS(ns, 'polyline'); pl.setAttribute('points', arr.map((v, i) => `${xp(i).toFixed(2)},${yp(v).toFixed(2)}`).join(' ')); pl.setAttribute('class', cls); pl.setAttribute('vector-effect', 'non-scaling-stroke'); svg.append(pl); };
    line(cb, 'ln-b'); line(ca, 'ln-a');
    const grid = [25, 50, 75].map(p => h('i', { class: 'cc-grid', style: { top: `${p}%` } }));
    const ylab = [100, 50].map(p => h('span', { class: 'cc-y', style: { top: `${100 - p}%` } }, fmtShort(mx * p / 100)));
    const cursor = h('i', { class: 'cc-cursor', hidden: true });
    const dotA = h('i', { class: 'cc-dot a', hidden: true }), dotB = h('i', { class: 'cc-dot b', hidden: true });
    const tip = h('div', { class: 'cc-tip', hidden: true });
    const plot = h('div', { class: 'cc-plot', tabindex: '0', role: 'img', 'aria-label': t('cmp.chart.aria', { n, a: fmtShort(ca ? ca[n - 1] : 0), b: fmtShort(cb ? cb[n - 1] : 0) }) }, ...grid, ...ylab, svg, cursor, dotA, dotB, tip);
    const show = i => {
      const x = xp(i), a = ca ? ca[i] : 0, b = cb ? cb[i] : 0;
      cursor.hidden = false; cursor.style.left = `${x}%`;
      if (ca) { dotA.hidden = false; dotA.style.left = `${x}%`; dotA.style.top = `${yp(a)}%`; }
      if (cb) { dotB.hidden = false; dotB.style.left = `${x}%`; dotB.style.top = `${yp(b)}%`; }
      const d = a === b ? t('records.label.same') : `${a > b ? 'A' : 'B'} +${fmtShort(Math.abs(a - b))} · +${pct(Math.max(a, b), Math.min(a, b))}%`;
      tip.replaceChildren(h('b', {}, t('tdmg.turn', [i + 1])),
        h('div', {}, h('i', { class: 'cc-sw a' }), 'A ', fmt(a)), h('div', {}, h('i', { class: 'cc-sw b' }), 'B ', fmt(b)), h('div', { class: 'cc-d' }, d));
      tip.hidden = false;
      tip.style.left = `${x}%`; tip.style.transform = x > 60 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)';
    };
    const hide = () => { [cursor, dotA, dotB, tip].forEach(e => { e.hidden = true; }); };
    let ki = n - 1;
    plot.addEventListener('pointermove', e => { const r = plot.getBoundingClientRect(); ki = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (n - 1)); show(ki); });
    plot.addEventListener('pointerleave', hide);
    plot.addEventListener('blur', hide);
    plot.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') { ki = Math.max(0, ki - 1); show(ki); } else if (e.key === 'ArrowRight') { ki = Math.min(n - 1, ki + 1); show(ki); } });
    const ticks = [1]; for (let k = 5; k <= n; k += 5) ticks.push(k); if (n > 1 && n - ticks[ticks.length - 1] >= 2) ticks.push(n);
    const axis = h('div', { class: 'cc-axis' }, ...ticks.map(k => h('span', { style: { left: `${xp(k - 1)}%` } }, String(k))));
    return h('figure', { class: 'cmp-chart' },
      h('figcaption', {}, t('compare.label.cumulativeDmgPerTurn'), h('small', { class: 'cap-note' }, t('cmp.chart.note', { n })),
        h('span', { class: 'cc-leg' }, ca && h('span', {}, h('i', { class: 'cc-sw a' }), `A ${fmtShort(ca[n - 1])}`), cb && h('span', {}, h('i', { class: 'cc-sw b' }), `B ${fmtShort(cb[n - 1])}`))),
      plot, axis);
  }

  // ── 실행 ──
  async function run() {
    if (st.running) { st.queued = true; return; }        // 실행 중 요청 → 끝나면 최신 편성으로 한 번 더
    st.queued = false;
    const ver = st.ver;
    if (st.sel.a && st.sel.a === st.sel.b) { st.error = t('compare.label.pleasePickTwoDifferent'); st.data = { a: null, b: null }; renderBar(); renderResult(); return; }
    if (!st.turnsManual) {
      const ta = st.side.a.recId ? st.side.a.turns : 30, tb = st.side.b.recId ? st.side.b.turns : 30;
      st.common.turns = Math.min(ta, tb);
      const sl = commonBox.querySelector('#cmp-turns');
      if (sl && +sl.value !== st.common.turns) { renderCommon(); }
    }
    const turns = st.common.turns;
    const shared = { chars: chars(), altar: S().altar, tdmg: S().tdmg, mainTurns: turns };
    st.running = true; st.error = ''; renderBar();
    const sim = sd => {
      const s = st.side[sd];
      if (!s.roster.some(Boolean)) return Promise.resolve(EMPTY_RESULT(turns));
      // 고정 칸 → 동료별 줄(effectiveTeam), 잠긴 턴 → turnPlans. 전 턴이 잠기면 v1 완전 수동 모양(순서 생략), 일부만이면 규칙 + 그 턴만.
      const env = makeEnv({ chars: shared.chars, altar: shared.altar });
      const roster = effectiveTeam(s.roster, s.pins || {}, turns, env);
      const locked = lockedWithin(s.locked || {}, turns);
      const full = fullyLocked(s, turns);
      const cfg = buildCompareCfg({ roster, turnOv: s.turnOv, adv: full ? locked : null, advOn: full, sync: s.sync }, { turns, runs: s.runs }, st.common, shared);
      if (!full && Object.keys(locked).length) cfg.turnPlans = locked;
      return api.simulate(cfg);
    };
    try {
      const [da, db] = await Promise.all([sim('a'), sim('b')]);
      if ((da && da.error) || (db && db.error)) throw new Error(da.error || db.error);
      st.data = { a: da, b: db };
      st.pending = st.ver !== ver;                        // 계산 중에 바뀌었으면 여전히 대기
    } catch (err) {
      st.error = `${t('compare.label.comparisonFailed')} ${err && err.message ? err.message : t('compare.label.error')}`;
    } finally {
      st.running = false;
      if (root.isConnected) { renderBar(); renderResult(); if (st.queued) run(); }
    }
  }

  renderPick(); renderCommon(); renderBar();
  if (prev) renderResult(); else run();
  return sheet;
}
