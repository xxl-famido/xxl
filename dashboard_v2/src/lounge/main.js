/**
 * lounge/main.js — XXL 라운지 부트: 동료 목록 로드 → 해시 라우터 → 화면 전환 모션.
 *
 * 라우트: #/ · #/c/:id · #/tier · #/tier/new · #/tier/:id · #/team · #/team/new · #/team/:id · #/me
 * 화면 전환은 View Transitions API(동료 목록 → 동료 페이지는 초상화가 이어지는 공유 요소 전환),
 * 미지원 브라우저·움직임 줄이기에서는 즉시 교체.
 */
import * as api from './api.js';
import { OPERATOR } from './shared.js';
import { i18n, t, LANGS } from './i18n.js';
import { h, icon, avatar, anonName, ago, nameOf, setChars, emptyState, toast, reducedMotion } from './ui.js';
import { charList, charPage } from './chars.js';
import { tierHome, tierEditor, tierView } from './tier.js';
import { teamHome, teamNew, teamView } from './team.js';
import { themeFade, stagger } from '../motion/index.js';
import { reveal, resetReveal, revealPage } from './ui.js';

const view = document.getElementById('view');
const VT_WAIT_MS = 60;   // 화면 전환이 첫 그림을 기다리는 최대 시간
const KIND_LABEL = { post: 'me.kind.post', tier: 'me.kind.tier', team: 'me.kind.team' };

function parse() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(qs) };
}

async function route() {
  const { parts, params } = parse();
  const [a, b] = parts;
  document.querySelectorAll('.lg-side a').forEach((el) => {
    const on = el.dataset.nav === (a === 'c' || !a ? 'char' : a);
    el.classList.toggle('on', on);
    if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
  if (!a) return charList(view);
  if (a === 'c') return charPage(view, +b);
  if (a === 'tier') return b === 'new' ? tierEditor(view, params) : b === 'edit' ? tierEditor(view, params, parts[2]) : b ? tierView(view, b) : tierHome(view);
  if (a === 'team') return b === 'new' ? teamNew(view, params) : b ? teamView(view, b) : teamHome(view, params);
  if (a === 'me') return mePage(view);
  if (a === 'op') return opPage(view);
  view.replaceChildren(emptyState(t('page.notFound'), { href: '#/', label: t('nav.chars') }));
}

let lastPath = null;
async function navigate() {
  const path = location.hash.split('?')[0];
  const samePage = path === lastPath;   // 필터 쿼리만 바뀐 경우는 전환 모션 없이
  lastPath = path;
  const run = async () => {
    resetReveal();
    try { await route(); revealPage(view); } catch (e) { console.error('[lounge]', e); view.replaceChildren(emptyState(t('page.loadFail'))); }
  };
  if (!samePage && document.startViewTransition && !reducedMotion()) {
    // 전환 중에는 화면이 멈추고 클릭이 막힌다 → 서버 응답을 기다리지 말고, 첫 화면(스켈레톤)이 그려지면(최대 VT_WAIT_MS) 바로 전환.
    // 나머지 내용은 전환 뒤에 채워진다(등장 모션이 이어받음).
    let rendered = Promise.resolve();
    let timer;
    const vt = document.startViewTransition(() => {
      rendered = run();                                    // 옛 화면을 찍은 뒤에 그리기 시작(순서가 바뀌면 전환이 사라진다)
      return Promise.race([rendered, new Promise((r) => { timer = setTimeout(r, VT_WAIT_MS); })]);
    });
    // 전환 도중 다른 이동(예: 권한 없는 수정 주소 → 보기로 되돌림)이 오면 이전 전환은 취소된다 — 오류가 아니므로 삼킨다
    vt.ready.catch(() => {});
    vt.updateCallbackDone.catch(() => {});
    await vt.finished.catch(() => {});
    clearTimeout(timer);
    await rendered;
  } else await run();
  if (!samePage) { scrollTo({ top: 0 }); view.focus({ preventScroll: true }); }
}

async function mePage(v) {
  const items = await api.mine();
  v.replaceChildren(h('div', { class: 'lg-single is-narrow' },
    h('header', { class: 'lg-page-head' }, h('h1', { class: 'lg-h1' }, t('nav.me'))),
    h('p', { class: 'lg-cap' }, t('me.cap')),
    items.length ? h('ol', { class: 'lg-rows' }, items.map((m) => {
      const x = m.item;
      const href = m.kind === 'post' ? (x.thread.startsWith('char:') ? `#/c/${x.thread.slice(5)}` : `#/${x.thread.replace(':', '/')}`) : `#/${m.kind}/${x.id}`;
      const where = m.kind === 'post' && x.thread.startsWith('char:') ? nameOf(+x.thread.slice(5)) : '';
      return h('li', {}, h('a', { class: 'lg-row', href },
        avatar(x.anon, 32),
        h('span', { class: 'lg-row-main' },
          h('span', { class: 'lg-row-title' }, m.kind === 'post' ? (x.deleted ? t('post.deleted') : x.body) : x.title),
          h('span', { class: 'lg-row-meta' }, h('span', { class: 'lg-chip' }, t(KIND_LABEL[m.kind])), where && `${where} · `, anonName(x.anon, x.anonNo, x.op), ' · ', ago(x.at)))));
    })) : emptyState(t('me.empty'), { href: '#/', label: t('nav.chars') }),
    api.MODE === 'mock' && h('div', { class: 'lg-mock-note' },
      h('p', { class: 'lg-hint' }, t('mock.note')),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { api.resetMock(); sessionStorage.removeItem('woofia_lounge_as'); toast(t('mock.reloaded')); navigate(); } }, icon('rotate-ccw'), t('mock.reload')))));
  reveal([...v.querySelectorAll('.lg-rows > li')]);
}

