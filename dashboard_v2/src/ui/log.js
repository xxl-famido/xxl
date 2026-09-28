// 전투 로그 — 턴 목록(왼쪽) + 상세 패널(오른쪽). v1 로그의 파고들기 기능을 모두 잇는다:
//   턴(데미지·치료·배리어) → 행동 → 타격·효과 → 계산 내역(영수증형, 행마다 배율·누적) → 출처(동료·스킬) → 스킬 설명
//   배리어 비례 딜은 배리어 구성 → 각 배리어 생성식 → 생성된 턴으로 이동.
// 계산은 core/receipt.js(엔진 식 1:1, tests/receipt.test.js 가 실결과로 대조). 여기서는 그리기만 한다.
import { fmt, fmtShort } from '../core/format.js';
import { receiptOf, barrierReceipt, createFlatGrantIndex } from '../core/receipt.js';
import { createCalcView } from './calcview.js';
import { specLevel, specRune } from '../core/spec.js';
import { ensureLangData, shortName } from './grow.js';

const K = { ult: '필살기', basic: '보통공격', defend: '방어', passive: '패시브', dot: '지속딜', hit: '피격' };   // 엔진 kind 토큰 copy-lint-allow
const KIND = { [K.ult]: 'ult', [K.basic]: 'basic', [K.defend]: 'defend', [K.passive]: 'passive', [K.dot]: 'dot', [K.hit]: 'hit' };
const MAIN_KINDS = new Set([K.ult, K.basic, K.defend]);
const isHit = (l) => !!(l.detail && l.detail.act && !l.detail.kind);
const MOBILE = '(max-width: 900px)';
const SLOT_KEYS = ['basicAtk', 'ultimate', 'sigil', 'passive0', 'passive1', 'passive2', 'passive3', 'passive4'];

/** 효과 줄 분류(엔진 한국어 문장 기준 — 표시 문구가 아니라 분류 토큰). copy-lint-allow */
function effectType(l) {
  const d = l.detail || {};
  if (d.kind === 'heal') return 'heal';
  if (d.kind === 'barrier') return 'barrier';
  if (d.kind === 'death') return 'death';
  const s = String(l.text || '');
  if (/디버프/.test(s)) return 'debuff';               // copy-lint-allow
  if (/버프/.test(s) || d.calc === 'flatAtk') return 'buff';   // copy-lint-allow  ('받는배리어' 버프도 버프)
  if (/배리어|베리어/.test(s)) return 'barrier';       // copy-lint-allow
  if (/중첩/.test(s)) return 'stack';                  // copy-lint-allow
  if (/CD|행동/.test(s)) return 'tempo';               // copy-lint-allow
  return 'other';
}
const EFFECT_ICON = { heal: 'heart', barrier: 'shield', buff: 'arrow-up', debuff: 'arrow-down', stack: 'layers', tempo: 'zap', death: 'x', other: 'sparkles' };

/** 로그 → 턴별 묶음. */
export function groupTurns(log) {
  const byTurn = new Map();
  for (const l of log || []) { if (!byTurn.has(l.turn)) byTurn.set(l.turn, []); byTurn.get(l.turn).push(l); }
  const out = new Map();
  for (const [tn, evs] of [...byTurn.entries()].sort((a, b) => a[0] - b[0])) {
    const acts = new Map();
    for (const l of evs) { if (!acts.has(l.act)) acts.set(l.act, []); acts.get(l.act).push(l); }
    const actList = [...acts.entries()].sort((a, b) => a[0] - b[0]).map(([aid, lines]) => ({ aid, lines, kind: (lines.find((x) => x.kind) || {}).kind || '' }));
    const seen = new Set(), main = [];
    for (const a of actList) {
      const id = a.lines[0].actorId;
      if (!id || !MAIN_KINDS.has(a.kind)) continue;
      main.push({ id, kind: a.kind, extra: seen.has(id) });
      seen.add(id);
    }
    const amt = (pred) => evs.filter(pred).reduce((s, l) => s + (+l.amount || 0), 0);
    out.set(tn, {
      turn: tn, evs, acts: actList, main, ult: main.some((m) => m.kind === K.ult),
      dmg: amt(isHit),
      heal: amt((l) => l.detail && l.detail.kind === 'heal'),
      barrier: amt((l) => l.detail && l.detail.kind === 'barrier'),
    });
  }
  return out;
}

