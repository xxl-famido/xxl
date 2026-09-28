// 공용 컴포넌트 — 모든 UI 모듈은 여기 API 로만 시트·토스트·툴팁·메뉴·세그먼트·슬라이더·스위치를 만든다.
// 마크업 규칙은 app.css 의 클래스와 1:1. 문구는 호출부가 i18n 으로 넘긴다(여기서 한국어를 만들지 않는다).
import { dur, ease, reduced, accordion as accMotion } from '../motion/index.js';

export const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};

/** Lucide 스프라이트 아이콘. name = sprite.svg 의 i-* 접미어. */
export const icon = (name, cls = 'ic') => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', `ui-icons/sprite.svg#i-${name}`);
  s.append(u); return s;
};

export const dot = color => h('i', { class: 'dot', style: { background: `var(--element-${color})` } });

/** 속성 이름 표기(점 + 속성색 글자). el = elementKey(fire·water·wood·light·dark·none). */
export const elTag = (el, label) => h('span', { class: 'el-tag', dataset: { el: el || 'none' } }, dot(el || 'none'), label);

/** 버튼. tier: primary | secondary | ghost | danger. */
export const button = ({ tier = 'secondary', size = '', label, iconName, iconOnly = false, ...attrs }) =>
  h('button', { class: `btn btn-${tier}${size ? ' btn-' + size : ''}${iconOnly ? ' btn-icon' : ''}`, type: 'button', 'aria-label': iconOnly ? label : undefined, ...attrs },
    iconName && icon(iconName), !iconOnly && h('span', {}, label));

/** 세그먼트 컨트롤. options: [{value, label(node|string)}], onChange(value). 5개 이하 권장. */
export function segment({ options, value, onChange, full = false, ariaLabel }) {
  const root = h('div', { class: `seg${full ? ' seg-full' : ''}`, role: 'group', 'aria-label': ariaLabel });
  const set = v => { root.dataset.val = String(v); root.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v == v))); };
  for (const o of options) root.append(h('button', { type: 'button', dataset: o.el ? { v: String(o.value), el: o.el } : { v: String(o.value) }, onClick: () => { if (root.dataset.val == o.value) return; set(o.value); onChange?.(o.value); } }, o.label));
  set(value);
  root.set = set;
  return root;
}

/** 슬라이더 + 숫자 입력. 값은 정수. onChange(v) 는 input 마다, onCommit(v) 는 change 마다. */
export function slider({ id, min, max, value, step = 1, unit, onChange, onCommit, ariaLabel }) {
  const num = h('input', { class: 'num-in', id, type: 'number', min, max, step, value, 'aria-label': ariaLabel });
  const range = h('input', { type: 'range', min, max, step, value, 'aria-label': ariaLabel });
  const paint = v => range.style.setProperty('--p', `${((v - min) / (max - min)) * 100}%`);
  const clamp = v => Math.max(min, Math.min(max, Math.round(+v || min)));
  const sync = (v, commit) => { v = clamp(v); num.value = v; range.value = v; paint(v); onChange?.(v); if (commit) onCommit?.(v); };
  range.addEventListener('input', () => sync(range.value, false));
  range.addEventListener('change', () => sync(range.value, true));
  num.addEventListener('change', () => sync(num.value, true));
  paint(value);
  const root = h('div', { class: 'field' }, h('div', { class: 'field-row' }, num, unit && h('span', { class: 'unit' }, unit)), range);
  root.set = v => sync(v, false); root.num = num; root.range = range;
  return root;
}

/** 스위치(토글). input 은 시각적 숨김(키보드 접근 유지). */
export function toggle({ label, checked = false, onChange, ariaLabel }) {
  const input = h('input', { type: 'checkbox', checked, 'aria-label': ariaLabel, onChange: () => onChange?.(input.checked) });
  const root = h('label', { class: 'switch' }, input, h('span', { class: 'sw' }), label);
  root.set = v => { input.checked = !!v; }; root.input = input;
  return root;
}

/** 아코디언 항목. summary 는 {title, summaryNode, changed} / body 는 노드. */
export function accordionItem({ title, summaryNode, body, open = false, changed = false, stepNo }) {
  const chev = icon('chevron-down', 'ic acc-chev');
  const sum = h('span', { class: 'acc-sum' }, summaryNode);
  const d = h('details', { open, class: changed ? 'changed' : '' },
    h('summary', {}, stepNo != null && h('span', { class: 'step-n' }, String(stepNo)), h('span', { class: 'acc-title' }, title), sum, chev),
    h('div', { class: 'acc-body' }, body));
  accMotion(d);
  d.setSummary = node => { sum.classList.add('swap'); setTimeout(() => { sum.replaceChildren(node); sum.classList.remove('swap'); }, dur('fast')); };
  d.setChanged = v => d.classList.toggle('changed', !!v);
  return d;
}

