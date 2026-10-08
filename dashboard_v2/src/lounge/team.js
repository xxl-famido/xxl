/**
 * lounge/team.js — 팀 공유: 모아보기, 올리기(공유 코드 판독 → 5인 프로필 자동), 보기(시뮬하러 가기).
 *
 * 공유 코드는 시뮬레이터와 같은 코덱(src/core/codec.js)으로 브라우저에서 바로 읽는다.
 * 실서비스에서는 서버도 같은 코덱으로 다시 읽어 동료 목록을 정한다(docs/community/PLAN.md §4-3).
 */
import * as api from './api.js';
import { spamReason } from './shared.js';
import { t, roleLabel, spamText } from './i18n.js';
import { cooldownButton, isCooling, writeError, reveal, put, h, icon, avatar, anonName, ago, buildChip, charOf, nameOf, searchText, iconSrc, elTag, toast, askPin, askConfirm, menuButton, votes, clampText, emptyState, skeleton, seg, pinField, reducedMotion } from './ui.js';
import { threadView } from './thread.js';
import { decodeShare } from '../core/codec.js';
import { summarizeSnap, teamIdsOf } from './shared.js';
import { flip, dur, ease } from '../motion/index.js';

const MAX_WITH = 3;
const basisLabel = (k) => t(`basis.${k}`);
export const simHref = (code) => `index.html#code=${encodeURIComponent(code)}&run=1`;

