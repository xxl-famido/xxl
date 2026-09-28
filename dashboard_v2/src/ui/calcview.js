// 계산 그래픽 — core/receipt.js 의 계산 행을 '수식 칩 + 단계 막대(브리지)'로 그린다.
//   수식 칩: [ATK] × [스킬 계수] × [주는 데미지] … = 최종  — 구조를 한눈에
//   단계 막대: 행마다 이전 값(회색) 위에 늘어난 몫(그룹 색) / 줄어든 몫(빗금)을 같은 눈금으로 — 무엇이 얼마나 키웠는지
//   출처: 행을 펼치면 동료·스킬(→ 스킬 설명)과 비중 막대. 고정 ATK 는 부여한 행동의 계산까지 이어서 보여 준다.
// 색 = 데이터 시각화 범주 슬롯(tokens.css --viz-*), 글자는 텍스트 토큰만. 그룹 = receipt.categoryOf.
import { categoryOf, CATEGORIES, flatAtkReceipt } from '../core/receipt.js';

const CAT_KEY = { atk: 'log.cat.atk', skill: 'log.cat.skill', amp: 'log.cat.amp', recv: 'log.cat.recv', elem: 'log.cat.elem' };

/**
 * env: { h, C, t, tr, fmt, pic, nameOf, skillLink, grants, onGoto }
 *   grants.find(comp, atIndex) → { index, line } | null  (고정 ATK 부여 줄)
 *   onGoto(turn, actId)        → 그 행동으로 이동
 *   memo.get/set(key, open)    → 출처 펼침 기억(로그와 공유)
 *   srcIcon(by, skill, cls)    → 출처 그림(동료 초상 · 제단 그림)
 */
