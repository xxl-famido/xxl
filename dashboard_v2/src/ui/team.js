// 팀 편성 패널: 슬롯 5칸(육성 차이 칩·해제·드래그 교체) + 동료 목록(검색·속성·포지션 필터·편성 번호).
// 편성 규칙(빈 자리·지정 자리·중복·임부언 1번 금지)은 스토어가 처리한다. 여기서는 그리기와 모션만.
import { SPEC_SLOTS, specOn, specInv, specRune, specSlotState, specLevel } from '../core/spec.js';
import { fmt, role as roleKey, EL_ORDER } from '../core/format.js';
import { openGrow, shortName, ensureLangData } from './grow.js';
import { shareCurrent } from './records.js';

const ROLE_ORDER = ['warrior', 'guard', 'healer', 'support', 'disrupt'];   // 게임 표기 순서
const NOTICE_KEY = { 'team.imbueonP1': 'team.msg.imbueonP1', 'sync.anchorRemoved': 'team.msg.syncGroupLeadLeft', 'records.storageFull': 'records.msg.recordStorageFullPlease' };
const LONG_PRESS = 350, DRAG_SLOP = 6;

/** 최대 육성과 다른 항목만 칩으로(COPY_AUDIT §5-2 순서: 스타 → 레벨 → 도장 없음 → 적합도 → 스킬 조정 → 제련). */
export function slotChips(s, meta, t) {
  const out = [];
  const on = specOn(s);
  const inv = specInv(s);
  if (on && inv.evo < 5) out.push(t('team.slot.chip.star', { n: inv.evo }));
  if (on && inv.level < 60) out.push(t('team.slot.chip.level', { n: inv.level }));
  if (!specRune(s)) out.push(t('team.slot.chip.noSigil'));
  if (on && inv.compat < 5 && (meta.rarity === 3 || meta.rarity === 4)) out.push(t('team.slot.chip.compat', { n: inv.compat }));
  if (on && SPEC_SLOTS.some((k) => specSlotState(s, k) === 'open' && specLevel(s, k) < 10)) out.push(t('team.slot.chip.skill'));
  if (s.sealOn) out.push(t('team.slot.chip.seal', { n: fmt(s.sealAtk || s.sealHp || 0) }));
  return out;
}

