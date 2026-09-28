// 턴 편집 시트 — 격자의 턴 머리(숫자)를 누르면 연다(RESTRUCTURE_PROPOSAL §2 · ARCHITECTURE §9).
// 옛 완전 수동 편집기(ui/manual.js)의 '한 턴 분량'만 남긴 것: 이 턴의 순서(끌기·▲▼) · 동료별 행동 · 추가 행동 위치.
// 저장 규칙: 행동이 규칙 결과와 같고 순서만 바뀌면 → 예외 턴(store.plan.setException, 행동은 규칙이 계속 정함).
//            행동이 바뀌거나 이미 잠긴 턴이면 → 잠긴 턴(store.pins.lockTurn). 기본 순서로 되돌리면 예외 턴 해제.
// 편집하는 동안 '이 턴을 잠갔다면' 시험 프로브(buildCfg plansOverride)로 실행 결과(실행 안 됨·바뀐 행동)를 보여 준다.
import { turnSeqFromProbe, turnClean, whyBad } from '../core/plan.js';
import { ACT_CLS, ACT_KEY, sortable, shortName, turnsText, sameActs, orderOfSeq, sameSeq } from './plan-helpers.js';

const ACTS = ['평', '궁', '방'];   // copy-lint-allow (엔진 토큰)
const clone = (v) => JSON.parse(JSON.stringify(v));
const TRIAL_DEBOUNCE = 250;

/**
 * 턴 편집 시트를 연다. opts.probe = 지금 미리보기 프로브(없으면 새로 계산), opts.pos = 강조할 동료 자리.
 * → 시트 참조 | null(편성이 비어 있음)
 */
