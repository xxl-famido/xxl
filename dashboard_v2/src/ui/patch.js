// 패치 히스토리 — patch-notes.json(원문 tools/redesign/patch_notes_src → build_patch_notes.py) → 시트.
// v1 구성 그대로: 세로 타임라인 · 분류 필터 · 메이저(x.y = 동료 추가)는 펼침+대표 동료, 패치(x.y.z)는 접힘(최신만 펼침)
// · 항목별 분류 점 · 언급 동료 얼굴 · 세부 항목. 미확인 표시는 마지막으로 본 버전과 비교.
import { h, icon, openSheet, segment, ensureStyle } from './components.js';
import { accordion as accMotion } from '../motion/index.js';

const SEEN_KEY = 'woofia_patch_seen';
const CATS = ['new', 'balance', 'fix', 'qol'];
const isMajor = ver => /^\d+\.\d+$/.test(String(ver));

export function install(ctx) {
  const { t, i18n } = ctx;
  let notes = null;
  const load = async () => {
    if (notes) return notes;
    const r = await fetch('patch-notes.json', { cache: 'no-store' });
    if (!r.ok) throw new Error(`patch-notes.json ${r.status}`);
    notes = await r.json();
    return notes;
  };
  const pick = obj => (obj && (obj[i18n.lang] || obj.kr)) || '';
  const nameOf = id => (i18n.nameOf ? i18n.nameOf(id) : String(id));
  const hideBroken = e => { e.currentTarget.style.display = 'none'; };

  ctx.hasUnseenPatch = async () => {
    try { const d = await load(); const latest = d.releases?.[0]?.version; return !!latest && localStorage.getItem(SEEN_KEY) !== latest; } catch { return false; }
  };

  const catDot = cat => h('i', { class: `pn-dot cat-${cat}`, 'aria-hidden': 'true' });
  const faces = ids => (Array.isArray(ids) && ids.length)
    ? h('span', { class: 'pn-faces' }, ...ids.map(id => h('img', { src: `icons/${id}.png`, alt: nameOf(id), title: nameOf(id), loading: 'lazy', onError: hideBroken })))
    : null;

  // 대표 동료(메이저 릴리스): 초상 + 도장 아이콘 + 이름. 이름은 동료 데이터(언어별) 우선, 없으면 JSON charName.
  function hero(rel) {
    if (rel.char == null && rel.charImg == null) return null;
    const name = (rel.char != null && nameOf(rel.char) !== String(rel.char)) ? nameOf(rel.char) : pick(rel.charName);
    return h('div', { class: 'pn-hero' },
      h('span', { class: 'pn-portrait' },
        h('img', { src: rel.charImg || `icons/${rel.char}.png`, alt: '', onError: hideBroken }),
        rel.skill && rel.char != null && h('img', { class: 'pn-rune', src: `icons/skills/Rune${rel.char}.png`, alt: '', onError: hideBroken })),
      name && h('span', { class: 'pn-hero-name' }, name));
  }

  function item(it) {
    const details = (it.details || []).map(pick).filter(Boolean);
    return h('li', { class: `pn-item cat-${it.cat}` },
      catDot(it.cat),
      h('div', { class: 'pn-item-body' },
        h('p', { class: 'pn-text' }, faces(it.chars), h('span', { class: 'pn-cat-sr' }, `${t(`patch.cat.${it.cat}`)}: `), pick(it.text)),
        details.length > 0 && h('ul', { class: 'pn-details' }, ...details.map(d => h('li', {}, d)))));
  }

  function release(rel, index, cat) {
    const items = (rel.items || []).filter(it => cat === 'all' || it.cat === cat);
    if (!items.length) return null;
    const major = isMajor(rel.version);
    // 전체 보기: 메이저는 펼침, 패치는 접힘(최신이면 펼침). 분류 필터 중에는 걸러진 결과를 바로 보이게 전부 펼친다.
    const open = cat !== 'all' || major || index === 0;
    const cats = CATS.filter(c => (rel.items || []).some(it => it.cat === c));
    const d = h('details', { class: `pn-rel${major ? ' major' : ''}${index === 0 ? ' latest' : ''}`, open },
      h('summary', {},
        h('span', { class: 'pn-node', 'aria-hidden': 'true' }),
        h('span', { class: 'pn-head' },
          h('span', { class: 'pn-line' },
            h('span', { class: 'pn-ver' }, `v${rel.version}`),
            h('time', { class: 'pn-date', datetime: rel.date }, rel.date),
            h('span', { class: 'pn-badges' }, ...cats.map(c => h('span', { class: `pn-badge cat-${c}` }, t(`patch.cat.${c}`))))),
          rel.title && h('span', { class: 'pn-title' }, pick(rel.title))),
        icon('chevron-down', 'ic acc-chev')),
      h('div', { class: 'pn-body' }, hero(rel), h('ul', { class: 'pn-items' }, ...items.map(item))));
    accMotion(d);
    return d;
  }

  ctx.openPatch = async () => {
    ensureStyle('css/patch.css');
    let d;
    try { d = await load(); } catch (e) { console.error('[patch] 불러오기 실패', e); return; }
    const releases = Array.isArray(d.releases) ? d.releases : [];
    let cat = 'all';
    let sheet = null;
    const list = h('div', { class: 'pn-list' });
    const render = () => {
      const nodes = releases.map((r, i) => release(r, i, cat)).filter(Boolean);
      list.replaceChildren(...(nodes.length ? nodes : [h('p', { class: 'pn-empty' }, t('patch.empty'))]));
    };
    const seg = segment({ ariaLabel: t('patch.filter.aria'), value: 'all', full: false,
      options: [{ value: 'all', label: t('patch.cat.all') },
        ...CATS.map(c => ({ value: c, label: h('span', { class: 'pn-seg' }, catDot(c), t(`patch.cat.${c}`)) }))],
      onChange: v => { cat = v; render(); if (sheet) sheet.body.scrollTop = 0; } });
    render();
    const offLang = i18n.onChange?.(() => render());          // 열린 채로 언어를 바꾸면 본문만 다시 그린다
    sheet = openSheet({ title: t('top.patch'), size: 'pn-sheet', body: h('div', { class: 'pn' }, h('div', { class: 'pn-filter' }, seg), list),
      ariaLabel: t('common.close'), onClose: () => offLang?.() });
    if (releases[0]) { try { localStorage.setItem(SEEN_KEY, releases[0].version); } catch { /* 저장 불가(사생활 모드) */ } }
    ctx.onPatchSeen?.();
  };
}
