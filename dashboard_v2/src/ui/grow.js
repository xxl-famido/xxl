// 동료 육성 창(시트). 스탯 · 육성 설정(레벨·스타·진화 단계·적합도) · 도장 잠금해제 · 도장 제련 · 스킬 레벨과 설명.
// v1 openModal/renderSpec/renderSkills 이식. 행동 계획(고정 칸·프리셋·필살기 방식·욱영/이태호 토글)은 행동 계획 패널 소관 — 머리의 '행동 계획에서 보기'로 그 행에 간다.
import { SPEC, SPEC_FULL, SPEC_NEED, SPEC_NEED_LV, specOn, specInv, specRune, specSlotState, specLevel, specAtkHp } from '../core/spec.js';
import { fmt, role as roleKey } from '../core/format.js';
import { loungeHref, showWhenLounge } from './lounge-link.js';

const ROWS = ['basicAtk', 'fatal', 'passive0', 'passive1', 'passive2', 'passive3', 'passive4'];
const SKILL_ICON = { basicAtk: 'SkillIcon01', passive0: 'SkillIcon03', passive1: 'SkillIcon03', passive2: 'SkillIcon04', passive3: 'SkillIcon04', passive4: 'SkillIcon04' };
const skillIconSrc = (slot, id) => ((slot === 'ultimate' || slot === 'sigil') ? `icons/skills/Rune${id}.png` : (SKILL_ICON[slot] ? `icons/skills/${SKILL_ICON[slot]}.png` : ''));
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

// ── 공용: 동료 이름·스킬 다국어 데이터(kr 이외 언어일 때만 한 번 받는다; v1 i18n.js 와 같은 파일) ──
let langDataP = null;
export function ensureLangData(ctx) {
  if (ctx.i18n.lang === 'kr') return Promise.resolve(false);
  if (!langDataP) {
    langDataP = Promise.all([
      fetch('data/chars.json').then((r) => (r.ok ? r.json() : null)),
      fetch('data/skills.json').then((r) => (r.ok ? r.json() : null)),
    ]).then(([names, skills]) => {
      const base = ctx.store.get().chars || {};
      const merged = {};
      for (const [id, meta] of Object.entries(base)) {
        const n = names && (names[id] || names[String(id)]);
        merged[id] = n ? { ...meta, name_kr: n.name_kr, name_en: n.name_en, name_ja: n.name_ja, name_cn: n.name_cn } : meta;
      }
      ctx.i18n.setData({ chars: merged, skills: skills || undefined });
      return true;
    }).catch(() => { langDataP = null; return false; });
  }
  return langDataP;
}

export { shortName } from '../core/format.js';

/** 슬롯 스펙이 최대 육성과 다른지(기본값 복원 버튼 활성). */
const isDefaultSlot = (s) => !specOn(s) && s.rune !== false && !s.sealOn;

/**
 * 동료 육성 창을 연다. i = 0-based 자리.
 * 변경은 즉시 store.team.update 로 반영(슬라이더는 놓을 때). 창을 닫아도 추가 저장 단계는 없다.
 */
