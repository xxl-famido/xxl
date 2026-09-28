// 전투 로그 '계산 내역' — 엔진 detail(woofia_sim/engine.py)을 곱연산 순서 그대로 한 줄씩 펼친다.
// DOM·i18n 없음(순수 함수). 각 행 = { id, key, comps?, show, mult?, add?, running, kind }.
//   kind: 'base'(시작값) · 'mul'(× mult) · 'add'(+ add) · 'sub'(소계 = 엔진 값으로 맞춤) · 'diff'(설명되지 않은 차이)
//   show: 값 칸 표기용 원자료 { pct } | { flat } | { abs } | { times }
// 엔진 식과 1:1(바뀌면 여기도 바꿀 것):
//   데미지  = ATK × 계수% × (1+주는)×(1+행동효과) × (1+필살기효과·발동딜) × max(0,(1+받는)(1+속성받는))×(1+필살기받는)
//            × (1+지속증가)(1+받는지속) × 상성 × (1+수면)                         — _record_hit
//   ATK    = 기본 × (1+기초ATK%) × (1+ATK%) + 고정                                  — Unit.atk_eff
//   치료    = ATK × 계수% × (1+행동효과) × max(0, 1+받는 치료)  / 최대HP 기반은 행동효과 없음 — HEAL
//   배리어  = 기준 × 계수% × (1+행동효과) × (1+받는 배리어)                          — BARRIER
//   고정ATK = 기본 × (1+기초ATK%) × 부여%                                          — apply_effect(of_base_atk)
//   받은 데미지 = 최대HP×n% × 방어0.5 × max(0,(1+받는)(1+속성받는)) × max(0,1+주는) × max(0,1+ATK%) — _apply_incoming

export const sumv = (a) => (a || []).reduce((s, c) => s + (+c.v || 0), 0);
const pctMult = (comps) => 1 + sumv(comps) / 100;

/** 곱연산 결과가 엔진 값과 이만큼 이상 다르면 '설명되지 않은 차이' 행을 붙인다(표시 반올림 오차는 무시). */
export const DIFF_TOLERANCE_ABS = 1;
export const DIFF_TOLERANCE_REL = 1e-4;

/** 엔진 행동 효과 라벨(effLabel) → 문구 키. 치료·배리어는 부여한 행동의 채널을 받는다. */
export const EFF_KEY = Object.freeze({
  '평타뎀': 'log.r.eff.basic', 'EX효과': 'log.r.eff.ex', '발동효과': 'log.r.eff.trigger', '지속딜': 'log.r.eff.dot', '효과': 'log.r.eff.generic',   // copy-lint-allow 엔진 토큰
});

function builder(start) {
  const rows = [];
  let running = start, mismatched = false;
  return {
    rows,
    get running() { return running; },
    base(id, key, value, extra = {}) { running = value; rows.push({ id, key, kind: 'base', show: { abs: value }, running, ...extra }); },
    mul(id, key, mult, show, comps, extra = {}) { running = running * mult + 0; rows.push({ id, key, kind: 'mul', mult, show, comps, running, ...extra }); },
    add(id, key, add, comps) { running += add; rows.push({ id, key, kind: 'add', add, show: { flat: add }, comps, running }); },
    // 소계·최종은 엔진 값으로 맞추되, 곱한 값과 다르면 그 앞에 '설명되지 않은 차이' 행을 남긴다(숨기지 않는다).
    reconcile(value) {
      const diff = value - running;
      if (Math.abs(diff) <= Math.max(DIFF_TOLERANCE_ABS, Math.abs(value) * DIFF_TOLERANCE_REL)) return;
      const mult = running ? value / running : null;
      rows.push({ id: 'diff', key: 'log.r.diff', kind: 'diff', mult, show: mult != null ? { times: mult } : { flat: diff }, running: value });
      mismatched = true;
      running = value;
    },
    sub(id, key, value) { this.reconcile(value); running = value; rows.push({ id, key, kind: 'sub', show: { abs: value }, running }); },
    close(final) {
      this.reconcile(final);
      return { rows, final, computed: running, matched: !mismatched };
    },
  };
}

/** ATK 채널(기본 × 기초ATK% × ATK% + 고정 → 소계). base 가 없으면(최대 HP 등 기준) 한 줄. */
function atkRows(b, d) {
  if (d.base == null || (d.baseLabel && d.baseLabel !== 'ATK')) {
    b.base('base', 'log.r.base.other', +d.baseTotal || 0, { label: d.baseLabel || '' });
    return;
  }
  b.base('base', 'log.r.base.atk', +d.base || 0);
  if ((d.baseAtk || []).length) b.mul('baseAtk', 'log.r.baseAtk', pctMult(d.baseAtk), { pct: sumv(d.baseAtk) }, d.baseAtk);
  if ((d.atk || []).length) b.mul('atk', 'log.r.atk', pctMult(d.atk), { pct: sumv(d.atk) }, d.atk);
  if (sumv(d.flat)) b.add('flat', 'log.r.flat', sumv(d.flat), d.flat);
  const total = d.atkTotal ?? d.baseTotal;
  if (total != null && b.rows.length > 1) b.sub('atkTotal', 'log.r.atkTotal', +total);
}