export function openTurnEdit(ctx, turn, opts = {}) {
  const { store, api, t, i18n, motion, components: C } = ctx;
  const { h, icon } = C;
  C.ensureStyle('css/plan.css');
  const S = () => store.get();
  if (!S().team.some(Boolean)) return null;
  const nameOf = (id) => shortName(i18n.nameOf ? i18n.nameOf(id) : String(id));
  const N = () => Math.max(1, +S().cond.turns || 30);
  const tt = Math.max(1, Math.min(N(), Math.round(+turn) || 1));
  const present = () => S().team.map((s, i) => (s ? i + 1 : 0)).filter(Boolean);

  let probe = opts.probe || S().probe || null;
  const wasLocked = () => Array.isArray(S().locked[tt]);
  const hadExc = () => Array.isArray(S().overrides[tt]) && S().overrides[tt].length > 0;
  const ruleSeq = () => turnSeqFromProbe(probe, tt) || [];
  let seq = wasLocked() ? clone(S().locked[tt]) : clone(ruleSeq());
  let base = clone(seq);                     // 시트를 연 시점의 모습(바뀐 것이 있는지 판정)
  let trial = null, trialSeq = 0, trialTimer = 0, closed = false;

  const live = () => (probe && probe.plan && probe.plan[String(tt)]) || { budget: {}, ultOk: [] };
  const tl = () => (trial && trial.plan && trial.plan[String(tt)]) || null;

  // ── 골격 ───────────────────────────────────────────────────────────────
  const status = h('p', { class: 'hint te-status' });
  const track = h('ol', { class: 'mn-track te-track' });
  const addRow = h('div', { class: 'mn-add' });
  const warn = h('p', { class: 'mn-warn', role: 'alert', hidden: true });
  const repIn = h('input', { type: 'number', min: '1', max: '29', value: '3', class: 'num-in', 'aria-label': t('plan.te.repeat.aria') });
  const repBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: doRepeat }, t('plan.te.repeat.post'));
  const lockAllBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: doLockAll }, icon('lock'), h('span', {}, t('plan.te.lockAll')));
  const tools = h('div', { class: 'te-tools' }, h('span', { class: 'te-rep' }, h('span', {}, t('plan.te.repeat.pre')), repIn, repBtn), lockAllBtn);
  const saveHint = h('p', { class: 'hint te-save-hint', role: 'status' });
  const body = h('div', { class: 'mn te' }, status, track, addRow, warn, saveHint, tools);
  sortable(track, { reduced: motion.reduced, onMove: (from, to) => { const [m] = seq.splice(from, 1); seq.splice(to, 0, m); changed(); } });

  const unlockBtn = h('button', { type: 'button', class: 'btn btn-ghost', onClick: doUnlock }, icon('lock'), h('span', {}, t('plan.te.unlock')));
  const clearExcBtn = h('button', { type: 'button', class: 'btn btn-ghost', onClick: doClearExc }, t('plan.te.clearExc'));
  const cancelBtn = h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => sheet.close() }, t('plan.te.cancel'));
  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary', onClick: doSave });
  const sheet = C.openSheet({ title: t('plan.te.title', { turn: tt }), body, foot: [unlockBtn, clearExcBtn, h('span', { class: 'mn-grow' }), cancelBtn, saveBtn],
    size: 'te-sheet', ariaLabel: t('plan.close'), onClose: () => { closed = true; clearTimeout(trialTimer); trialSeq++; } });

  // ── 판정 ────────────────────────────────────────────────────────────────
  /** 저장하면 무엇이 되나: 'same' | 'lock' | 'exc' | 'clearExc' */
  function saveKind() {
    const rule = ruleSeq();
    if (wasLocked()) return sameSeq(seq, base) ? 'same' : 'lock';
    if (!sameActs(seq, rule)) return 'lock';
    const order = orderOfSeq(seq, present());
    const def = store.plan.order().map((o) => o.i + 1);
    const isDef = order.every((p, k) => p === def[k]);
    if (sameSeq(seq, base)) return 'same';
    if (isDef) return hadExc() ? 'clearExc' : 'same';
    return 'exc';
  }

  // ── 그리기 ──────────────────────────────────────────────────────────────
  const keepFocus = (fn) => {
    const a = document.activeElement;
    const fk = a && body.contains(a) ? (a.closest('[data-fk]') || {}).dataset?.fk : null;
    fn();
    if (fk) { const el = body.querySelector(`[data-fk="${CSS.escape(fk)}"]`); if (el && !el.disabled) el.focus({ preventScroll: true }); }
  };
  function render() {
    if (closed) return;
    keepFocus(() => { renderStatus(); renderTrack(); renderFoot(); });
  }
  function renderStatus() {
    status.textContent = t(wasLocked() ? 'plan.te.status.locked' : hadExc() ? 'plan.te.status.exc' : 'plan.te.status.rule');
  }
  function renderTrack() {
    const st = S();
    const lv = live(), tr = tl();
    const exec = tr ? tr.exec : null, cdOk = tr ? tr.cdOk : null;
    const budget = (tr && tr.budget) || lv.budget || {};
    const ultOk = new Set(lv.ultOk || []);
    const want = {}; seq.forEach((e) => { want[e.p] = (want[e.p] || 0) + 1; });
    const seen = {};
    track.setAttribute('aria-label', t('manual.track.aria', { turn: tt }));
    if (!seq.length) track.replaceChildren(h('li', { class: 'mn-empty' }, t('manual.empty.turn')));
    else track.replaceChildren(...seq.map((e, k) => {
      const id = (st.team[e.p - 1] || {}).id, meta = st.chars[id] || {};
      seen[e.p] = (seen[e.p] || 0) + 1;
      const granted = seen[e.p] > (meta.actionsPerTurn || 1);
      const done = exec ? exec[k] : e.a;
      const over = exec ? done == null : seen[e.p] > (budget[e.p] || 0);
      const downgraded = !over && done && done !== e.a;
      const canUlt = (cdOk ? cdOk[k] : ultOk.has(e.p)) || e.a === '궁';   // copy-lint-allow
      return h('li', { 'data-sort': '', class: `${granted ? 'granted' : ''}${opts.pos === e.p ? ' hl' : ''}` },
        h('span', { class: 'sn' }, String(k + 1)),
        id ? h('img', { src: `icons/${id}.png`, alt: '', draggable: 'false' }) : null,
        h('span', { class: 'nm' }, id ? nameOf(id) : `P${e.p}`),
        granted ? h('span', { class: 'tag' }, t('manual.step.extra')) : null,
        over ? h('span', { class: 'tag bad' }, t('manual.step.notRun')) : null,
        downgraded ? h('span', { class: 'tag bad' }, t('manual.step.became', { act: t(ACT_KEY[done]) })) : null,
        h('span', { class: 'seg mn-acts', role: 'group', 'aria-label': t('manual.step.acts.aria', { n: k + 1 }) }, ...ACTS.map((a) => {
          const off = a === '궁' && !canUlt;   // copy-lint-allow
          return h('button', { type: 'button', 'aria-pressed': String(e.a === a), disabled: off, title: off ? t('manual.msg.exSkillNotReady') : null, 'data-fk': `a:${k}:${a}`,
            onClick: () => setAct(k, a) }, t(`plan.cell.abbr.${ACT_CLS[a]}`));
        })),
        h('span', { class: 'mv' },
          h('button', { type: 'button', class: 'btn-icon', disabled: k === 0, 'aria-label': t('plan.order.up.aria'), 'data-fk': `u:${k}`, onClick: () => moveStep(k, -1) }, icon('arrow-up')),
          h('button', { type: 'button', class: 'btn-icon', disabled: k === seq.length - 1, 'aria-label': t('plan.order.down.aria'), 'data-fk': `d:${k}`, onClick: () => moveStep(k, 1) }, icon('arrow-down'))),
        h('button', { type: 'button', class: 'btn-icon', 'aria-label': t('manual.step.del.aria'), 'data-fk': `x:${k}`, onClick: () => delStep(k) }, icon('x')));
    }));
    addRow.replaceChildren(h('span', { class: 'lbl' }, t('manual.add.label')), ...st.team.map((s, i) => {
      if (!s) return null;
      const pos = i + 1, left = (budget[pos] || 0) - (want[pos] || 0);
      return h('button', { type: 'button', class: 'btn btn-ghost btn-sm', disabled: left <= 0, 'data-fk': `add:${pos}`, title: left > 0 ? null : t('manual.msg.noActionBudgetLeft'),
        onClick: () => addStep(pos) }, h('img', { src: `icons/${s.id}.png`, alt: '' }), h('span', {}, nameOf(s.id)));
    }));
    const overPs = exec ? [...new Set(seq.filter((e, k) => exec[k] == null).map((e) => e.p))] : Object.keys(want).map(Number).filter((p) => want[p] > (budget[p] || 0));
    warn.hidden = !overPs.length;
    if (overPs.length) warn.textContent = t('manual.warn.over', { names: overPs.map((p) => nameOf((st.team[p - 1] || {}).id)).join(', ') });
  }
  function renderFoot() {
    const k = saveKind();
    saveBtn.textContent = t(k === 'exc' || k === 'clearExc' ? 'plan.te.save.exc' : 'plan.te.save.lock');
    saveBtn.disabled = k === 'same' && wasLocked();          // 규칙 턴은 바꾸지 않아도 '지금 결과 그대로' 잠글 수 있다
    saveHint.textContent = t(k === 'same' ? (wasLocked() ? 'plan.te.save.hint.same' : 'plan.te.save.hint.asIs') : `plan.te.save.hint.${k}`);
    unlockBtn.hidden = !wasLocked();
    clearExcBtn.hidden = wasLocked() || !hadExc();
    repBtn.disabled = !seq.length;
  }

  // ── 조작 ────────────────────────────────────────────────────────────────
  function changed() { render(); scheduleTrial(); }
  function setAct(k, a) { if (!seq[k] || seq[k].a === a) return; seq[k] = { ...seq[k], a }; changed(); }
  function delStep(k) { seq.splice(k, 1); changed(); }
  function addStep(pos) { seq.push({ p: pos, a: '평' }); changed(); }   // copy-lint-allow
  function moveStep(k, dir) {
    const to = k + dir;
    if (to < 0 || to >= seq.length) return;
    motion.flip(track, () => { [seq[k], seq[to]] = [seq[to], seq[k]]; render(); }, { duration: motion.dur('fast') });
    scheduleTrial();
    const b = body.querySelector(`[data-fk="${dir < 0 ? 'u' : 'd'}:${to}"]`);
    if (b && !b.disabled) b.focus({ preventScroll: true });
  }

  /** 시험 프로브: 이 턴을 지금 모습으로 잠갔다면(다른 잠긴 턴은 그대로) 엔진이 어떻게 실행하나. */
  function scheduleTrial() {
    clearTimeout(trialTimer);
    trialTimer = setTimeout(runTrial, TRIAL_DEBOUNCE);
  }
  async function runTrial() {
    const my = ++trialSeq;
    body.classList.add('busy');
    try {
      const r = await api.probe(store.buildCfg({ mode: 'probe', plansOverride: { ...S().locked, [tt]: seq.map((e) => ({ p: e.p, a: e.a })) } }));
      if (my !== trialSeq || closed) return;
      if (r && !r.error) trial = r;
    } catch { /* 시험 결과 없이도 편집은 된다 */ } finally {
      if (my === trialSeq && !closed) { body.classList.remove('busy'); render(); }
    }
  }
  async function ensureProbe() {
    if (probe) return;
    try { const r = await api.probe(store.buildCfg({ mode: 'probe' })); if (r && !r.error) probe = r; } catch { /* 빈 턴으로 시작 */ }
    if (closed) return;
    if (!wasLocked()) { seq = clone(ruleSeq()); base = clone(seq); }
    render();
  }

  function doSave() {
    const k = saveKind();
    if (k === 'same' && wasLocked()) { sheet.close(); return; }
    if (k === 'lock' || k === 'same') {
      store.pins.lockTurn(tt, seq);
      C.toast(t('plan.te.saved.lock', { turn: tt }), { action: { label: t('plan.undo'), fn: () => store.pins.undo() } });
    } else if (k === 'clearExc') {
      const prev = S().overrides[tt];
      store.plan.clearException(tt);
      C.toast(t('plan.te.excCleared', { turn: tt }), { action: { label: t('plan.undo'), fn: () => store.plan.setException(tt, prev) } });
    } else {
      const prev = hadExc() ? S().overrides[tt] : null;
      store.plan.setException(tt, orderOfSeq(seq, present()));
      C.toast(t('plan.te.saved.exc', { turn: tt }), { action: { label: t('plan.undo'), fn: () => (prev ? store.plan.setException(tt, prev) : store.plan.clearException(tt)) } });
    }
    sheet.close();
  }
  function doUnlock() {
    store.pins.unlockTurn(tt);
    C.toast(t('plan.te.unlocked', { turn: tt }), { action: { label: t('plan.undo'), fn: () => store.pins.undo() } });
    sheet.close();
  }
  function doClearExc() {
    const prev = S().overrides[tt];
    store.plan.clearException(tt);
    C.toast(t('plan.te.excCleared', { turn: tt }), { action: { label: t('plan.undo'), fn: () => store.plan.setException(tt, prev) } });
    sheet.close();
  }
  /** 'N턴 간격으로 반복': 지금 모습을 tt, tt+N, tt+2N … 에 잠근다. 그대로 실행되지 않는 턴은 건너뛰고 알린다. */
  async function doRepeat() {
    const step = Math.max(1, Math.min(29, Math.round(+repIn.value) || 1));
    repIn.value = String(step);
    const want = seq.map((e) => ({ p: e.p, a: e.a }));
    const turns = [tt];
    for (let x = tt + step; x <= N(); x += step) turns.push(x);
    if (turns.length < 2 || !want.length) { C.toast(t('plan.te.repeat.none')); return; }
    repBtn.disabled = true;
    let r = null;
    try {
      const over = { ...S().locked };
      turns.forEach((x) => { over[x] = want; });
      r = await api.probe(store.buildCfg({ mode: 'probe', plansOverride: over }));
    } catch (err) { C.toast(t('manual.probeFailed', { message: (err && err.message) || '' })); }
    if (closed) return;
    repBtn.disabled = false;
    if (!r || r.error) return;
    const good = turns.filter((x) => turnClean(r, x, want));
    const bad = turns.filter((x) => !good.includes(x));
    good.forEach((x) => store.pins.lockTurn(x, want));
    const why = bad.length ? whyBad(r, bad[0], want) : null;
    const msg = [good.length ? t('plan.te.repeat.done', { turns: turnsText(good) }) : '',
      bad.length ? t('plan.te.repeat.bad', { turns: turnsText(bad), cd: why.cd, over: why.over }) : ''].filter(Boolean).join(' · ');
    C.toast(msg, { duration: 6000, action: good.length ? { label: t('plan.undo'), fn: () => { for (let k = 0; k < good.length; k++) store.pins.undo(); } } : undefined });
    if (good.length) sheet.close();
  }
  function doLockAll() {
    if (!probe) return;
    const n = store.pins.lockAllFromProbe(probe);
    C.toast(t('plan.te.lockAll.done', { n }), { action: { label: t('plan.undo'), fn: () => store.pins.undo() } });
    sheet.close();
  }

  render();
  ensureProbe().then(() => { if (!closed) scheduleTrial(); });
  return sheet;
}
