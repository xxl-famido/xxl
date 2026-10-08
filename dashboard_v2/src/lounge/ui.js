/**
 * lounge/ui.js — 라운지 공용 조각: DOM 헬퍼, 아이콘, 동료 아바타·이름, 시간 표기, 토스트, 비밀번호 대화상자, 반응 버튼.
 */
import { shortName } from '../core/format.js';
import * as api from './api.js';
import { dur, ease } from '../motion/index.js';
import { OPERATOR } from './shared.js';
import { i18n, t, locale } from './i18n.js';

export const SPRITE = 'ui-icons/sprite.svg';
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** h('div', {class, onclick, ...}, ...children). false/null/undefined 자식은 건너뛴다. */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function icon(name, cls = 'ic') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', cls); svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', `${SPRITE}#i-${name}`);
  svg.append(use);
  return svg;
}

// ── 동료 ──────────────────────────────────────────────────────────────────
let CH = {};
export function setChars(list) {
  CH = Object.fromEntries(list.map((c) => [c.id, c]));
  i18n.setData({ chars: CH });                     // name_kr/en/ja/cn → 현재 언어 이름
}
export const charOf = (id) => CH[id] || { id, name: String(id), el: 'none', role: '' };
/** 좁은 칸용 이름(현재 언어). 긴 수식어 이름은 마지막 단어 — 공백 없는 일본어·중국어는 그대로. */
export const nameOf = (id) => shortName(i18n.nameOf(id));
/** 검색용: 모든 언어 이름을 한 줄로(어느 언어로 쳐도 찾게) */
export const searchText = (id) => { const c = charOf(id); return [c.name, c.name_kr, c.name_en, c.name_ja, c.name_cn].filter(Boolean).join(' ').toLowerCase(); };
export const iconSrc = (id) => `icons/${id}.png`;
export const elLabel = (el) => t(`element.${el || 'none'}`);
export const EL_ORDER = ['fire', 'water', 'wood', 'light', 'dark'];
/** 포지션 값(동료 데이터의 한국어 — 필터 비교용). 화면 표기는 i18n.roleLabel */
export const ROLES = ['전사', '수호', '치유', '보조', '방해'];

export function avatar(id, size = 32, cls = '') {
  return h('img', { class: `lg-av ${cls}`.trim(), src: iconSrc(id), alt: '', width: size, height: size, loading: 'lazy', style: { width: size + 'px', height: size + 'px' } });
}
/** 표시 이름. 운영자 글(op)만 접두어 없이 '파미도' — 서버가 관리자 토큰으로 확인한 글에만 op 가 붙는다. */
export const anonName = (anon, no = 1, op = false) => (op ? nameOf(OPERATOR.anon) : t('anon.name', { name: nameOf(anon) }) + (no > 1 ? ' ' + no : ''));
export const elTag = (el) => h('span', { class: 'el-tag', 'data-el': el }, h('i', { class: 'dot', style: { background: `var(--el)` } }), elLabel(el));

// ── 시간 ──────────────────────────────────────────────────────────────────
export function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return t('time.justNow');
  if (s < 3600) return t('time.min', { n: Math.floor(s / 60) });
  if (s < 86400) return t('time.hour', { n: Math.floor(s / 3600) });
  if (s < 86400 * 30) return t('time.day', { n: Math.floor(s / 86400) });
  return new Date(ts).toLocaleDateString(locale());
}
/** '이전 버전' 표시 — 티어표·팀 공유 게시글(목록·보기)에만 쓴다. 동료 게시판 의견·댓글에는 붙이지 않는다(2026-10-08 사용자 결정). */
export const buildChip = (build) => build && build !== api.CURRENT_BUILD
  ? h('span', { class: 'lg-chip lg-chip-muted', title: t('chip.prevVersion.title', { ver: api.verLabel(build) }) }, t('chip.prevVersion'))
  : null;

// ── 토스트 ────────────────────────────────────────────────────────────────
export function toast(msg, action) {
  const box = document.getElementById('toasts');
  const t = h('div', { class: 'toast lg-toast', role: 'status' }, h('span', {}, msg),
    action && h('button', { onclick: () => { action.run(); t.remove(); } }, action.label));
  box.append(t);
  setTimeout(() => t.remove(), 4200);
}

// ── 대화상자 ──────────────────────────────────────────────────────────────
/**
 * 비밀번호 4자리를 받아 check(pin) 을 부른다. check 가 던진 에러는 대화상자 안에 보여 주고 다시 입력받는다.
 * 확인에 성공하면 check 의 반환값으로 resolve, 취소하면 null.
 */
