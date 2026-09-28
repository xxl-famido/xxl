// 방탈출 제단 편집 시트 — 층(1~3)별 별의 제단·달의 제단 점등. ARCHITECTURE §7 E.
// 점등 의미(게임 기준, COPY_AUDIT F-4): 별의 제단 = 점등하면 페널티 차단(미점등 = 페널티 적용),
// 달의 제단 = 점등하면 효과 적용. 저장 형식 state.altar.floors[f].off[id] = true 는 '미점등'.
// 확률 CD 감소(1012/1013)는 1층 사용 + 점등일 때 걸린다(core/plan.js altarProcCdActive).
import { ALTAR_CD_PROC_IDS, altarProcCdActive } from '../core/plan.js';

let dataPromise = null;
/** altars.json 을 한 번만 읽는다. 실패하면 null. */
export function loadAltars() {
  if (!dataPromise) {
    dataPromise = fetch('altars.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => (d && Array.isArray(d.floors) ? d : null))
      .catch(() => null);
  }
  return dataPromise;
}

/** 제단 문구의 언어별 값. zh 는 번체(zh), 없으면 kr. */
export const altarText = (a, lang) => String((a && a.text && (a.text[lang] || a.text.kr)) || '');

/** 켜진 층까지의 페널티(별 미점등)·효과(달 점등) 개수. data 없으면 null. */
export function altarCounts(altar, data) {
  if (!data || !altar) return null;
  let floors = 0, penalty = 0, buff = 0;
  for (const f of data.floors) {
    const cfg = altar.floors && altar.floors[f.floor];
    if (!cfg || cfg.on === false) break;
    floors = f.floor;
    for (const a of f.star || []) if (cfg.off && cfg.off[a.id]) penalty++;
    for (const a of f.moon || []) if (!(cfg.off && cfg.off[a.id])) buff++;
  }
  return { floors, penalty, buff };
}

/** 시트를 연다. ctx.openAltar 로도 등록된다(cond.js). */
export async function openAltar(ctx) {
  const { store, t, i18n, components: C } = ctx;
  const { h } = C;
  C.ensureStyle('css/cond.css');
  const body = h('div', { class: 'altar-sheet' }, h('p', { class: 'hint' }, t('altar.loading')));
  let unsub = null;
  C.openSheet({ title: t('altar.title'), body, ariaLabel: t('common.close'), onClose: () => unsub?.() });
  const data = await loadAltars();
  if (!body.isConnected) return;           // 불러오는 사이 닫힘 — 구독 전이라 정리할 것 없음
  if (!data) { body.replaceChildren(C.empty(t('altar.load.fail'))); return; }

  const render = () => {
    const altar = store.get().altar;
    const on = !!altar.on;
    const procIds = altarProcCdActive(altar);
    const head = h('div', { class: 'altar-top' },
      C.toggle({ label: t('cond.altar.use'), checked: on, onChange: v => setOn(v) }),
      h('span', { class: 'altar-sub' }, t('altar.sub')));
    const hint = h('p', { class: 'hint' }, t('altar.hint'), h('br'), t('altar.floor.rule'));
    const offNote = !on && h('p', { class: 'altar-note-box' }, C.icon('info'), h('span', {}, t('altar.offNote')));
    const procNote = on && procIds.length && h('p', { class: 'altar-note-box' }, C.icon('info'), h('span', {}, t('altar.proc.note')));
    const floors = data.floors.map(f => floorEl(f, altar, on));
    body.replaceChildren(head, hint, offNote || '', procNote || '', ...floors, h('p', { class: 'hint altar-foot' }, t('altar.note')));
  };
  const floorEl = (f, altar, on) => {
    const cfg = (altar.floors && altar.floors[f.floor]) || { on: true, off: {} };
    const floorOn = cfg.on !== false;
    const group = kind => {
      const list = f[kind] || [];
      const lit = list.filter(a => !(cfg.off && cfg.off[a.id])).length;
      return h('div', { class: `altar-group ${kind}` },
        h('div', { class: 'altar-gh' },
          h('img', { src: `icons/altar_${kind}.webp`, alt: '' }),
          h('b', {}, t(`altar.${kind}`)),
          h('span', { class: 'altar-gcount' }, t('altar.lit.count', { lit, n: list.length })),
          h('span', { class: 'altar-gsub' }, t(`altar.${kind}.sub`))),
        h('ul', { class: 'altar-list' }, ...list.map(a => rowEl(f.floor, kind, a, cfg, on && floorOn, floorOn))));
    };
    return h('section', { class: `altar-floor${floorOn ? '' : ' off'}`, 'aria-label': t('altar.floor', [f.floor]) },
      h('header', { class: 'altar-fh' },
        h('b', {}, t('altar.floor', [f.floor])),
        h('span', { class: 'altar-fmeta' }, `${t('altar.energy')} ${f.energy}`),
        C.toggle({ label: t('altar.floor.use'), checked: floorOn, onChange: v => { store.altar.setFloor(f.floor, v); } })),
      group('star'), group('moon'));
  };

  const rowEl = (floor, kind, a, cfg, applies, floorOn) => {
    const lit = !(cfg.off && cfg.off[a.id]);
    // 결과에 반영되는 상태: 별 = 미점등(페널티), 달 = 점등(효과)
    const active = applies && (kind === 'star' ? !lit : lit);
    const isProc = ALTAR_CD_PROC_IDS.includes(a.id);
    const tag = active && h('span', { class: `altar-tag ${kind === 'star' ? 'pen' : 'buff'}` }, t(kind === 'star' ? 'altar.tag.penalty' : 'altar.tag.buff'));
    const btn = h('button', { type: 'button', class: `altar-row${lit ? ' lit' : ''}`, role: 'checkbox', 'aria-checked': String(lit), disabled: !floorOn,
      onClick: () => { store.altar.toggle(floor, a.id); } },
      h('img', { class: 'altar-ri', src: `icons/altar_${kind}.webp`, alt: '', width: 20, height: 20 }),
      h('span', { class: 'altar-ck', 'aria-hidden': 'true' }, lit && C.icon('check')),
      h('span', { class: 'altar-txt' }, altarText(a, i18n.lang)),
      h('span', { class: 'altar-tags' }, tag || '', isProc && h('span', { class: 'altar-tag proc' }, t('altar.tag.proc'))));
    const li = h('li', {}, btn);
    if (isProc) {
      const help = h('button', { type: 'button', class: 'help', 'aria-label': t('altar.proc.help.aria') }, '?');
      C.tooltip(help, t('altar.proc.help2'));
      li.append(help);
    }
    return li;
  };

  const setOn = v => {
    const hadForce = store.get().cond.forceProc;
    store.altar.setOn(v);
    C.toast(v ? (hadForce ? t('plan.adv.forceOff') : t('altar.toast.on')) : t('altar.toast.off'));   // 확률 100% 가 꺼졌다는 사실을 말한다(ADV_AUDIT 모순 8)
  };

  const offAltar = store.subscribe(s => s.altar, () => { if (body.isConnected) render(); });
  const offTeam = store.subscribe(s => s.team, () => { if (body.isConnected) render(); });
  const offLang = i18n.onChange?.(() => { if (body.isConnected) render(); });
  unsub = () => { offAltar(); offTeam(); offLang?.(); };
  if (!body.isConnected) unsub();          // 불러오는 사이 닫힘
  render();
}