export function openGrow(ctx, i) {
  const { store, components, t, i18n, api } = ctx;
  const { h, icon, button, slider, toggle, toast } = components;
  components.ensureStyle('css/grow.css');
  const first = store.get().team[i];
  if (!first) return null;
  const id = first.id;
  const meta = () => store.get().chars[id] || {};
  let slot = clone(first);
  let detail = null, detailErr = false;

  const limit = () => meta().sealLimit || 20000;
  const seal = () => {
    const L = limit();
    const atk = Math.max(0, Math.min(L, slot.sealAtk ?? 0));
    return { atk, hp: slot.sealAtk == null ? L : Math.max(0, Math.min(L, slot.sealHp ?? (L - atk))) };
  };
  const ensureSpec = () => { if (!slot.spec) slot.spec = { on: false, ...SPEC_FULL, lv: {} }; if (!slot.spec.lv) slot.spec.lv = {}; return slot.spec; };

  function commit() {
    const s = clone(slot);
    store.team.update(i, (n) => {
      if (s.spec) n.spec = s.spec; else delete n.spec;
      n.rune = s.rune !== false;
      if (s.sealOn) n.sealOn = true; else delete n.sealOn;
      if (s.sealAtk != null) { n.sealAtk = s.sealAtk; n.sealHp = s.sealHp; } else { delete n.sealAtk; delete n.sealHp; }
    });
    store.saveDraft?.();
  }

  // ── 표시 조각 ──
  const statEls = {};
  function paintStats() {
    const c = meta();
    const [a, hp] = specAtkHp(slot, store.get().chars);
    const sl = seal();
    const ua = slot.sealOn ? sl.atk : 0, uh = slot.sealOn ? sl.hp : 0;
    const [fA] = SPEC.scaleAtkHp(c.baseATK || 0, c.baseHP || 0, c.rarity || 4, SPEC_FULL);
    statEls.atk.textContent = fmt(a + ua);
    statEls.hp.textContent = fmt(hp + uh);
    statEls.atkAdd.textContent = ua ? t('grow.stat.seal', { n: fmt(ua) }) : '';
    statEls.hpAdd.textContent = uh ? t('grow.stat.seal', { n: fmt(uh) }) : '';
    statEls.ratio.textContent = t('grow.stat.ratio', { n: fA ? Math.round((a / fA) * 100) : 100 });
  }

  function statsBlock() {
    statEls.atk = h('dd', { class: 'num' }); statEls.hp = h('dd', { class: 'num' });
    statEls.atkAdd = h('small', { class: 'grow-add' }); statEls.hpAdd = h('small', { class: 'grow-add' });
    statEls.ratio = h('p', { class: 'grow-ratio' });
    const c = meta();
    const el = c.elementKey || 'none';
    const rk = roleKey(c.role);
    const block = h('div', { class: 'grow-head' },
      h('img', { src: `icons/${id}.png`, alt: '', width: 64, height: 64 }),
      h('div', { class: 'grow-id' },
        h('div', { class: 'grow-tags' },
          h('span', { class: 'grow-tag' }, components.elTag(el, t(`element.${el}`))),
          rk && h('span', { class: 'grow-tag' }, t(`role.${rk}`)),
          h('span', { class: 'grow-tag' }, t('grow.pos', { n: i + 1 }))),
        h('dl', { class: 'grow-stats' },
          h('div', {}, h('dt', {}, t('grow.stat.atk'), statEls.atkAdd), statEls.atk),
          h('div', {}, h('dt', {}, t('grow.stat.hp'), statEls.hpAdd), statEls.hp)),
        statEls.ratio),
      // 행동 계획의 이 동료 행으로(시트를 닫고 행으로 스크롤 + 1초 강조). 행동 계획 패널이 없으면(비교 범위 등) 숨김.
      h('div', { class: 'grow-links' },
        typeof ctx.showPlanRow === 'function' && button({ tier: 'ghost', size: 'sm', iconName: 'sliders-horizontal', label: t('grow.planLink'), 'data-plan-link': '',
          onClick: () => { const pos = i + 1; sheet.close(); setTimeout(() => ctx.showPlanRow && ctx.showPlanRow(pos), 60); } }),
        // XXL 라운지의 이 동료 게시판(인계서 §2-4, 같은 탭 이동). lounge.html 이 없으면 숨김.
        showWhenLounge(h('a', { class: 'btn btn-ghost btn-sm', href: loungeHref.char(id), title: t('grow.lounge.tip'), 'data-lounge-char': '' },
          components.icon('message-square'), h('span', {}, t('grow.lounge'))))));
    paintStats();
    return block;
  }

  /** 라벨 + 슬라이더 + 숫자 입력 + "/ 최대" 단위. */
  function field(k, label, { min, max, value, disabled, note, onChange, onCommit }) {
    const f = slider({ id: `grow-${k}`, min, max: Math.max(max, min + 1), value, unit: `/ ${max}`, ariaLabel: label, onChange, onCommit });
    f.dataset.k = k;
    f.querySelector('.field-row').prepend(h('label', { for: `grow-${k}` }, label));
    if (disabled) { f.num.disabled = true; f.range.disabled = true; f.classList.add('is-off'); }
    if (note) f.append(h('p', { class: 'hint' }, note));
    return f;
  }

  function specBlock() {
    const on = specOn(slot);
    const inv = specInv(slot);
    const c = meta();
    const cap = SPEC.pevoCap(inv.evo);
    const bond = c.rarity === 3 || c.rarity === 4;
    const use = toggle({ label: t('grow.spec.use'), checked: on, onChange: (v) => { ensureSpec().on = v; commit(); render(); } });
    use.dataset.k = 'use';
    const live = (fn) => (v) => { fn(v); paintStats(); };
    const edit = (fn) => (v) => { fn(v); commit(); render(); };
    const setEvo = (v) => { const p = ensureSpec(); p.evo = v; p.pevo = Math.min(p.pevo || 0, SPEC.pevoCap(v)); };
    const lock = !on;
    const canRune = SPEC.canUnlockRune(inv.evo);
    const runeOn = specRune(slot);
    const rune = toggle({ label: t('grow.sigil.unlock'), checked: runeOn, onChange: (v) => { slot.rune = v; commit(); render(); } });
    rune.dataset.k = 'rune';
    if (lock || !canRune) { rune.input.disabled = true; rune.classList.add('is-off'); }
    const runeNote = !canRune ? t('grow.label.unlockableStar3') : t(runeOn ? 'grow.hint.sigilExSkillUsed' : 'grow.hint.normalExSkillUsed');

    return h('section', { class: 'grow-sec', 'aria-labelledby': 'grow-spec-h' },
      h('div', { class: 'grow-sec-head' }, h('h3', { id: 'grow-spec-h' }, t('grow.spec.title')), use),
      !on && h('p', { class: 'hint' }, t('grow.hint.whenOffEverythingCalculated')),
      on && h('div', { class: 'grow-fields' },
        field('level', t('grow.level'), { min: 1, max: SPEC.MAX_LEVEL, value: inv.level, disabled: lock, onChange: live((v) => { ensureSpec().level = v; }), onCommit: edit((v) => { ensureSpec().level = v; }) }),
        field('evo', t('grow.star'), { min: 0, max: SPEC.MAX_EVO, value: inv.evo, disabled: lock, onChange: live(setEvo), onCommit: edit(setEvo) }),
        field('pevo', t('grow.pevo'), { min: 0, max: cap, value: inv.pevo, disabled: lock || !cap, note: !cap && on ? t('grow.msg.star5HasNo') : null,
          onChange: live((v) => { ensureSpec().pevo = v; }), onCommit: edit((v) => { ensureSpec().pevo = v; }) }),
        field('compat', t('grow.compat'), { min: 0, max: 5, value: inv.compat, disabled: lock || !bond, note: !bond ? t('grow.compat.na') : null,
          onChange: live((v) => { ensureSpec().compat = v; }), onCommit: edit((v) => { ensureSpec().compat = v; }) }),
        h('div', { class: 'grow-rune' }, rune, h('p', { class: 'hint' }, runeNote))));
  }

  function sealBlock() {
    const L = limit();
    const sl = seal();
    const on = !!slot.sealOn;
    const setAtk = (v, commitNow) => {
      v = Math.max(0, Math.min(L, Math.round(v / 100) * 100));
      slot.sealAtk = v; slot.sealHp = L - v;
      guard = true; atkF.set(v); hpF.set(L - v); guard = false;
      paintStats();
      if (commitNow) commit();
    };
    let guard = false;
    const atkF = field('sealAtk', t('grow.seal.atk'), { min: 0, max: L, value: sl.atk, disabled: !on,
      onChange: (v) => { if (!guard) setAtk(v, false); }, onCommit: (v) => setAtk(v, true) });
    const hpF = field('sealHp', t('grow.seal.hp'), { min: 0, max: L, value: sl.hp, disabled: !on,
      onChange: (v) => { if (!guard) setAtk(L - v, false); }, onCommit: (v) => setAtk(L - v, true) });
    [atkF, hpF].forEach((f) => { f.num.step = 100; f.range.step = 100; });
    const sw = toggle({ label: t('grow.seal.title'), checked: on, onChange: (v) => {
      slot.sealOn = v;
      if (v && slot.sealAtk == null) { slot.sealAtk = 0; slot.sealHp = L; }
      commit(); render();
    } });
    sw.dataset.k = 'seal';
    return h('section', { class: 'grow-sec', 'aria-labelledby': 'grow-seal-h' },
      h('div', { class: 'grow-sec-head' }, h('h3', { id: 'grow-seal-h', class: 'sr' }, t('grow.seal.title')), sw),
      h('p', { class: 'hint' }, t('grow.seal.cap', { n: fmt(L) })),
      h('div', { class: `grow-fields${on ? '' : ' is-off'}` }, atkF, hpF));
  }

  // 스킬 이름·설명: kr 은 엔진(api.char) 문구, 다른 언어는 skills.json(없으면 kr).
  function skillText(slotKey, lv) {
    const sk = detail && detail.skills.find((x) => x.slot === slotKey);
    const e = sk ? (sk.levels[Math.min(lv - 1, sk.levels.length - 1)] || {}) : {};
    let name = (sk && sk.name) || (meta().skillNames || {})[slotKey] || '';
    let desc = (e.kr || '').trim();
    if (i18n.lang !== 'kr') {
      name = i18n.skillName(id, slotKey) || name;
      desc = i18n.skillDesc(id, slotKey, lv - 1) || desc;
    }
    return { name, desc, cd: e.cd || 0 };
  }

  function skillsBlock() {
    const on = specOn(slot);
    const runeOn = specRune(slot);
    const rows = ROWS.map((k) => {
      const slotKey = k === 'fatal' ? (runeOn ? 'sigil' : 'ultimate') : k;
      const st = k === 'fatal' ? 'open' : specSlotState(slot, k);
      const lv = specLevel(slot, slotKey);
      const { name, desc, cd } = skillText(slotKey, lv);
      const label = name || t(`grow.slot.${slotKey}`);
      const ic = skillIconSrc(slotKey, id);
      let ctrl;
      if (st === 'locked') ctrl = h('span', { class: 'sk-note' }, icon('lock'), t('grow.skill.locked', { n: SPEC_NEED[k] }));
      else if (st === 'pinned') ctrl = h('span', { class: 'sk-note' }, t('grow.skill.pinned', { n: SPEC_NEED_LV[k] }));
      else if (!on) ctrl = h('span', { class: 'sk-lv' }, t('grow.skill.lv', { n: lv }));
      else {
        const keys = k === 'fatal' ? ['ultimate', 'sigil'] : [k];   // 필살기 줄은 일반/도장 양쪽에 같은 레벨
        const set = (v) => { const p = ensureSpec(); keys.forEach((x) => { p.lv[x] = v; }); };
        ctrl = slider({ id: `grow-sk-${k}`, min: 1, max: 10, value: lv, ariaLabel: t('grow.skill.lvAria', { name: label }),
          onChange: set, onCommit: (v) => { set(v); commit(); render(); } });
        ctrl.classList.add('sk-slider');
        ctrl.dataset.k = `sk-${k}`;
      }
      return h('li', { class: `sk-row is-${st}` },
        ic ? h('img', { class: 'sk-ic', src: ic, alt: '', loading: 'lazy', width: 32, height: 32 }) : h('span', { class: 'sk-ic' }),
        h('div', { class: 'sk-main' },
          h('div', { class: 'sk-title' },
            h('span', { class: 'sk-slot' }, t(`grow.slot.${slotKey}`)),
            h('span', { class: 'sk-name' }, label),
            st === 'pinned' && h('span', { class: 'sk-lv' }, t('grow.skill.lv', { n: 1 }))),
          st !== 'locked' && h('p', { class: 'sk-desc' },
            cd ? h('span', { class: 'sk-cd' }, t('grow.skill.cd', { n: cd })) : null,
            detail ? (desc || '—') : (detailErr ? t('grow.skill.loadFail') : t('grow.status.loadingSkills')))),
        h('div', { class: 'sk-ctrl' }, ctrl));
    });
    return h('section', { class: 'grow-sec grow-skills', 'aria-labelledby': 'grow-sk-h' },
      h('div', { class: 'grow-sec-head' }, h('h3', { id: 'grow-sk-h' }, t('grow.skills.title'))),
      h('ul', { class: 'sk-list' }, rows));
  }

  const body = h('div', { class: 'grow' });
  const resetBtn = button({ tier: 'ghost', size: 'sm', label: t('grow.reset'), iconName: 'rotate-ccw', onClick: () => {
    const prev = clone(slot);
    delete slot.spec; slot.rune = true; delete slot.sealOn; delete slot.sealAtk; delete slot.sealHp;
    commit(); render();
    toast(t('grow.reset.done'), { action: { label: t('top.undo'), fn: () => { if (!sheet.el.isConnected) return; slot = prev; commit(); render(); } } });
  } });
  const foot = h('div', { class: 'grow-foot' }, resetBtn);

  function render() {
    const scroller = body.closest('.sheet-body');
    const top = scroller ? scroller.scrollTop : 0;
    const ae = document.activeElement;
    const holder = ae && ae.closest ? ae.closest('[data-k]') : null;
    const focusK = holder && body.contains(holder) ? holder.dataset.k : null;
    const focusRange = ae && ae.type === 'range';
    body.replaceChildren(statsBlock(), h('div', { class: 'grow-cols' }, h('div', { class: 'grow-col' }, specBlock(), sealBlock()), h('div', { class: 'grow-col' }, skillsBlock())));
    resetBtn.disabled = isDefaultSlot(slot);
    if (scroller) scroller.scrollTop = top;
    if (focusK) {
      const el = body.querySelector(`[data-k="${focusK}"]`);
      (el && (el.querySelector(focusRange ? 'input[type=range]' : 'input') || el))?.focus({ preventScroll: true });
    }
  }

  const sheet = components.openSheet({ title: i18n.nameOf(id), body, foot, size: 'sheet-lg', ariaLabel: t('top.close'),
    onClose: () => { unsub(); offLang(); } });
  // 창이 열린 동안 편성이 바뀌어 이 자리가 다른 동료가 되면 닫는다(엉뚱한 동료 편집 방지).
  const unsub = store.subscribe((s) => s.team[i] && s.team[i].id, (cur) => { if (cur !== id) sheet.close(); });
  const offLang = i18n.onChange(() => { ensureLangData(ctx).then(() => { sheet.el.querySelector('.sheet-head h2').textContent = i18n.nameOf(id); render(); }); });
  render();
  Promise.all([api.char(id), ensureLangData(ctx)]).then(([d]) => { detail = d && Array.isArray(d.skills) ? d : null; detailErr = !detail; })
    .catch(() => { detailErr = true; })
    .finally(() => { if (sheet.el.isConnected) render(); });
  return sheet;
}
