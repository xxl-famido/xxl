/**
 * lounge/tier.js — 티어표: 모아보기(커뮤니티 평균 + 공개 목록), 만들기(드래그 편집기), 보기.
 *
 * 편집기 드래그는 포인터 이벤트로 직접 구현한다(마우스·터치 공용). 끌고 가는 동안 실제 칩을 삽입 위치로 옮기고
 * 주변 칩은 FLIP 으로 자리를 비킨다. 놓으면 고스트가 칩 자리로 내려앉는다.
 * 대체 입력: 칩을 누르면 선택 → 행을 누르면 그 행으로 / 선택한 칩에서 숫자키 1~8 = 해당 행, 0 = 미배치.
 */
import * as api from './api.js';
import { spamReason } from './shared.js';
import { t, spamText } from './i18n.js';
import { cooldownButton, writeError, reveal, REVEAL_STEP, put, h, icon, avatar, anonName, ago, buildChip, nameOf, iconSrc, toast, askPin, askConfirm, menuButton, votes, clampText, emptyState, skeleton, seg, pinField, reducedMotion } from './ui.js';
import { threadView } from './thread.js';
import { flip, dur, ease } from '../motion/index.js';

const DRAFT_KEY = 'woofia_lounge_tier_draft';
const MIN_ROWS = 2;
const MAX_ROWS = 8;
const DEFAULT_LABELS = ['S', 'A', 'B', 'C', 'D'];
const DRAG_THRESHOLD_PX = 4;
/** 여러 영역에 걸친 FLIP — 칩이 다른 행으로 넘어가도 원래 자리에서 새 자리로 미끄러진다. */
function flipMany(containers, mutate, duration = dur('base')) {
  const before = new Map();
  containers.forEach((c) => [...c.children].forEach((el) => before.set(el, el.getBoundingClientRect())));
  mutate();
  if (reducedMotion()) return;
  containers.forEach((c) => [...c.children].forEach((el) => {
    const b = before.get(el); if (!b || el.classList.contains('is-dragging')) return;
    const a = el.getBoundingClientRect();
    const dx = b.left - a.left, dy = b.top - a.top;
    if (dx || dy) el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration, easing: ease('standard') });
  }));
}
const basisLabel = (k) => t(`basis.${k}`);

// ── 모아보기 ──────────────────────────────────────────────────────────────
const home = { basis: 'any', listBasis: 'any', sort: 'best' };

