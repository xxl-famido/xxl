// 가이드 — v1 가이드 구성(소개 · 큰 묶음 · 절 · 문단 · 목록 · 전체/2단/부분 그림 · 참고 상자)을 v2 화면 기준으로 다시 씀.
// 문구 = i18n gd.* (i18n/parts/guide.<lang>.json, <b> 같은 인라인 태그 허용 → tHtml), 그림 = guide/*.png
// (tools/redesign/guide_shots_v2.js 로 2배율 촬영 — 부분 그림은 원래 크기의 절반으로 표시).
import { h, icon, openSheet, ensureStyle } from './components.js';
import { GUIDE } from './guide-content.js';

export function install(ctx) {
  const { t, i18n } = ctx;
  const html = key => i18n.tHtml(`gd.${key}`);
  const hideBroken = e => { e.currentTarget.closest('figure')?.remove(); };
  // 2배율 촬영본 → 절반 크기(부분 그림). 전체 그림은 칸 너비에 맞춘다.
  const halfSize = e => { const img = e.currentTarget; if (img.naturalWidth) img.style.width = `${Math.round(img.naturalWidth / 2)}px`; };   // max-width:100% 는 CSS 가 유지

  function figure(files, kind) {
    const cls = kind === 'crop' ? `g-fig g-crop${files.length > 1 ? ' g-pair' : ''}` : files.length > 1 ? 'g-fig g-two' : 'g-fig';
    return h('figure', { class: cls },
      ...files.map(f => h('img', { src: `guide/${f}.png`, alt: t(`gd.fig.${f}`), loading: 'lazy', onError: hideBroken, onLoad: kind === 'crop' ? halfSize : null })));
  }

  function block(b) {
    if (b.group) return h('h2', { class: 'g-group', id: `guide-${b.group}` }, t(`gd.${b.group}.title`));
    if (b.sec) return h('h3', { class: 'g-h', id: `guide-${b.sec.replace(/\./g, '-')}` }, t(`gd.${b.sec}.title`));
    if (b.intro) return h('p', { class: 'g-intro', html: html(b.intro) });
    if (b.p) return h('p', { html: html(b.p) });
    if (b.ul) return h('ul', { class: 'g-list' }, ...b.ul.map(k => h('li', { html: html(k) })));
    if (b.note) return h('div', { class: 'g-note' }, icon('info', 'ic g-note-ic'), h('p', { html: html(b.note) }));
    if (b.fig) return figure(b.fig, b.kind);
    return null;
  }

  ctx.openGuide = (anchor) => {
    ensureStyle('css/guide.css');
    const toc = h('nav', { class: 'g-toc', 'aria-label': t('gd.toc') },
      ...GUIDE.filter(b => b.group).map(b => h('a', { href: `#guide-${b.group}`, onClick: e => {
        e.preventDefault();
        sheet.el.querySelector(`#guide-${b.group}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } }, t(`gd.${b.group}.title`))));
    const sheet = openSheet({ title: t('gd.title'), size: 'sheet-lg', body: h('article', { class: 'guide' }, toc, ...GUIDE.map(block)), ariaLabel: t('common.close') });
    if (anchor) setTimeout(() => sheet.el.querySelector(`#guide-${anchor}`)?.scrollIntoView({ block: 'start' }), 50);
  };
}