export function askPin({ title, desc, confirm = t('common.confirm'), danger = false, check }) {
  return new Promise((resolve) => {
    const input = h('input', { class: 'lg-pin', type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: 4, pattern: '\\d{4}', 'aria-label': t('pin.aria'), placeholder: '····' });
    const err = h('p', { class: 'lg-err', role: 'alert' });
    const ok = h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'submit' }, confirm);
    const form = h('form', { method: 'dialog', class: 'lg-dialog-in' },
      h('h2', {}, title), desc && h('p', { class: 'lg-dialog-desc' }, desc),
      input, err,
      h('div', { class: 'lg-dialog-foot' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close(null) }, t('common.cancel')), ok));
    const dlg = h('dialog', { class: 'lg-dialog', 'aria-label': title }, form);
    let done = false;
    const close = (v) => { if (done) return; done = true; dlg.close(); dlg.remove(); resolve(v); };
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 4); err.textContent = ''; });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!api.isPin(input.value)) { err.textContent = t('pin.need4'); input.focus(); return; }
      ok.disabled = true;
      try { close(await check(input.value)); } catch (ex) { err.textContent = ex.message; input.select(); ok.disabled = false; }
    });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
    document.body.append(dlg);
    dlg.showModal();
    input.focus();
  });
}

/** 확인만 받는 대화상자(신고 등). */
export function askConfirm({ title, desc, confirm = t('common.confirm'), danger = false }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'lg-dialog', 'aria-label': title },
      h('div', { class: 'lg-dialog-in' }, h('h2', {}, title), desc && h('p', { class: 'lg-dialog-desc' }, desc),
        h('div', { class: 'lg-dialog-foot' },
          h('button', { class: 'btn btn-ghost', onclick: () => close(false) }, t('common.cancel')),
          h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => close(true) }, confirm))));
    const close = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(false); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

// ── 드롭다운 메뉴 ─────────────────────────────────────────────────────────
let openMenu = null;
export function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
document.addEventListener('click', (e) => { if (openMenu && !openMenu.contains(e.target)) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
/** items: [{label, icon, run, danger}] | 'sep'. anchor 아래에 붙인다. */
export function menuButton(label, items) {
  const btn = h('button', { class: 'btn-icon lg-more', 'aria-label': label, 'aria-haspopup': 'menu' }, icon('ellipsis-vertical'));
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (openMenu) { closeMenu(); return; }
    const m = h('div', { class: 'menu lg-menu', role: 'menu' }, items.filter(Boolean).map((it) => it === 'sep' ? h('hr') :
      h('button', { role: 'menuitem', class: it.danger ? 'danger' : '', onclick: () => { closeMenu(); it.run(); } }, it.icon && icon(it.icon), it.label)));
    const r = btn.getBoundingClientRect();
    m.style.top = `${r.bottom + scrollY + 4}px`;
    m.style.left = `${Math.max(8, Math.min(r.right + scrollX - 200, innerWidth - 208))}px`;
    document.body.append(m);
    openMenu = m;
    m.querySelector('button')?.focus();
  });
  return btn;
}