/** 데미지 1타. */
export function hitReceipt(d) {
  const b = builder(0);
  const isBar = !!(d.barrierComp && d.barrierComp.length);
  if (isBar || (d.baseLabel && d.baseLabel !== 'ATK')) {
    b.base('base', isBar ? 'log.r.base.barrier' : 'log.r.base.other', +d.atkTotal || 0,
      { label: d.baseLabel || '', barrierPre: d.barrierPre, barrierConsumed: d.barrierConsumed });
  } else {
    atkRows(b, d);
    if (d.atkTotal != null && b.rows[b.rows.length - 1].kind !== 'sub') b.reconcile(+d.atkTotal);
  }
  b.mul('skill', 'log.r.skill', (+d.skillPct || 0) / 100, { pct: +d.skillPct || 0, plain: true }, null, { skillId: d.skillId, skillName: d.skillName });
  if ((d.dealt || []).length) b.mul('dealt', 'log.r.dealt', pctMult(d.dealt), { pct: sumv(d.dealt) }, d.dealt);
  if ((d.eff || []).length) b.mul('eff', EFF_KEY[d.effLabel] || 'log.r.eff.generic', pctMult(d.eff), { pct: sumv(d.eff) }, d.eff);
  if ((d.effEx || []).length) b.mul('effEx', 'log.r.eff.ex', pctMult(d.effEx), { pct: sumv(d.effEx) }, d.effEx);
  // 받는 데미지: 일반 × 속성은 한 덩어리로 0 하한(incoming_mult). 한 줄씩 보이되 하한이 걸리면 두 번째 줄에서 맞춘다.
  const g = d.takenG || [], p = d.takenP || [], old = d.taken || [];
  const incRaw = pctMult(g) * pctMult(p) * pctMult(old);
  const inc = Math.max(0, incRaw);
  if (g.length) b.mul('takenG', 'log.r.takenG', pctMult(g), { pct: sumv(g) }, g);
  if (old.length) b.mul('taken', 'log.r.takenG', pctMult(old), { pct: sumv(old) }, old);
  if (p.length) b.mul('takenP', 'log.r.takenP', inc === incRaw ? pctMult(p) : (inc / (pctMult(g) * pctMult(old)) || 0), { pct: sumv(p) }, p);
  if ((d.takenEx || []).length) b.mul('takenEx', 'log.r.takenEx', Math.max(0, pctMult(d.takenEx)), { pct: sumv(d.takenEx) }, d.takenEx);
  if ((d.dotDealt || []).length) b.mul('dotDealt', 'log.r.dotDealt', pctMult(d.dotDealt), { pct: sumv(d.dotDealt) }, d.dotDealt);
  if ((d.dotTaken || []).length) b.mul('dotTaken', 'log.r.dotTaken', pctMult(d.dotTaken), { pct: sumv(d.dotTaken) }, d.dotTaken);
  if (d.elemMult && d.elemMult !== 1) b.mul('elem', d.elemMult > 1 ? 'log.r.elem.adv' : 'log.r.elem.dis', d.elemMult, { times: d.elemMult });
  if (d.sleepBonus) b.mul('sleep', 'log.r.sleep', 1 + d.sleepBonus / 100, { pct: d.sleepBonus });
  return b.close(+d.final || 0);
}

/** 치료(즉시·지속형·흡혈). */
export function healReceipt(d) {
  const b = builder(0);
  atkRows(b, d);
  b.mul('skill', 'log.r.skill', (+d.skillPct || 0) / 100, { pct: +d.skillPct || 0, plain: true }, null, { skillId: d.skillId, skillName: d.skillName });
  if ((d.eff || []).length) b.mul('eff', EFF_KEY[d.effLabel] || 'log.r.eff.generic', pctMult(d.eff), { pct: sumv(d.eff) }, d.eff);
  if (d.healRecv) b.mul('healRecv', 'log.r.healRecv', Math.max(0, 1 + d.healRecv / 100), { pct: d.healRecv });
  return b.close(+d.final || 0);
}

/** 배리어 생성. */
export function barrierReceipt(d) {
  const b = builder(0);
  atkRows(b, d);
  b.mul('skill', 'log.r.skill', (+d.skillPct || 0) / 100, { pct: +d.skillPct || 0, plain: true }, null, { skillId: d.skillId, skillName: d.skillName });
  if ((d.eff || []).length) b.mul('eff', EFF_KEY[d.effLabel] || 'log.r.eff.generic', pctMult(d.eff), { pct: sumv(d.eff) }, d.eff);
  if (d.barRecv) b.mul('barRecv', 'log.r.barRecv', 1 + d.barRecv / 100, { pct: d.barRecv }, d.barRecvComp || null);
  return b.close(+d.final || 0);
}