/** 공유 코드 → { ids, summary, extra }. 읽을 수 없으면 에러. */
export async function readCode(raw) {
  const code = String(raw || '').trim();
  if (!code) throw new Error(t('code.empty'));
  if (code.length > api.LIMITS.code) throw new Error(t('code.tooLong'));
  let recs;
  try { recs = await decodeShare(code); } catch { throw new Error(t('code.bad')); }
  const snap = recs && recs[0] && recs[0].snap;
  const ids = teamIdsOf(snap);
  if (!ids.length) throw new Error(t('code.empty.team'));
  const known = new Set((await api.chars()).map((c) => c.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) throw new Error(t('code.unknown', { ids: unknown.join(', ') }));
  const summary = summarizeSnap(snap);
  return { code, ids, summary, extraRecords: recs.length - 1 };
}

function summaryChips(s) {
  if (!s) return null;
  return h('span', { class: 'lg-sum' },
    h('span', { class: 'lg-chip' }, t('sum.turns', { n: s.turns })),
    h('span', { class: 'lg-chip' }, t('sum.enemies', { n: s.dummies })),
    s.altar && h('span', { class: 'lg-chip' }, t('sum.altar')),
    s.plan && h('span', { class: 'lg-chip' }, t('sum.plan')),
    s.spec ? h('span', { class: 'lg-chip' }, t('sum.spec', { n: s.spec })) : null);
}

/** 5인 프로필. size: 'lg'(보기·올리기) | 'sm'(목록). */
function teamStrip(ids, size = 'sm', focus = null) {
  if (size === 'sm') {
    return h('span', { class: 'lg-strip' }, ids.map((id, i) => h('span', { class: `lg-strip-cell ${id === focus ? 'is-focus' : ''}` },
      h('img', { src: iconSrc(id), alt: nameOf(id), title: `${i + 1}. ${nameOf(id)}` }))));
  }
  return h('ol', { class: 'lg-slots', 'aria-label': t('team.slots.aria') }, ids.map((id, i) => slotCard(id, i)));
}
function slotCard(id, i) {
  const c = charOf(id);
  return h('li', { class: 'lg-slot', 'data-el': c.el },
    h('a', { href: `#/c/${id}` },
      h('span', { class: 'lg-slot-img' }, h('img', { src: iconSrc(id), alt: '' }), h('span', { class: 'lg-slot-pos' }, String(i + 1))),
      h('span', { class: 'lg-slot-name' }, nameOf(id)),
      h('span', { class: 'lg-slot-meta' }, elTag(c.el), roleLabel(c.role))));
}

// ── 모아보기 ──────────────────────────────────────────────────────────────
const home = { basis: 'any', sort: 'best' };

export async function teamHome(view, params) {
  const all = await api.chars();
  const withIds = (params.get('with') || '').split(',').map(Number).filter((x) => all.some((c) => c.id === x)).slice(0, MAX_WITH);
  const list = h('ol', { class: 'lg-rows' }, h('li', {}, skeleton(4)));
  const withBox = h('div', { class: 'lg-with' });
  view.replaceChildren(h('div', { class: 'lg-single' },
    h('header', { class: 'lg-page-head' }, h('h1', { class: 'lg-h1' }, t('nav.team')),
      h('a', { class: 'btn btn-primary', href: '#/team/new' }, icon('upload'), t('team.upload'))),
    h('div', { class: 'lg-tools' }, withBox,
      seg(t('basis.aria'), [{ value: 'any', label: t('common.all') }, ...api.TEAM_BASIS.map((b) => ({ value: b.key, label: basisLabel(b.key) }))], home.basis, (v) => { home.basis = v; paint(true); }),
      seg(t('sort.aria'), [{ value: 'best', label: t('sort.best') }, { value: 'new', label: t('sort.new') }], home.sort, (v) => { home.sort = v; paint(true); })),
    list));

  function paintWith() {
    put(withBox, h('span', { class: 'lg-label' }, t('team.with')),
      withIds.map((id) => h('button', { class: 'lg-with-chip', 'aria-label': t('team.with.remove', { name: nameOf(id) }), onclick: () => { withIds.splice(withIds.indexOf(id), 1); syncUrl(); } },
        avatar(id, 20), nameOf(id), icon('x'))),
      withIds.length < MAX_WITH && pickerButton(withIds, (id) => { withIds.push(id); syncUrl(); }));
  }
  function syncUrl() {
    history.replaceState(null, '', withIds.length ? `#/team?with=${withIds.join(',')}` : '#/team');
    paintWith(); paint(true);
  }

  const rows = new Map();
  async function paint(animate = false) {
    const items = await api.teams({ withIds, basis: home.basis, sort: home.sort });
    const build = () => {
      if (!items.length) { list.replaceChildren(h('li', {}, emptyState(withIds.length ? t('team.empty.filter') : t('team.empty'), { href: '#/team/new', label: t('team.upload') }))); return; }
      list.replaceChildren(...items.map((m) => rows.get(m.id) || rowOf(m)));
    };
    if (animate && list.querySelector('.lg-row')) flip(list, build); else { build(); reveal([...list.children]); }
  }
  function rowOf(m) {
    const [d] = clampText(m.descr.replace(/\s*\n+\s*/g, ' '), 2, 'lg-row-desc');
    const li = h('li', {}, h('a', { class: 'lg-row is-team', href: `#/team/${m.id}` },
      teamStrip(m.ids, 'sm'),
      h('span', { class: 'lg-row-main' },
        h('span', { class: 'lg-row-title' }, m.title),
        d,
        h('span', { class: 'lg-row-meta' }, h('span', { class: 'lg-chip' }, basisLabel(m.basis)), avatar(m.anon, 16), anonName(m.anon, m.anonNo, m.op), ' · ', ago(m.at), buildChip(m.build))),
      h('span', { class: 'lg-row-stats' }, h('span', {}, icon('thumbs-up'), m.likes), h('span', {}, icon('message-circle'), m.comments))));
    rows.set(m.id, li);
    return li;
  }
  paintWith(); paint();
}

/** 동료 고르기 팝오버. */
function pickerButton(exclude, onPick) {
  const btn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-haspopup': 'dialog' }, icon('plus'), t('team.pick'));
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    document.querySelector('.lg-picker')?.remove();
    const all = await api.chars();
    const q = h('input', { type: 'search', placeholder: t('search.name'), 'aria-label': t('team.pick.search') });
    const grid = h('div', { class: 'lg-picker-grid' });
    const paint = () => grid.replaceChildren(...all.filter((c) => !exclude.includes(c.id) && (!q.value || searchText(c.id).includes(q.value.trim().toLowerCase())))
      .sort((a, b) => b.id - a.id)
      .map((c) => h('button', { type: 'button', class: 'lg-tchip', title: nameOf(c.id), 'aria-label': nameOf(c.id), onclick: () => { pop.remove(); onPick(c.id); } }, h('img', { src: iconSrc(c.id), alt: '' }))));
    const pop = h('div', { class: 'menu lg-picker', role: 'dialog', 'aria-label': t('team.pick') }, h('label', { class: 'search lg-search' }, icon('search'), q), grid);
    q.addEventListener('input', paint);
    paint();
    const r = btn.getBoundingClientRect();
    pop.style.top = `${r.bottom + scrollY + 4}px`;
    pop.style.left = `${Math.max(8, Math.min(r.left + scrollX, innerWidth - 336))}px`;
    document.body.append(pop);
    q.focus();
    const off = (ev) => { if (!pop.contains(ev.target)) { pop.remove(); removeEventListener('click', off); } };
    setTimeout(() => addEventListener('click', off));
    pop.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { pop.remove(); btn.focus(); } });
  });
  return btn;
}