// ── 좋아요 / 싫어요 ──────────────────────────────────────────────────────
/** 좋아요 수만 보인다. 싫어요는 눌렀는지만 표시(수는 서버도 내려주지 않는다). */
export function votes(target, item, { size = 'sm' } = {}) {
  const likeN = h('span', { class: 'lg-num' }, String(item.likes || 0));
  const up = h('button', { class: `lg-vote ${size}`, 'aria-pressed': String(item.vote === 1), 'aria-label': t('vote.like') }, icon('thumbs-up'), likeN);
  const down = h('button', { class: `lg-vote ${size}`, 'aria-pressed': String(item.vote === -1), 'aria-label': t('vote.dislike') }, icon('thumbs-down'));
  const set = async (v) => {
    try {
      const r = await api.react(target, v);
      up.setAttribute('aria-pressed', String(r.vote === 1));
      down.setAttribute('aria-pressed', String(r.vote === -1));
      rollNumber(likeN, r.likes);
    } catch (e) { toast(e.message); }
  };
  up.addEventListener('click', () => set(1));
  down.addEventListener('click', () => set(-1));
  return h('span', { class: 'lg-votes' }, up, down);
}
/** 숫자가 바뀌는 방향으로 한 칸 굴린다(reduced-motion 이면 즉시). */
export function rollNumber(el, n) {
  const prev = +el.textContent;
  el.textContent = String(n);
  if (reducedMotion() || prev === n) return;
  el.animate([{ transform: `translateY(${n > prev ? 6 : -6}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: 160, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
}

/** 긴 글: n줄 넘으면 접고 '더 보기'. */
export function clampText(text, lines = 6, cls = 'lg-body') {
  const p = h('p', { class: `${cls} lg-clamp`, style: { '-webkit-line-clamp': String(lines) } }, text);
  const more = h('button', { class: 'lg-more-link', hidden: true }, t('common.readMore'));
  more.addEventListener('click', () => { p.classList.remove('lg-clamp'); p.style.webkitLineClamp = ''; more.remove(); });
  requestAnimationFrame(() => { if (p.scrollHeight > p.clientHeight + 2) more.hidden = false; });
  return [p, more];
}

export function emptyState(msg, action) {
  return h('div', { class: 'empty' }, h('p', {}, msg), action && h('a', { class: 'btn btn-secondary btn-sm', href: action.href }, action.label));
}
export function skeleton(lines = 4) {
  return h('div', { class: 'lg-skel', 'aria-busy': 'true', 'aria-label': t('common.loading') }, Array.from({ length: lines }, (_, i) => h('i', { style: { width: `${90 - (i % 3) * 18}%` } })));
}

/** 세그먼트(등폭 아님, 5개 이하). */
export function seg(label, options, value, onChange) {
  const g = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  for (const o of options) {
    const b = h('button', { type: 'button', 'aria-pressed': String(o.value === value), 'data-value': String(o.value) }, o.dot && h('i', { class: 'dot', 'data-el': o.dot, style: { background: 'var(--el)', width: '6px', height: '6px' } }), o.label);
    b.addEventListener('click', () => { g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); onChange(o.value); });
    g.append(b);
  }
  return g;
}

/** 숫자 4자리 입력(작성 폼용). */
export function pinField(id) {
  const input = h('input', { id, class: 'lg-pin lg-pin-inline', type: 'password', inputmode: 'numeric', autocomplete: 'new-password', maxlength: 4, placeholder: '····', 'aria-describedby': id + '-h' });
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 4); });
  return h('label', { class: 'lg-pinwrap', for: id },
    h('span', { class: 'lg-label' }, icon('key-round'), t('pin.label')), input,
    h('span', { class: 'sr', id: id + '-h' }, t('pin.hint')));
}

/** replaceChildren 이되 false/null/undefined 자식은 건너뛴다(조건부 조각을 그대로 넘길 수 있게). */
export function put(el, ...kids) { el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false)); }

// ── 스크롤 등장(reveal) ────────────────────────────────────────────────────
/*
 * 첫 N개만 애니메이션하던 stagger 대신, 모든 항목이 "화면에 들어오는 순간" 위→아래·왼→오 순서로 등장한다.
 * - 한 번에 보이는 묶음은 위치순으로 정렬해 step 간격으로 이어 붙인다.
 * - 전역 시계(clock)로 묶음을 이어 붙여, 헤더가 먼저 뜨고 늦게 그려진 목록이 그 뒤를 잇는다(동시에 튀지 않음).
 * - 스크롤해서 새로 보이는 항목은 대기열이 비어 있으므로 곧바로 등장.
 * - 지연에 상한을 두지 않는다 — 상한이 있으면 긴 목록의 끝이 한꺼번에 몰려 나와 '급하게 끝나는' 느낌이 된다.
 *   간격·거리·길이는 v2 등장 규칙(motion.css .enter: 8px, dur-slow, 40ms)과 같다. 안전장치로 대기열이 SAFETY 를 넘으면 시계를 되감는다.
 * - 움직임 줄이기면 아무것도 숨기지 않는다.
 */
export const REVEAL_STEP = Object.freeze({ row: 40, tile: 24, chip: 14 });
const REVEAL_QUEUE_SAFETY_MS = 2400;
const REVEAL_SHIFT_PX = 8;
let revealIO = null;
let revealClock = 0;
const revealStep = new WeakMap();

function onReveal(entries) {
  const vis = entries.filter((e) => e.isIntersecting).map((e) => e.target);
  if (!vis.length) return;
  const pos = new Map(vis.map((el) => [el, el.getBoundingClientRect()]));
  vis.sort((a, b) => (Math.round(pos.get(a).top) - Math.round(pos.get(b).top)) || (pos.get(a).left - pos.get(b).left));
  const now = performance.now();
  revealClock = Math.max(revealClock, now);
  if (revealClock - now > REVEAL_QUEUE_SAFETY_MS) revealClock = now;
  for (const el of vis) {
    revealIO.unobserve(el);
    const delay = revealClock - now;
    revealClock += revealStep.get(el) || REVEAL_STEP.row;
    el.classList.remove('lg-rv');
    el.animate([{ opacity: 0, transform: `translateY(${REVEAL_SHIFT_PX}px)` }, { opacity: 1, transform: 'none' }],
      { duration: dur('slow'), delay, easing: ease('enter'), fill: 'backwards' });
  }
}

/** els 를 숨겨 두고 화면에 들어오면 등장시킨다. 이미 등록된 요소는 무시(재사용 노드가 두 번 뜨지 않게). */
export function reveal(els, { step = REVEAL_STEP.row } = {}) {
  if (reducedMotion() || typeof IntersectionObserver === 'undefined') return;
  if (!revealIO) revealIO = new IntersectionObserver(onReveal, { rootMargin: '0px', threshold: 0 });
  for (const el of els) {
    if (!el || el.dataset.rv) continue;
    el.dataset.rv = '1';
    el.classList.add('lg-rv');
    revealStep.set(el, step);
    revealIO.observe(el);
  }
}

/** 화면 전환 시 대기열 초기화(이전 화면 요소 관찰 해제). */
export function resetReveal() {
  if (revealIO) { revealIO.disconnect(); revealIO = null; }
  revealClock = 0;
}

/** 페이지 골격(뒤로 가기·제목·도구·작성 칸 등)을 등장 대상으로. 목록 항목은 각 화면이 따로 등록한다. */
const PAGE_PARTS = ['.lg-back', '.lg-page-head', '.lg-tools', '.lg-hero-text', '.lg-stats', '.lg-composer:not(.is-compact)', '.lg-thread-head', '.lg-tagbar',
  '.lg-sec-head', '.lg-cap', '.lg-title-in', '.lg-field-row', '.lg-board-foot', '.lg-form > *', '.lg-go-bar', '.lg-descr', '.lg-code-row', '.lg-bar',
  '.lg-rail-h', '.lg-publish > *', '.lg-mock-note', '.lg-link-more'].join(',');
export function revealPage(root) { reveal(root.querySelectorAll(PAGE_PARTS)); }

// ── 쓰기 대기(도배 방지 안내) ─────────────────────────────────────────────
/*
 * 서버가 "N초 후 다시"(429 + retryAfter)라고 답했을 때만 켠다 — 화면이 스스로 막지 않는다(서버 규칙과 어긋나지 않게).
 * 등록한 버튼들은 남은 시간이 0 이 될 때까지 "N초 후 가능"으로 잠긴다. 2분을 넘는 대기(하루 한도 등)는 안내 문구로만.
 */
const COOLDOWN_SHOW_MAX_SEC = 120;
let cdUntil = 0;
let cdTimer = null;
const cdButtons = new Set();
function cdTick() {
  clearTimeout(cdTimer);
  const left = Math.ceil((cdUntil - Date.now()) / 1000);
  for (const b of [...cdButtons]) {
    // 막 만들어져 아직 화면에 안 붙은 버튼은 건너뛰고, 붙었다가 사라진 버튼만 정리한다.
    if (!b.isConnected) { if (b.dataset.cdAttached) cdButtons.delete(b); continue; }
    b.dataset.cdAttached = '1';
    if (left > 0) { b.disabled = true; b.classList.add('is-cooling'); b.textContent = t('cooldown.left', { n: left }); }
    else if (b.classList.contains('is-cooling')) { b.classList.remove('is-cooling'); b.disabled = false; b.textContent = b.dataset.cdLabel; }
  }
  if (left > 0) cdTimer = setTimeout(cdTick, 250);
}
/** 제출 버튼을 대기 표시 대상으로 등록(원래 글자는 기억). */
export function cooldownButton(btn) { btn.dataset.cdLabel = btn.textContent; cdButtons.add(btn); cdTick(); return btn; }
export const isCooling = (btn) => btn.classList.contains('is-cooling');
/** 쓰기 실패 공통 처리: 대기형 거절이면 카운트다운, 문구는 토스트. */
export function writeError(e) {
  if (e && e.status === 429 && e.retryAfter > 0 && e.retryAfter <= COOLDOWN_SHOW_MAX_SEC) { cdUntil = Date.now() + e.retryAfter * 1000; cdTick(); }
  toast(e && e.message ? e.message : t('err.generic'), e && e.dupId ? { label: t('common.goSee'), run: () => { location.hash = `#/team/${e.dupId}`; } } : undefined);
}