/** 기초 ATK 비례 고정 ATK 버프. */
export function flatAtkReceipt(d) {
  const b = builder(0);
  b.base('base', 'log.r.base.atk', +d.base || 0);
  if ((d.baseAtk || []).length) b.mul('baseAtk', 'log.r.baseAtk', pctMult(d.baseAtk), { pct: sumv(d.baseAtk) }, d.baseAtk);
  b.mul('grant', 'log.r.grantPct', (+d.pct || 0) / 100, { pct: +d.pct || 0, plain: true });
  return b.close(+d.val || 0);
}

/** 적에게 받은 데미지(피격 모드·턴마다 받는 데미지). */
export function incomingReceipt(d) {
  const b = builder(0);
  b.base('raw', d.turnDmg ? 'log.r.in.rawTurn' : 'log.r.in.raw', +d.raw || 0, { pct: d.pct });
  if (d.defended) b.mul('defend', 'log.r.in.defend', 0.5, { pct: -50 });
  const g = d.taken || [], p = d.takenP || [];
  const incRaw = pctMult(g) * pctMult(p), inc = Math.max(0, incRaw);
  if (g.length) b.mul('taken', 'log.r.takenG', pctMult(g), { pct: sumv(g) }, g);
  if (p.length) b.mul('takenP', 'log.r.takenP', inc === incRaw ? pctMult(p) : (inc / pctMult(g) || 0), { pct: sumv(p) }, p);
  if ((d.dealt || []).length) b.mul('dealt', 'log.r.in.dealt', Math.max(0, pctMult(d.dealt)), { pct: sumv(d.dealt) }, d.dealt);
  if ((d.atkPct || []).length) b.mul('atkPct', 'log.r.in.atk', Math.max(0, pctMult(d.atkPct)), { pct: sumv(d.atkPct) }, d.atkPct);
  return b.close(+d.dmg || 0);
}

/** 로그 한 줄의 계산 내역(없으면 null). */
export function receiptOf(line) {
  const d = line && line.detail;
  if (!d) return null;
  if (d.calc === 'flatAtk') return flatAtkReceipt(d);
  if (d.kind === 'heal') return healReceipt(d);
  if (d.kind === 'barrier') return barrierReceipt(d);
  if (d.kind === 'incoming') return incomingReceipt(d);
  if (d.act && !d.kind) return hitReceipt(d);
  return null;
}

// ── 그래픽 표시용 분류 ────────────────────────────────────────────────────────
/** 계산 행 → 색 그룹(표시 순서 = 데이터 시각화 범주 슬롯 순서). */
export const CATEGORIES = Object.freeze(['atk', 'skill', 'amp', 'recv', 'elem']);
const CAT_OF = {
  base: 'atk', raw: 'atk', baseAtk: 'atk', atk: 'atk', flat: 'atk', atkTotal: 'atk',
  skill: 'skill', grant: 'skill',
  dealt: 'amp', eff: 'amp', effEx: 'amp', dotDealt: 'amp', atkPct: 'amp',
  takenG: 'recv', taken: 'recv', takenP: 'recv', takenEx: 'recv', dotTaken: 'recv', sleep: 'recv', healRecv: 'recv', barRecv: 'recv', defend: 'recv',
  elem: 'elem',
};
export const categoryOf = (row) => (row.kind === 'diff' ? 'diff' : CAT_OF[row.id] || 'atk');

// ── 고정 ATK 추적 ────────────────────────────────────────────────────────────
/**
 * 고정 ATK 버프는 부여 시점의 시전자 기초 ATK로 값이 정해진다(엔진 apply_effect: of_base_atk).
 * 타격 계산의 고정 ATK 출처 {v, by, skill} → 그 값을 만든 부여 줄(detail.calc === 'flatAtk')을 찾는다.
 * 같은 동료·스킬·값이면서 그 타격보다 앞선 가장 최근 줄. 없으면 null.
 */
export function createFlatGrantIndex(log) {
  const byKey = new Map();
  (log || []).forEach((l, i) => {
    const d = l && l.detail;
    if (!d || d.calc !== 'flatAtk' || !l.srcId) return;
    const key = `${l.srcId}|${l.srcSkill}|${(+d.val).toFixed(2)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(i);
  });
  return {
    /** comp = 고정 ATK 출처 한 개, at = 그 타격의 로그 인덱스 → { index, line } | null */
    find(comp, at) {
      const list = byKey.get(`${comp.by}|${comp.skill}|${(+comp.v).toFixed(2)}`);
      if (!list) return null;
      let best = -1;
      for (const i of list) { if (i <= at) best = i; else break; }
      return best >= 0 ? { index: best, line: log[best] } : null;
    },
  };
}
