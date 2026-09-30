// 행동 계획 패널 — 두 가지 모양(같은 코드):
//   main(메인 화면, 고급 설정 꺼짐) = 확정 목업 mockup.html:
//     ① 순서와 필살기: 행 = 번호 · 초상 · 이름 · 방식(자동 / 직접 지정) · ▲▼(끌기도). 직접 지정이면 행 아래 턴 칸(= 그 동료의 핀 줄) + 프리셋
//        (3턴마다 · 필살기 직전 방어 · 간격 맞추기 — 성공 가정을 켜는 프리셋은 고급 설정에만). 욱영 '아군 필살기 나중' 체크.
//        턴당 2회 행동(이태호 — 도장 패시브)은 칸 하나를 행동 수만큼 나눔(왼쪽부터 실행 순서, 임부언에게 받은 추가 행동 조각 = 아래 막대).
//     ② 예외 턴: 목록 + 「턴 추가」 시트.  실행 미리보기: 엔진 프로브 결과(읽기 전용).
//     패널 맨 아래 전체 폭 진입 버튼(「고급 설정에서 세부 행동 편집」).
//   main(고급 설정 켜짐) = 같은 패널을 흐리게 + inert(.is-dimmed) + 머리 아래 배너 한 줄(제단 강제면 사유), 진입 버튼 = 「고급 설정 열기 · 사용 중」.
//   adv(고급 설정 창 안, ctx.planVariant = 'adv') = ① 순서와 필살기(방식 3택 + 직접 지정 + 필요할 때만 성공 가정·방어 턴 유지)
//     → ② 예외 턴 → ctx.planExtra(③ 필살기 연동 · ④ 턴별 행동 계획 — ui/advanced.js). 읽기 미리보기 없음(④ 표가 대신).
//     [2026-09-29 사용자 요청] 창의 ①에도 메인처럼 직접 지정 턴 칸 줄(프리셋·받은 추가 행동 포함)이 있다 — ④ 격자와 같은 핀을 편집한다.
//     기본 설정과 고급 설정의 값은 advanced.js 가 따로 보관하므로 여기서 바꿔도 메인 값은 바뀌지 않는다.
//     욱영 프리셋은 ③. [D3] 「첫 필살기 당기기」 프리셋 삭제(옛 기록의 핀은 그대로 읽힘).
// 턴 칸 클릭 = 선택 팝오버(plan-helpers cellPicker). 상태·계산은 전부 core(store.plan / store.pins / store.sync).
import { ultOf, syncGroupOf, normalizeSyncGroups, summary, taehoFedTurns, effectiveTeam, planView, cellsOf } from '../core/plan.js';
import { UK_ID, IMBUEON_ID } from '../core/format.js';
import {
  ACT_CLS, ACT_KEY, autoUltTurns, groupExceptions, actsOf, actSegs, segsKey, actsLabel, turnsText, sortable, shortName, setBaseCtx, ukPresetIndex, cellPicker,
  assistEffect, keepDefEffect, ukPresetOverwrites, helpTip, isFedCarry, pinUltWithRules, pinUltNotice, presetTip, stackOrderRisk, presetBlockedByMode,
  fillRowNow, openRepeatSheet,
} from './plan-helpers.js';
import { openAdvanced, advIsOn, onAdvChange, hasDeep, advSetOn, advForced } from './advanced.js';

const PRESET_KEY = { allUlt: 'plan.turn.preset.allUlt', ult3: 'plan.turn.preset.every3', pdef: 'plan.turn.preset.defBefore', reflow: 'plan.turn.preset.realign',
  ult3def: 'plan.turn.preset.ult3def', defRush: 'plan.turn.preset.defRush' };
// 메인: 쿨감·성공 가정 전제 프리셋 제외(창의 프리셋은 ④ 행 메뉴 — advanced.js). 동료별 프리셋(CHAR_SPECIALS.md)은 해당 동료에게만 보인다:
//   3턴마다(투명인간·마타야) · 3턴마다 + 직전 방어(란) · 필살기 직전 방어(파미도·란) · 방어로 필살기 앞당기기(모이루·히토하 = cdDefendReduce)
const MAIN_PRESETS = ['ult3', 'ult3def', 'pdef', 'defRush', 'reflow'];
const MODES = ['auto', 'strict', 'asap'];
const NOTICE_RX = /^(plan\.|manual\.|sync\.presetFull$)/;
const PROBE_DEBOUNCE = 300;
const ULT = '궁', DEF = '방', ATK = '평';   // copy-lint-allow (엔진 토큰)
const MOBILE_MQ = '(max-width: 900px)';

