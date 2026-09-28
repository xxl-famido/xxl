/**
 * lounge/chars.js — 동료 게시판(메인): 동료 목록 + 동료 페이지.
 */
import * as api from './api.js';
import { reveal, REVEAL_STEP, h, icon, avatar, anonName, ago, charOf, nameOf, searchText, iconSrc, elTag, elLabel, EL_ORDER, ROLES, seg, emptyState, skeleton } from './ui.js';
import { i18n, t, locale, roleLabel } from './i18n.js';
import { threadView } from './thread.js';
import { flip, rollup } from '../motion/index.js';

let NEW_IDS = new Set();   // lounge_chars.json 의 new 표시(tools/redesign/gen_lounge_chars.py --new)
const ui = { q: '', el: 'all', role: 'all', sort: 'base' };

export async function charList(view) {
  const all = await api.chars();
  NEW_IDS = new Set(all.filter((c) => c.new).map((c) => c.id));
  const grid = h('ul', { class: 'lg-chars', 'aria-label': t('chars.list.aria') });
  const rail = h('aside', { class: 'lg-rail', 'aria-label': t('chars.recent') }, h('h2', { class: 'lg-rail-h' }, t('chars.recent')), skeleton(6));
  const search = h('input', { type: 'search', placeholder: t('search.name'), 'aria-label': t('chars.search.aria'), value: ui.q });
  const sortSel = h('select', { class: 'lg-select', 'aria-label': t('sort.aria') },
    [['base', t('chars.sort.name')], ['recent', t('chars.sort.recent')], ['count', t('chars.sort.count')]].map(([v, l]) => h('option', { value: v, selected: ui.sort === v }, l)));

  view.replaceChildren(h('div', { class: 'lg-cols' },
    h('div', { class: 'lg-col-main' },
      h('header', { class: 'lg-page-head' }, h('h1', { class: 'lg-h1' }, t('nav.chars'))),
      h('div', { class: 'lg-tools' },
        h('label', { class: 'search lg-search' }, icon('search'), search),
        seg(t('filter.element'), [{ value: 'all', label: t('common.all') }, ...EL_ORDER.map((e) => ({ value: e, label: elLabel(e), dot: e }))], ui.el, (v) => { ui.el = v; repaint(); }),
        seg(t('filter.role'), [{ value: 'all', label: t('common.all') }, ...ROLES.map((r) => ({ value: r, label: roleLabel(r) }))], ui.role, (v) => { ui.role = v; repaint(); }),
        sortSel),
      grid),
    rail));

  let summary = {};
  search.addEventListener('input', () => { ui.q = search.value.trim(); repaint(); });
  sortSel.addEventListener('change', () => { ui.sort = sortSel.value; repaint(); });
  // 필터·정렬이 바뀌면 남는 타일은 새 자리로 미끄러지고(FLIP), 새로 들어온 타일은 페이드 인. 타일은 id 로 재사용한다.
  const tiles = new Map();
  const repaint = () => flip(grid, paint);

  function paint() {
    let list = all.filter((c) => (ui.el === 'all' || c.el === ui.el) && (ui.role === 'all' || c.role === ui.role) && (!ui.q || searchText(c.id).includes(ui.q.toLowerCase())));
    // 신규 동료는 어떤 정렬에서도 맨 앞. 그다음은 고른 정렬, 동점·기본은 현재 언어 이름 순(한국어면 가나다).
    const byName = (a, b) => nameOf(a.id).localeCompare(nameOf(b.id), locale());
    const byNew = (a, b) => NEW_IDS.has(b.id) - NEW_IDS.has(a.id);
    const key = ui.sort === 'recent' ? (a, b) => (summary[b.id]?.last || 0) - (summary[a.id]?.last || 0)
      : ui.sort === 'count' ? (a, b) => (summary[b.id]?.count || 0) - (summary[a.id]?.count || 0)
      : () => 0;
    list = [...list].sort((a, b) => byNew(a, b) || key(a, b) || byName(a, b));
    if (!list.length) { grid.replaceChildren(h('li', { class: 'lg-chars-empty' }, emptyState(t('chars.empty')))); return; }
    grid.replaceChildren(...list.map((c) => {
      const n = summary[c.id]?.count || 0;
      const old = tiles.get(c.id);
      if (old) { old.querySelector('.lg-char-meta').textContent = n ? t('chars.posts', { n }) : t('chars.noPosts'); return old; }
      const img = h('img', { src: iconSrc(c.id), alt: '', loading: 'lazy' });
      const a = h('a', { class: 'lg-char', href: `#/c/${c.id}`, 'data-el': c.el },
        h('span', { class: 'lg-char-fig' }, h('span', { class: 'lg-char-img' }, img), NEW_IDS.has(c.id) && h('span', { class: 'lg-new-chip', 'aria-label': t('chars.new.aria') }, 'NEW!!')),
        h('span', { class: 'lg-char-name' }, h('i', { class: 'dot', style: { background: 'var(--el)' } }), nameOf(c.id)),
        h('span', { class: 'lg-char-meta' }, n ? t('chars.posts', { n }) : t('chars.noPosts')));
      a.addEventListener('click', () => { img.style.viewTransitionName = 'lg-hero'; });
      const li = h('li', {}, a);
      tiles.set(c.id, li);
      return li;
    }));
  }
  paint();
  reveal([...grid.children], { step: REVEAL_STEP.tile });
  summary = await api.charSummary();
  paint();

  const recent = await api.recentPosts(8);
  rail.replaceChildren(h('h2', { class: 'lg-rail-h' }, t('chars.recent')),
    recent.length ? h('ol', { class: 'lg-feed' }, recent.map((p) => {
      const cid = +p.thread.slice(5);
      return h('li', {}, h('a', { href: `#/c/${cid}` },
        h('span', { class: 'lg-feed-top' }, avatar(cid, 20), h('b', {}, nameOf(cid)), h('span', { class: 'lg-feed-time' }, ago(p.at))),
        h('span', { class: 'lg-feed-body' }, p.body),
        h('span', { class: 'lg-feed-by' }, anonName(p.anon, p.anonNo, p.op))));
    })) : emptyState(t('chars.recent.empty')));
  reveal([...rail.querySelectorAll('.lg-rail-h, .lg-feed li')]);
}