export async function tierHome(view) {
  const agg = h('div', { class: 'lg-agg' }, skeleton(5));
  const aggCap = h('p', { class: 'lg-cap' });
  const list = h('ol', { class: 'lg-rows' }, h('li', {}, skeleton(4)));
  view.replaceChildren(h('div', { class: 'lg-single' },
    h('header', { class: 'lg-page-head' }, h('h1', { class: 'lg-h1' }, t('nav.tier')),
      h('a', { class: 'btn btn-primary', href: '#/tier/new' }, icon('plus'), t('tier.new'))),
    h('section', { class: 'lg-sec' },
      h('div', { class: 'lg-sec-head' }, h('h2', {}, t('tier.agg.title')),
        seg(t('basis.aria'), [{ value: 'any', label: t('common.all') }, ...api.TIER_BASIS.filter((b) => b.key !== 'free').map((b) => ({ value: b.key, label: basisLabel(b.key) }))], home.basis, (v) => { home.basis = v; paintAgg(); })),
      aggCap, agg),
    h('section', { class: 'lg-sec' },
      h('div', { class: 'lg-sec-head' }, h('h2', {}, t('tier.list.title')),
        h('div', { class: 'lg-sec-tools' },
          seg(t('basis.aria'), [{ value: 'any', label: t('common.all') }, ...api.TIER_BASIS.map((b) => ({ value: b.key, label: basisLabel(b.key) }))], home.listBasis, (v) => { home.listBasis = v; paintList(); }),
          seg(t('sort.aria'), [{ value: 'best', label: t('sort.best') }, { value: 'new', label: t('sort.new') }], home.sort, (v) => { home.sort = v; paintList(); }))),
      list)));

  async function paintAgg() {
    const a = await api.aggregate(home.basis);
    aggCap.textContent = t('tier.agg.cap', { n: a.sampleCount, min: api.AGG_MIN_SAMPLES });
    if (!a.sampleCount) { agg.replaceChildren(emptyState(t('tier.agg.empty'), { href: '#/tier/new', label: t('tier.new') })); return; }
    const icons = [];
    put(agg, h('div', { class: 'lg-tboard is-read' }, a.rows.map((r) => h('div', { class: 'lg-trow' },
      h('div', { class: 'lg-tlabel' }, r.label),
      h('div', { class: 'lg-tzone' }, r.items.length ? r.items.map((it) => {
        const el = h('a', { class: 'lg-tchip', href: `#/c/${it.id}`, title: t('tier.agg.chip', { name: nameOf(it.id), n: it.n }) }, h('img', { src: iconSrc(it.id), alt: nameOf(it.id) }));
        icons.push(el); return el;
      }) : h('span', { class: 'lg-tzone-empty' }, '—'))))),
    a.thin.length ? h('p', { class: 'lg-cap' }, t('tier.agg.thin'), ' ', a.thin.map(nameOf).join(', ')) : null);
    // 아이콘이 행마다 순서대로 자리 잡는다 — 평균이 '집계되는' 느낌.
    reveal(icons, { step: REVEAL_STEP.chip });
  }

  async function paintList() {
    const items = await api.tiers({ basis: home.listBasis, sort: home.sort });
    if (!items.length) { list.replaceChildren(h('li', {}, emptyState(t('tier.list.empty'), { href: '#/tier/new', label: t('tier.new') }))); return; }
    list.replaceChildren(...items.map((tl) => h('li', {}, h('a', { class: 'lg-row', href: `#/tier/${tl.id}` },
      h('span', { class: 'lg-row-lead lg-tprev' }, tl.rows.slice(0, 2).map((r) => h('span', { class: 'lg-tprev-row' }, h('b', {}, r.label), r.ids.slice(0, 5).map((id) => h('img', { src: iconSrc(id), alt: '' }))))),
      h('span', { class: 'lg-row-main' },
        h('span', { class: 'lg-row-title' }, tl.title),
        h('span', { class: 'lg-row-meta' }, h('span', { class: 'lg-chip' }, basisLabel(tl.basis)), tl.fun && h('span', { class: 'lg-chip', title: t('tier.fun.hint') }, t('chip.fun')), avatar(tl.anon, 16), anonName(tl.anon, tl.anonNo, tl.op), ' · ', ago(tl.at), buildChip(tl.build))),
      h('span', { class: 'lg-row-stats' }, h('span', {}, icon('thumbs-up'), tl.likes), h('span', {}, icon('message-circle'), tl.comments))))));
    reveal([...list.children]);
  }

  paintAgg(); paintList();
}

// ── 편집기 ───────────────────────────────────────────────────────────────
function loadDraft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; } }
function saveDraft(d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* 무시 */ } }
const blank = () => ({ title: '', basis: 'all', descr: '', fun: false, rows: DEFAULT_LABELS.map((label) => ({ label, ids: [] })) });

/**
 * 수정 권한(비밀번호)은 보기 화면에서 확인하고 여기에 잠깐 들고 온다(주소·저장소에 남기지 않음).
 * 운영자는 비밀번호 없이 토큰으로 수정한다.
 */
let editGrant = null;   // { id, pin }
export function grantTierEdit(id, pin) { editGrant = { id, pin }; }