/** 시트/모달. 한 번에 하나(중첩 시 앞 것을 닫는다). 반환: {close, body, el} */
let openSheetRef = null;
export function openSheet({ title, body, foot, size = '', onClose, ariaLabel }) {
  if (openSheetRef) openSheetRef.close(true);
  const scrim = h('div', { class: 'scrim' });
  const closeBtn = button({ tier: 'ghost', iconName: 'x', iconOnly: true, label: ariaLabel || 'close' });
  const el = h('div', { class: `sheet ${size}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h2', {}, title), closeBtn),
    h('div', { class: 'sheet-body' }, body),
    foot && h('div', { class: 'sheet-foot' }, foot));
  const host = document.getElementById('app-sheets') || document.body;
  host.append(scrim, el);
  const prevFocus = document.activeElement;
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  let closed = false;
  const close = (immediate = false) => {
    if (closed) return; closed = true; openSheetRef = null;
    document.removeEventListener('keydown', onKey);
    const done = () => { scrim.remove(); el.remove(); onClose?.(); prevFocus?.focus?.(); };
    if (immediate || reduced()) return done();
    scrim.classList.add('out'); el.classList.add('out');
    setTimeout(done, dur('base'));
  };
  scrim.addEventListener('click', () => close());
  closeBtn.addEventListener('click', () => close());
  el.tabIndex = -1;
  setTimeout(() => el.focus({ preventScroll: true }), 30);   // 시트 자체에 포커스(닫기 버튼에 링이 뜨지 않게). Tab 을 누르면 첫 컨트롤로 간다.
  openSheetRef = { close, el, body: el.querySelector('.sheet-body') };
  return openSheetRef;
}

/** 토스트. action: {label, fn} 이면 되돌리기 같은 버튼. */
export function toast(message, { action, duration = 4000 } = {}) {
  let host = document.getElementById('app-toast');
  if (!host) { host = h('div', { id: 'app-toast', class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(host); }
  const el = h('div', { class: 'toast' }, h('span', {}, message),
    action && h('button', { type: 'button', onClick: () => { action.fn(); remove(); } }, action.label));
  const remove = () => { el.classList.add('out'); setTimeout(() => el.remove(), dur('fast')); };
  host.append(el);
  setTimeout(remove, duration);
  return { remove };
}

/** 툴팁(?) — 트리거에 hover/focus/클릭(터치). 텍스트만. */
export function tooltip(trigger, text) {
  let tip = null;
  const show = () => {
    if (tip) return;
    tip = h('div', { class: 'tip', role: 'tooltip' }, text);
    document.body.append(tip);
    const r = trigger.getBoundingClientRect();
    const w = tip.offsetWidth;
    tip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    tip.style.top = `${r.bottom + 6 + scrollY}px`;
  };
  const hide = () => { tip?.remove(); tip = null; };
  trigger.addEventListener('mouseenter', show); trigger.addEventListener('mouseleave', hide);
  trigger.addEventListener('focus', show); trigger.addEventListener('blur', hide);
  trigger.addEventListener('click', e => { e.preventDefault(); tip ? hide() : show(); });
  return { show, hide };
}

/** 드롭다운 메뉴. items: [{label, iconName, onSelect, danger} | 'sep'] */
export function menu(anchor, items) {
  const el = h('div', { class: 'menu', role: 'menu' }, ...items.map(it => it === 'sep' ? h('hr') :
    h('button', { type: 'button', role: 'menuitem', class: it.danger ? 'danger' : '', onClick: () => { close(); it.onSelect?.(); } }, it.iconName && icon(it.iconName), it.label)));
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  el.style.top = `${r.bottom + 4 + scrollY}px`;
  el.style.left = `${Math.min(r.left, innerWidth - el.offsetWidth - 8)}px`;
  const close = () => { el.remove(); document.removeEventListener('click', onDoc, true); document.removeEventListener('keydown', onKey); };
  const onDoc = e => { if (!el.contains(e.target) && e.target !== anchor) close(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  setTimeout(() => { document.addEventListener('click', onDoc, true); document.addEventListener('keydown', onKey); }, 0);
  el.querySelector('button')?.focus();
  return { close, el };
}

/** 빈 상태: 문장 1줄 + 행동 1개. */
export const empty = (text, action) => h('div', { class: 'empty' }, h('span', {}, text), action);

/** 모듈 전용 스타일시트를 한 번만 붙인다(css/<module>.css). 공용 app.css 를 여러 에이전트가 동시에 고치지 않기 위한 규칙. */
export function ensureStyle(href) {
  if (document.querySelector(`link[data-href="${href}"]`)) return;
  document.head.append(h('link', { rel: 'stylesheet', href, 'data-href': href }));
}