export async function mount(host, ctx) {
  const { store, api, t, i18n, motion, components: C } = ctx;
  const { h, icon } = C;
  C.ensureStyle('css/plan.css');
  const ADV = ctx.planVariant === 'adv';
  const MAIN = !ADV;
  if (MAIN && !ctx.scoped) setBaseCtx(ctx);
  const unsubs = [];

  const S = () => store.get();
  const fullName = (id) => (i18n.nameOf ? i18n.nameOf(id) : String(id));
  const nameOf = (id) => shortName(fullName(id));
  const turnsN = () => Math.max(1, +S().cond.turns || 30);
  const present = (st = S()) => st.team.map((s, i) => (s ? i + 1 : 0)).filter(Boolean);
  const isMobile = () => typeof matchMedia === 'function' && matchMedia(MOBILE_MQ).matches;
  const undoToast = (msg, fn) => C.toast(msg, fn ? { action: { label: t('plan.undo'), fn } } : undefined);
  const iconBtn = (name, label, attrs = {}) => h('button', { type: 'button', class: 'btn-icon', 'aria-label': label, title: label, ...attrs }, icon(name));
  const select = (attrs, options, value) => {
    const el = h('select', attrs, ...options.map(([v, label, extra = {}]) => h('option', { value: String(v), ...extra }, label)));
    el.value = String(value);
    return el;
  };
  const hasPins = (pos) => Object.keys(store.pins.row(pos)).length > 0;
  // 고급 설정 창: ④ 격자의 프로브(ui/advanced.js)를 받아 ① 직접 지정 칸도 같은 실행 결과로 칠한다(ADV_AUDIT 모순 3)
  const advProbe = ADV && ctx.advProbe ? ctx.advProbe : null;
  const lockedAt = (st, tt) => Array.isArray(st.locked && st.locked[tt]) && tt <= turnsN();
  const advMode = () => MAIN && advIsOn();   // 메인: 고급 설정이 켜져 있으면 기본 패널을 흐리게 + inert

  // ── 알림(store.onNotice) — 메인 스토어는 메인 패널이, 스코프 스토어는 창 안 패널이 받는다(중복 토스트 방지) ──
  if (MAIN || ctx.scoped) unsubs.push(store.onNotice(({ key, vars = {} }) => {
    if (!NOTICE_RX.test(key)) return;
    const v = { ...vars };
    if (v.id != null) v.name = nameOf(v.id);
    if (Array.isArray(v.names)) v.names = v.names.join(', ');
    C.toast(t(key, v));
  }));

  // ── 포커스 보존: 다시 그려도 [data-fk] 가 같은 요소로 포커스를 돌려준다 ─────────
  const keepFocus = (fn) => {
    const a = document.activeElement;
    const fk = a && host.contains(a) ? (a.closest('[data-fk]') || {}).dataset?.fk : null;
    fn();
    if (fk) {
      const el = host.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
      if (el && el !== document.activeElement && !el.disabled) el.focus({ preventScroll: true });
    }
  };

  let el = {};                     // 현재 DOM 참조(언어 전환 시 새로 만든다)
  const rowCache = new Map();      // 자리(pos) → li — FLIP 이 같은 요소를 추적하도록 재사용
  const openState = { d1: true, d2: false };
  const directOpen = new Set();    // '직접 지정'을 골랐지만 아직 칸을 찍지 않은 자리(핀이 생기면 핀이 기준)
  const isDirect = (pos) => hasPins(pos) || directOpen.has(pos);

  // ═════════════════════════════════════════════════════════════════════════════
  // 골격
  // ═════════════════════════════════════════════════════════════════════════════
  function build() {
    rowCache.clear();
    const sumText = () => h('span', { class: 'acc-sum-text' });
    const ol = h('ol', { class: 'prio', 'aria-label': t('plan.step1.title') });
    sortable(ol, { reduced: motion.reduced, onMove: (from, to) => {
      const ord = store.plan.order().map((o) => o.i + 1);
      const [m] = ord.splice(from, 1); ord.splice(to, 0, m);
      store.plan.setOrder(ord);
    } });
    const excList = h('ul', { class: 'exc-list' });
    const excAdd = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'data-fk': 'excAdd', onClick: () => openExceptionSheet(null) }, icon('plus'), h('span', {}, t('plan.step2.add')));
    // [ADV_REVIEW #6] 창: 방식 안내 문단은 ① 제목 옆 ⓘ 툴팁. [#10] ② 안내에 ④ 턴 편집과 같은 설정이라는 연결.
    const body1 = h('div', { class: 'step-body' }, ol, ADV ? null : h('p', { class: 'hint' }, t('plan.ult.mode.hint.light')));
    const body2 = h('div', { class: 'step-body' }, h('p', { class: 'hint' }, t(ADV ? 'plan.step2.hint.adv' : 'plan.step2.hint')), excList, excAdd);

    // 실행 미리보기(읽기 전용)
    const legend = h('span', { class: 'legend' },
      ...[['ult', 'plan.act.ult'], ['def', 'plan.act.def'], ['atk', 'plan.act.atk'], ['extra', 'plan.legend.extra']].flatMap(([k, key]) => [h('i', { class: `pv ${k}` }), t(key), ' ']));
    const grid = h('div', { class: 'pv-grid', role: 'img', 'aria-label': '' });
    const pvMsg = h('p', { class: 'hint pv-msg', hidden: true });
    const fig = h('figure', { class: 'preview' },
      h('figcaption', {}, h('span', {}, t('plan.preview.title')), legend),
      grid, pvMsg, h('p', { class: 'hint' }, t('plan.preview.hint')));

    if (ADV) {
      // 고급 설정 창: 번호 붙은 구역을 세로로(아코디언 없음)
      const sec = (n, key, body, id) => h('section', { class: 'deep-sec', 'aria-labelledby': id },
        h('div', { class: 'deep-sec-h' }, h('h3', { id }, h('span', { class: 'step-n' }, String(n)), t(key))), body);
      // [ADV_REVIEW #7] 창의 구역은 접히지 않으므로 머리 요약(kv)은 만들지 않는다(목록과 같은 값). s1·s2 는 화면 밖 자리표시.
      const s1 = h('span', {}), s2 = h('span', {});
      const sec1 = sec(1, 'plan.step1.title', body1, 'advp-h1');
      sec1.querySelector('.deep-sec-h').append(helpTip(C, t('plan.ult.mode.hint'), t('plan.adv.help.aria', { what: t('plan.step1.title') })));
      const sec2 = sec(2, 'plan.step2.title', body2, 'advp-h2');
      host.replaceChildren(sec1, sec2, ...(ctx.planExtra || []));   // 읽기 미리보기는 없음(④ N턴 고정 표가 대신)
      el = { ol, s1, s2, excList };
    } else {
      const resetBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-haspopup': 'menu', 'aria-label': t('plan.reset.menu.aria') },
        icon('rotate-ccw'), h('span', {}, t('plan.reset')), icon('chevron-down'));
      let menuWasOpen = false, menuRef = null;
      resetBtn.addEventListener('pointerdown', () => { menuWasOpen = !!(menuRef && menuRef.el.isConnected); });
      resetBtn.addEventListener('click', () => {
        if (menuWasOpen || (menuRef && menuRef.el.isConnected)) { menuRef.close(); menuWasOpen = false; return; }
        menuRef = C.menu(resetBtn, [
          { label: t('plan.reset.order'), iconName: 'list-restart', onSelect: () => resetScope('order') },
          { label: t('plan.reset.exceptions'), onSelect: () => resetScope('exceptions') },
          { label: t('plan.reset.direct'), onSelect: () => resetScope('direct') },
          'sep',
          { label: t('plan.reset.all'), iconName: 'rotate-ccw', danger: true, onSelect: () => resetScope('all') },
        ]);
      });
      const tools = h('div', { class: 'panel-tools' }, resetBtn);
      const s1 = sumText(), s2 = sumText();
      const d1 = C.accordionItem({ title: t('plan.step1.title'), summaryNode: s1, body: body1, open: openState.d1, stepNo: 1 });
      const d2 = C.accordionItem({ title: t('plan.step2.title'), summaryNode: s2, body: body2, open: openState.d2, stepNo: 2 });
      [['d1', d1], ['d2', d2]].forEach(([k, d]) => d.addEventListener('toggle', () => { openState[k] = d.open; }));
      const steps = h('div', { class: 'acc steps' }, d1, d2);
      const main = h('div', { class: 'pl-main' }, steps, fig);
      // 고급 설정 사용 중 배너(패널 머리 아래 한 줄) — 켜진 동안 기본 패널은 흐리게 + inert
      const bannerWhy = h('span', { class: 'deep-banner-why', hidden: true }, icon('lock'), h('span', {}, t('plan.adv.forced')));
      const banner = h('div', { class: 'deep-banner', role: 'status', hidden: true }, icon('sliders-horizontal'), h('span', { class: 'deep-banner-msg' }, t('plan.adv.banner')), bannerWhy);
      // 패널 맨 아래 진입 버튼(전체 폭)
      const enterMain = h('b', { class: 'deep-enter-main' });
      const enterSub = h('span', { class: 'deep-enter-sub' }, t('plan.adv.enter.sub'));
      const enter = h('button', { type: 'button', class: 'btn btn-secondary deep-enter', 'data-fk': 'advOpen', onClick: () => openAdvanced(ctx) },
        icon('sliders-horizontal'), h('span', { class: 'deep-enter-text' }, enterMain, enterSub), icon('chevron-right', 'ic deep-enter-chev'));
      host.replaceChildren(h('div', { class: 'panel-head' }, h('h2', { id: 'plan-h' }, t('plan.title')), tools), banner, main, enter);
      el = { ol, d1, d2, s1, s2, excList, grid, pvMsg, fig, steps, tools, main, banner, bannerWhy, enter, enterMain, enterSub, resetBtn };
    }
    prevCells = null;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ① 순서와 필살기
  // ═════════════════════════════════════════════════════════════════════════════
  function renderStep1() {
    const st = S(), n = turnsN(), env = store.env();
    const order = store.plan.order();
    const eff = effectiveTeam(st.team, st.pins, n, env);
    const ukIdx = ukPresetIndex(st.sync, st.team);
    const ukAnchor = ukIdx >= 0 ? normalizeSyncGroups(st.sync)[ukIdx].anchor : 0;
    el.ol.querySelectorAll(':scope > :not([data-sort])').forEach((x) => x.remove());
    const seen = new Set();
    order.forEach((o, k) => {
      const pos = o.i + 1; seen.add(pos);
      let li = rowCache.get(pos);
      if (!li) { li = h('li', { 'data-sort': '' }); rowCache.set(pos, li); }
      li.dataset.pos = String(pos);
      li.title = t('plan.order.drag');
      li.replaceChildren(...rowContent(o.s, o.i, k, order.length, st, env, n, eff, ukIdx, ukAnchor));
      el.ol.append(li);
    });
    for (const [pos, li] of rowCache) if (!seen.has(pos)) { li.remove(); rowCache.delete(pos); }
    if (!order.length) el.ol.replaceChildren(C.empty(t('plan.pv.empty')));
  }

  function rowContent(s, i, k, len, st, env, n, eff, ukIdx, ukAnchor) {
    const pos = i + 1, meta = env.chars[s.id] || st.chars[s.id] || {}, name = nameOf(s.id);
    const direct = isDirect(pos);
    const u = ultOf(s), mode = u.mode === 'strict' ? 'strict' : u.mode === 'asap' ? 'asap' : 'auto';
    const auto = autoUltTurns(meta, n, env, 3, s);   // 성공 가정이 당기면 당겨진 턴(#27)
    const autoLabel = auto ? t('plan.ult.mode.autoTurns', { turns: auto }) : t('plan.ult.mode.auto');
    const g = syncGroupOf(st.sync, pos);
    // 욱영 프리셋 그룹(메인 체크)의 멤버는 칩을 달지 않는다 — 라이트 기능, 욱영 행 체크로 보인다
    const anchorSlot = g && g.role === 'member' && g.g.anchor && g.g.anchor !== ukAnchor ? st.team[g.g.anchor - 1] : null;
    const nameEl = h('span', { class: 'prio-name' }, h('span', { class: 'nm', title: fullName(s.id) }, name),
      anchorSlot && h('span', { class: 'link-chip' }, icon('layers'), t('plan.link.chip', { name: nameOf(anchorSlot.id) })));
    if (MAIN && s.id === UK_ID) {   // [D2] 창에서는 ③ 필살기 연동의 욱영 프리셋에서 편집
      const cb = h('input', { type: 'checkbox', 'data-fk': `ukafter:${pos}`, checked: ukIdx >= 0 || !!s.allyUltAfter, onChange: (e) => setUkAfter(i, e.target.checked, name, e.currentTarget.closest('label')) });
      nameEl.append(h('label', { class: 'row-toggle', title: t('plan.ally.ultAfter.tip', { name }) }, cb, h('span', {}, t('plan.ally.ultAfter'))));
    }
    const mv = h('span', { class: 'mv' },
      iconBtn('arrow-up', t('plan.order.up.aria'), { disabled: k === 0, 'data-fk': `up:${pos}`, onClick: () => moveRow(k, -1) }),
      iconBtn('arrow-down', t('plan.order.down.aria'), { disabled: k === len - 1, 'data-fk': `dn:${pos}`, onClick: () => moveRow(k, 1) }));
    const out = [h('span', { class: 'prio-n' }, String(k + 1)), h('img', { src: `icons/${s.id}.png`, alt: '', draggable: 'false' }), nameEl];
    if (ADV) {
      // 고급 설정: 방식 3택 + 직접 지정(턴 칸 줄 — 메인과 같은 모양) + 성공 가정·방어 턴 유지
      const modeSel = select({ 'data-fk': `amode:${pos}`, 'aria-label': t('plan.step1.ultMode.aria', { name }), onChange: (e) => setAdvMode(i, e.target.value, direct, name) },
        [...MODES.map((m) => [m, m === 'auto' ? autoLabel : t(`plan.ult.mode.${m}`)]), ['direct', t('plan.mode.direct')]], direct ? 'direct' : mode);
      out.push(h('label', { class: 'ult-mode' }, h('span', { class: 'sr' }, t('plan.step1.ultMode.aria', { name })), modeSel), mv);
      const asap = mode === 'asap';
      // 효과 없는 조건이면 흐리게 + 이유(모순 4). 기본값이 아닌 채로 남아 있으면 되돌릴 수 있게 입력은 살려 둔다.
      const cb = (fk, label, checked, disabled, dim, title, onChange) => h('label', { class: `deep-cb${dim ? ' off' : ''}`, title },
        h('input', { type: 'checkbox', 'data-fk': fk, checked, disabled, 'aria-description': dim ? title : null, onChange: (e) => onChange(e.target.checked) }), h('span', {}, label));
      const as = assistEffect(st, pos, env);
      let asTip = as.live ? t('plan.ult.assist.tip') : t({ asap: 'plan.row.assist.asap', single: 'plan.row.assist.single' }[as.reason] || 'plan.row.assist.noAltar');
      // [D8·D9] 임부언이 추가 행동을 주는 1번 자리는 고정 칸 없이 당기지 않는다(core effectiveTeam) — 체크 툴팁으로 알림
      if (as.live && isFedCarry(st, pos) && !hasPins(pos)) asTip += `\n${t('plan.row.assist.fedCarry', { name: nameOf(IMBUEON_ID) })}`;
      const kdLive = keepDefEffect(st, pos);
      // [ADV_REVIEW #4] 체크는 효과가 있거나 기본값에서 바뀐 경우에만 보인다(켜진 채 효과가 없으면 흐림 + 이유로 남아 끌 수 있음).
      //   둘 다 없으면 두 번째 줄 없음 → 기본 상태의 행은 한 줄.
      const opts = [
        // [D4] '준비되면 바로'는 제단이 켜져 있으면 흐린 체크 + 이유로 보인다(왜 못 켜는지 알 수 있게)
        (as.live || u.assist || as.reason === 'asap') ? cb(`aassist:${pos}`, t('plan.badge.assist'), u.assist && !asap, asap || (!as.live && !u.assist), !as.live, asTip, (v) => store.plan.setAssist(pos, v)) : null,
        (kdLive || !u.keepDef) ? cb(`akeep:${pos}`, t('plan.row.keepDef'), u.keepDef, !kdLive && u.keepDef, !kdLive, kdLive ? t('plan.row.keepDef.tip') : t('plan.row.keepDef.dead'), (v) => store.plan.setKeepDef(pos, v)) : null,
      ].filter(Boolean);
      if (opts.length) out.push(h('div', { class: 'row-opt' }, ...opts));
    } else {
      // 메인: 자동 / 직접 지정
      const modeSel = select({ 'data-fk': `mode:${pos}`, onChange: (e) => setDirect(pos, e.target.value === 'direct', name) },
        [['rule', autoLabel], ['direct', t('plan.mode.direct')]], direct ? 'direct' : 'rule');
      out.push(h('label', { class: 'ult-mode' }, h('span', { class: 'sr' }, t('plan.step1.ultMode.aria', { name })), modeSel), mv);
    }
    if (direct) out.push(planStrip(i, st, env, n, name, eff));
    else {
      // 이태호: 임부언에게 받은 추가 행동은 직접 지정 줄(창에서는 ④ 칸 메뉴도)에서 턴마다 정한다
      const fedTurns = taehoFedTurns(s, st.team, n, env);
      if (fedTurns && fedTurns.size) out.push(h('div', { class: 'row-opt' }, h('span', { class: 'hint' }, t(ADV ? 'plan.fed.manualHint.adv' : 'plan.fed.manualHint', { name: nameOf(IMBUEON_ID) }))));
    }
    return out;
  }

  function moveRow(k, dir) {
    motion.flip(el.ol, () => keepFocus(() => store.plan.move(k, dir)), { duration: motion.dur('base') });
  }

  /**
   * 욱영 '아군 필살기 나중' = 욱영 프리셋 맞추기 그룹(store.sync.preset('uk'))의 존재. 켜면 그 그룹을 만들고, 끄면 그 그룹만 지운다.
   * 옛 필드 allyUltAfter 도 같은 체크로 읽으므로 끌 때 함께 지운다(페이로드 계약은 core 그대로).
   */
  function setUkAfter(i, on, name, anchorEl) {
    const st = S(), prevSync = normalizeSyncGroups(st.sync), prevFlag = !!(st.team[i] && st.team[i].allyUltAfter);
    const undo = () => { store.sync.set(prevSync); if (prevFlag !== !!(S().team[i] && S().team[i].allyUltAfter)) store.plan.setAllyUltAfter(i, prevFlag); };
    if (on) {
      const apply = () => {
        const r = store.sync.preset('uk');
        if (r.ok) undoToast(t('plan.ally.ultAfter.on', { name }), undo); else refresh();
      };
      // 모순 6: 지금 맞추기(욱영 기준 그룹·인접 동료가 든 그룹)를 덮어쓰면 먼저 묻는다. 체크는 확인 전까지 꺼 둔다.
      if (anchorEl && ukPresetOverwrites(st.sync, st.team)) {
        const input = anchorEl.querySelector('input');
        if (input) input.checked = false;
        confirmUkPreset(anchorEl, name, apply);
        return;
      }
      apply();
      return;
    }
    const k = ukPresetIndex(st.sync, st.team);
    if (k >= 0) store.sync.set(prevSync.filter((_, j) => j !== k));
    if (prevFlag) store.plan.setAllyUltAfter(i, false);
    undoToast(t('plan.ally.ultAfter.off', { name }), undo);
  }

  /** 욱영 프리셋이 지금 맞추기를 바꿀 때의 확인(데스크톱 = 팝오버, 모바일 = 바텀시트). */
  function confirmUkPreset(anchorEl, name, apply) {
    const msg = t('plan.sync.preset.confirm', { name: nameOf(UK_ID) });
    cellPicker(C, anchorEl, { title: msg, mobile: isMobile(), closeLabel: t('plan.close'), items: [
      { label: msg, disabled: true, onSelect: () => {} }, 'sep',
      { label: t('plan.sync.preset.confirm.replace'), iconName: 'sparkles', onSelect: apply },
      { label: t('plan.sync.preset.confirm.keep'), iconName: 'x', onSelect: () => {} },
    ] });
  }

  /**
   * 창 ① 방식 선택: 직접 지정 = 턴 칸 줄을 연다(준비되면 바로는 칸 고정과 맞지 않아 자동으로). 다른 방식 = 그 방식 + 직접 지정이었으면 칸 해제.
   */
  function setAdvMode(i, v, wasDirect, name) {
    const pos = i + 1;
    if (v === 'direct') {
      if (ultOf(S().team[i]).mode === 'asap') store.plan.setUltMode(i, 'auto');
      setDirect(pos, true, name);
      return;
    }
    store.plan.setUltMode(i, v);
    if (wasDirect) setDirect(pos, false, name);
  }

  /** 직접 지정 켜기/끄기. 끄면 그 동료의 핀(직접 지정 칸)을 전부 지운다(되돌리기 토스트). */
  function setDirect(pos, on, name) {
    if (on) { directOpen.add(pos); refresh(); return; }
    directOpen.delete(pos);
    if (store.pins.clearRow(pos)) undoToast(t('plan.mode.clear.done', { name }), () => { directOpen.add(pos); store.pins.undo(); });
    else refresh();
  }

  /** 직접 지정 줄: 그 동료의 구체화된 줄(핀 + 규칙 채움)을 칸으로 보이고, 칸을 누르면 선택 팝오버. */
  function planStrip(i, st, env, n, name, eff) {
    const pos = i + 1;
    const pv = planView(eff[i], i, eff, n, env);
    // 고급 설정 창(모순 3): 칸 = ④ 와 같은 값 — 고정 칸은 사용자가 고른 값, 나머지는 실제 실행(프로브). 실행이 고정과 다르면 경고 점,
    // 잠긴 턴에 가려진 고정은 흐리게(모순 5). 프로브 전에는 구체화된 줄(pv.view)로 대신한다. 메인은 종전대로 pv.view.
    const probe = advProbe ? advProbe.get() : null;
    const ignored = probe ? new Set(((store.pinsIgnored(probe).find((x) => x.pos === pos)) || { turns: [] }).turns) : new Set();
    const shown = (idx, ti) => {
      const pin = store.pins.row(pos)[ti + 1];
      const a = idx - ti * pv.apt;
      if (ADV && pin && !lockedAt(st, ti + 1)) return [...pin][a] || ATK;
      if (ADV && probe) { const acts = actsOf(probe, ti + 1, pos).slice(0, pv.apt); return acts[a] || (acts.length ? ATK : null); }
      return pv.view[idx] || ATK;
    };
    const presets = MAIN_PRESETS.filter((p) => store.pins.presetAvailable(pos, p)).map((p) =>
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-fk': `pre:${pos}:${p}`, 'data-preset': p, disabled: !!presetBlockedByMode(st.team[i], p),
        title: presetBlockedByMode(st.team[i], p) ? t('plan.row.preset.asap') : presetTip(t, i18n, p, st.team[i].id), onClick: () => applyPreset(pos, p, name) }, t(PRESET_KEY[p])));
    const multi = pv.apt > 1;
    const pinned = store.pins.row(pos);
    const actName = (a) => t(ACT_KEY[a] || 'plan.act.atk');
    const cellBtn = (idx, ti, label) => {
      const act = shown(idx, ti);
      const nocd = !!pv.lockUlt[ti];
      const pin = !!pinned[ti + 1];
      const masked = ADV && pin && lockedAt(st, ti + 1);
      const warn = ADV && pin && !masked && ignored.has(ti + 1);
      const extraNote = [];
      if (warn && probe) extraNote.push(t('plan.grid.ignored', { acts: actsLabel(t, actsOf(probe, ti + 1, pos), pv.apt) }));
      if (masked) extraNote.push(t('plan.grid.masked', { act: cellsOf(pinned[ti + 1], pv.apt).map(actName).join(' → ') }));
      if (nocd) extraNote.push(immuneAt(pv, ti) ? t('plan.turn.cell.immune', { name: nameOf(IMBUEON_ID) }) : t('plan.turn.cell.nocd'));
      const what = act ? t(ACT_KEY[act]) : t('plan.pv.cell.none');
      const aria = [t('plan.turn.cell.aria', { turn: ti + 1, action: what }), ...(pin && !masked ? [t('plan.legend.pin')] : []), ...extraNote].join(' · ');
      return h('button', { type: 'button', class: `${act ? ACT_CLS[act] : 'none'}${nocd ? ' nocd' : ''}${pin ? ' pin' : ''}${masked ? ' masked' : ''}${warn ? ' warn' : ''}`,
        'data-fk': `cell:${pos}:${idx}`, 'data-t': String(ti + 1), title: ADV ? aria : null,
        'aria-haspopup': 'menu', 'aria-label': aria,
        onClick: (e) => pickCell(e.currentTarget, pos, pv, idx, ti, name, pin, act) }, label);
    };
    // 줄 유틸(모든 동료): 모두 보통 공격 · 모두 방어(필살기 칸 유지) · 패턴 반복 — 뒤에 동료별 프리셋
    const util = (fk, label, tip, onClick) => h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-fk': `util:${pos}:${fk}`, 'data-util': fk, title: tip, onClick }, label);
    const utils = [
      util('fillAtk', t('plan.turn.preset.fillAtk'), t('plan.turn.preset.tip.fillAtk'), () => fillRowNow(ctx, pos, ATK, name)),
      util('fillDef', t('plan.turn.preset.fillDef'), t('plan.turn.preset.tip.fillDef'), () => fillRowNow(ctx, pos, DEF, name)),
      util('repeat', t('plan.repeat.btn'), t('plan.repeat.tip'), () => openRepeatSheet(ctx, pos, name)),
    ];
    const tools = h('div', { class: 'plan-tools' },
      h('span', { class: 'plan-label' }, t('plan.turn.label'), ' ', h('span', { class: 'hint' }, t('plan.turn.hint')),
        ADV ? helpTip(C, t('plan.turn.cdHint.adv'), t('plan.adv.help.aria', { what: t('plan.turn.label') })) : null),   // [ADV_REVIEW #9]
      h('div', { class: 'plan-presets', role: 'group', 'aria-label': t('plan.turn.presets.aria', { name }) }, ...utils, ...presets));
    if (!multi) {
      const cells = h('div', { class: 'plan-cells', role: 'group', 'aria-label': t('plan.turn.cells.aria', { name }) },
        ...Array.from({ length: n }, (_, ti) => cellBtn(ti, ti, String(ti + 1))));
      const strip = h('div', { class: 'plan-strip' }, tools, cells);
      if (MAIN) strip.append(h('p', { class: 'hint' }, t('plan.turn.cdHint')));
      return strip;
    }
    // 턴당 2회(이태호 — 도장 패시브): 다른 동료와 같은 칸 하나를 행동 수만큼 나눈다(왼쪽부터 실행 순서 — 실행 미리보기·④ 격자와 같은 모양).
    // 임부언이 필살기를 쓰는 턴에는 받은 추가 행동 조각(아래 막대)이 붙는다. 칸을 누르면 행동마다 한 줄씩 고르는 메뉴(pickTurn).
    const fedTurns = pv.fedTurns && pv.fedTurns.size ? pv.fedTurns : null;
    const splitBtn = (ti) => {
      const tt = ti + 1;
      const own = Array.from({ length: pv.apt }, (_, a) => shown(ti * pv.apt + a, ti) || ATK);
      const fedA = fedTurns && fedTurns.has(tt) ? (pv.fed[tt] || ATK) : null;
      const acts = fedA ? [...own, fedA] : own;
      const pin = !!pinned[tt];
      const masked = ADV && pin && lockedAt(st, tt);
      const warn = ADV && pin && !masked && ignored.has(tt);
      const notes = [];
      if (warn && probe) notes.push(t('plan.grid.ignored', { acts: actsLabel(t, actsOf(probe, tt, pos), pv.apt) }));
      if (masked) notes.push(t('plan.grid.masked', { act: cellsOf(pinned[tt], pv.apt).map(actName).join(' → ') }));
      const aria = [t('plan.turn.cell.aria', { turn: tt, action: actsLabel(t, acts, pv.apt) }), ...(pin && !masked ? [t('plan.legend.pin')] : []), ...notes].join(' · ');
      // 대각선으로 나눈 칸: --c0·--c1(·--c2) = 조각 색(왼쪽 위부터 실행 순서), xlast = 마지막 조각이 받은 추가 행동(아래 막대)
      const segs = actSegs(acts, pv.apt);
      const colors = segs.map((sg, k) => `--c${k}:var(--pc-${sg.cls})`).join(';');
      const xlast = segs.length && segs[segs.length - 1].extra;
      return h('button', { type: 'button', class: `split k${segs.length}${xlast ? ' xlast' : ''}${pin ? ' pin' : ''}${masked ? ' masked' : ''}${warn ? ' warn' : ''}`, style: colors,
        'data-fk': `cell:${pos}:${tt}`, 'data-t': String(tt), title: ADV ? aria : null, 'aria-haspopup': 'menu', 'aria-label': aria,
        onClick: (e) => pickTurn(e.currentTarget, i, tt, name, own, fedA) }, h('span', { class: 'pc-num' }, String(tt)));
    };
    const cells = h('div', { class: 'plan-cells', role: 'group', 'aria-label': t('plan.turn.cells.aria', { name }) },
      ...Array.from({ length: n }, (_, ti) => splitBtn(ti)));
    // 쿨타임 안내 대신 행동 횟수 안내(필살기 CD 1턴 — 잠기는 칸이 없다)
    const hint = h('p', { class: 'hint' }, t('plan.turn.multiHint', { n: pv.apt }), fedTurns ? ` ${t('plan.turn.fedHint', { name: nameOf(IMBUEON_ID) })}` : '');
    return h('div', { class: 'plan-strip' }, tools, cells, hint);
  }

  /**
   * 턴당 2회 칸 메뉴: 행동마다 한 줄(1번째 · 2번째 · 임부언에게 받은 추가 행동). 자기 행동 = 그 턴 고정 칸(행동 수만큼 — 필살기는 한 턴에 한 번),
   * 받은 추가 행동 = fedActions(고정 칸이 있는 줄에만 실리므로 없으면 이 턴을 함께 고정). own = 지금 칸의 자기 행동, fedA = 받은 추가 행동(없으면 null).
   */
  function pickTurn(anchor, i, tt, name, own, fedA) {
    const pos = i + 1;
    const SW = { [ATK]: 'pl-sw-atk', [ULT]: 'pl-sw-pin-ult', [DEF]: 'pl-sw-def' };
    const choices = (cur, pick) => [ATK, ULT, DEF].map((a) => ({ label: t(ACT_KEY[a]), swatch: SW[a], current: cur === a, onSelect: () => pick(a) }));
    const setOwn = (k, a) => keepFocus(() => {
      const turn = own.slice();
      turn[k] = a;
      if (a === ULT) turn.forEach((x, j) => { if (j !== k && x === ULT) turn[j] = ATK; });
      store.pins.set(tt, pos, turn.join(''));
    });
    const items = own.map((cur, k) => ({ row: t('plan.pop.nth', { n: k + 1 }), choices: choices(cur, (a) => setOwn(k, a)) }));
    if (fedA) items.push({ row: t('plan.pop.extra'), note: t('plan.fed.label', { name: nameOf(IMBUEON_ID) }), choices: choices(fedA, (a) => keepFocus(() => {
      if (!Object.keys(store.pins.row(pos)).length) store.pins.set(tt, pos, own.join(''));
      store.plan.setFed(i, tt, a);
    })) });
    if (ADV && store.pins.row(pos)[tt]) items.push('sep', { label: t('plan.cellSheet.clear'), iconName: 'x', onSelect: () => keepFocus(() => store.pins.set(tt, pos, null)) });
    if (tt < turnsN()) items.push('sep', { label: t('plan.repeat.cell'), iconName: 'copy', onSelect: () => openRepeatSheet(ctx, pos, name, tt) });
    cellPicker(C, anchor, { title: t('plan.cellSheet.title', { turn: tt, name }), items, mobile: isMobile(), closeLabel: t('plan.close') });
  }

  /** 칸 선택 팝오버(턴당 1회 동료 — 턴당 2회는 pickTurn): 보통 공격 / 필살기(쿨타임이 안 돌아온 턴은 비활성 + 이유) / 방어 (+ 고급 설정 창은 고정 해제). */
  function pickCell(anchor, pos, pv, idx, ti, name, pinned, shownAct) {
    const cur = shownAct || pv.view[idx] || ATK;
    const meta = store.env().chars[(S().team[pos - 1] || {}).id] || {};
    const set = (a) => {
      if (a === ULT) {   // 동료별 규칙(앞 턴 방어 자동 배치 · 전투당 1회) — core pinUltRow
        keepFocus(() => { const msg = pinUltNotice(t, pinUltWithRules(store, pos, ti + 1), name, ti + 1); if (msg) C.toast(msg); });
        return;
      }
      keepFocus(() => { store.pins.set(ti + 1, pos, a); });
    };
    const nocd = !!pv.lockUlt[ti];
    const items = [
      { label: t('plan.act.atk'), swatch: 'pl-sw-atk', current: cur === ATK, onSelect: () => set(ATK) },
      { label: t('plan.act.ult'), swatch: 'pl-sw-pin-ult', current: cur === ULT, disabled: nocd,
        reason: nocd ? (immuneAt(pv, ti) ? t('plan.turn.cell.immune', { name: nameOf(IMBUEON_ID) }) : t('plan.turn.cell.nocd')) : (meta.cdDefendReduce > 0 ? t('plan.pin.defHint') : null), onSelect: () => set(ULT) },
      { label: t('plan.act.def'), swatch: 'pl-sw-def', current: cur === DEF, onSelect: () => set(DEF) },
    ];
    if (ADV && pinned) items.push('sep', { label: t('plan.cellSheet.clear'), iconName: 'x', onSelect: () => keepFocus(() => store.pins.set(ti + 1, pos, null)) });
    if (ti + 1 < turnsN()) items.push('sep', { label: t('plan.repeat.cell'), iconName: 'copy', onSelect: () => openRepeatSheet(ctx, pos, name, ti + 1) });
    cellPicker(C, anchor, { title: t('plan.cellSheet.title', { turn: ti + 1, name }), items, mobile: isMobile(), closeLabel: t('plan.close') });
  }

  /** 쿨타임이 안 돌아온 칸이 임부언 CD 변동 면역 턴인가(1번 자리 동료 — core planView.immune). ti 0-based. */
  function immuneAt(pv, ti) { return !!(pv.immune && pv.immune.has(ti + 1)); }

  function applyPreset(pos, p, name) {
    const tok = store.pins.applyPreset(pos, p);
    if (tok) undoToast(t('plan.row.preset.done', { name, preset: t(PRESET_KEY[p]) }), () => store.pins.revert(tok));
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ② 예외 턴
  // ═════════════════════════════════════════════════════════════════════════════
  const orderNames = (order, st) => order.filter((p) => st.team[p - 1]).map((p) => nameOf(st.team[p - 1].id)).join(' → ');
  function renderStep2() {
    const st = S();
    const groups = groupExceptions(st.overrides, turnsN());
    el.excList.replaceChildren(...groups.map((g) => {
      const tt = turnsText(g.turns);
      // 모순 5: 잠긴 턴은 순서까지 잠긴 대로 실행 → 그 턴의 예외 순서는 쓰이지 않는다
      const masked = g.turns.filter((x) => lockedAt(st, x));
      const maskedEl = masked.length ? h('span', { class: 'exc-masked' }, icon('lock'), h('span', {}, t('plan.exc.masked', { turns: turnsText(masked) }))) : null;
      return h('li', { class: `exc-row${masked.length === g.turns.length ? ' is-masked' : ''}`, dataset: { turns: g.turns.join(' ') } },
        h('span', { class: 'exc-turns' }, t('plan.sum.exceptions', { turns: tt })),
        h('span', { class: 'exc-order' }, orderNames(g.order, st)), maskedEl,
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-fk': `excedit:${g.turns[0]}`, 'aria-label': t('plan.exc.edit.aria', { turns: tt }), onClick: () => openExceptionSheet(g) }, t('plan.exc.edit')),
        iconBtn('trash-2', t('plan.exc.remove.aria', { turns: tt }), { onClick: () => {
          store.plan.clearException(g.turns);
          undoToast(t('plan.exc.removed', { turns: tt }), () => store.plan.setException(g.turns, g.order));
        } }));
    }));
    el.excList.hidden = !groups.length;
  }

  function openExceptionSheet(g) {
    const st = S(), n = turnsN();
    const sel = new Set(g ? g.turns.filter((x) => x <= n) : []);
    const order = (g ? g.order : store.plan.order().map((o) => o.i + 1)).filter((p) => st.team[p - 1]);
    present(st).forEach((p) => { if (!order.includes(p)) order.push(p); });
    if (!order.length) return;
    const chips = h('div', { class: 'turn-chips', role: 'group', 'aria-label': t('plan.exc.sheet.turns') });
    const err = h('p', { class: 'hint err', role: 'alert', hidden: true }, t('plan.exc.sheet.needTurn'));
    chips.replaceChildren(...Array.from({ length: n }, (_, k) => {
      const tt = k + 1;
      const has = Array.isArray(st.overrides[tt]) && st.overrides[tt].length && !(g && g.turns.includes(tt));
      return h('button', { type: 'button', class: has ? 'has' : '', 'aria-pressed': String(sel.has(tt)),
        'aria-label': has ? t('plan.exc.chip.has', { turn: tt }) : t('plan.exc.chip.aria', { turn: tt }),
        onClick: (e) => { if (sel.has(tt)) sel.delete(tt); else sel.add(tt); e.currentTarget.setAttribute('aria-pressed', String(sel.has(tt))); err.hidden = true; } }, String(tt));
    }));
    const ol = h('ol', { class: 'prio exc-order-list' });
    const items = new Map();
    const renderOrder = () => {
      order.forEach((p, k) => {
        let li = items.get(p);
        if (!li) { li = h('li', { 'data-sort': '' }); items.set(p, li); }
        const id = st.team[p - 1].id;
        const mv = (dir) => {
          const to = k + dir; if (to < 0 || to >= order.length) return;
          motion.flip(ol, () => { const [m] = order.splice(k, 1); order.splice(to, 0, m); renderOrder(); });
          const b = items.get(p).querySelector(dir < 0 ? '[data-dir="-1"]' : '[data-dir="1"]'); if (b && !b.disabled) b.focus();
        };
        li.replaceChildren(h('span', { class: 'prio-n' }, String(k + 1)), h('img', { src: `icons/${id}.png`, alt: '', draggable: 'false' }),
          h('span', { class: 'prio-name' }, nameOf(id)),
          h('span', { class: 'mv' },
            iconBtn('arrow-up', t('plan.order.up.aria'), { disabled: k === 0, 'data-dir': '-1', onClick: () => mv(-1) }),
            iconBtn('arrow-down', t('plan.order.down.aria'), { disabled: k === order.length - 1, 'data-dir': '1', onClick: () => mv(1) })));
        ol.append(li);
      });
    };
    renderOrder();
    sortable(ol, { reduced: motion.reduced, onMove: (from, to) => { const [m] = order.splice(from, 1); order.splice(to, 0, m); renderOrder(); } });
    const body = h('div', { class: 'exc-sheet' },
      h('section', { class: 'sheet-sec' }, h('h3', {}, t('plan.exc.sheet.turns')), h('p', { class: 'hint' }, t('plan.exc.sheet.turnsHint')), chips, err),
      h('section', { class: 'sheet-sec' }, h('h3', {}, t('plan.exc.sheet.order')), h('p', { class: 'hint' }, t('plan.order.drag')), ol));
    let sheet = null;
    const apply = () => {
      if (!sel.size) { err.hidden = false; return; }
      const turns = [...sel].sort((a, b) => a - b);
      const prev = JSON.parse(JSON.stringify(S().overrides || {}));
      if (g) { const drop = g.turns.filter((x) => !sel.has(x)); if (drop.length) store.plan.clearException(drop); }
      store.plan.setException(turns, order);
      sheet.close();
      undoToast(t('plan.exc.saved', { turns: turnsText(turns) }), () => store.set({ overrides: prev }));
      // 방어로 CD 를 줄이는 동료(모이루)가 이 턴에 앞으로 오면 그 턴 동료 보통 공격의 추격이 방어에 반영되지 않는다 — 고정한 필살기가 밀릴 수 있음
      const risk = stackOrderRisk(S(), order);
      if (risk.length) C.toast(t('plan.exc.warn.stack', { name: risk.map(nameOf).join(', '), turns: turnsText(turns) }));
    };
    sheet = C.openSheet({ title: t(g ? 'plan.exc.sheet.edit' : 'plan.exc.sheet.add'), body, ariaLabel: t('plan.close'),
      foot: [h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => sheet.close() }, t('plan.exc.sheet.cancel')),
        h('button', { type: 'button', class: 'btn btn-primary', onClick: apply }, t('plan.exc.sheet.apply'))] });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 요약 · 고급 설정 카드(메인)
  // ═════════════════════════════════════════════════════════════════════════════
  const orderText = (st) => { const o = summary.order(st); return o.key === 'plan.sum.order' ? o.vars.ids.map(nameOf).join(' → ') : t(o.key, o.vars); };
  function renderSummaries() {
    const st = S();
    const ex = summary.exceptions(st);
    const exText = ex.key === 'plan.sum.exceptions'
      ? (ex.vars.n > 6 ? t('plan.sum.exceptions.many', { n: ex.vars.n }) : t('plan.sum.exceptions', { turns: turnsText(ex.vars.turns) }))
      : t(ex.key);
    el.s1.textContent = orderText(st);
    el.s2.textContent = exText;
    if (MAIN) {
      el.d1.setChanged(!(st.team.every((s) => !s || s.priority == null) && present(st).every((p) => !hasPins(p)) && !st.team.some((s) => s && s.allyUltAfter) && ukPresetIndex(st.sync, st.team) < 0));
      el.d2.setChanged(ex.key === 'plan.sum.exceptions');
    }
  }
  function renderAdvState() {
    if (!MAIN) return;
    const on = advMode();
    el.main.classList.add('dim-able');
    el.main.classList.toggle('is-dimmed', on);
    el.main.inert = on;
    el.resetBtn.disabled = on;
    el.banner.hidden = !on;
    el.bannerWhy.hidden = !(on && advForced(S()));
    el.enter.classList.toggle('on', on);
    el.enterMain.textContent = t(on ? 'plan.adv.enter.on' : 'plan.adv.enter.main');
    el.enterSub.hidden = on;
  }

  function refresh() {
    keepFocus(() => { renderAdvState(); renderStep1(); renderStep2(); renderSummaries(); });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 실행 미리보기 — probe(디바운스 300ms), 바뀐 칸만 하이라이트. 읽기 전용(툴팁만).
  // ═════════════════════════════════════════════════════════════════════════════
  let probeSeq = 0, probeTimer = 0, lastProbe = null, prevCells = null;
  function schedule() {
    clearTimeout(probeTimer);
    if (ADV) return;                                 // 창 안은 미리보기 없음(④ 표가 프로브를 그린다)
    if (el.grid) { el.grid.classList.add('loading'); el.grid.setAttribute('aria-busy', 'true'); }
    probeTimer = setTimeout(runProbe, PROBE_DEBOUNCE);
  }
  async function runProbe() {
    const my = ++probeSeq;
    const st = S();
    const done = () => { if (my === probeSeq && el.grid) { el.grid.classList.remove('loading'); el.grid.removeAttribute('aria-busy'); } };
    if (!st.team.some(Boolean)) { lastProbe = null; renderPreview(null); done(); return; }
    try {
      const r = await api.probe(store.buildCfg({ mode: 'probe' }));
      if (my !== probeSeq) return;
      if (!r || r.error) throw new Error((r && r.error) || 'probe');
      lastProbe = r;
      store.set({ probe: r }, { silent: true });      // 턴 편집·prepareRun 이 같은 결과를 쓴다
      renderPreview(r);
    } catch (err) {
      if (my !== probeSeq) return;
      el.pvMsg.hidden = false;
      el.pvMsg.classList.add('err');
      el.pvMsg.textContent = t('plan.pv.error', { message: (err && err.message) || '' });
    } finally { done(); }
  }

  function renderPreview(probe) {
    const st = S(), n = turnsN();
    const order = store.plan.order();
    el.grid.setAttribute('aria-label', t('plan.preview.aria', { turns: n, n: order.length }));
    if (!probe || !order.length) {
      el.grid.replaceChildren();
      el.pvMsg.hidden = false; el.pvMsg.classList.remove('err'); el.pvMsg.textContent = t('plan.pv.empty');
      prevCells = null;
      return;
    }
    el.pvMsg.hidden = true;
    const next = new Map(), cellEls = new Map();
    const cols = `repeat(${n}, 1fr)`;
    const chars = store.env().chars;
    const rowEls = order.map((o) => {
      const pos = o.i + 1, meta = chars[o.s.id] || st.chars[o.s.id] || {}, apt = meta.actionsPerTurn || 1, name = nameOf(o.s.id);
      const cells = h('span', { class: 'pv-cells', style: { gridTemplateColumns: cols } });
      for (let tt = 1; tt <= n; tt++) {
        // 한 턴에 여러 번 행동하면 칸을 실행 순서대로 나눈다(왼쪽부터) — 추가 행동 조각은 아래 막대
        const acts = actsOf(probe, tt, pos);
        const segs = actSegs(acts, apt);
        const title = t('plan.pv.cell', { turn: tt, name, acts: actsLabel(t, acts, apt) });
        const key = `${pos}:${tt}`;
        const data = { pos: String(pos), t: String(tt) };
        const c = segs.length > 1
          ? h('i', { class: 'multi', title, dataset: data }, ...segs.map((sg) => h('b', { class: `${sg.cls}${sg.extra ? ' x' : ''}` })))
          : h('i', { class: segs.length ? segs[0].cls : 'none', title, dataset: data });
        next.set(key, segsKey(segs) || 'none'); cellEls.set(key, c);
        cells.append(c);
      }
      return h('div', { class: 'pv-row', dataset: { pos: String(pos) } }, h('span', { class: 'pv-name', title: fullName(o.s.id) }, name), cells);
    });
    const ticks = [1, ...[5, 10, 15, 20, 25, 30].filter((x) => x < n), n].filter((x, k, a) => a.indexOf(x) === k);
    const axis = h('div', { class: 'pv-axis', 'aria-hidden': 'true' }, ...ticks.map((x) => h('span', { style: { left: `${((x - 0.5) / n) * 100}%` } }, String(x))));
    el.grid.replaceChildren(...rowEls, axis);
    if (prevCells) {
      const keys = [...next.keys()].filter((k) => prevCells.has(k));
      motion.flashChanged(keys.map((k) => cellEls.get(k)), keys.map((k) => prevCells.get(k)), keys.map((k) => next.get(k)));
    }
    prevCells = next;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 초기화(메인)
  // ═════════════════════════════════════════════════════════════════════════════
  const sameIds = (a, b) => a.length === b.length && a.every((s, k) => (s ? s.id : 0) === (b[k] ? b[k].id : 0));
  function resetScope(scope) {
    const st = S();
    const prev = { team: st.team, overrides: st.overrides, pins: st.pins, locked: st.locked, sync: st.sync };
    const restore = (parts) => () => {
      const now = S(); const patch = {};
      if (parts.includes('team') && sameIds(prev.team, now.team)) patch.team = prev.team;
      if (parts.includes('overrides')) patch.overrides = prev.overrides;
      if (parts.includes('pins')) patch.pins = prev.pins;
      if (parts.includes('locked')) patch.locked = prev.locked;
      if (Object.keys(patch).length) store.set(patch);
      if (parts.includes('sync')) store.sync.set(prev.sync);
    };
    if (scope === 'order') { store.plan.resetOrder(); undoToast(t('plan.reset.done.order'), restore(['team'])); return; }
    if (scope === 'exceptions') { store.plan.resetExceptions(); undoToast(t('plan.reset.done.exceptions'), restore(['overrides'])); return; }
    if (scope === 'direct') { directOpen.clear(); store.set({ pins: {} }); undoToast(t('plan.reset.done.direct'), restore(['pins'])); return; }
    directOpen.clear();
    store.plan.resetAll();
    S().team.forEach((s, i) => {
      if (!s) return;
      store.plan.setUltMode(i, 'auto');
      store.plan.setUlt(i, { keepDef: true, assist: false });
      if (s.allyUltAfter) store.plan.setAllyUltAfter(i, false);
    });
    store.set({ pins: {}, locked: {} });
    store.sync.set([]);
    undoToast(t('plan.reset.done.all'), restore(['team', 'overrides', 'pins', 'locked', 'sync']));
  }

  /** 육성 창의 '행동 계획에서 보기' — 그 동료 행으로 스크롤 + 1초 강조(고급 설정이 켜져 있으면 창을 연다). */
  function showRow(pos) {
    if (advMode()) { openAdvanced(ctx); return; }
    if (el.d1 && !el.d1.open) el.d1.open = true;
    const li = el.ol && el.ol.querySelector(`li[data-pos="${pos}"]`);
    if (!li) return;
    li.scrollIntoView({ block: 'center', behavior: motion.reduced() ? 'auto' : 'smooth' });
    li.classList.remove('hl'); void li.offsetWidth; li.classList.add('hl');
    const row = el.grid.querySelector(`.pv-row[data-pos="${pos}"]`);
    if (row) row.classList.add('hl');
    setTimeout(() => { li.classList.remove('hl'); if (row) row.classList.remove('hl'); }, 1000);
    const sel = li.querySelector('select');
    if (sel) sel.focus({ preventScroll: true });
  }
  if (MAIN && !ctx.scoped) ctx.showPlanRow = showRow;

  /**
   * 메인: 기록·공유 코드로 딥 설정이 들어오거나 방탈출 제단이 켜지면 고급 설정을 켠다(엔진에 가는 값이 화면에 드러나게).
   * 제단이 켜져 있는 동안은 끌 수 없다(advForced).
   */
  const autoAdv = () => { const st = S(); if (MAIN && !advIsOn() && (hasDeep(st) || advForced(st))) advSetOn(store, true, { keep: true }); };

  // ═════════════════════════════════════════════════════════════════════════════
  // 부트
  // ═════════════════════════════════════════════════════════════════════════════
  build();
  autoAdv();
  refresh();
  schedule();

  const condKey = (s) => { const c = s.cond; return [c.turns, c.hp10, c.dummies, c.enemyHits, c.dummyElement, c.incomingOn, c.incomingPct].join('|'); };
  const onChange = () => { autoAdv(); refresh(); schedule(); };
  const onTeam = () => { for (const p of [...directOpen]) if (!S().team[p - 1]) directOpen.delete(p); onChange(); };
  unsubs.push(
    store.subscribe((s) => s.team, onTeam),
    store.subscribe(condKey, onChange),
    store.subscribe((s) => s.sync, onChange),
    store.subscribe((s) => s.overrides, onChange),
    store.subscribe((s) => s.altar, onChange),
    store.subscribe((s) => s.pins, onChange),
    store.subscribe((s) => s.locked, onChange),
    store.subscribe((s) => s.tdmg, schedule),
    store.subscribe((s) => s.chars, onChange));
  if (MAIN) unsubs.push(onAdvChange(() => { directOpen.clear(); refresh(); schedule(); }));   // 켜고 끌 때 행동 계획이 통째로 바뀐다
  if (advProbe) unsubs.push(advProbe.on(() => keepFocus(renderStep1)));
  if (i18n.onChange) unsubs.push(i18n.onChange(() => { build(); refresh(); if (lastProbe && MAIN) renderPreview(lastProbe); else schedule(); }));
  /** 해제(창을 다시 열 때 이전 패널의 구독·대기 중 프로브를 끊는다). */
  return () => {
    clearTimeout(probeTimer); probeSeq++;
    if (ctx.showPlanRow === showRow) delete ctx.showPlanRow;
    unsubs.forEach((u) => { try { u && u(); } catch { /* noop */ } });
  };
}