export async function tierEditor(view, params, editId = null) {
  const chars = await api.chars();
  let d = editId ? null : (loadDraft() || blank());
  let editPin = null;
  if (editId) {
    if (!api.isOperator() && !(editGrant && editGrant.id === editId)) { location.hash = `#/tier/${editId}`; return; }
    editPin = editGrant && editGrant.id === editId ? editGrant.pin : null;
    const src = await api.tier(editId);
    if (!src) { view.replaceChildren(emptyState(t('tier.notFound'), { href: '#/tier', label: t('tier.backList') })); return; }
    d = { title: src.title, basis: src.basis, descr: src.descr || '', fun: !!src.fun, rows: src.rows.map((r) => ({ label: r.label, ids: [...r.ids] })) };
  }
  const fromId = editId ? null : params.get('from');
  if (fromId) {
    const src = await api.tier(fromId);
    if (src) d = { title: src.title + ' ' + t('tier.copySuffix'), basis: src.basis, descr: '', rows: src.rows.map((r) => ({ label: r.label, ids: [...r.ids] })), from: fromId };
  }
  let selected = null;

  const title = h('input', { class: 'lg-input lg-title-in', value: d.title, maxlength: api.LIMITS.title, placeholder: t('tier.title.ph'), 'aria-label': t('tier.title.ph') });
  const board = h('div', { class: 'lg-tboard is-edit' });
  const pool = h('div', { class: 'lg-tzone lg-pool', 'data-row': '-1', 'aria-label': t('tier.pool') });
  const poolSearch = h('input', { type: 'search', placeholder: t('search.name'), 'aria-label': t('tier.pool.search') });
  const descr = h('textarea', { class: 'lg-textarea lg-boxed', rows: 5, maxlength: api.LIMITS.tierDesc, placeholder: t('tier.descr.ph') }, d.descr || '');
  const addRowBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, icon('plus'), t('tier.addRow'));
  const placedCount = h('span', { class: 'lg-count' });
  // 평균 티어 집계 제외: 체크하면 평균 티어에서 빠진다(서버 tiers.fun). 체크 상태는 초안에도 남는다.
  const funBox = h('input', { type: 'checkbox', checked: !!d.fun, onchange: () => { d.fun = funBox.checked; commit(false); } });
  const funField = h('label', { class: 'lg-check' }, funBox, h('span', {}, h('b', {}, t('tier.fun.label')), h('span', { class: 'lg-hint' }, t('tier.fun.hint'))));

  view.replaceChildren(h('div', { class: 'lg-cols is-editor' },
    h('div', { class: 'lg-col-main' },
      h('a', { class: 'lg-back', href: editId ? `#/tier/${editId}` : '#/tier' }, icon('arrow-left'), editId ? t('tier.backToTier') : t('nav.tier')),
      h('header', { class: 'lg-page-head' }, h('h1', { class: 'lg-h1' }, editId ? t('tier.edit.title') : fromId ? t('tier.fork') : t('tier.new'))),
      title,
      h('div', { class: 'lg-field-row' }, h('span', { class: 'lg-label' }, t('basis.aria')),
        seg(t('basis.aria'), api.TIER_BASIS.map((b) => ({ value: b.key, label: basisLabel(b.key) })), d.basis, (v) => { d.basis = v; commit(); })),
      board,
      h('div', { class: 'lg-board-foot' }, addRowBtn, h('span', { class: 'lg-hint' }, t('tier.dragHint'))),
      h('section', { class: 'lg-sec lg-pool-sec' },
        h('div', { class: 'lg-sec-head' }, h('h2', {}, t('tier.pool'), ' ', placedCount), h('label', { class: 'search lg-search' }, icon('search'), poolSearch)),
        pool)),
    h('aside', { class: 'lg-rail lg-publish' },
      h('h2', { class: 'lg-rail-h' }, editId ? t('tier.saveEdit') : t('tier.publish')),
      h('label', { class: 'lg-field' }, h('span', { class: 'lg-label' }, t('field.descr')), descr),
      funField,
      !editId && pinField('tier-pin'),
      cooldownButton(h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: publish }, editId ? t('tier.saveEdit') : t('tier.publish'))),
      h('button', { class: 'btn btn-secondary btn-block', type: 'button', onclick: () => exportPng({ title: title.value || t('nav.tier'), rows: d.rows }) }, icon('image-down'), t('tier.savePng')),
      !editId && h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: reset }, icon('rotate-ccw'), t('tier.reset')),
      h('p', { class: 'lg-hint' }, editId ? t('tier.edit.hint') : t('tier.draftHint')))));

  const chipOf = (id) => {
    const b = h('button', { type: 'button', class: 'lg-tchip', 'data-id': id, 'aria-label': nameOf(id), 'aria-pressed': 'false', title: nameOf(id) },
      h('img', { src: iconSrc(id), alt: '', draggable: 'false' }));
    b.addEventListener('pointerdown', (e) => startDrag(e, b));
    b.addEventListener('keydown', (e) => {
      const n = e.key === '0' ? -1 : /^[1-8]$/.test(e.key) ? +e.key - 1 : null;
      if (n === null || n >= d.rows.length) return;
      e.preventDefault();
      moveChip(b, zoneOf(n));
      b.focus();
    });
    return b;
  };
  const zoneOf = (i) => (i < 0 ? pool : board.querySelector(`.lg-tzone[data-row="${i}"]`));

  function paintBoard() {
    board.replaceChildren(...d.rows.map((r, i) => {
      const lab = h('input', { class: 'lg-tlabel', value: r.label, maxlength: 12, 'aria-label': t('tier.row.label.aria', { n: i + 1 }) });
      lab.addEventListener('input', () => { d.rows[i].label = lab.value; commit(false); });
      const zone = h('div', { class: 'lg-tzone', 'data-row': String(i), 'aria-label': t('tier.row.aria', { label: r.label }) }, r.ids.map(chipOf));
      return h('div', { class: 'lg-trow' }, lab, zone,
        menuButton(t('tier.row.menu', { label: r.label }), [
          i > 0 && { label: t('tier.row.up'), icon: 'arrow-up', run: () => swapRows(i, i - 1) },
          i < d.rows.length - 1 && { label: t('tier.row.down'), icon: 'arrow-down', run: () => swapRows(i, i + 1) },
          { label: t('tier.row.delete'), icon: 'trash-2', danger: true, run: () => removeRow(i) },
        ]));
    }));
    board.querySelectorAll('.lg-tzone').forEach(bindZoneTap);
    addRowBtn.disabled = d.rows.length >= MAX_ROWS;
  }
  function paintPool() {
    const placed = new Set(d.rows.flatMap((r) => r.ids));
    const q = poolSearch.value.trim();
    pool.replaceChildren(...chars.filter((c) => !placed.has(c.id)).sort((a, b) => b.id - a.id).map((c) => {
      const b = chipOf(c.id); if (q && !c.name.includes(q)) b.hidden = true; return b;
    }));
    placedCount.textContent = `${chars.length - placed.size}`;
  }
  bindZoneTap(pool);
  poolSearch.addEventListener('input', () => { pool.querySelectorAll('.lg-tchip').forEach((b) => { b.hidden = !!poolSearch.value && !nameOf(+b.dataset.id).includes(poolSearch.value.trim()) && !chars.find((c) => c.id === +b.dataset.id).name.includes(poolSearch.value.trim()); }); });
  title.addEventListener('input', () => { d.title = title.value; commit(false); });
  descr.addEventListener('input', () => { d.descr = descr.value; commit(false); });
  addRowBtn.addEventListener('click', () => {
    if (d.rows.length >= MAX_ROWS) return;
    d.rows.push({ label: DEFAULT_LABELS[d.rows.length] || String(d.rows.length + 1), ids: [] });
    flip(board, paintBoard); commit(false);
  });

  /** DOM → 상태. 행 라벨은 입력 이벤트에서 이미 반영된다. */
  function commit(fromDom = true) {
    if (fromDom) d.rows.forEach((r, i) => { r.ids = [...zoneOf(i).querySelectorAll('.lg-tchip')].map((b) => +b.dataset.id); });
    const placed = new Set(d.rows.flatMap((r) => r.ids));
    placedCount.textContent = `${chars.length - placed.size}`;
    if (!editId) saveDraft(d);   // 수정 중인 내용은 새 티어표 초안을 덮어쓰지 않는다
  }
  function swapRows(a, b) { [d.rows[a], d.rows[b]] = [d.rows[b], d.rows[a]]; flip(board, paintBoard); commit(false); }
  async function removeRow(i) {
    if (d.rows.length <= MIN_ROWS) { toast(t('tier.row.min', { n: MIN_ROWS })); return; }
    d.rows.splice(i, 1); paintBoard(); paintPool(); commit(false);
  }
  async function reset() {
    if (!(await askConfirm({ title: t('tier.reset'), desc: t('tier.reset.desc'), confirm: t('tier.reset.confirm'), danger: true }))) return;
    d = blank(); title.value = ''; descr.value = ''; saveDraft(d); paintBoard(); paintPool();
  }

  /** 칩을 zone 끝(또는 before 앞)으로 옮기고 두 영역을 FLIP. */
  function moveChip(chip, zone, before = null) {
    flipMany([...new Set([chip.parentElement, zone])], () => zone.insertBefore(chip, before));
    selectChip(null);
    commit();
  }
  function selectChip(b) {
    if (selected) selected.setAttribute('aria-pressed', 'false');
    selected = b && b !== selected ? b : null;
    if (selected) selected.setAttribute('aria-pressed', 'true');
    board.classList.toggle('has-pick', !!selected); pool.classList.toggle('has-pick', !!selected);
  }
  function bindZoneTap(zone) {
    zone.addEventListener('click', (e) => { if (selected && !e.target.closest('.lg-tchip')) moveChip(selected, zone); });
  }

  // ── 포인터 드래그 ──
  function startDrag(e, chip) {
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    let ghost = null, lastZone = null, lastBefore = undefined;
    const move = (ev) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_THRESHOLD_PX) return;
        const r = chip.getBoundingClientRect();
        ghost = h('img', { class: 'fly lg-ghost', src: iconSrc(chip.dataset.id), alt: '', style: { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' } });
        ghost.dataset.ox = String(sx - r.left); ghost.dataset.oy = String(sy - r.top);
        document.body.append(ghost);
        chip.classList.add('is-dragging');
        document.body.classList.add('lg-dragging');
        selectChip(null);
      }
      ghost.style.left = ev.clientX - +ghost.dataset.ox + 'px';
      ghost.style.top = ev.clientY - +ghost.dataset.oy + 'px';
      const zone = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.lg-tzone');
      if (!zone || !(board.contains(zone) || zone === pool)) return;
      const before = insertionPoint(zone, ev.clientX, ev.clientY, chip);
      if (zone === lastZone && before === lastBefore) return;
      lastZone = zone; lastBefore = before;
      flipMany([...new Set([chip.parentElement, zone])], () => zone.insertBefore(chip, before), dur('fast'));
      board.querySelectorAll('.lg-tzone').forEach((z) => z.classList.toggle('is-over', z === zone));
      pool.classList.toggle('is-over', zone === pool);
    };
    const up = async () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      if (!ghost) { selectChip(chip); return; }
      document.body.classList.remove('lg-dragging');
      board.querySelectorAll('.is-over').forEach((z) => z.classList.remove('is-over')); pool.classList.remove('is-over');
      const r = chip.getBoundingClientRect();
      if (!reducedMotion()) {
        await ghost.animate([{ left: ghost.style.left, top: ghost.style.top }, { left: r.left + 'px', top: r.top + 'px' }],
          { duration: dur('fast'), easing: ease('enter'), fill: 'forwards' }).finished;
      }
      ghost.remove(); chip.classList.remove('is-dragging');
      commit();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  /** 포인터 위치 기준 삽입 지점(그 칩 앞에 넣는다, null = 끝). 줄바꿈된 칩 줄도 고려. */
  function insertionPoint(zone, x, y, self) {
    for (const c of zone.querySelectorAll('.lg-tchip:not([hidden])')) {
      if (c === self) continue;
      const r = c.getBoundingClientRect();
      if (y < r.top) return c;
      if (y <= r.bottom && x < r.left + r.width / 2) return c;
    }
    return null;
  }

  async function publish() {
    commit();
    const pin = editId ? editPin : document.getElementById('tier-pin').value;
    const why = spamReason(title.value) || spamReason(descr.value) || d.rows.map((r) => spamReason(r.label)).find(Boolean);
    if (why) { toast(spamText(why)); return; }
    if (editId) {
      try {
        await api.editTier(editId, pin, { title: title.value, basis: d.basis, rows: d.rows.filter((r) => r.ids.length || r.label), descr: descr.value, fun: !!d.fun });
        editGrant = null;
        toast(t('toast.tierEdited'));
        location.hash = `#/tier/${editId}`;
      } catch (e) { writeError(e); }
      return;
    }
    try {
      const tl = await api.createTier({ title: title.value, basis: d.basis, rows: d.rows.filter((r) => r.ids.length || r.label), descr: descr.value, fun: !!d.fun, pin });
      localStorage.removeItem(DRAFT_KEY);
      toast(t('toast.tierPublished'));
      location.hash = `#/tier/${tl.id}`;
    } catch (e) { writeError(e); }
  }

  paintBoard(); paintPool(); commit(false);
  reveal([...board.querySelectorAll('.lg-trow')]);
  reveal([...pool.children], { step: REVEAL_STEP.chip });
}