export async function mount(host, ctx) {
  const { store, components, t, i18n, motion } = ctx;
  const { h, icon, button, segment, toast } = components;
  components.ensureStyle('css/team.css');
  const chars = () => store.get().chars || {};
  const nameOf = (id) => i18n.nameOf(id);
  const iconSrc = (id) => `icons/${id}.png`;
  let busy = false;                   // 모션 중 재진입 방지

  // ── 뼈대 ──
  const slotsOl = h('ol', { class: 'slots' });
  const rosterUl = h('ul', { class: 'roster' });
  const count = h('span', { class: 'count' });
  const pickHint = h('span', { class: 'pick-hint', hidden: true });
  const search = h('input', { type: 'search' });
  let elSeg, roleSeg, headTitle, rosterTitle, shareBtn, searchLabel;
  search.addEventListener('input', () => { store.set({ ui: { ...store.get().ui, search: search.value } }); });

  function build() {
    const ui = store.get().ui;
    headTitle = h('h2', { id: 'team-h' }, t('team.title'));
    shareBtn = button({ tier: 'ghost', size: 'sm', label: t('team.share'), iconName: 'share-2', onClick: () => shareCurrent(ctx) });
    slotsOl.setAttribute('aria-label', t('team.slots.aria'));
    rosterUl.setAttribute('aria-label', t('team.roster.aria'));
    rosterTitle = h('h3', {}, t('team.roster.title'));
    search.placeholder = t('team.roster.search.ph');
    search.setAttribute('aria-label', t('team.roster.search.aria'));
    search.value = ui.search || '';
    searchLabel = h('label', { class: 'search' }, icon('search'), search);
    elSeg = segment({
      ariaLabel: t('team.filter.element.aria'), value: ui.filterEl || 'all',
      options: [{ value: 'all', label: t('team.filter.all') }, ...EL_ORDER.map((e) => ({ value: e, el: e, label: [components.dot(e), t(`element.${e}`)] }))],
      onChange: (v) => store.set({ ui: { ...store.get().ui, filterEl: v } }),
    });
    roleSeg = segment({
      ariaLabel: t('team.filter.role.aria'), value: ui.filterRole || 'all',
      options: [{ value: 'all', label: t('team.filter.all') }, ...ROLE_ORDER.map((r) => ({ value: r, label: t(`role.${r}`) }))],
      onChange: (v) => store.set({ ui: { ...store.get().ui, filterRole: v } }),
    });
    elSeg.classList.add('seg-el'); roleSeg.classList.add('seg-role');
    host.replaceChildren(
      h('div', { class: 'panel-head' }, headTitle, h('div', { class: 'panel-tools' }, shareBtn)),
      slotsOl,
      h('span', { id: 'team-drag-hint', class: 'sr' }, t('team.slot.dragHint')),
      h('div', { class: 'roster-head' }, rosterTitle, count, pickHint),
      h('div', { class: 'roster-tools' }, searchLabel, elSeg, roleSeg),
      rosterUl);
    renderSlots(); renderRoster();
  }

  // ── 포커스·스크롤 보존 재그리기 ──
  const keep = (root, draw) => {
    const ae = document.activeElement;
    const k = ae && root.contains(ae) ? ae.dataset.k : null;
    draw();
    if (k) root.querySelector(`[data-k="${k}"]`)?.focus({ preventScroll: true });
  };

  // ── 슬롯 ──
  function slotEl(s, i) {
    const pos = String(i + 1);
    const target = store.get().ui.pickTarget === i;
    if (!s) {
      return h('li', { class: `slot slot-empty${target ? ' is-target' : ''}`, dataset: { pos, i: String(i) } },
        h('button', { type: 'button', class: 'slot-btn', dataset: { k: `slot-${i}` }, 'aria-pressed': String(target),
          'aria-label': t(target ? 'team.slot.target.aria' : 'team.slot.empty.aria', { n: pos }),
          onClick: () => store.team.setPickTarget(target ? null : i) },
        h('span', { class: 'slot-plus' }, icon('plus', 'ic ic-lg')),
        h('span', { class: 'slot-pos' }, pos),
        h('span', { class: 'slot-name' }, t('team.slot.empty.label'))));
    }
    const meta = chars()[s.id] || {};
    const full = nameOf(s.id);
    const rk = roleKey(meta.role);
    const el = meta.elementKey || 'none';
    const chips = slotChips(s, meta, t);
    const shown = chips.slice(0, 2);
    const aria = [t('team.slot.aria', { n: pos, name: full }), ...chips].join(' · ');
    const btn = h('button', { type: 'button', class: 'slot-btn', dataset: { k: `slot-${i}`, id: String(s.id) }, 'aria-label': aria, 'aria-describedby': 'team-drag-hint' },
      h('img', { src: iconSrc(s.id), alt: '', draggable: 'false' }),
      h('span', { class: 'slot-pos' }, pos),
      h('span', { class: 'slot-name' }, shortName(full)),
      h('span', { class: 'slot-meta' }, components.elTag(el, t(el === 'none' ? 'element.none.long' : `element.${el}`)), rk ? t(`role.${rk}`) : '',
        ...shown.map((c) => h('span', { class: 'chip' }, c)),
        chips.length > 2 && h('span', { class: 'chip chip-more', title: chips.slice(2).join(' · ') }, t('team.slot.chip.more', { n: chips.length - 2 }))));
    btn.addEventListener('click', (e) => { if (drag.suppress) { e.preventDefault(); drag.suppress = false; return; } openGrow(ctx, i); });
    btn.addEventListener('keydown', (e) => {
      if (!e.altKey) return;
      const dir = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      const j = i + dir;
      if (j >= 0 && j < 5) swap(i, j, true);
    });
    const rm = h('button', { type: 'button', class: 'slot-rm btn-icon', dataset: { k: `rm-${i}` }, 'aria-label': t('team.slot.remove.aria', { name: full }),
      onClick: () => removeAt(i) }, icon('x'));
    return h('li', { class: 'slot', dataset: { pos, i: String(i), el } }, btn, rm);
  }
  function renderSlots() {
    keep(slotsOl, () => slotsOl.replaceChildren(...store.get().team.map(slotEl)));
    const pt = store.get().ui.pickTarget;
    pickHint.hidden = pt == null;
    if (pt != null) {
      pickHint.replaceChildren(t('team.pick.hint', { n: pt + 1 }),
        h('button', { type: 'button', class: 'pick-cancel', onClick: () => store.team.setPickTarget(null) }, t('team.pick.cancel')));
    }
  }

  // 슬롯 이미지 위치(동료 id → rect)로 FLIP: 재그리기는 요소를 새로 만들기 때문에 id 로 짝을 맞춘다.
  const slotRects = () => new Map([...slotsOl.querySelectorAll('.slot-btn[data-id]')].map((b) => [b.dataset.id, b.getBoundingClientRect()]));
  function flipFrom(before) {
    if (motion.reduced()) return Promise.resolve();
    const anims = [];
    for (const b of slotsOl.querySelectorAll('.slot-btn[data-id]')) {
      const r0 = before.get(b.dataset.id); if (!r0) continue;
      const r1 = b.getBoundingClientRect();
      const dx = r0.left - r1.left, dy = r0.top - r1.top;
      if (!dx && !dy) continue;
      anims.push(b.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: motion.dur('base'), easing: motion.ease('standard') }).finished);
    }
    return Promise.all(anims).catch(() => {});
  }
  function swap(a, b, keepFocus = false) {
    const before = slotRects();
    const r = store.team.swap(a, b);
    if (!r.ok) return;
    store.saveDraft?.();
    flipFrom(before);
    if (keepFocus) slotsOl.querySelector(`[data-k="slot-${b}"]`)?.focus({ preventScroll: true });
  }
  async function removeAt(i) {
    if (busy) return;
    const li = slotsOl.children[i];
    const btn = li && li.querySelector('.slot-btn');
    busy = true;
    try { if (btn) await motion.fade(btn, { out: true, y: 4 }); } catch { /* 애니메이션 취소는 무시 */ }
    busy = false;
    store.team.remove(i);
    store.saveDraft?.();
    slotsOl.querySelector(`[data-k="slot-${i}"]`)?.focus({ preventScroll: true });
  }

  // ── 슬롯 드래그 교체(마우스: 끌기 / 터치: 길게 누른 뒤 끌기) ──
  const drag = { suppress: false };
  function clearDrag() {
    clearTimeout(drag.timer);
    drag.ghost?.remove();
    slotsOl.querySelectorAll('.is-dragging,.is-over').forEach((el) => el.classList.remove('is-dragging', 'is-over'));
    slotsOl.classList.remove('is-sorting');
    Object.assign(drag, { active: false, start: null, ghost: null, over: -1, timer: 0 });
  }
  function beginDrag() {
    const src = slotsOl.children[drag.i];
    const btn = src && src.querySelector('.slot-btn');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    drag.active = true;
    drag.dx = drag.x0 - r.left; drag.dy = drag.y0 - r.top;
    const g = btn.cloneNode(true);
    g.className = 'slot-btn slot-ghost';
    g.removeAttribute('data-k');
    Object.assign(g.style, { width: `${r.width}px`, height: `${r.height}px`, left: `${r.left}px`, top: `${r.top}px` });
    document.body.append(g);
    drag.ghost = g;
    src.classList.add('is-dragging');
    slotsOl.classList.add('is-sorting');
    if (navigator.vibrate && drag.type !== 'mouse') { try { navigator.vibrate(10); } catch { /* 미지원 */ } }
  }
  function moveDrag(x, y) {
    drag.ghost.style.transform = `translate(${x - drag.dx - parseFloat(drag.ghost.style.left)}px, ${y - drag.dy - parseFloat(drag.ghost.style.top)}px)`;
    const under = document.elementFromPoint(x, y);
    const li = under && under.closest && under.closest('.slots > .slot');
    const j = li && slotsOl.contains(li) ? +li.dataset.i : -1;
    if (j === drag.over) return;
    slotsOl.querySelectorAll('.is-over').forEach((el) => el.classList.remove('is-over'));
    drag.over = j;
    if (j >= 0 && j !== drag.i) li.classList.add('is-over');
  }
  slotsOl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || busy) return;
    const btn = e.target.closest('.slot-btn[data-id]');
    if (!btn || e.target.closest('.slot-rm')) return;
    clearDrag();
    Object.assign(drag, { i: +btn.closest('.slot').dataset.i, x0: e.clientX, y0: e.clientY, type: e.pointerType, start: Date.now(), pid: e.pointerId });
    if (e.pointerType !== 'mouse') drag.timer = setTimeout(() => { if (drag.start) beginDrag(); }, LONG_PRESS);
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag.start || e.pointerId !== drag.pid) return;
    const far = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > DRAG_SLOP;
    if (!drag.active) {
      if (!far) return;
      if (drag.type === 'mouse') beginDrag();
      else { clearDrag(); return; }       // 길게 누르기 전에 움직이면 스크롤로 본다
    }
    if (drag.active) moveDrag(e.clientX, e.clientY);
  });
  const endDrag = (e, cancel) => {
    if (!drag.start || (e && e.pointerId !== drag.pid)) return;
    const { active, i, over } = drag;
    clearDrag();
    if (!active) return;
    drag.suppress = true;                  // 끌기 뒤 따라오는 click 을 먹는다
    setTimeout(() => { drag.suppress = false; }, 50);
    if (!cancel && over >= 0 && over !== i) swap(i, over);
  };
  window.addEventListener('pointerup', (e) => endDrag(e, false));
  window.addEventListener('pointercancel', (e) => endDrag(e, true));
  slotsOl.addEventListener('touchmove', (e) => { if (drag.active) e.preventDefault(); }, { passive: false });
  slotsOl.addEventListener('contextmenu', (e) => { if (e.target.closest('.slot-btn')) e.preventDefault(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag.active) endDrag(null, true); });

  // ── 동료 목록 ──
  function rosterList() {
    const cs = Object.values(chars());
    return cs.sort((a, b) => ((b.rarity || 0) - (a.rarity || 0)) || (a.id - b.id));
  }
  function renderRoster() {
    const st = store.get();
    const ui = st.ui;
    const team = st.team;
    const q = String(ui.search || '').trim().toLowerCase();
    const list = rosterList().filter((c) => {
      if (ui.filterEl && ui.filterEl !== 'all' && c.elementKey !== ui.filterEl) return false;
      if (ui.filterRole && ui.filterRole !== 'all' && roleKey(c.role) !== ui.filterRole) return false;
      if (q && !(nameOf(c.id).toLowerCase().includes(q) || String(c.name || '').toLowerCase().includes(q))) return false;
      return true;
    });
    count.textContent = t('team.roster.count', { n: team.filter(Boolean).length });
    keep(rosterUl, () => {
      if (!list.length) {
        rosterUl.replaceChildren(h('li', { class: 'roster-empty' }, components.empty(t('team.roster.empty'),
          button({ tier: 'secondary', size: 'sm', label: t('team.roster.reset'), onClick: resetFilters }))));
        return;
      }
      rosterUl.replaceChildren(...list.map((c) => {
        const at = team.findIndex((s) => s && s.id === c.id);
        const name = nameOf(c.id);
        return h('li', {}, h('button', {
          type: 'button', class: `tile${at >= 0 ? ' in' : ''}`, dataset: { k: `tile-${c.id}`, id: String(c.id) },
          'aria-label': at >= 0 ? t('team.tile.placed.aria', { name, n: at + 1 }) : name, 'aria-pressed': String(at >= 0), title: name,
          onClick: (e) => pick(c.id, e.currentTarget),
        }, h('img', { src: iconSrc(c.id), alt: '', loading: 'lazy', draggable: 'false' }), components.dot(c.elementKey || 'none'), at >= 0 && h('b', {}, String(at + 1))));
      }));
    });
  }
  function resetFilters() {
    search.value = '';
    elSeg.set('all'); roleSeg.set('all');
    store.set({ ui: { ...store.get().ui, search: '', filterEl: 'all', filterRole: 'all' } });
  }

  async function pick(id, tile) {
    if (busy) return;
    const team = store.get().team;
    const at = team.findIndex((s) => s && s.id === id);
    if (at >= 0) {                                   // 편성된 동료를 다시 누르면 해제
      const btn = slotsOl.children[at]?.querySelector('.slot-btn');
      busy = true;
      try { if (btn) await motion.fade(btn, { out: true, y: 4 }); } catch { /* noop */ }
      busy = false;
      store.team.pick(id);
      store.saveDraft?.();
      return;
    }
    const r = store.team.pick(id);
    if (!r.ok) {
      if (r.reason === 'full') toast(t('team.msg.full'));
      return;                                        // imbueonP1 은 스토어 알림으로 안내
    }
    store.saveDraft?.();
    const img = slotsOl.children[r.at]?.querySelector('.slot-btn img');
    const from = tile && tile.querySelector('img');
    if (!img || !from || motion.reduced()) return;
    busy = true;
    img.style.visibility = 'hidden';
    try { await motion.flyTo(from, img, iconSrc(id)); } catch { /* noop */ }
    img.style.visibility = '';
    busy = false;
  }

  // ── 구독 ──
  build();
  store.subscribe((s) => s.team, () => { renderSlots(); renderRoster(); });
  store.subscribe((s) => s.ui.pickTarget, renderSlots);
  store.subscribe((s) => s.chars, () => { renderSlots(); renderRoster(); });
  store.subscribe((s) => `${s.ui.search}|${s.ui.filterEl}|${s.ui.filterRole}`, () => {
    const ui = store.get().ui;
    if (search.value !== (ui.search || '')) search.value = ui.search || '';
    elSeg.set(ui.filterEl || 'all'); roleSeg.set(ui.filterRole || 'all');
    renderRoster();
  });
  store.onNotice?.(({ key, vars }) => { if (NOTICE_KEY[key]) toast(t(NOTICE_KEY[key], vars)); });
  i18n.onChange(() => { build(); ensureLangData(ctx).then((fresh) => { if (fresh) build(); }); });
  ensureLangData(ctx).then((fresh) => { if (fresh) build(); });
}