// ── 올리기 ───────────────────────────────────────────────────────────────
export async function teamNew(view, params) {
  await api.chars();
  let read = null;
  let basis = 'boss';
  const codeIn = h('textarea', { class: 'lg-textarea lg-boxed lg-code', rows: 3, placeholder: t('team.code.ph'), 'aria-label': t('field.code'), spellcheck: 'false' }, params.get('code') || '');
  const codeErr = h('p', { class: 'lg-err', role: 'alert' });
  const preview = h('div', { class: 'lg-preview' }, previewEmpty());
  const titleIn = h('input', { class: 'lg-input', maxlength: api.LIMITS.title, placeholder: t('team.title.ph'), 'aria-label': t('field.title') });
  const descr = h('textarea', { class: 'lg-textarea lg-boxed', rows: 8, maxlength: api.LIMITS.teamDesc, placeholder: t('team.descr.ph'), 'aria-label': t('field.descr') });
  const counter = h('span', { class: 'lg-counter' }, `0 / ${api.LIMITS.teamDesc}`);
  const submit = cooldownButton(h('button', { class: 'btn btn-primary btn-lg', type: 'submit', disabled: true }, t('team.upload')));

  view.replaceChildren(h('div', { class: 'lg-single is-narrow' },
    h('a', { class: 'lg-back', href: '#/team' }, icon('arrow-left'), t('nav.team')),
    h('header', { class: 'lg-page-head' }, h('h1', { class: 'lg-h1' }, t('team.upload'))),
    h('form', { class: 'lg-form', onsubmit: onSubmit },
      h('label', { class: 'lg-field' }, h('span', { class: 'lg-label' }, t('field.code')), codeIn, codeErr),
      preview,
      h('label', { class: 'lg-field' }, h('span', { class: 'lg-label' }, t('field.title')), titleIn),
      h('div', { class: 'lg-field' }, h('span', { class: 'lg-label' }, t('basis.aria')),
        seg(t('basis.aria'), api.TEAM_BASIS.map((b) => ({ value: b.key, label: basisLabel(b.key) })), basis, (v) => { basis = v; })),
      h('label', { class: 'lg-field' }, h('span', { class: 'lg-label-row' }, h('span', { class: 'lg-label' }, t('field.descr')), counter), descr),
      h('div', { class: 'lg-form-foot' }, pinField('team-pin'), submit))));

  let timer = 0;
  const tryRead = async () => {
    codeErr.textContent = '';
    if (!codeIn.value.trim()) { read = null; preview.replaceChildren(previewEmpty()); submit.disabled = true; return; }
    try {
      const r = await readCode(codeIn.value);
      const same = read && read.code === r.code;
      read = r;
      submit.disabled = false;
      if (!same) await showPreview(r);
    } catch (e) { read = null; submit.disabled = true; codeErr.textContent = e.message; preview.replaceChildren(previewEmpty()); }
  };
  codeIn.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(tryRead, 250); });
  descr.addEventListener('input', () => { counter.textContent = `${descr.value.length} / ${api.LIMITS.teamDesc}`; });
  if (codeIn.value) tryRead();

  function previewEmpty() {
    return h('div', { class: 'lg-slots-empty' }, Array.from({ length: 5 }, (_, i) => h('span', {}, String(i + 1))), h('p', { class: 'lg-hint' }, t('team.preview.hint')));
  }

  /** 코드 칸에서 동료 아이콘이 하나씩 빠져나와 슬롯에 앉는다. */
  async function showPreview(r) {
    const dup = await api.teamByCode(r.code);
    const slots = teamStrip(r.ids, 'lg');
    put(preview, slots,
      h('div', { class: 'lg-preview-foot' }, summaryChips(r.summary),
        r.extraRecords > 0 && h('span', { class: 'lg-hint' }, t('team.multiRecords', { n: r.extraRecords + 1 }))),
      dup && h('p', { class: 'lg-note' }, t('team.dup'), ' ', h('a', { href: `#/team/${dup.id}` }, dup.title)));
    if (reducedMotion()) return;
    const from = codeIn.getBoundingClientRect();
    const imgs = [...slots.querySelectorAll('.lg-slot-img img')];
    imgs.forEach((im) => { im.style.opacity = '0'; });
    slots.querySelectorAll('.lg-slot-name, .lg-slot-meta').forEach((el) => { el.style.opacity = '0'; });
    await Promise.all(imgs.map((im, i) => new Promise((res) => setTimeout(async () => {
      const to = im.getBoundingClientRect();
      const size = 40;
      const g = h('img', { class: 'fly', src: im.src, alt: '', style: { left: `${from.left + from.width / 2 - size / 2}px`, top: `${from.top + from.height / 2 - size / 2}px`, width: size + 'px', height: size + 'px' } });
      document.body.append(g);
      await g.animate([
        { transform: 'none', opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { transform: `translate(${to.left - (from.left + from.width / 2 - size / 2)}px, ${to.top - (from.top + from.height / 2 - size / 2)}px) scale(${to.width / size})`, opacity: 1 },
      ], { duration: dur('slow') + 120, easing: ease('enter'), fill: 'forwards' }).finished;
      im.style.opacity = ''; g.remove();
      const card = im.closest('.lg-slot');
      card.querySelectorAll('.lg-slot-name, .lg-slot-meta').forEach((el) => { el.style.opacity = ''; el.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: dur('base'), easing: ease('enter') }); });
      res();
    }, i * 70))));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!read) { codeErr.textContent = t('code.readFirst'); return; }
    const why = spamReason(titleIn.value) || spamReason(descr.value);
    if (why) { toast(spamText(why)); return; }
    submit.disabled = true;
    try {
      const tm = await api.createTeam({ code: read.code, ids: read.ids, summary: read.summary, title: titleIn.value, basis, descr: descr.value, pin: document.getElementById('team-pin').value });
      toast(t('toast.teamUploaded'));
      location.hash = `#/team/${tm.id}`;
    } catch (ex) {
      writeError(ex);
      if (!isCooling(submit)) submit.disabled = false;
    }
  }
}

