// 전투 조건 — 아코디언 4개(반복·턴 / 적 / 받는 데미지 / 방탈출 제단) + 실행 버튼(진행 바로 변형). ARCHITECTURE §7 E.
// 실행 함수는 ctx.run 으로 등록해 모바일 하단 바(runbar.js)가 같은 흐름을 쓴다. 진행 상태는 ctx.onRun(fn) 으로 흘린다.
// 스토어 쓰기는 값이 실제로 바뀔 때만 한다(슬라이더 set → onChange → store → 구독 → set 되먹임 방지).
import { COND_DEFAULTS, isDefault, summary } from '../core/plan.js';
import { TDMG_DEFAULTS } from '../core/store.js';
import { DUMMY_EL } from '../core/format.js';
import { openAltar, loadAltars, altarCounts } from './altar.js';

const RUNS_MAX = 200;            // store.cond.set 이 1~200 으로 자른다(v1 index.html 과 같음)
const HITS = ['0', '1', '2', '3', '4', '5', 'all'];
const clone = v => JSON.parse(JSON.stringify(v));

export async function mount(host, ctx) {
  const { store, t, i18n, components: C, motion } = ctx;
  const { h } = C;
  C.ensureStyle('css/cond.css');
  const S = () => store.get();
  const offs = [];                                   // 다시 그릴 때(언어 전환) 정리할 구독
  let running = false;
  ctx.openAltar = () => openAltar(ctx);
  let altarData = null;
  loadAltars().then(d => { altarData = d; sync(); });

  // ── 공통 조각 ──
  const help = (text, aria) => { const b = h('button', { type: 'button', class: 'help', 'aria-label': aria }, '?'); C.tooltip(b, text); return b; };
  const kv = (...texts) => h('span', { class: 'kv-list' }, ...texts.filter(Boolean).map(x => h('span', { class: 'kv' }, x)));
  const withLabel = (sl, label, extra = []) => { sl.querySelector('.field-row').prepend(label, ...extra); return sl; };
  const secReset = (onClick) => h('button', { type: 'button', class: 'reset sec-reset', onClick }, t('cond.incoming.dmg.reset'));

  // 부분/전체 초기화 — 되돌리기 토스트용 스냅샷
  const capture = () => ({ cond: { ...S().cond }, tdmg: clone(S().tdmg), altar: clone(S().altar) });
  const restore = snap => {
    const a = snap.altar;
    store.altar.apply({ on: a.on, floors: Object.fromEntries(Object.entries(a.floors).map(([f, v]) => [f, { on: v.on, off: Object.keys(v.off || {}).map(Number) }])) });
    store.tdmg.set({ ...snap.tdmg });
    store.cond.set({ ...snap.cond });
  };
  const withUndo = (fn, msgKey) => { const snap = capture(); fn(); C.toast(t(msgKey), { action: { label: t('cond.undo'), fn: () => restore(snap) } }); };
  const setCond = patch => { const c = S().cond; if (Object.keys(patch).some(k => String(c[k]) !== String(patch[k]))) return store.cond.set(patch); return true; };
  const setTdmg = patch => { const td = S().tdmg; if (Object.keys(patch).some(k => JSON.stringify(td[k]) !== JSON.stringify(patch[k]))) store.tdmg.set(patch); };

  // ── 1. 반복 · 턴 ──
  const runsSl = withLabel(C.slider({ id: 'cond-runs', min: 1, max: RUNS_MAX, value: S().cond.runs, ariaLabel: t('cond.runs.label'), onCommit: v => setCond({ runs: v }) }),
    h('label', { for: 'cond-runs' }, t('cond.runs.label')), [help(t('cond.runs.help'), t('cond.runs.help.aria'))]);
  const turnsSl = withLabel(C.slider({ id: 'cond-turns', min: 1, max: 30, value: S().cond.turns, ariaLabel: t('cond.turns.label'), onCommit: v => setCond({ turns: v }) }),
    h('label', { for: 'cond-turns' }, t('cond.turns.label')));
  const procSw = C.toggle({ label: t('cond.proc.label'), onChange: v => {
    if (!setCond({ forceProc: v })) { procSw.set(false); C.toast(t('altar.lock')); }
  } });
  const procHelp = help(t('cond.tip.forceAllChanceBased'), t('cond.proc.help.aria'));
  const procNote = h('p', { class: 'hint cond-sub' });
  const hpSw = C.toggle({ label: t('cond.hp10.label'), onChange: v => setCond({ hp10: v }) });
  const runsBody = h('div', { class: 'cond-fields' },
    runsSl, turnsSl,
    h('div', { class: 'field' }, h('div', { class: 'field-row' }, procSw, procHelp), procNote),
    h('div', { class: 'field' }, h('div', { class: 'field-row' }, hpSw, help(t('cond.tip.lockDummyHp10'), t('cond.hp10.help.aria')))));
  const runsReset = secReset(() => withUndo(() => setCond({ runs: COND_DEFAULTS.runs, turns: COND_DEFAULTS.turns, forceProc: false, hp10: false }), 'cond.toast.reset.section'));
  runsBody.prepend(runsReset);

  // ── 2. 적 ──
  const elSeg = C.segment({ full: true, ariaLabel: t('cond.enemy.element.label'), value: S().cond.dummyElement,
    options: DUMMY_EL.map((k, i) => ({ value: i, el: k, label: k === 'none' ? t('element.none') : h('span', { class: 'seg-el' }, C.dot(k), t(`element.${k}`)) })),
    onChange: v => setCond({ dummyElement: +v }) });
  const cntSeg = C.segment({ full: true, ariaLabel: t('cond.enemy.count.label'), value: S().cond.dummies,
    options: [1, 2, 3, 4, 5].map(n => ({ value: n, label: String(n) })), onChange: v => setCond({ dummies: +v }) });
  const enemyReset = secReset(() => withUndo(() => setCond({ dummyElement: COND_DEFAULTS.dummyElement, dummies: COND_DEFAULTS.dummies }), 'cond.toast.reset.section'));
  const enemyBody = h('div', { class: 'cond-fields' }, enemyReset,
    h('div', { class: 'field' }, h('div', { class: 'field-row' }, h('span', { class: 'label' }, t('cond.enemy.element.label')), help(t('cond.enemy.element.help'), t('cond.enemy.element.help.aria'))), elSeg),
    h('div', { class: 'field' }, h('div', { class: 'field-row' }, h('span', { class: 'label' }, t('cond.enemy.count.label'))), cntSeg));

  // ── 3. 받는 데미지 ──
  const hitsSeg = C.segment({ full: true, ariaLabel: t('cond.incoming.hits.label'), value: S().cond.enemyHits,
    options: HITS.map(v => ({ value: v, label: v === 'all' ? t('cond.incoming.hits.all') : v })), onChange: v => setCond({ enemyHits: String(v) }) });
  const incSw = C.toggle({ label: t('cond.incoming.dmg.label'), onChange: v => setCond({ incomingOn: v }) });
  const incSl = C.slider({ id: 'cond-inc', min: 1, max: 99, value: S().cond.incomingPct, unit: t('cond.unit.hpPct'), ariaLabel: t('cond.incoming.dmg.aria'), onCommit: v => setCond({ incomingPct: v }) });
  incSl.querySelector('.field-row').prepend(incSw, help(t('cond.incoming.dmg.help'), t('cond.incoming.dmg.help.aria')));
  const tdSw = C.toggle({ label: t('cond.tdmg.label'), onChange: v => setTdmg({ on: v }) });
  const tdNum = h('input', { class: 'num-in', type: 'number', min: 1, max: 99, 'aria-label': t('cond.tdmg.aria'),
    onChange: () => { const v = Math.max(1, Math.min(99, Math.round(+tdNum.value || 1))); tdNum.value = v; setTdmg({ pct: v }); } });
  const tdMore = C.button({ tier: 'ghost', size: 'sm', label: t('cond.tdmg.perTurn'), iconName: 'sliders-horizontal', onClick: () => openTdmgSheet() });
  const tdNote = h('p', { class: 'hint cond-sub' });
  const incBody = h('div', { class: 'cond-fields' },
    h('div', { class: 'field' }, h('div', { class: 'field-row' }, h('span', { class: 'label' }, t('cond.incoming.hits.label')), help(t('cond.incoming.hits.help'), t('cond.incoming.hits.help.aria'))), hitsSeg),
    incSl,
    h('div', { class: 'field' },
      h('div', { class: 'field-row' }, tdSw, help(t('tdmg.hint'), t('cond.tdmg.help.aria')), tdNum, h('span', { class: 'unit' }, t('cond.unit.hpPct'))),
      h('div', { class: 'field-row' }, tdNote, tdMore)));
  const incReset = secReset(() => withUndo(() => {
    setCond({ enemyHits: COND_DEFAULTS.enemyHits, incomingOn: false, incomingPct: COND_DEFAULTS.incomingPct });
    setTdmg({ ...clone(TDMG_DEFAULTS) });
  }, 'cond.toast.reset.section'));
  incBody.prepend(incReset);

  // ── 4. 방탈출 제단 ──
  const altSw = C.toggle({ label: t('cond.altar.use'), onChange: v => {
    const hadForce = S().cond.forceProc;
    store.altar.setOn(v);
    C.toast(v ? (hadForce ? t('plan.adv.forceOff') : t('altar.toast.on')) : t('altar.toast.off'));   // 확률 100% 가 꺼졌다는 사실을 말한다(ADV_AUDIT 모순 8)
  } });
  const altLine = h('p', { class: 'hint' });
  const altAdvNote = h('p', { class: 'hint cond-sub', hidden: true }, t('plan.adv.forced.cond'));   // 제단이 켜지면 행동 계획은 고급 설정에서만
  const altBody = h('div', { class: 'cond-fields' },
    h('div', { class: 'field-row' }, altSw),
    altLine, altAdvNote,
    C.button({ tier: 'secondary', size: 'sm', label: t('cond.altar.edit'), iconName: 'layers', onClick: () => ctx.openAltar() }));

  // ── 아코디언 ──
  const acc = {
    runs: C.accordionItem({ title: t('cond.runs.title'), summaryNode: h('span'), body: runsBody, open: true }),
    enemy: C.accordionItem({ title: t('cond.enemy.title'), summaryNode: h('span'), body: enemyBody }),
    inc: C.accordionItem({ title: t('cond.incoming.title'), summaryNode: h('span'), body: incBody }),
    altar: C.accordionItem({ title: [h('img', { class: 'altar-ti star', src: 'icons/altar_star.webp', alt: '' }), h('img', { class: 'altar-ti', src: 'icons/altar_moon.webp', alt: '' }), t('cond.altar.title')], summaryNode: h('span'), body: altBody }),
  };

  // ── 실행 버튼 ──
  const prog = h('i', { class: 'prog', 'aria-hidden': 'true' });
  const runLabel = h('span', {}, t('cond.run'));
  const runBtn = h('button', { type: 'button', class: 'btn btn-primary btn-lg btn-block btn-run', onClick: () => ctx.run() }, prog, C.icon('play'), runLabel);
  const runMeta = h('span', { class: 'run-meta' });

  const resetAll = C.button({ tier: 'ghost', size: 'sm', label: t('cond.reset'), onClick: () => withUndo(() => {
    store.cond.reset(); setTdmg({ ...clone(TDMG_DEFAULTS) }); if (S().altar.on) store.altar.setOn(false);
  }, 'cond.toast.reset.all') });

  host.replaceChildren(
    h('div', { class: 'panel-head' }, h('h2', { id: 'cond-h' }, t('cond.title')), resetAll),
    h('div', { class: 'acc' }, acc.runs, acc.enemy, acc.inc, acc.altar),
    h('div', { class: 'run' }, runBtn, runMeta));

  // ── 상태 → 화면 ──
  const lastSum = {};
  const setSum = (name, node) => {
    const key = node.textContent;
    if (lastSum[name] === key) return;
    if (lastSum[name] == null) acc[name].querySelector('.acc-sum').replaceChildren(node);
    else acc[name].setSummary(node);
    lastSum[name] = key;
  };
  const elName = i => (+i ? C.elTag(DUMMY_EL[+i], t(`element.${DUMMY_EL[+i]}`)) : t('element.none.long'));

  function sync() {
    const s = S(), c = s.cond, td = s.tdmg, al = s.altar;
    if (+runsSl.num.value !== +c.runs) runsSl.set(+c.runs);
    if (+turnsSl.num.value !== +c.turns) turnsSl.set(+c.turns);
    procSw.set(!!c.forceProc && !al.on);
    procSw.input.disabled = !!al.on;
    procNote.textContent = al.on ? t('altar.lock') : (c.forceProc ? t('cond.proc.runsNote') : '');
    procNote.hidden = !procNote.textContent;
    runsSl.classList.toggle('dim', !!c.forceProc && !al.on);
    hpSw.set(!!c.hp10);
    elSeg.set(+c.dummyElement); cntSeg.set(+c.dummies); hitsSeg.set(String(c.enemyHits));
    incSw.set(!!c.incomingOn);
    if (+incSl.num.value !== +c.incomingPct) incSl.set(+c.incomingPct);
    incSl.num.disabled = incSl.range.disabled = !c.incomingOn;
    incSl.classList.toggle('dim', !c.incomingOn);
    tdSw.set(!!td.on);
    if (document.activeElement !== tdNum) tdNum.value = td.pct;
    tdNum.disabled = !td.on;
    const perN = Object.keys(td.per || {}).filter(k => +k <= +c.turns).length;
    tdNote.textContent = td.on && td.adv && perN ? t('cond.tdmg.perTurn.set', { n: perN }) : '';
    altSw.set(!!al.on);
    const cnt = altarCounts(al, altarData);
    altLine.textContent = al.on && cnt ? t('cond.altar.line', cnt) : t('cond.altar.hint');
    altAdvNote.hidden = !al.on;

    // 요약(라벨-값 쌍) — plan.summary 의 vars 로 조립
    const sc = summary.cond(s).vars;
    const forced = !!c.forceProc && !al.on;
    setSum('runs', kv(forced ? t('cond.sum.forced') : t('cond.runs.sum.runs', { n: sc.runs }), t('cond.runs.sum.turns', { n: sc.turns }), sc.hp10 && t('cond.sum.hp10')));
    setSum('enemy', kv(elName(sc.dummyElement), t('cond.enemy.sum.count', { n: sc.dummies })));
    const st = summary.tdmg(s);
    setSum('inc', kv(sc.enemyHits === 'all' ? t('cond.incoming.sum.all') : t('cond.incoming.sum.hits', { n: sc.enemyHits }),
      sc.incoming ? t('cond.sum.incoming', { n: sc.incoming }) : '',
      st.key === 'cond.tdmg.sum' ? t('tdmg.result', [st.vars.pct]) : st.key === 'cond.tdmg.sum.range' ? t('tdmg.result.range', [st.vars.min, st.vars.max]) : ''));
    const sa = summary.altar(s);
    setSum('altar', sa.key === 'cond.altar.sum.off' ? kv(t('cond.altar.sum.off'))
      : cnt ? kv(t('cond.altar.sum.penalty', { n: cnt.penalty }), t('cond.altar.sum.buff', { n: cnt.buff }))
        : kv(t('cond.altar.sum.floors', { n: sa.vars.floors })));

    // 변경 표식 — 기본값에서 바뀐 섹션만
    const ch = {
      runs: +c.runs !== COND_DEFAULTS.runs || +c.turns !== COND_DEFAULTS.turns || !!c.forceProc || !!c.hp10,
      enemy: +c.dummyElement !== COND_DEFAULTS.dummyElement || +c.dummies !== COND_DEFAULTS.dummies,
      inc: String(c.enemyHits) !== COND_DEFAULTS.enemyHits || !!c.incomingOn || !isDefault.tdmg(s),
      altar: !isDefault.altar(s),
    };
    for (const k of Object.keys(acc)) acc[k].setChanged(ch[k]);
    runsReset.hidden = !ch.runs; enemyReset.hidden = !ch.enemy; incReset.hidden = !ch.inc;
    resetAll.hidden = !(ch.runs || ch.enemy || ch.inc || ch.altar);
    if (!running) runMeta.textContent = forced ? t('cond.run.meta.forced') : t('cond.run.meta', { n: c.runs });
  }

  offs.push(store.subscribe(s => s.cond, sync), store.subscribe(s => s.tdmg, sync), store.subscribe(s => s.altar, sync));
  // 언어 전환: 통째로 다시 그린다(열림 상태는 기본으로). 실행 중이면 끝난 뒤에.
  const relang = () => { if (running) { setTimeout(relang, 300); return; } offs.forEach(f => f && f()); mount(host, ctx); };
  offs.push(i18n.onChange?.(relang));
  sync();

  // ── 턴마다 받는 데미지: 턴별 값 시트 ──
  function openTdmgSheet() {
    const body = h('div', { class: 'tdmg-sheet' });
    let off = null;
    const render = () => {
      const td = S().tdmg, n = +S().cond.turns;
      const hitsSegT = C.segment({ ariaLabel: t('tdmg.targets'), value: Math.max(1, Math.min(5, +td.hits || 5)),
        options: [1, 2, 3, 4, 5].map(k => ({ value: k, label: k === 5 ? t('tdmg.target.all') : String(k) })), onChange: v => setTdmg({ hits: +v }) });
      const grid = h('div', { class: 'tdmg-grid' + (td.adv ? '' : ' off') });
      for (let k = 1; k <= n; k++) {
        const v = td.per && td.per[k] != null ? td.per[k] : '';
        const inp = h('input', { class: 'num-in', type: 'number', min: 0, max: 99, value: v, placeholder: String(td.pct), disabled: !td.adv,
          'aria-label': t('tdmg.turn', [k]), onChange: () => store.tdmg.setTurn(k, inp.value === '' ? '' : inp.value) });
        grid.append(h('label', { class: 'tdmg-cell' + (v !== '' ? ' set' : '') }, h('span', {}, t('tdmg.turn', [k])), inp));
      }
      body.replaceChildren(
        h('p', { class: 'hint' }, t('tdmg.hint')),
        h('div', { class: 'field' }, h('div', { class: 'field-row' }, C.toggle({ label: t('tdmg.use'), checked: td.on, onChange: v => setTdmg({ on: v }) }))),
        h('div', { class: 'field' }, h('div', { class: 'field-row' }, h('span', { class: 'label' }, t('tdmg.targets'))), hitsSegT, h('p', { class: 'hint' }, t('tdmg.targets.sub'))),
        h('div', { class: 'field' },
          h('div', { class: 'field-row' }, C.toggle({ label: t('tdmg.adv'), checked: td.adv, onChange: v => setTdmg({ adv: v }) }),
            h('button', { type: 'button', class: 'reset', onClick: () => store.tdmg.clearTurns() }, t('tdmg.reset'))),
          h('p', { class: 'hint' }, t('tdmg.adv.sub')), grid));
    };
    C.openSheet({ title: t('tdmg.title'), body, ariaLabel: t('common.close'), onClose: () => off?.() });
    off = store.subscribe(s => s.tdmg, () => { if (!body.contains(document.activeElement) || document.activeElement.type !== 'number') render(); });
    render();
  }

  // ── 실행 ──
  let msPerRun = ctx.api.mode === 'fetch' ? 34 : 110;      // 첫 추정. 실행할 때마다 실제 시간으로 보정
  const runListeners = new Set();
  const emit = st => runListeners.forEach(fn => { try { fn(st); } catch { /* noop */ } });
  ctx.onRun = fn => { runListeners.add(fn); return () => runListeners.delete(fn); };
  ctx.isRunning = () => running;

  // opts: { save=true(기록 저장), quiet=false(부트 자동 실행: 결과로 스크롤하지 않음) }
  ctx.run = async ({ save = true, quiet = false } = {}) => {
    if (running) return;
    running = true;                                   // prepareRun(고정 칸 점검 프로브)을 기다리는 동안의 중복 클릭도 막는다
    let prep = null;
    try { prep = await store.prepareRun(); } catch (err) { C.toast(`${t('result.label.simError')} ${err && err.message ? err.message : err}`); }
    if (!prep) { running = false; if (prep === null && !S().team.some(Boolean)) C.toast(t('run.emptyTeam')); return; }
    const chars = S().chars;
    const nm = id => i18n.nameOf ? i18n.nameOf(id) : ((chars[id] || {}).name || String(id));
    for (const w of prep.warnings) {
      const vars = { ...w.vars };
      if (vars.id != null) vars.name = nm(vars.id);
      if (Array.isArray(vars.names)) vars.names = vars.names.join(', ');
      if (Array.isArray(vars.turns)) vars.turns = vars.turns.join('·');
      C.toast(t(w.key, vars), { duration: 6000 });
    }
    const cfg = prep.cfg;
    const total = cfg.forceProc ? 1 : Math.max(1, +cfg.runs || 1);
    const est = 250 + total * msPerRun * Math.max(1, (+cfg.turns || 30) / 30);
    store.set({ ui: { ...S().ui, busy: true } });
    runBtn.classList.add('running'); runBtn.setAttribute('aria-busy', 'true');
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(0.95, 1 - Math.exp(-(performance.now() - t0) / est * 1.6));
      const n = Math.min(total, Math.max(0, Math.floor(p / 0.95 * total)));
      prog.style.setProperty('--p', `${(p * 100).toFixed(1)}%`);
      runLabel.textContent = t('cond.run.progress', { n, total });
      emit({ running: true, p, n, total });
      raf = requestAnimationFrame(tick);
    };
    tick();
    let data = null;
    try {
      data = await ctx.api.simulate(cfg);
      if (data && data.error) throw new Error(data.error);
      const took = performance.now() - t0;
      if (total >= 5) msPerRun = Math.max(5, (took - 150) / total / Math.max(1, (+cfg.turns || 30) / 30));
    } catch (err) {
      data = null;
      C.toast(`${t('result.label.simError')} ${err && err.message ? err.message : err}`, { duration: 7000 });
    } finally {
      cancelAnimationFrame(raf);
      prog.style.setProperty('--p', data ? '100%' : '0%');
      await new Promise(r => setTimeout(r, data ? motion.dur('fast') : 0));
      running = false;
      runBtn.classList.remove('running'); runBtn.removeAttribute('aria-busy');
      prog.style.setProperty('--p', '0%');
      runLabel.textContent = t('cond.run');
      store.set({ ui: { ...S().ui, busy: false } });
      emit({ running: false, p: data ? 1 : 0 });
      sync();
    }
    if (!data) return;
    // 결과 머리 요약은 실행한 cfg 기준(실행 중에 조건을 바꿔도 결과와 맞게)
    data.cond = { dummies: +cfg.dummies, dummyElement: +cfg.dummyElement, enemyHits: String(cfg.enemyHits), hp10: !!cfg.hp10,
      forceProc: !!cfg.forceProc, incoming: +cfg.incomingHpPct || 0 };
    store.setResult(data, { save });
    if (quiet) return;
    const res = document.getElementById('app-result');
    requestAnimationFrame(() => res?.scrollIntoView({ behavior: motion.reduced() ? 'auto' : 'smooth', block: 'start' }));
  };
}