export async function charPage(view, id) {
  await api.chars();
  const c = charOf(id);
  if (!c.name || c.name === String(id)) { view.replaceChildren(emptyState(t('chars.notFound'), { href: '#/', label: t('chars.list') })); return; }
  const img = h('img', { class: 'lg-hero-img', src: iconSrc(id), alt: '', style: { viewTransitionName: 'lg-hero' } });
  const tierVal = h('b', {}, '—');
  const tierSub = h('small', {});
  const postN = h('b', {}, '—');
  const teamN = h('b', {}, '—');

  const side = h('aside', { class: 'lg-rail' });
  view.replaceChildren(h('div', { class: 'lg-cols is-page' },
    h('div', { class: 'lg-col-main' },
      h('a', { class: 'lg-back', href: '#/' }, icon('arrow-left'), t('chars.list')),
      h('header', { class: 'lg-hero', 'data-el': c.el },
        img,
        h('div', { class: 'lg-hero-text' },
          h('h1', { class: 'lg-display' }, i18n.nameOf(id)),
          h('p', { class: 'lg-hero-meta' }, elTag(c.el), h('span', {}, roleLabel(c.role)), (c.rarity >= 3) && h('img', { class: 'lg-rarity', src: `brand/rarity0${Math.min(4, c.rarity)}.webp`, alt: c.rarity >= 4 ? 'XXL' : 'XL', title: c.rarity >= 4 ? 'XXL' : 'XL', width: c.rarity >= 4 ? 53 : 35, height: 18, decoding: 'async' })),
          h('div', { class: 'lg-hero-actions' },
            h('a', { class: 'btn btn-secondary btn-sm', href: `index.html#add=${id}` }, icon('swords'), t('chars.toSim'))))),
      h('div', { class: 'lg-stats' },
        h('a', { href: '#/tier' }, h('span', { class: 'lg-st-k' }, t('chars.stat.tier')), h('span', { class: 'lg-st-v' }, tierVal, tierSub)),
        h('button', { type: 'button', onclick: () => document.getElementById('thread')?.scrollIntoView({ behavior: 'smooth' }) }, h('span', { class: 'lg-st-k' }, t('thread.title')), h('span', { class: 'lg-st-v' }, postN)),
        h('a', { href: `#/team?with=${id}` }, h('span', { class: 'lg-st-k' }, t('chars.stat.teams')), h('span', { class: 'lg-st-v' }, teamN))),
      h('div', { id: 'thread' }, threadView({ key: 'char:' + id, withTags: true, title: t('thread.title'), placeholder: t('chars.composer.ph', { name: nameOf(id) }), onCount: (n) => { if (postN.textContent === '—') rollup(postN, n, (v) => String(Math.round(v)), { duration: 500 }); else postN.textContent = String(n); } }))),
    side));

  const [tierInfo, tn, teams] = await Promise.all([api.charTier(id, 'any'), api.teamCountWith(id), api.teams({ withIds: [id] })]);
  tierVal.textContent = tierInfo ? tierInfo.label : '—';
  tierSub.textContent = ' ' + (tierInfo ? t('chars.tier.samples', { n: tierInfo.n }) : t('chars.tier.thin'));
  rollup(teamN, tn, (v) => String(Math.round(v)), { duration: 500 });
  side.replaceChildren(...[h('h2', { class: 'lg-rail-h' }, t('chars.teamsWith')),
    teams.length ? h('ol', { class: 'lg-mini-teams' }, teams.slice(0, 3).map((m) => h('li', {}, h('a', { href: `#/team/${m.id}` },
      h('span', { class: 'lg-strip sm' }, m.ids.map((x) => h('img', { src: iconSrc(x), alt: nameOf(x), class: x === id ? 'is-focus' : '' }))),
      h('span', { class: 'lg-mini-title' }, m.title),
      h('span', { class: 'lg-mini-meta' }, t('chars.team.meta', { likes: m.likes, comments: m.comments })))))) : emptyState(t('team.empty'), { href: '#/team/new', label: t('team.upload') }),
    teams.length > 3 && h('a', { class: 'lg-link-more', href: `#/team?with=${id}` }, t('chars.teams.all', { n: teams.length }), icon('chevron-right'))].filter(Boolean));
  reveal([...side.querySelectorAll('.lg-rail-h, .lg-mini-teams li, .empty, .lg-link-more')]);
}