/**
 * 운영자 모드(#/op — 메뉴에 없는 숨은 주소). 관리자 토큰을 이 브라우저에 한 번 넣으면
 * 여기서 쓰는 의견·티어표·팀이 '파미도' 이름으로 올라간다. 토큰은 서버가 확인하고, 이 브라우저(localStorage)에만 둔다.
 */
function opPage(v) {
  const input = h('input', { class: 'lg-input', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: t('op.token.ph'), 'aria-label': t('op.token') });
  const status = h('p', { class: 'lg-cap', role: 'status' });
  const paint = () => {
    status.textContent = api.isOperator() ? t('op.on.status', { name: anonName(OPERATOR.anon, 1, true) }) : t('op.off.status');
    off.hidden = !api.isOperator();
  };
  const on = h('button', { class: 'btn btn-primary', type: 'submit' }, t('op.turnOn'));
  const off = h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { api.clearOperator(); toast(t('op.offDone')); paint(); } }, t('op.turnOff'));
  const form = h('form', { class: 'lg-form' },
    h('label', { class: 'lg-field' }, h('span', { class: 'lg-label' }, icon('key-round'), t('op.token')), input,
      h('span', { class: 'lg-hint' }, t('op.token.hint'))),
    h('div', { class: 'lg-form-foot' }, off, on));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    on.disabled = true;
    try { await api.setOperatorToken(input.value); input.value = ''; toast(t('op.onDone', { name: anonName(OPERATOR.anon, 1, true) })); paint(); }
    catch (ex) { toast(ex.message); } finally { on.disabled = false; }
  });
  v.replaceChildren(h('div', { class: 'lg-single is-narrow' },
    h('header', { class: 'lg-page-head' }, h('h1', { class: 'lg-h1' }, t('op.title'))), status, form));
  paint();
}

/** lounge.html 의 정적 문구(data-i18n / data-i18n-aria). 언어가 바뀔 때마다 다시 칠한다. */
function paintShell() {
  document.title = t('brand');
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}

/** 언어 선택(메인과 같은 'woofia_lang'). 고르면 셸·현재 화면을 새 언어로 다시 그린다. 유저 글은 그대로. */
function initLang() {
  const btn = document.getElementById('langBtn');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelector('.lg-langmenu')?.remove();
    const m = h('div', { class: 'menu lg-menu lg-langmenu', role: 'menu' }, LANGS.map((l) =>
      h('button', { role: 'menuitemradio', 'aria-checked': String(l.code === i18n.lang), onclick: async () => { m.remove(); if (l.code !== i18n.lang) await i18n.setLang(l.code); } },
        h('span', { class: 'lg-langmenu-check' }, l.code === i18n.lang ? icon('check') : ''), l.label)));
    const r = btn.getBoundingClientRect();
    m.style.top = `${r.bottom + scrollY + 4}px`;
    m.style.left = `${Math.max(8, Math.min(r.right + scrollX - 200, innerWidth - 208))}px`;
    document.body.append(m);
    m.querySelector('button')?.focus();
    const off = (ev) => { if (!m.contains(ev.target)) { m.remove(); removeEventListener('click', off); } };
    setTimeout(() => addEventListener('click', off));
    m.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { m.remove(); btn.focus(); } });
  });
  i18n.onChange(() => { paintShell(); paintThemeLabel(); lastPath = null; navigate(); });
}

let paintThemeLabel = () => {};
function initTheme() {
  const btn = document.getElementById('themeBtn');
  const cur = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const paint = () => { btn.querySelector('use').setAttribute('href', `ui-icons/sprite.svg#i-${cur() === 'dark' ? 'sun' : 'moon'}`); btn.setAttribute('aria-label', cur() === 'dark' ? t('theme.toLight') : t('theme.toDark')); };
  btn.addEventListener('click', () => {
    const next = cur() === 'dark' ? 'light' : 'dark';
    themeFade(() => { document.documentElement.dataset.theme = next; });
    try { localStorage.setItem('woofia_theme', next); } catch { /* 무시 */ }
    paint();
  });
  paint();
  paintThemeLabel = paint;
}

/** 테스트 데이터(목업·로컬 서버)를 보고 있으면 화면 위에 표시 — 라이브 글로 착각하지 않게. */
function testBanner() {
  if (!api.IS_TEST) return;
  const live = document.querySelector('meta[name="lounge-api"]')?.content;
  document.body.prepend(h('div', { class: 'lg-testbar', role: 'status' },
    h('b', {}, api.MODE === 'mock' ? t('testbar.mock') : t('testbar.local')), ' — ' + t('testbar.notLive'),
    live && h('a', { href: location.pathname + '?api=live' + location.hash }, t('testbar.toLive'))));
}

async function boot() {
  await i18n.ready;                               // 사전 먼저(없으면 한국어로 폴백)
  paintShell();
  testBanner();
  initTheme();
  initLang();
  api.deviceId();
  try { setChars(await api.chars()); } catch (e) { view.replaceChildren(emptyState(e.message)); return; }
  addEventListener('hashchange', navigate);
  await navigate();
  stagger([...document.querySelectorAll('.lg-side a')]);
}
boot();