// ── 보기 ─────────────────────────────────────────────────────────────────
export async function teamView(view, id) {
  view.replaceChildren(skeleton(8));
  await api.chars();
  const m = await api.team(id);
  if (!m) { view.replaceChildren(emptyState(t('team.notFound'), { href: '#/team', label: t('nav.team') })); return; }
  const slots = teamStrip(m.ids, 'lg');
  const go = h('a', { class: 'btn btn-primary btn-lg lg-go', href: simHref(m.code) }, icon('play'), t('team.toSim'));
  go.addEventListener('click', (e) => {
    if (reducedMotion()) return;
    e.preventDefault();
    // 떠나기 전에 다섯 명이 차례로 앞으로 모였다가 페이지가 물러난다 — '이 팀 그대로 시뮬로 간다'는 연결.
    const cards = [...slots.children];
    cards.forEach((c, i) => c.animate([{ transform: 'none' }, { transform: 'translateY(-6px)' }, { transform: 'none' }], { duration: dur('base'), delay: i * 40, easing: ease('standard') }));
    view.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-8px)' }], { duration: dur('base'), delay: 220, easing: ease('exit'), fill: 'forwards' })
      .finished.then(() => { location.href = go.href; });
  });
  const codeBox = h('code', { class: 'lg-codebox' }, m.code);
  view.replaceChildren(h('div', { class: 'lg-single' },
    h('a', { class: 'lg-back', href: '#/team' }, icon('arrow-left'), t('nav.team')),
    h('header', { class: 'lg-page-head is-stack' },
      h('h1', { class: 'lg-h1' }, m.title),
      h('p', { class: 'lg-row-meta' }, h('span', { class: 'lg-chip' }, basisLabel(m.basis)), avatar(m.anon, 16), anonName(m.anon, m.anonNo, m.op), ' · ', ago(m.at), m.edited && ' · ' + t('chip.edited'), ' · ' + api.verLabel(m.build), buildChip(m.build))),
    slots,
    h('div', { class: 'lg-go-bar' },
      summaryChips(m.summary),
      h('span', { class: 'lg-bar-gap' }),
      go),
    m.descr && h('div', { class: 'lg-descr' }, clampText(m.descr, 8)),
    h('div', { class: 'lg-code-row' }, h('span', { class: 'lg-label' }, t('field.code')), codeBox,
      h('button', { class: 'btn btn-secondary btn-sm', onclick: async () => { try { await navigator.clipboard.writeText(m.code); toast(t('toast.codeCopied')); } catch { toast(t('toast.copyFail')); } } }, icon('copy'), t('common.copy'))),
    h('div', { class: 'lg-bar' },
      votes('team:' + m.id, m, { size: 'md' }),
      h('span', { class: 'lg-bar-gap' }),
      menuButton(t('common.more'), [
        { label: t('common.edit'), icon: 'pencil', run: async () => {
          const pin = api.isOperator() ? null : await askPin({ title: t('team.edit.title'), desc: t('pin.askUploaded'), check: async (p) => { await api.verifyPin(m.id, p); return p; } });
          if (api.isOperator() || pin) openTeamEdit(view, m, pin);
        } },
        { label: t('common.delete'), icon: 'trash-2', danger: true, run: async () => {
          const ok = await askPin({ title: t('team.delete.title'), desc: t('pin.askUploaded'), confirm: t('common.delete'), danger: true, check: async (pin) => { await api.deleteItem(m.id, pin); return true; } });
          if (ok) { toast(t('toast.deleted')); location.hash = '#/team'; }
        } },
        { label: t('common.report'), icon: 'flag', run: async () => { if (await askConfirm({ title: t('common.report'), desc: t('report.team.desc'), confirm: t('common.report') })) toast((await api.report('team:' + m.id)) ? t('toast.reported') : t('toast.reportedAlready')); } },
      ])),
    threadView({ key: 'team:' + m.id, owner: { anon: m.anon, anonNo: m.anonNo }, placeholder: t('team.composer.ph') })));
  reveal([...slots.children]);
}