// ── 보기 ─────────────────────────────────────────────────────────────────
export async function tierView(view, id) {
  view.replaceChildren(skeleton(8));
  const tl = await api.tier(id);
  if (!tl) { view.replaceChildren(emptyState(t('tier.notFound'), { href: '#/tier', label: t('tier.backList') })); return; }
  const chips = [];
  const board = h('div', { class: 'lg-tboard is-read' }, tl.rows.map((r) => h('div', { class: 'lg-trow' },
    h('div', { class: 'lg-tlabel' }, r.label),
    h('div', { class: 'lg-tzone' }, r.ids.length ? r.ids.map((cid) => { const a = h('a', { class: 'lg-tchip', href: `#/c/${cid}`, title: nameOf(cid) }, h('img', { src: iconSrc(cid), alt: nameOf(cid) })); chips.push(a); return a; }) : h('span', { class: 'lg-tzone-empty' }, '—')))));
  view.replaceChildren(h('div', { class: 'lg-single' },
    h('a', { class: 'lg-back', href: '#/tier' }, icon('arrow-left'), t('nav.tier')),
    h('header', { class: 'lg-page-head is-stack' },
      h('h1', { class: 'lg-h1' }, tl.title),
      h('p', { class: 'lg-row-meta' }, h('span', { class: 'lg-chip' }, basisLabel(tl.basis)), tl.fun && h('span', { class: 'lg-chip', title: t('tier.fun.hint') }, t('chip.fun')), avatar(tl.anon, 16), anonName(tl.anon, tl.anonNo, tl.op), ' · ', ago(tl.at), tl.edited && ' · ' + t('chip.edited'), ' · ' + t('meta.build', { build: tl.build }), buildChip(tl.build))),
    board,
    tl.descr && h('div', { class: 'lg-descr' }, clampText(tl.descr, 8)),
    h('div', { class: 'lg-bar' },
      votes('tier:' + tl.id, tl, { size: 'md' }),
      h('span', { class: 'lg-bar-gap' }),
      h('a', { class: 'btn btn-secondary btn-sm', href: `#/tier/new?from=${tl.id}` }, icon('copy'), t('tier.fork')),
      h('button', { class: 'btn btn-secondary btn-sm', onclick: () => exportPng(tl) }, icon('image-down'), t('tier.savePng')),
      menuButton(t('common.more'), [
        { label: t('common.edit'), icon: 'pencil', run: async () => {
          if (api.isOperator()) { location.hash = `#/tier/edit/${tl.id}`; return; }
          const pin = await askPin({ title: t('tier.edit.title'), desc: t('pin.askPublished'), check: async (p) => { await api.verifyPin(tl.id, p); return p; } });
          if (pin) { grantTierEdit(tl.id, pin); location.hash = `#/tier/edit/${tl.id}`; }
        } },
        { label: t('common.delete'), icon: 'trash-2', danger: true, run: async () => {
          const ok = await askPin({ title: t('tier.delete.title'), desc: t('pin.askPublished'), confirm: t('common.delete'), danger: true, check: async (pin) => { await api.deleteItem(tl.id, pin); return true; } });
          if (ok) { toast(t('toast.deleted')); location.hash = '#/tier'; }
        } },
        { label: t('common.report'), icon: 'flag', run: async () => { if (await askConfirm({ title: t('common.report'), desc: t('report.tier.desc'), confirm: t('common.report') })) toast((await api.report('tier:' + tl.id)) ? t('toast.reported') : t('toast.reportedAlready')); } },
      ])),
    threadView({ key: 'tier:' + tl.id, owner: { anon: tl.anon, anonNo: tl.anonNo }, placeholder: t('tier.composer.ph') })));
  reveal([...view.querySelectorAll('.lg-tboard.is-read .lg-trow')]);
}