export function createLog(ctx, d) {
  const { t, i18n, store, api, components: C, motion } = ctx;
  const { h } = C;
  C.ensureStyle('css/log.css');
  const tr = (s) => (i18n.translateEngine ? i18n.translateEngine(s) : String(s ?? ''));
  const nameOf = (id) => shortName(i18n.nameOf ? i18n.nameOf(id) : String(id));
  const teamById = Object.fromEntries((d.team || []).map((x) => [x.id, x]));
  const elOf = (id) => (teamById[id] && teamById[id].elementKey) || 'none';
  const turns = groupTurns(d.log);
  const turnList = [...turns.keys()];
  const maxDmg = Math.max(1, ...[...turns.values()].map((g) => g.dmg));
  const mq = matchMedia(MOBILE);
  let sel = turnList[0] ?? null;

  const pic = (id, cls = 'bl-pic') => (id
    ? h('img', { class: cls, src: `icons/${id}.png`, alt: '', loading: 'lazy', dataset: { el: elOf(id) } })
    : h('span', { class: `${cls} sys` }, C.icon('swords')));

  // 제단 출처: 엔진은 동료가 아닌 출처를 by=0 으로, 제단은 이름 '별 제단 N층 · …' / '달 제단 N층 · …' 로 넘긴다
  // (woofia_sim/altar.py 라벨표). 초상 자리에 별·달 제단 그림을 쓴다(v1 icons/altar_{star,moon}.webp).
  const altarKind = (skill) => { const s = String(skill || ''); return s.startsWith('별 제단') ? 'star' : s.startsWith('달 제단') ? 'moon' : null; };   // copy-lint-allow 엔진 출처 토큰
  /** 출처 그림: 동료 초상 · 제단 그림 · 없으면 빈 칸. */
  const srcIcon = (by, skill, cls = 'bl-pic-xs') => {
    if (by) return pic(by, cls);
    const k = altarKind(skill);
    return k ? h('span', { class: `${cls} bl-altar-ic`, title: t(`altar.${k}`) }, h('img', { src: `icons/altar_${k}.webp`, alt: t(`altar.${k}`), loading: 'lazy' }))
      : h('span', { class: `${cls} sys` });
  };

  // ── 스킬 설명 시트 ──
  const charCache = new Map();
  const charDetail = (id) => { if (!charCache.has(id)) charCache.set(id, api.char(id).catch(() => null)); return charCache.get(id); };
  async function openSkill(id, skillName) {
    if (!id) return;
    const body = h('div', { class: 'bl-skill' }, h('p', { class: 'hint' }, t('log.skill.loading')));
    C.openSheet({ title: t('log.skill.title'), body, ariaLabel: t('common.close') });
    const [detail] = await Promise.all([charDetail(id), ensureLangData(ctx).catch(() => false)]);
    const slot = (store.get().team || []).find((s) => s && s.id === id) || null;
    const skills = (detail && detail.skills) || [];
    const same = skills.filter((s) => s.name === skillName);
    const rune = slot ? specRune(slot) : true;
    const sk = same.find((s) => s.slot === (rune ? 'sigil' : 'ultimate')) || same[0] || null;
    if (!sk) {
      body.replaceChildren(h('div', { class: 'bl-skill-head' }, pic(id, 'bl-skill-pic'), h('div', {}, h('b', {}, nameOf(id)), h('p', {}, tr(skillName) || t('log.label.default')))),
        h('p', { class: 'hint' }, t('log.skill.notFound')));
      return;
    }
    const lv = slot ? specLevel(slot, sk.slot) : sk.levels.length;
    const e = sk.levels[Math.min(lv - 1, sk.levels.length - 1)] || {};
    let name = sk.name, desc = (e.kr || '').trim();
    if (i18n.lang !== 'kr') { name = i18n.skillName(id, sk.slot) || name; desc = i18n.skillDesc(id, sk.slot, lv - 1) || desc; }
    body.replaceChildren(
      h('div', { class: 'bl-skill-head' }, pic(id, 'bl-skill-pic'),
        h('div', {}, h('b', {}, nameOf(id)), h('p', { class: 'bl-skill-name' }, name),
          h('p', { class: 'bl-skill-meta' }, t(`grow.slot.${sk.slot}`), ' · ', t('grow.skill.lv', { n: lv }),
            e.cd ? [' · ', t('log.skill.cd', { n: e.cd })] : '', !slot && [' · ', t('log.skill.maxLv')]))),
      h('p', { class: 'bl-skill-desc' }, desc || '—'));
  }
  const skillLink = (id, skillName, label) => (id && skillName
    ? h('button', { type: 'button', class: 'bl-sk', onClick: (e) => { e.stopPropagation(); openSkill(id, skillName); } }, label ?? tr(skillName))
    : h('span', { class: `bl-sk-static${altarKind(skillName) ? ' is-altar' : ''}` }, label ?? (skillName ? tr(skillName) : t('log.label.default'))));

  // ── 펼침 상태 — 처음엔 전부 닫힘. 사용자가 열고/닫은 곳만 키(턴·행동·항목 경로)로 기억해,
  //    다른 턴에 갔다 와도 그대로 다시 열린다. 이 결과를 보는 동안 유지(새 실행이면 새로 시작).
  const openState = new Map();
  /** head(버튼/role=button) 가 body 를 여닫게 연결. 반환 = set(open, user) — user 면 기억. */
  function disclose(key, head, body, { dflt = false, onChange } = {}) {
    const set = (o, user = false) => {
      if (o) onChange?.(true);
      body.hidden = !o;
      head.setAttribute('aria-expanded', String(o));
      if (!o) onChange?.(false);
      if (user) openState.set(key, o);
    };
    set(openState.get(key) ?? dflt);
    return set;
  }
  const memo = { get: (k) => openState.get(k), set: (k, v) => openState.set(k, v) };

  // ── 계산 그래픽(ui/calcview.js) ──
  const lineIndex = new Map((d.log || []).map((l, i) => [l, i]));
  const calc = createCalcView({ h, C, t, tr, fmt, pic, nameOf, skillLink, grants: createFlatGrantIndex(d.log), memo, srcIcon, onGoto: (tn, actId) => navigate(tn, actId) });
  const calcOf = (l, opts = {}) => { const rc = receiptOf(l); return rc ? calc.render(rc, { atIndex: lineIndex.get(l) ?? Infinity, ...opts }) : null; };

  // 배리어 비례 딜: 구성(인스턴스별 값·출처·생성 턴) → 각 생성식
  function barrierComp(total, comp, key) {
    const rows = comp.map((c, j) => {
      const reduced = c.orig && Math.abs(c.orig - c.v) > 1;
      const det = h('div', { class: 'bl-sub' }, c.detail ? calc.render(barrierReceipt(c.detail), { compact: true, key: `${key}:b${j}` }) : null);
      const head = h('button', { type: 'button', class: 'bl-row', 'aria-expanded': 'false' },
        C.icon('chevron-right', 'ic bl-chev'), C.icon('shield', 'ic bl-eic t-barrier'),
        h('span', { class: 'bl-txt' }, tr(c.src), reduced && h('small', {}, t('log.bar.before', { v: fmt(c.orig) }))),
        h('span', { class: 'bl-amt' }, fmt(c.v)));
      const set = disclose(`${key}:b${j}`, head, det);
      head.addEventListener('click', () => set(det.hidden, true));
      const go = c.turn != null && h('button', { type: 'button', class: 'bl-go', onClick: () => navigate(c.turn, c.actId) },
        c.turn === sel ? t('log.bar.gotoAct') : t('log.bar.goto', { n: c.turn }), C.icon('arrow-up', 'ic bl-go-ic'));
      return h('li', {}, h('div', { class: 'bl-row-wrap' }, head, go), det);
    });
    return h('div', { class: 'bl-barcomp' },
      h('p', { class: 'bl-cap' }, t('log.bar.comp', { n: comp.length, total: fmt(total) })),
      h('ul', { class: 'bl-list' }, ...rows));
  }

  // ── 타격 ──
  function hitItem(l, idx, counter, key) {
    const dd = l.detail;
    const isBar = !!(dd.barrierComp && dd.barrierComp.length);
    const det = h('div', { class: 'bl-sub' }, calcOf(l, { key }), isBar && barrierComp(dd.atkTotal, dd.barrierComp, key));
    const head = h('button', { type: 'button', class: 'bl-row bl-hit' },
      C.icon('chevron-right', 'ic bl-chev'),
      counter ? h('span', { class: 'bl-tag t-counter' }, t('log.label.counter')) : h('span', { class: 'bl-idx' }, t('log.hit.n', { n: idx })),
      dd.target && h('span', { class: 'bl-tgt' }, `→ ${tr(dd.target)}`),
      dd.elemMult && dd.elemMult !== 1 && h('span', { class: `bl-tag ${dd.elemMult > 1 ? 't-adv' : 't-dis'}` }, t(dd.elemMult > 1 ? 'log.r.elem.adv' : 'log.r.elem.dis')),
      h('span', { class: 'bl-amt' }, fmt(dd.final)));
    const set = disclose(key, head, det);
    head.addEventListener('click', () => { const o = det.hidden; set(o, true); if (o) crumb(null, head); });
    return h('li', { class: 'bl-item' }, head, det);
  }

  // ── 효과(버프·디버프·치료·배리어·중첩·받은 데미지) ──
  function effectItem(l, key) {
    const dd = l.detail || {};
    if (dd.kind === 'incoming') return incomingItem(dd, key);
    const type = effectType(l);
    const hasCalc = !!receiptOf(l);
    const raw = String(l.text || '');
    const text = tr(type === 'death' ? raw : raw.replace(/^\S+\s/, ''));   // 첫 토큰(행동 이름)은 행동 머리에 이미 있다(v1 과 같음)
    const amount = (type === 'heal' || type === 'barrier') && l.amount ? fmt(l.amount) : '';
    const src = l.srcId && l.srcSkill ? skillLink(l.srcId, l.srcSkill)
      : altarKind(l.srcSkill) ? h('span', { class: 'bl-src-altar' }, srcIcon(0, l.srcSkill), skillLink(0, l.srcSkill)) : null;
    const inner = [C.icon(EFFECT_ICON[type], `ic bl-eic t-${type}`), h('span', { class: 'bl-txt' }, text), src && h('span', { class: 'bl-src' }, src), amount && h('span', { class: 'bl-amt' }, amount)];
    if (!hasCalc) return h('li', { class: `bl-item bl-eff t-${type}` }, h('div', { class: 'bl-row is-static' }, h('span', { class: 'bl-chev-sp' }), ...inner));
    const det = h('div', { class: 'bl-sub' }, calcOf(l, { key }));
    const head = h('div', { class: 'bl-row', role: 'button', tabindex: '0' }, C.icon('chevron-right', 'ic bl-chev'), ...inner);
    const set = disclose(key, head, det);
    const toggle = () => set(det.hidden, true);
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => { if (e.target === head && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(); } });
    return h('li', { class: `bl-item bl-eff t-${type}` }, head, det);
  }

  function incomingItem(dd, key) {
    const pre = dd.preBar || 0, remain = dd.remainBar || 0;
    const gauge = pre > 0 && h('div', { class: 'bl-gauge', role: 'img', 'aria-label': t('log.in.left', { left: fmt(remain), pre: fmt(pre) }) },
      h('span', { class: 'g-remain', style: { width: `${(remain / pre * 100).toFixed(1)}%` } }),
      h('span', { class: 'g-lost', style: { width: `${((pre - remain) / pre * 100).toFixed(1)}%` } }));
    const outcome = h('p', { class: 'bl-in-out' },
      pre > 0 ? t('log.in.left', { left: fmt(remain), pre: fmt(pre) }) : t('log.in.noBarrier'),
      (dd.hpLost || 0) > 0 && h('b', { class: 't-hp' }, t('log.in.hp', { v: fmt(dd.hpLost) })));
    const det = h('div', { class: 'bl-sub' }, calc.render(receiptOf({ detail: dd }), { key }));
    const head = h('button', { type: 'button', class: 'bl-row' },
      C.icon('chevron-right', 'ic bl-chev'), C.icon('swords', 'ic bl-eic t-incoming'),
      h('span', { class: 'bl-txt' }, dd.turnDmg ? t('log.in.turnTitle') : t('log.in.title'), dd.defended && h('span', { class: 'bl-tag' }, t('log.r.in.defend'))),
      h('span', { class: 'bl-amt t-hp' }, fmt(dd.dmg || 0)));
    const set = disclose(key, head, det);
    head.addEventListener('click', () => set(det.hidden, true));
    return h('li', { class: 'bl-item bl-in' }, head, h('div', { class: 'bl-in-body' }, gauge, outcome), det);
  }

  // ── 행동 ──
  function actionCard({ aid, id, title, kind, lines, prefix }) {
    const key = `t${sel}:a${aid}`;
    const hits = lines.filter(isHit), effs = lines.filter((l) => !isHit(l));
    const total = hits.reduce((s, l) => s + l.amount, 0);
    const body = h('div', { class: 'bl-act-b' });
    let built = false;
    const build = () => {
      if (built) return; built = true;
      if (hits.length) body.append(h('ul', { class: 'bl-list' }, ...hits.map((l, i) => hitItem(l, i + 1, kind === K.hit, `${key}:h${i}`))));
      if (effs.length) body.append(h('p', { class: 'bl-cap' }, t('log.effects')), h('ul', { class: 'bl-list' }, ...effs.map((l, i) => effectItem(l, `${key}:f${i}`))));
    };
    const sub = hits.length > 1 ? t('log.hits.count', { n: hits.length }) : '';
    const counter = kind === K.hit && total > 0;   // 피격 카드의 데미지 = 그 피격에 대한 반격
    const head = h('button', { type: 'button', class: 'bl-act-h' },
      C.icon('chevron-right', 'ic bl-chev'), prefix, pic(id),
      h('span', { class: 'bl-an' }, title),
      kind && KIND[kind] && h('span', { class: `bl-kind k-${KIND[kind]}` }, t(`log.kind.${KIND[kind]}`)),
      sub && h('span', { class: 'bl-sub-n' }, sub),
      h('span', { class: 'bl-act-v' }, counter && h('span', { class: 'bl-tag t-counter' }, t('log.label.counter')),
        total ? fmt(total) : h('i', {}, effs.length ? t('log.effects.n', { n: effs.length }) : t('log.msg.noReaction'))));
    const card = h('section', { class: `bl-act${kind === K.ult ? ' is-ult' : ''}`, dataset: { act: String(aid) } }, head, body);
    const set = disclose(key, head, body, { onChange: (o) => { if (o) build(); card.classList.toggle('open', o); } });
    const setOpen = (o) => { set(o, true); if (o) crumb(card); };
    head.addEventListener('click', () => setOpen(body.hidden));
    card._setOpen = setOpen;
    card._title = [title, kind && KIND[kind] ? t(`log.kind.${KIND[kind]}`) : ''].filter(Boolean).join(' ');
    return card;
  }

  // ── 상세 패널 ──
  const crumbEl = h('nav', { class: 'bl-crumb', 'aria-label': t('log.crumb.aria') });
  let crumbAct = null;
  function crumb(card, hitHead) {
    if (card) crumbAct = card;
    const parts = [h('button', { type: 'button', onClick: () => insp.scrollIntoView({ behavior: motion.reduced() ? 'auto' : 'smooth', block: 'start' }) }, t('tdmg.turn', [sel]))];
    if (crumbAct && crumbAct.isConnected) {
      const a = crumbAct;
      parts.push(C.icon('chevron-right', 'ic'), h('button', { type: 'button', onClick: () => a.scrollIntoView({ behavior: motion.reduced() ? 'auto' : 'smooth', block: 'center' }) }, a._title));
      if (hitHead && a.contains(hitHead)) parts.push(C.icon('chevron-right', 'ic'), h('span', {}, hitHead.querySelector('.bl-idx, .bl-tag')?.textContent || ''));
    }
    crumbEl.replaceChildren(...parts);
  }

  const insp = h('div', { class: 'bl-insp', tabindex: '-1' });
  function renderInspector() {
    crumbAct = null;
    const g = turns.get(sel);
    if (!g) { insp.replaceChildren(h('p', { class: 'hint' }, t('log.empty'))); return; }
    const idx = turnList.indexOf(sel);
    const nav = (dir) => { const n = turnList[idx + dir]; if (n != null) select(n, { focusInsp: true }); };
    const prev = C.button({ tier: 'ghost', size: 'sm', iconName: 'chevron-up', iconOnly: true, label: t('log.nav.prev'), onClick: () => nav(-1) });
    const next = C.button({ tier: 'ghost', size: 'sm', iconName: 'chevron-down', iconOnly: true, label: t('log.nav.next'), onClick: () => nav(1) });
    prev.disabled = idx <= 0; next.disabled = idx >= turnList.length - 1;
    const back = C.button({ tier: 'ghost', size: 'sm', iconName: 'chevron-right', label: t('log.nav.back'), onClick: () => root.classList.remove('is-detail') });
    back.classList.add('bl-back');
    const stat = (k, v, cls) => v > 0 && h('div', { class: `bl-stat ${cls}` }, h('dt', {}, t(k)), h('dd', {}, fmt(v)));
    const head = h('div', { class: 'bl-insp-head' },
      back,
      h('h4', {}, t('tdmg.turn', [sel])),
      h('dl', { class: 'bl-stats' }, stat('log.sum.dmg', g.dmg, 's-dmg') || h('div', { class: 'bl-stat s-dmg' }, h('dt', {}, t('log.sum.dmg')), h('dd', {}, '0')), stat('log.sum.heal', g.heal, 's-heal'), stat('log.sum.barrier', g.barrier, 's-bar')),
      h('div', { class: 'bl-nav' }, prev, next));

    const ally = [], enemy = [];
    let enemyTotal = 0;
    for (const a of g.acts) {
      const id = a.lines[0].actorId;
      const hits = a.lines.filter(isHit), effs = a.lines.filter((l) => !isHit(l));
      if (a.kind === K.hit) {
        const atkBy = (a.lines.find((l) => l.atkBy) || {}).atkBy;
        enemyTotal += hits.reduce((s, l) => s + l.amount, 0);
        enemy.push(actionCard({ aid: a.aid, id, title: nameOf(id), kind: K.hit, lines: [...hits, ...effs.filter((l) => !/에게 피격$/.test(l.text))],   // copy-lint-allow 엔진 문장
          prefix: h('span', { class: 'bl-by' }, atkBy ? tr(atkBy) : t('log.label.enemyAttack'), ' →') }));
        continue;
      }
      if (!hits.length && !effs.length) continue;
      ally.push(actionCard({ aid: a.aid, id, title: id ? nameOf(id) : t('log.label.enemyAction'), kind: id ? a.kind : '', lines: a.lines }));
    }
    const list = h('div', { class: 'bl-acts' }, ...ally);
    if (enemy.length) {
      const body = h('div', { class: 'bl-act-b bl-enemy-b' }, ...enemy);
      const headBtn = h('button', { type: 'button', class: 'bl-act-h' },
        C.icon('chevron-right', 'ic bl-chev'), pic(0), h('span', { class: 'bl-an' }, t('log.label.enemyAttack')),
        h('span', { class: 'bl-kind k-hit' }, t('log.enemy.hits', { n: enemy.length })),
        h('span', { class: 'bl-act-v' }, enemyTotal > 0 && h('span', { class: 'bl-tag t-counter' }, t('log.label.counter')),
          enemyTotal ? fmt(enemyTotal) : h('i', {}, t('log.msg.noReaction'))));
      const card = h('section', { class: 'bl-act bl-enemy', dataset: { act: 'enemy' } }, headBtn, body);
      const set = disclose(`t${sel}:enemy`, headBtn, body, { onChange: (o) => card.classList.toggle('open', o) });
      card._setOpen = (o) => set(o, true);
      headBtn.addEventListener('click', () => card._setOpen(body.hidden));
      list.append(card);
    }
    insp.replaceChildren(head, crumbEl, list);
    crumb(list.querySelector(':scope > .bl-act.open'));   // 기억된 펼침이 있으면 경로에 표시
  }

  // ── 턴 목록 ──
  const listEl = h('div', { class: 'bl-turns', role: 'listbox', 'aria-label': t('log.turns.aria') });
  const rowByTurn = new Map();
  for (const tn of turnList) {
    const g = turns.get(tn);
    const pics = h('span', { class: 'bl-t-pics' }, ...g.main.slice(0, 6).map((m) => h('span', { class: `bl-t-pic${m.kind === K.ult ? ' is-ult' : ''}${m.extra ? ' is-extra' : ''}` }, pic(m.id, 'bl-pic-sm'))));
    const extra = [g.heal > 0 && h('span', { class: 's-heal', title: t('log.sum.heal') }, C.icon('heart'), fmtShort(g.heal)),
      g.barrier > 0 && h('span', { class: 's-bar', title: t('log.sum.barrier') }, C.icon('shield'), fmtShort(g.barrier))].filter(Boolean);
    const row = h('button', { type: 'button', class: `bl-t${g.ult ? ' has-ult' : ''}`, role: 'option', 'aria-selected': 'false', dataset: { turn: String(tn) },
      style: { '--w': `${(g.dmg / maxDmg * 100).toFixed(1)}%` },
      'aria-label': t('log.turn.aria', { n: tn, dmg: fmt(g.dmg) }) },
      h('span', { class: 'bl-t-n' }, String(tn)), pics,
      h('span', { class: 'bl-t-v' }, h('b', {}, fmtShort(g.dmg)), extra.length ? h('small', {}, ...extra) : null));
    row.addEventListener('click', () => select(tn, { mobileDetail: true }));
    row.addEventListener('keydown', (e) => {
      const dir = { ArrowDown: 1, ArrowUp: -1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      const n = turnList[turnList.indexOf(tn) + dir];
      if (n != null) { select(n); rowByTurn.get(n).focus(); }
    });
    rowByTurn.set(tn, row);
    listEl.append(row);
  }

  function select(tn, { mobileDetail = false, focusInsp = false } = {}) {
    if (!turns.has(tn)) return;
    const prev = rowByTurn.get(sel);
    if (prev) { prev.setAttribute('aria-selected', 'false'); prev.tabIndex = -1; }
    sel = tn;
    const row = rowByTurn.get(tn);
    row.setAttribute('aria-selected', 'true'); row.tabIndex = 0;
    // 목록 안에서만 보이게 맞춘다(페이지는 움직이지 않게 — scrollIntoView 는 창까지 굴린다)
    const top = row.getBoundingClientRect().top - listEl.getBoundingClientRect().top + listEl.scrollTop, bottom = top + row.offsetHeight;
    if (top < listEl.scrollTop) listEl.scrollTop = top - 8;
    else if (bottom > listEl.scrollTop + listEl.clientHeight) listEl.scrollTop = bottom - listEl.clientHeight + 8;
    renderInspector();
    if (mobileDetail && mq.matches) { root.classList.add('is-detail'); root.scrollIntoView({ block: 'start' }); }
    if (focusInsp) insp.focus({ preventScroll: true });
  }

  /** 다른 턴의 행동으로 이동(배리어 생성 추적). 행동을 펼치고 잠깐 강조. */
  function navigate(tn, actId) {
    select(tn, { mobileDetail: true });
    const card = actId != null ? insp.querySelector(`.bl-act[data-act="${actId}"]`) : null;
    const target = card || insp;
    const group = card && card.closest('.bl-enemy');          // 피격 중 생긴 배리어면 '적의 공격' 묶음 안에 있다
    if (group && group !== card && group._setOpen) group._setOpen(true);
    if (card && card._setOpen) card._setOpen(true);
    target.scrollIntoView({ behavior: motion.reduced() ? 'auto' : 'smooth', block: 'center' });
    target.classList.remove('flash'); void target.offsetWidth; target.classList.add('flash');
  }

  const root = h('section', { class: 'bl', 'aria-labelledby': 'bl-h' },
    h('header', { class: 'bl-head' },
      h('h3', { id: 'bl-h' }, t('log.title')),
      h('span', { class: 'bl-note' }, d.meta && d.meta.runs > 1 ? t('result.log.note.mean') : ''),
      h('p', { class: 'bl-order' }, t('result.label.actionOrder'), ' ', (d.meta.order || []).map((nm) => {
        const id = (d.team || []).find((x) => x.name === nm)?.id; return id ? nameOf(id) : tr(nm);
      }).join(' → '))),
    h('div', { class: 'bl-body' }, listEl, insp));
  if (sel != null) select(sel);

  return {
    el: root,
    /** 턴 스트립에서 호출: 그 턴을 고르고(목록 행 강조) 스크롤할 요소를 돌려준다 — 데스크톱은 로그 전체, 모바일은 상세. */
    open(tn) {
      if (!turns.has(tn)) return null;
      select(tn, { mobileDetail: true });
      const row = rowByTurn.get(tn);
      row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
      return mq.matches ? insp : root;
    },
  };
}