/** 팀 수정 시트: 제목·기준·설명(공유 코드=팀 구성은 그대로). 저장하면 보기 화면을 다시 그린다. */
function openTeamEdit(view, m, pin) {
  let basis = m.basis;
  const titleIn = h('input', { class: 'lg-input', maxlength: api.LIMITS.title, value: m.title, 'aria-label': t('field.title') });
  const descr = h('textarea', { class: 'lg-textarea lg-boxed', rows: 8, maxlength: api.LIMITS.teamDesc, 'aria-label': t('field.descr') }, m.descr || '');
  const save = h('button', { class: 'btn btn-primary', type: 'submit' }, t('tier.saveEdit'));
  const form = h('form', { class: 'lg-form lg-team-edit' },
    h('p', { class: 'lg-hint' }, t('team.edit.hint')),
    h('label', { class: 'lg-field' }, h('span', { class: 'lg-label' }, t('field.title')), titleIn),
    h('div', { class: 'lg-field' }, h('span', { class: 'lg-label' }, t('basis.aria')), seg(t('basis.aria'), api.TEAM_BASIS.map((b) => ({ value: b.key, label: basisLabel(b.key) })), basis, (v) => { basis = v; })),
    h('label', { class: 'lg-field' }, h('span', { class: 'lg-label' }, t('field.descr')), descr),
    h('div', { class: 'lg-form-foot' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => teamView(view, m.id) }, t('common.cancel')), save));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const why = spamReason(titleIn.value) || spamReason(descr.value);
    if (why) { toast(spamText(why)); return; }
    save.disabled = true;
    try { await api.editTeam(m.id, pin, { title: titleIn.value, basis, descr: descr.value }); toast(t('toast.teamEdited')); await teamView(view, m.id); }
    catch (ex) { writeError(ex); save.disabled = false; }
  });
  const head = view.querySelector('.lg-page-head');
  const descrEl = view.querySelector('.lg-descr');
  if (descrEl) descrEl.remove();
  head.after(form);
  titleIn.focus();
}
