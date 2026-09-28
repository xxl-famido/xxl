// 상단바: 워드마크 · 기록 select · 팀 비교 · 라운지 · ≡ 메뉴(가이드 포함) + 모바일 섹션 점프 칩.
// 팀 비교·라운지는 secondary(라운지는 강조색) — 모바일에서도 아이콘+짧은 라벨을 유지하고, 모자라면 기록 select 가 줄어든다.
import { recordLabel, restoreRecord } from './records.js';
import { openMenu } from './menu.js';
import { ensureLangData } from './grow.js';
import { loungeHref, showWhenLounge } from './lounge-link.js';

// 로고: brand/logo-80.png(높이 80 = 40px 표시의 2배) · logo-240.png(고배율 화면). 원본(트림)은 brand/logo.png.
const LOGO = { src: 'brand/logo-80.png', srcset: 'brand/logo-80.png 2x, brand/logo-240.png 6x', w: 53, h: 40 };
const JUMPS = [
  { id: 'app-team', key: 'jump.team' },
  { id: 'app-plan', key: 'jump.plan' },
  { id: 'app-cond', key: 'jump.cond' },
  { id: 'app-result', key: 'jump.result' },
];

export async function mount(host, ctx) {
  const { store, components, t, i18n } = ctx;
  const { h, button } = components;
  components.ensureStyle('css/topbar.css');
  let menuRef = null;
  let io = null, mo = null, navTimer = null;

  // ── 기록 select ──
  const select = h('select', { id: 'histSelect' });
  select.addEventListener('change', () => {
    const id = select.value;
    if (!id) return;
    const r = restoreRecord(ctx, id);
    if (!r) renderHistory();
  });
  function renderHistory() {
    const st = store.get();
    // 기록 시트의 검색·정렬과 무관하게 최신순(고정은 위 묶음).
    const list = [...st.records].sort((a, b) => b.id - a.id);
    select.setAttribute('aria-label', t('top.history.aria'));
    const opt = (rec) => h('option', { value: String(rec.id), dataset: { pinned: rec.pinned ? '1' : null, locked: rec.locked ? '1' : null } }, recordLabel(rec, ctx));
    const pinned = list.filter((r) => r.pinned), rest = list.filter((r) => !r.pinned);
    const active = list.some((r) => r.id === st.activeRecId);
    const kids = [];
    if (!list.length) kids.push(h('option', { value: '' }, t('top.history.empty')));
    else if (!active) kids.push(h('option', { value: '' }, t('top.history.pick')));
    if (pinned.length) kids.push(h('optgroup', { label: t('records.label.pinned') }, pinned.map(opt)));
    kids.push(...rest.map(opt));
    select.replaceChildren(...kids);
    select.disabled = !list.length;
    select.value = active ? String(st.activeRecId) : '';
  }

  // ── 상단 버튼 ──
  const cmpBtn = button({ tier: 'secondary', label: t('top.compare'), iconName: 'columns-2', class: 'btn btn-secondary tb-nav', onClick: () => ctx.openCompare?.() });
  // 라운지(같은 탭 이동). lounge.html 이 빌드에서 빠졌으면(404) 숨긴다.
  const loungeLink = showWhenLounge(h('a', { class: 'btn btn-secondary tb-nav tb-lounge', href: loungeHref.home(), dataset: { lounge: '' } },
    components.icon('users'), h('span', { class: 'tb-full' }), h('span', { class: 'tb-short', 'aria-hidden': 'true' })));
  const menuBtn = button({ tier: 'ghost', label: t('top.menu.aria'), iconName: 'menu', iconOnly: true, 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  menuBtn.addEventListener('click', () => {
    if (menuRef && menuRef.el.isConnected) { menuRef.close(); menuRef = null; menuBtn.setAttribute('aria-expanded', 'false'); return; }
    menuRef = openMenu(menuBtn, ctx);
  });
  // 팀 비교는 다른 담당이 부트 뒤에 ctx 에 붙인다 — 붙을 때까지 비활성으로 두고 확인한다. (가이드는 ≡ 메뉴가 연 시점에 확인)
  const syncNav = () => {
    cmpBtn.disabled = typeof ctx.openCompare !== 'function';
    return !cmpBtn.disabled;
  };
  if (!syncNav()) {
    let n = 0;
    navTimer = setInterval(() => { if (syncNav() || ++n > 60) { clearInterval(navTimer); navTimer = null; } }, 500);
  }
  cmpBtn.addEventListener('pointerenter', syncNav);

  // ── 섹션 점프(모바일) ──
  const jump = h('nav', { class: 'jump' });
  const jumpLinks = JUMPS.map((j) => {
    const a = h('a', { href: `#${j.id}`, dataset: { target: j.id } });
    a.addEventListener('click', (e) => {
      const el = document.getElementById(j.id); if (!el) return;
      e.preventDefault();
      const top = el.getBoundingClientRect().top + scrollY - host.offsetHeight - 8;
      scrollTo({ top, behavior: ctx.motion.reduced() ? 'auto' : 'smooth' });
      setOn(j.id);
    });
    return a;
  });
  const setOn = (id) => jumpLinks.forEach((a) => { const on = a.dataset.target === id; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  const syncResultChip = () => {
    const res = document.getElementById('app-result');
    const link = jumpLinks[3];
    link.hidden = !res || res.hidden;
  };
  function watchSections() {
    io?.disconnect();
    const visible = new Map();
    io = new IntersectionObserver((entries) => {
      for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
      let best = null, bestTop = Infinity;
      for (const j of JUMPS) {
        const el = document.getElementById(j.id);
        if (!el || el.hidden || !(visible.get(j.id) > 0)) continue;
        const top = Math.abs(el.getBoundingClientRect().top - host.offsetHeight);
        if (top < bestTop) { bestTop = top; best = j.id; }
      }
      if (best) setOn(best);
    }, { rootMargin: '-80px 0px -45% 0px', threshold: [0, 0.01, 0.25, 0.5] });
    JUMPS.forEach((j) => { const el = document.getElementById(j.id); if (el) io.observe(el); });
    const res = document.getElementById('app-result');
    mo?.disconnect();
    if (res) { mo = new MutationObserver(syncResultChip); mo.observe(res, { attributes: true, attributeFilter: ['hidden'] }); }
    syncResultChip();
  }

  function render() {
    // 라운지 인계서 §1: brand · brand-mark · brand-name 클래스는 유지(라운지가 같은 이름을 쓴다).
    const brand = h('a', { class: 'brand', href: '#', 'aria-label': t('top.brand.aria'), onClick: (e) => { e.preventDefault(); scrollTo({ top: 0, behavior: ctx.motion.reduced() ? 'auto' : 'smooth' }); } },
      h('span', { class: 'brand-mark-wrap' },
        h('img', { class: 'brand-mark brand-logo', src: LOGO.src, srcset: LOGO.srcset, width: LOGO.w, height: LOGO.h, alt: '', decoding: 'async' })),
      h('span', { class: 'brand-name brand-sub', 'aria-hidden': 'true' }, t('top.brand.sub')));
    // 라벨: 데스크톱 = 전체(.tb-full), 모바일 = 짧은 라벨(.tb-short). 화면 읽기는 전체 라벨만 읽는다.
    const cmpLabel = cmpBtn.querySelector('span');
    cmpLabel.className = 'tb-full';
    cmpLabel.textContent = t('top.compare');
    let cmpShort = cmpBtn.querySelector('.tb-short');
    if (!cmpShort) { cmpShort = h('span', { class: 'tb-short', 'aria-hidden': 'true' }); cmpBtn.append(cmpShort); }
    cmpShort.textContent = t('top.compare.short');
    cmpBtn.title = t('top.tip.compareTwoSavedTeams');
    loungeLink.querySelector('.tb-full').textContent = t('top.lounge');
    loungeLink.querySelector('.tb-short').textContent = t('top.lounge.short');
    loungeLink.title = t('top.tip.lounge');
    menuBtn.setAttribute('aria-label', t('top.menu.aria'));
    const nav = h('nav', { class: 'topnav', 'aria-label': t('top.nav.aria') }, cmpBtn, loungeLink, menuBtn);
    const hist = h('label', { class: 'history' }, h('span', { class: 'history-label' }, t('top.history.label')), select);
    jump.setAttribute('aria-label', t('jump.aria'));
    jumpLinks.forEach((a, k) => { a.textContent = t(JUMPS[k].key); });
    jump.replaceChildren(...jumpLinks);
    host.replaceChildren(h('div', { class: 'wrap topbar-in' }, brand, hist, nav), jump);
    renderHistory();
  }

  render();
  store.subscribe((s) => `${s.records.length}|${s.activeRecId}|` + s.records.map((r) => `${r.id}${r.name || ''}${r.pinned ? 'p' : ''}${r.locked ? 'l' : ''}${r.total}`).join(','), renderHistory);
  // 다른 언어 이름표(data/chars.json)가 늦게 오면 기록 이름을 한 번 더 그린다.
  i18n.onChange(() => { render(); ensureLangData(ctx).then(renderHistory); });
  ensureLangData(ctx).then((fresh) => { if (fresh) renderHistory(); });
  // 다른 패널이 모두 마운트된 뒤 관찰을 건다(이 모듈이 가장 먼저 마운트된다).
  requestAnimationFrame(() => setTimeout(watchSections, 0));
  setOn('app-team');
}