export function createCalcView(env) {
  const { h, C, t, tr, fmt } = env;

  const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(+(+v).toFixed(2));
  const pctText = (v, plain) => (plain ? `${+(+v).toFixed(2)}%` : `${sgn(v)}%`);
  const multText = (m) => (m == null ? '' : `×${(+m).toFixed(m >= 10 ? 2 : 4).replace(/\.?0+$/, '')}`);
  function valueText(r) {
    const s = r.show || {};
    if (s.abs != null) return fmt(s.abs);
    if (s.flat != null) return `${s.flat >= 0 ? '+' : '−'}${fmt(Math.abs(s.flat))}`;
    if (s.pct != null) return pctText(s.pct, s.plain);
    if (s.times != null) return multText(s.times);
    return '';
  }
  function label(r) {
    if (r.key === 'log.r.base.other') return tr(r.label) || t('log.r.base.atk');
    if (r.key === 'log.r.in.raw' || r.key === 'log.r.in.rawTurn') return t(r.key, { pct: r.pct });
    return t(r.key);
  }

  /** 출처 목록(비중 막대). 고정 ATK 출처는 부여 계산으로 이어진다. */
  function sources(r, cat, atIndex, depth, key) {
    const comps = r.comps || [];
    const total = comps.reduce((s, c) => s + Math.abs(+c.v || 0), 0) || 1;
    return h('ul', { class: 'cv-src' }, ...comps.map((c, ci) => {
      const share = Math.abs(+c.v || 0) / total * 100;
      const who = h('span', { class: 'cv-src-who' },
        env.srcIcon(c.by, c.skill, 'bl-pic-xs'),
        c.by ? h('span', { class: 'cv-src-name' }, env.nameOf(c.by)) : null,
        env.skillLink(c.by, c.skill),
        (c.cond || c.el) && h('span', { class: 'cv-cond' }, c.cond ? t('log.src.cond', { cond: tr(c.cond) }) : tr(c.el)));
      const val = h('span', { class: 'cv-src-v' }, r.id === 'flat' ? `+${fmt(c.v)}` : pctText(+c.v));
      const bar = h('span', { class: 'cv-src-bar', dataset: { cat } }, h('i', { style: { width: `${share.toFixed(1)}%` } }));
      const li = h('li', {}, h('div', { class: 'cv-src-row' }, who, bar, val));
      if (r.id === 'flat' && env.grants && depth < 2) {
        const g = env.grants.find(c, atIndex);
        if (g) {
          val.classList.add('is-result');
          const gl = g.line;
          li.append(h('div', { class: 'cv-grant' },
            h('p', { class: 'cv-grant-h' },
              h('span', {}, t('log.flat.grantedAt', { n: gl.turn, name: env.nameOf(gl.actorId || c.by) })),
              h('button', { type: 'button', class: 'bl-go', onClick: () => env.onGoto(gl.turn, gl.act) }, t('log.flat.goto', { n: gl.turn }), C.icon('arrow-up', 'ic bl-go-ic'))),
            render(flatAtkReceipt(gl.detail), { atIndex: g.index, depth: depth + 1, compact: true, key: key && `${key}:g${ci}` })));
        } else {
          li.append(h('p', { class: 'cv-grant-miss' }, t('log.flat.notFound')));
        }
      }
      return li;
    }));
  }

  /** 계산 한 벌을 그린다. opts: { atIndex(로그 인덱스), depth(중첩), compact(수식 칩 생략), key(펼침 기억 경로) } */
  function render(rc, { atIndex = Infinity, depth = 0, compact = false, key = null } = {}) {
    const rows = rc.rows;
    const maxRun = Math.max(1, rc.final, ...rows.map((r) => r.running || 0));
    const pct = (v) => `${Math.max(0, Math.min(100, v / maxRun * 100)).toFixed(2)}%`;
    const used = new Set();
    const steps = h('ol', { class: 'cv-steps' });
    const stepEls = new Map();
    let prev = 0;
    rows.forEach((r, ri) => {
      const cat = categoryOf(r);
      if (r.kind === 'sub') {       // 소계(ATK 합계): 막대 대신 구분선 + 값
        steps.append(h('li', { class: 'cv-sub' }, h('span', { class: 'cv-l' }, label(r)), h('span', { class: 'cv-run' }, fmt(r.running))));
        prev = r.running;
        return;
      }
      if (cat !== 'diff') used.add(cat);
      const cur = r.running;
      const lo = Math.min(prev, cur), hi = Math.max(prev, cur);
      const up = r.kind === 'base' || cur >= prev;
      const track = h('span', { class: 'cv-track', 'aria-hidden': 'true' },
        r.kind !== 'base' && h('i', { class: 'cv-keep', style: { width: pct(lo) } }),
        h('i', { class: up ? 'cv-gain' : 'cv-loss', dataset: { cat }, style: { left: r.kind === 'base' ? '0%' : pct(lo), width: r.kind === 'base' ? pct(cur) : pct(hi - lo) } }));
      const comps = r.comps && r.comps.length ? r.comps : null;
      const lab = h('span', { class: 'cv-l' }, h('i', { class: 'cv-sw', dataset: { cat } }), h('span', {}, label(r)));
      if (r.id === 'skill' && r.skillName) lab.append(h('span', { class: 'cv-skill' }, env.skillLink(r.skillId, r.skillName)));
      if (r.key === 'log.r.base.barrier' && r.barrierPre != null) lab.append(h('small', {}, t('log.r.barrierUsed', { pre: fmt(r.barrierPre), used: fmt(r.barrierConsumed) })));
      const val = h('span', { class: 'cv-v' }, h('b', {}, valueText(r)), (r.kind === 'mul' || r.kind === 'diff') && !(r.show && r.show.times != null) && h('small', {}, multText(r.mult)));
      const run = h('span', { class: 'cv-run' }, fmt(cur));
      const li = h('li', { class: `cv-step k-${r.kind}${up ? '' : ' is-down'}`, dataset: { cat } });
      if (comps) {
        const skey = key && `${key}:s${ri}`;
        const panel = h('div', { class: 'cv-panel', hidden: true }, sources(r, cat, atIndex, depth, skey));
        const btn = h('button', { type: 'button', class: 'cv-row', 'aria-expanded': 'false', 'aria-label': t('log.src.aria', { label: label(r) }) },
          lab, val, track, run, h('span', { class: 'cv-more' }, t('log.src.count', { n: comps.length }), C.icon('chevron-down', 'ic')));
        li._toggle = (force, remember = true) => {
          const open = force ?? panel.hidden;
          panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); li.classList.toggle('open', open);
          if (remember && skey && env.memo) env.memo.set(skey, open);
        };
        btn.addEventListener('click', () => li._toggle());
        if (skey && env.memo && env.memo.get(skey)) li._toggle(true, false);
        li.append(btn, panel);
      } else {
        li.append(h('div', { class: 'cv-row is-static' }, lab, val, track, run, h('span', { class: 'cv-more' })));
      }
      steps.append(li);
      stepEls.set(r, li);
      prev = cur;
    });
    // 마지막 단계의 누적값 = 최종값 → 결과 숫자로 같이 표시
    const lastStep = [...stepEls.values()].pop();
    if (lastStep) lastStep.classList.add('is-last');
    steps.append(h('li', { class: 'cv-final' },
      h('span', { class: 'cv-l' }, t('log.r.final')),
      h('span', { class: 'cv-track', 'aria-hidden': 'true' }, h('i', { class: 'cv-total', style: { width: pct(rc.final) } })),
      h('span', { class: 'cv-run' }, fmt(rc.final))));

    const parts = [];
    if (!compact) parts.push(equation(rc, stepEls));
    if (!compact && used.size > 1) {
      parts.push(h('div', { class: 'cv-legend' }, ...CATEGORIES.filter((c) => used.has(c)).map((c) => h('span', {}, h('i', { class: 'cv-sw', dataset: { cat: c } }), t(CAT_KEY[c])))));
    }
    parts.push(steps);
    if (!rc.matched) parts.push(h('p', { class: 'rc-warn' }, C.icon('triangle-alert'), t('log.r.diff.note')));
    return h('div', { class: `cv${compact ? ' is-compact' : ''}` }, ...parts);
  }

  /** 수식 칩: 시작값(소계가 있으면 소계) × 곱해지는 항목들 = 최종. 칩을 누르면 그 단계로. */
  function equation(rc, stepEls) {
    const rows = rc.rows;
    const lastSub = rows.map((r) => r.kind).lastIndexOf('sub');
    const startIdx = lastSub >= 0 ? lastSub : 0;
    const chips = [];
    const chip = (r, text, cat, op) => {
      if (op) chips.push(h('span', { class: 'cv-op', 'aria-hidden': 'true' }, op));
      const el = h('button', { type: 'button', class: 'cv-chip', dataset: { cat } }, h('small', {}, label(r)), h('b', {}, text));
      const target = stepEls.get(r) || [...stepEls.values()].find((s) => s.dataset.cat === cat);
      el.addEventListener('click', () => {
        if (!target) return;
        target._toggle?.(true);
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        target.classList.remove('flash'); void target.offsetWidth; target.classList.add('flash');
      });
      chips.push(el);
    };
    const start = rows[startIdx];
    chip(start, fmt(start.running), categoryOf(start.kind === 'sub' ? { id: 'atkTotal', kind: 'mul' } : start));
    for (const r of rows.slice(startIdx + 1)) {
      if (r.kind === 'mul' || r.kind === 'diff') chip(r, valueText(r), categoryOf(r), '×');
      else if (r.kind === 'add') chip(r, valueText(r), categoryOf(r), '+');
    }
    chips.push(h('span', { class: 'cv-op', 'aria-hidden': 'true' }, '='), h('span', { class: 'cv-chip is-final' }, h('small', {}, t('log.r.final')), h('b', {}, fmt(rc.final))));
    return h('div', { class: 'cv-eq' }, ...chips);
  }

  return { render };
}