// ── 이미지 저장 ───────────────────────────────────────────────────────────
/** 현재 테마 색으로 PNG 를 그린다(로컬 처리, 업로드 없음). 원칙 1: 행 색 띠 없이 라벨 글자와 구분선만. */
export async function exportPng(tl) {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  const W = 1200, PAD = 32, LABEL_W = 120, ICON = 72, GAP = 8, TITLE_H = 72, FOOT_H = 48;
  const perLine = Math.floor((W - PAD * 2 - LABEL_W - GAP) / (ICON + GAP));
  const rowH = tl.rows.map((r) => Math.max(1, Math.ceil(r.ids.length / perLine)) * (ICON + GAP) + GAP);
  const H = TITLE_H + rowH.reduce((a, b) => a + b, 0) + FOOT_H + PAD;
  const cv = document.createElement('canvas');
  const scale = 2;
  cv.width = W * scale; cv.height = H * scale;
  const g = cv.getContext('2d');
  g.scale(scale, scale);
  const font = (w, s) => `${w} ${s}px Pretendard Variable, Pretendard, sans-serif`;
  g.fillStyle = v('--bg-surface'); g.fillRect(0, 0, W, H);
  g.fillStyle = v('--text-primary'); g.font = font(600, 28); g.textBaseline = 'middle';
  g.fillText(tl.title, PAD, TITLE_H / 2 + 8);
  const load = (id) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = iconSrc(id); });
  let y = TITLE_H;
  for (let i = 0; i < tl.rows.length; i++) {
    const r = tl.rows[i];
    g.strokeStyle = v('--border-default'); g.lineWidth = 1;
    g.beginPath(); g.moveTo(PAD, y + 0.5); g.lineTo(W - PAD, y + 0.5); g.stroke();
    g.fillStyle = v('--text-primary'); g.font = font(600, r.label.length > 3 ? 16 : 28);
    g.fillText(r.label, PAD + 8, y + rowH[i] / 2, LABEL_W - 16);
    const imgs = await Promise.all(r.ids.map(load));
    imgs.forEach((im, k) => {
      if (!im) return;
      const x = PAD + LABEL_W + GAP + (k % perLine) * (ICON + GAP);
      const yy = y + GAP + Math.floor(k / perLine) * (ICON + GAP);
      g.save(); g.beginPath(); g.roundRect(x, yy, ICON, ICON, 10); g.clip(); g.drawImage(im, x, yy, ICON, ICON); g.restore();
    });
    y += rowH[i];
  }
  g.beginPath(); g.moveTo(PAD, y + 0.5); g.lineTo(W - PAD, y + 0.5); g.stroke();
  g.fillStyle = v('--text-tertiary'); g.font = font(500, 13);
  g.fillText(`${t('brand')} · ${t('nav.tier')}`, PAD, y + FOOT_H / 2 + 4);
  const a = document.createElement('a');
  a.download = `${(tl.title || 'tier').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)}.png`;
  a.href = cv.toDataURL('image/png');
  a.click();
  toast(t('toast.pngSaved'));
}
