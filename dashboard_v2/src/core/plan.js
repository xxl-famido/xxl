/**
 * core/plan.js — 행동 계획 모델 (순수 계산). v1 app.js에서 이식:
 *   · 궁극기 사용 방식 L3200-3224 (ultOf/setUlt/402 cdPlus/fcd/ffat)
 *   · 확률 쿨 감소 L1666-1684 (ALTAR_CD_PROC/cdProcSources/cdAssistSrc)
 *   · 연동 그룹 L3225-3322 + 편집 L3636-3680 + 프리셋 L2370-2395 + 편성 변경 L1441-1477
 *   · 우선순위 L1527-1533 · 특정 턴 순서 L2706-2715
 *   · 턴별 플래너 L4160-4515 (프리셋·쿨 검증·재배치·칸 클릭 규칙)
 *   · 완전 수동(turnPlans) 재조정 L1686-1860 · L1919-2044
 *
 * v1 전역(CHARS·altarOn·altarCfg·syncGroups·team)은 인자로 받는다. 플래너 함수는 마지막 인자로
 * `env = makeEnv({ chars, altar })` 를 받는다 — 402(최대 CD+1)·확률 쿨 감소 제단 상태가 여기 들어 있다.
 * DOM·토스트는 없다. 사용자에게 알릴 일은 반환값({status, reason, …})으로 돌려준다.
 */
import { HOLD_ULT_IDS, ULT3_IDS, PASSIVE_DEF_ID, TAEHO_ID, UK_ID, IMBUEON_ID, basePriority } from './format.js';
import { specRune } from './spec.js';

// ── 환경(제단이 계획 모델에 주는 영향) ─────────────────────────────────────
export const ALTAR_FLOORS = Object.freeze([1, 2, 3]);
export const ALTAR_CD_PLUS_ID = 402;                       // 필살기 최대 CD +1 (별: 해제 = 서 있음 = 적용)
export const ALTAR_CD_PROC_IDS = Object.freeze([1012, 1013]);
/** 확률 쿨 감소의 계획 모델(엔진 altar.py 와 같은 값). on: 'act' 행동마다 / 'ult' 필살기마다. */
export const ALTAR_CD_PROC = Object.freeze({ 1012: { on: 'act', amt: 1, ch: 30 }, 1013: { on: 'ult', amt: 3, ch: 30 } });

/** v1 `cdPlus()` — 마스터 ON · 1층 ON · 402 해제(=서 있음)면 1. altar = state.altar {on, floors}. */
export function cdPlusOf(altar) {
  const f = altar && altar.on && altar.floors && altar.floors[1];
  return (f && f.on !== false && f.off && f.off[ALTAR_CD_PLUS_ID]) ? 1 : 0;
}
/** v1 `altarProcCdActive()` — 걸려 있는 확률 쿨 감소 제단 id. */
export function altarProcCdActive(altar) {
  const f = altar && altar.on && altar.floors && altar.floors[1];
  if (!f || f.on === false) return [];
  return ALTAR_CD_PROC_IDS.filter((id) => !(f.off && f.off[id]));
}
/**
 * 계획 계산 환경. chars = id→meta(API.chars), altar = state.altar, team = 편성(선택).
 * team 을 주면 도장 잠금해제를 끈 동료(육성 설정)의 meta 는 턴당 행동 수를 actionsPerTurnNoRune 으로 바꾼 사본이 된다 —
 * 이태호의 턴당 2회는 도장 패시브에서 나오므로 도장이 없으면 엔진도 턴당 1회다(base_actions). 편성에 같은 동료는 한 명뿐이라 id 로 덮는다.
 */
export function makeEnv({ chars = {}, altar = null, team = null } = {}) {
  return { chars: teamChars(chars, team), cdPlus: cdPlusOf(altar), procIds: altarProcCdActive(altar) };
}
function teamChars(chars, team) {
  let out = chars;
  (team || []).forEach((s) => {
    const m = s && chars[s.id];
    if (!m || m.actionsPerTurnNoRune == null || m.actionsPerTurnNoRune === m.actionsPerTurn || specRune(s)) return;
    if (out === chars) out = { ...chars };
    // firstUltOnly: 필살기 리듬은 턴당 2회일 때와 같다(첫 턴 필살기로 자세 전환 뒤 보통 공격 — 엔진 hold_fatal, 도장과 무관)
    out[s.id] = { ...m, actionsPerTurn: m.actionsPerTurnNoRune, firstUltOnly: true };
  });
  return out;
}
export const ENV0 = Object.freeze({ chars: {}, cdPlus: 0, procIds: [] });

export const fcd = (m, env = ENV0) => (m.fatalCd || 0) + env.cdPlus;       // 계획 도구가 보는 필살 CD
export const ffat = (m, env = ENV0) => (m.firstFatal || 1) + env.cdPlus;   // 첫 필살기 가능 턴
export function cdProcSources(meta, env = ENV0) {
  return (meta && meta.singleUlt) ? [] : env.procIds.map((id) => ALTAR_CD_PROC[id]).filter(Boolean);
}
export function cdAssistSrc(slot, meta, env = ENV0) {
  const u = ultOf(slot);
  if (!u.assist || u.mode === 'asap') return null;
  const src = cdProcSources(meta, env);
  return src.length ? src : null;
}

// ── 궁극기 사용 방식 ─────────────────────────────────────────────────────
export const ULT_MODES = Object.freeze(['fixed', 'strict', 'asap']);
export function ultOf(s) {
  const u = (s && s.ult) || {};
  return { mode: ULT_MODES.includes(u.mode) ? u.mode : 'fixed', keepDef: u.keepDef !== false, assist: u.assist === true };
}
export const ultIsDefault = (u) => u.mode === 'fixed' && u.keepDef && !u.assist;
/** 기본값이면 키를 지운다(기록·공유 코드 looseEq에서 '기본 객체'≈'누락'). 슬롯을 바꾼다. */
export function setUlt(slot, u) {
  if (ultIsDefault(u)) { delete slot.ult; return; }
  slot.ult = { mode: u.mode, keepDef: u.keepDef };
  if (u.assist) slot.ult.assist = true;
}
/**
 * 필살기 방식(v2.1 3택: auto | strict | asap). asap 이 우선, 다음 strict, 나머지 auto.
 * v1 `usePlan`(직접 계획)은 방식이 아니다 — applySnap 이 계획을 핀으로 옮기고 지운다(adoptLegacyPlans).
 */
export function ultModeOf(slot) {
  if (!slot) return 'auto';
  const u = ultOf(slot);
  if (u.mode === 'asap') return 'asap';
  if (u.mode === 'strict') return 'strict';
  return 'auto';
}
/** ultModeOf 의 역방향 — 슬롯을 바꾼다. 옛 'manual' 은 'auto' 로 취급(읽기 호환). 남아 있는 v1 계획 필드는 지운다. */
export function setUltMode(slot, mode) {
  const u = ultOf(slot);
  delete slot.usePlan; delete slot.plan;
  slot.rotation = '';
  setUlt(slot, { ...u, mode: mode === 'strict' ? 'strict' : mode === 'asap' ? 'asap' : 'fixed' });
}

// ── 연동(맞추기) 그룹 ────────────────────────────────────────────────────
// { anchor: 포지션, members: [{ p, order:'before'|'after', base?:'defend'|'basic', other?:'own'|'hold' }], miss:'wait'|'asap' }
export const SYNC_MAX_GROUPS = 3;
export const SYNC_BASES = Object.freeze(['fatal', 'defend', 'basic']);
export const syncOtherDefault = (m) => (m && m.base ? 'own' : 'hold');
export const syncOtherOf = (m) => (m && (m.other === 'own' || m.other === 'hold') ? m.other : syncOtherDefault(m));
export function normalizeSyncGroups(raw) {
  const used = new Set(), out = [];
  (Array.isArray(raw) ? raw : []).slice(0, SYNC_MAX_GROUPS).forEach((g) => {
    if (!g || typeof g !== 'object') return;
    const anchor = +g.anchor;
    const members = [];
    (Array.isArray(g.members) ? g.members : []).forEach((m) => {
      const obj = !!(m && typeof m === 'object');
      const p = +(obj ? m.p : m);
      if (!(p >= 1 && p <= 5) || p === anchor || used.has(p) || members.some((x) => x.p === p)) return;
      const base = (obj && SYNC_BASES.includes(m.base) && m.base !== 'fatal') ? m.base : null;
      const mem = { p, order: (!base && obj && m.order === 'after') ? 'after' : 'before' };
      if (base) mem.base = base;
      const other = (obj && (m.other === 'own' || m.other === 'hold')) ? m.other : null;
      if (other && other !== syncOtherDefault(mem)) mem.other = other;
      members.push(mem);
    });
    if (!(anchor >= 1 && anchor <= 5) || used.has(anchor)) {
      if (members.length || (anchor >= 1 && anchor <= 5)) out.push({ anchor: (anchor >= 1 && anchor <= 5 && !used.has(anchor)) ? anchor : 0, members: [], miss: g.miss === 'asap' ? 'asap' : 'wait' });
      return;
    }
    used.add(anchor); members.forEach((m) => used.add(m.p));
    out.push({ anchor, members, miss: g.miss === 'asap' ? 'asap' : 'wait' });
  });
  return out.filter((g) => g.anchor || g.members.length);
}
/** 엔진 cfg.sync / snapshot.sync: 유효 그룹(앵커+멤버), 없으면 null. */
export function syncPayloadOf(groups) {
  const g = normalizeSyncGroups(groups).filter((x) => x.anchor && x.members.length);
  return g.length ? g : null;
}
/** 포지션이 속한 그룹 → { g, idx, role:'anchor'|'member', m } | null */
export function syncGroupOf(groups, pos) {
  const gs = normalizeSyncGroups(groups);
  for (let i = 0; i < gs.length; i++) {
    const g = gs[i];
    if (g.anchor === pos) return { g, idx: i, role: 'anchor' };
    const m = g.members.find((x) => x.p === pos);
    if (m) return { g, idx: i, role: 'member', m };
  }
  return null;
}
/** 옛 기록: snapshot.altar.groups → snapshot.sync (제자리 변경, 바뀌었으면 true). */
export function migrateSnapSync(sn) {
  if (!sn || !sn.altar || !Array.isArray(sn.altar.groups)) return false;
  if (!sn.sync) sn.sync = sn.altar.groups;
  delete sn.altar.groups;
  return true;
}
/** 그룹 i 수정(v1 setSyncGroup의 계산부) → 새 정규화 배열. */
export function editSyncGroup(groups, i, fn) {
  const gs = normalizeSyncGroups(JSON.parse(JSON.stringify(groups || [])));
  while (gs.length <= i) gs.push({ anchor: 0, members: [], miss: 'wait' });
  fn(gs[i]);
  return normalizeSyncGroups(gs);
}
/** 연동 탭 조작(v1 initAltar 본문 핸들러) — 전부 새 배열을 돌려준다. */
export const syncOps = Object.freeze({
  setAnchor: (gs, i, p) => editSyncGroup(gs, i, (g) => { g.anchor = +p; g.members = g.members.filter((m) => m.p !== +p); }),
  toggleMember: (gs, i, p) => editSyncGroup(gs, i, (g) => {
    const k = g.members.findIndex((m) => m.p === +p);
    if (k >= 0) g.members.splice(k, 1); else g.members.push({ p: +p, order: 'before' });
  }),
  setOrder: (gs, i, p, order) => editSyncGroup(gs, i, (g) => { const m = g.members.find((x) => x.p === +p); if (m) m.order = order === 'after' ? 'after' : 'before'; }),
  setBase: (gs, i, p, base) => editSyncGroup(gs, i, (g) => {
    const m = g.members.find((x) => x.p === +p); if (!m) return;
    const chosen = m.other;          // 사용자가 고른 '그 밖의 턴' 처리는 행동 종류를 바꿔도 유지
    if (base === 'fatal') delete m.base; else { m.base = base; m.order = 'before'; }
    if (chosen) m.other = chosen;
  }),
  setOther: (gs, i, p, other) => editSyncGroup(gs, i, (g) => { const m = g.members.find((x) => x.p === +p); if (m) m.other = other === 'hold' ? 'hold' : 'own'; }),
  setMiss: (gs, i, miss) => editSyncGroup(gs, i, (g) => { g.miss = miss === 'asap' ? 'asap' : 'wait'; }),
  removeGroup: (gs, i) => normalizeSyncGroups((gs || []).filter((_, k) => k !== i)),
});
/**
 * 욱영 프리셋(v1 applySyncPreset): 욱영=앵커, 인접 아군(채워진 자리 원형 링)=‘평타 → 받은 추가 행동에서 궁’.
 * → { ok, groups, reason?: 'noUk'|'full' }
 */
export function applySyncPreset(groups, roster, kind = 'uk') {
  if (kind !== 'uk') return { ok: false, groups, reason: 'unknown' };
  const ukPos = roster.findIndex((x) => x && x.id === UK_ID) + 1;
  if (!ukPos) return { ok: false, groups, reason: 'noUk' };
  const ring = roster.map((x, i) => (x ? i + 1 : 0)).filter(Boolean);
  const k = ring.indexOf(ukPos), n = ring.length;
  const adj = n <= 1 ? [] : [...new Set([ring[(k - 1 + n) % n], ring[(k + 1) % n]])].filter((p) => p !== ukPos);
  const gs = normalizeSyncGroups(JSON.parse(JSON.stringify(groups || [])));
  let i = gs.findIndex((g) => g.anchor === ukPos);
  if (i < 0) {
    i = gs.findIndex((g) => !g.anchor);
    if (i < 0 && gs.length < SYNC_MAX_GROUPS) { gs.push({ anchor: 0, members: [], miss: 'wait' }); i = gs.length - 1; }
  }
  if (i < 0) return { ok: false, groups, reason: 'full' };
  gs.forEach((g, j) => {
    if (j === i) return;
    if (adj.includes(g.anchor) || g.anchor === ukPos) g.anchor = 0;
    g.members = g.members.filter((m) => m.p !== ukPos && !adj.includes(m.p));
  });
  gs[i] = { anchor: ukPos, members: adj.map((p) => ({ p, order: 'before', base: 'basic' })), miss: gs[i].miss || 'wait' };
  return { ok: true, groups: normalizeSyncGroups(gs) };
}
/**
 * 자리 pos(1-based)의 동료를 뺄 때 연동 역할을 걷어낸다(v1 detachSync). team = 빼기 전 편성.
 * → { groups, out(복원용 id 기준 정보|null), anchorRemoved }
 */
export function detachSync(groups, team, pos) {
  const gs = normalizeSyncGroups(JSON.parse(JSON.stringify(groups || [])));
  const idAt = (p) => (team[p - 1] || {}).id;
  let out = null, anchorRemoved = false;
  const keep = [];
  gs.forEach((g) => {
    if (g.anchor === pos) {
      out = { role: 'anchor', miss: g.miss, members: g.members.map((m) => ({ ...m, id: idAt(m.p) })) };
      anchorRemoved = true;
      return;
    }
    const m = g.members.find((x) => x.p === pos);
    if (m) { out = { role: 'member', anchorId: idAt(g.anchor), m: { ...m } }; g.members = g.members.filter((x) => x.p !== pos); }
    if (g.members.length) keep.push(g);
  });
  return { groups: out ? keep : normalizeSyncGroups(groups), out, anchorRemoved };
}
/** 다시 넣은 동료의 연동 역할 복원(v1 attachSync). team = 넣은 뒤 편성. → 새 groups */
export function attachSync(groups, team, c, pos) {
  const gs = normalizeSyncGroups(JSON.parse(JSON.stringify(groups || [])));
  const used = new Set(gs.flatMap((g) => [g.anchor, ...g.members.map((m) => m.p)]));
  if (used.has(pos)) return gs;
  const posOf = (id) => team.findIndex((x) => x && x.id === id) + 1;
  if (c.role === 'member') {
    const g = gs.find((x) => x.anchor === posOf(c.anchorId));
    if (!g) return gs;
    g.members.push({ ...c.m, p: pos });
  } else {
    if (gs.length >= SYNC_MAX_GROUPS) return gs;
    const members = c.members.map((m) => ({ ...m, p: posOf(m.id) })).filter((m) => m.p > 0 && !used.has(m.p))
      .map(({ id, ...m }) => m);
    if (!members.length) return gs;
    gs.push({ anchor: pos, members, miss: c.miss });
  }
  return normalizeSyncGroups(gs);
}
/** 두 자리 교체 시 연동 포지션도 교체(v1 cmpSwapSlots 규칙). */
export function swapSyncPositions(groups, p1, p2) {
  const sw = (p) => (p === p1 ? p2 : (p === p2 ? p1 : p));
  return normalizeSyncGroups((groups || []).map((g) => ({ ...g, anchor: sw(g.anchor), members: g.members.map((m) => ({ ...m, p: sw(m.p) })) })));
}

// ── 우선순위 · 특정 턴 순서 ──────────────────────────────────────────────
/** v1 `teamOrder` — [{ s, i, p }] 우선순위 오름차순. */
export function teamOrder(team, chars = {}) {
  return (team || []).map((s, i) => (s ? { s, i } : null)).filter(Boolean)
    .map((o) => ({ ...o, p: o.s.priority ?? basePriority(o.s, o.i + 1, chars) }))
    .sort((a, b) => a.p - b.p);
}
/** 진입 시 자동 선택할 예외 턴 — 첫 턴과 같은 순서를 가진 턴만(v1 autoSelOverrides). */
export function autoSelOverrides(ov) {
  const keys = Object.keys(ov || {}).map(Number).sort((a, b) => a - b), set = new Set();
  if (keys.length) {
    const first = JSON.stringify(ov[keys[0]]);
    keys.forEach((t) => { if (JSON.stringify(ov[t]) === first) set.add(t); });
  }
  return set;
}

// ── 턴별 행동 플래너 (apt = 턴당 행동 수; 이태호 = 2) ────────────────────
export function fillPlan(meta, action, n = 30, env = ENV0) {
  const apt = meta.actionsPerTurn || 1;
  const plan = Array(n * apt).fill(action);
  if (apt === 1 && !HOLD_ULT_IDS.has(meta.id) && !meta.firstUltOnly) {
    for (let t = ffat(meta, env); t <= n; t += fcd(meta, env)) plan[t - 1] = '궁';
  }
  return plan;
}
export function defaultPlan(meta, n = 30, env = ENV0) {
  if (meta.singleUlt) {                        // 제토: 전투당 1회 — 마지막 턴에만
    const apt = meta.actionsPerTurn || 1;
    const p = Array(n * apt).fill('평');
    p[(n - 1) * apt] = '궁';
    return p;
  }
  const plan = fillPlan(meta, '평', n, env);
  if (((meta.actionsPerTurn || 1) > 1 || meta.firstUltOnly) && ffat(meta, env) <= 1) plan[0] = '궁';
  return plan;
}
/** n턴 길이로 확장만 한다(기본 궁 주기를 이어받음). 제자리 변경 후 반환. */
export function padPlan(plan, meta, n, env = ENV0) {
  const apt = meta.actionsPerTurn || 1, want = n * apt;
  if (!plan || plan.length >= want) return plan;
  const base = defaultPlan(meta, n, env);
  while (plan.length < want) plan.push(base[plan.length] || '평');
  return plan;
}
export function ult3Plan(meta, n = 30, action = '평') {
  const apt = meta.actionsPerTurn || 1;
  const plan = Array(n * apt).fill(action);
  if (apt === 1) for (let t = 4; t <= n; t += 3) plan[t - 1] = '궁';
  return plan;
}
export function isUlt3Plan(plan, meta) {
  if (!plan || (meta.actionsPerTurn || 1) !== 1) return false;
  const ref = ult3Plan(meta, plan.length);
  for (let i = 0; i < plan.length; i++) if ((plan[i] === '궁') !== (ref[i] === '궁')) return false;
  return true;
}
export function passiveDefendPlan(meta, n = 30, env = ENV0) {
  const plan = fillPlan(meta, '평', n, env);
  for (let i = 0; i < plan.length; i++) if (plan[i] === '궁' && i - 1 >= 0) plan[i - 1] = '방';
  return plan;
}
// ── 동료별 행동 규칙(v1 캐릭터 창 버튼 이식 + 란 — docs/redesign/CHAR_SPECIALS.md) ─────────────
/**
 * '필살기 직전 방어'가 스킬상 이득인 동료 — 방어 시 효과가 다음 턴 필살기까지 남는다(엔진 메타에 없는 정보라 표로 둔다;
 * tests/char-specials.test.js 가 data/skills.json 원문과 대조). needUlt = 방어 효과가 '필살기로 얻은 표식'을 요구 →
 * 첫 필살기 앞 방어는 효과가 없으므로 넣지 않는다.
 *   10421 파미도 passive1 「롱 패스 준비」: 방어 시 자신 기초 ATK 30% 증가(2턴)            — v1 '패시브 방어' 버튼
 *   10426 란     passive2 「허물 매미 교전」: 필살기 발동 시 【란의 기운】, 기운 보유 방어 → 4번 자리 동료가 공격하면
 *                란에게 발동 스킬 효과 +108%(2턴)·【해일의 송곳니】 +5 → 다음 턴 필살기(송곳니 중첩당 발동 데미지)가 커진다 — v2 신규
 */
export const DEF_BEFORE_ULT = Object.freeze({
  [PASSIVE_DEF_ID]: Object.freeze({ needUlt: false }),
  10426: Object.freeze({ needUlt: true, pos4: true }),
});
/** v1 PRESETS 밖의 동료별 프리셋(계약 테스트의 PRESETS 목록은 그대로 둔다). */
export const CHAR_PRESETS = Object.freeze(['defRush', 'ult3def']);
/**
 * '필살기 직전 방어' 계획. every = 0 → 기본 리듬(fillPlan) 위에, every = 3 → 첫 필살기(ffat)부터 3턴마다 위에
 * 필살기 바로 앞 턴을 방어로. needUlt 동료는 첫 필살기 앞은 두지 않는다. 필살기 턴은 덮지 않는다.
 * 파미도(needUlt 없음, every 0)는 v1 passiveDefendPlan 과 같은 배열.
 */
export function defBeforePlan(meta, n = 30, env = ENV0, every = 0) {
  const apt = meta.actionsPerTurn || 1;
  let plan;
  if (every > 0 && apt === 1) {
    plan = Array(n).fill('평');
    for (let t = ffat(meta, env); t <= n; t += every) plan[t - 1] = '궁';
  } else plan = fillPlan(meta, '평', n, env);
  if (apt !== 1) return plan;
  const rule = DEF_BEFORE_ULT[meta.id] || {};
  let seen = false;
  for (let i = 0; i < plan.length; i++) {
    if (plan[i] !== '궁') continue;
    if ((seen || !rule.needUlt) && i >= 1 && plan[i - 1] !== '궁') plan[i - 1] = '방';
    seen = true;
  }
  return plan;
}
/**
 * 방어로 CD 가 주는 동료(cdDefendReduce — 모이루 추격·히토하 입질): 앞 턴 방어를 자동 배치하며 가장 이른 턴마다 필살기.
 * v1 은 칸을 누를 때마다 enforceCdDefend 를 돌렸다 — 그 규칙을 1턴부터 차례로 적용한 것(모이루 + 앞 3명 보통 공격 = 방·방·필살기
 * 반복, 히토하 = 보통 공격·방어·필살기 반복). 앞선 필살기를 방어로 덮는 배치는 채택하지 않는다.
 */
export function defRushPlan(meta, n, allyBasics, src, env = ENV0, immune = null) {
  const plan = Array(n).fill('평');
  if (!(meta.cdDefendReduce > 0) || (meta.actionsPerTurn || 1) !== 1) return plan;
  for (let t = 1; t <= n; t++) {
    const test = plan.slice();
    test[t - 1] = '궁';
    const r = enforceCdDefend(test, meta, t, allyBasics, src, env, immune);
    if (r === false) continue;
    if (plan.some((a, k) => a === '궁' && test[k] !== '궁')) continue;   // 앞선 필살기를 덮으면 버린다
    if (r === null && !ultAvail(test, meta, allyBasics, src, env, immune)[t - 1]) continue;
    for (let k = 0; k < n; k++) plan[k] = test[k];
  }
  return plan;
}

/** 모이루형 CD 감소용: 팀의 '다른' 동료가 턴마다 평타를 몇 번 치는지. */
export function allyBasicCounts(roster, selfIdx, n, env = ENV0) {
  const cnt = Array(n).fill(0);
  (roster || []).forEach((s, i) => {
    if (!s || i === selfIdx) return;
    const m = env.chars[s.id]; if (!m) return;
    const apt = m.actionsPerTurn || 1;
    const p = (s.usePlan && s.plan && s.plan.length) ? s.plan : defaultPlan(m, n, env);
    for (let t = 0; t < n; t++) for (let k = 0; k < apt; k++) if (p[t * apt + k] === '평') cnt[t]++;
  });
  return cnt;
}
function procAmts(src) {
  let act = 0, ult = 0;
  (src || []).forEach((x) => { if (x.on === 'act') act += x.amt; else if (x.on === 'ult') ult += x.amt; });
  return [act, ult];
}
/**
 * ok[i] = i+1턴에 필살기 가능. 반환 배열의 .luck[i] = 확률 감소가 있어야 가능한 턴. 엔진 _ult_ready 와 같은 규칙.
 * immune(선택, Set): 임부언 CD 변동 면역 턴(cdImmuneTurns) — 그 턴엔 방어 CD 감소·성공 가정 적립을 건너뛴다
 * (필살 후 CD 재설정·자연 충전은 그대로, 면역 전에 쌓인 적립은 쓸 수 있다 — docs/redesign/IMBUEON_IMMUNITY.md §1·§5).
 */
export function ultAvail(plan, meta, allyBasics, src, env = ENV0, immune = null) {
  const ok = [], luck = []; const red = meta.cdDefendReduce || 0;
  const per = meta.cdDefendPerStack || 0, cap = meta.cdDefendStackCap || 0;
  const [actAmt, ultAmt] = procAmts(src);
  let cd = ffat(meta, env) - 1, hooked = false, stk = 0, pending = false, bank = 0;
  for (let t = 1; t <= plan.length; t++) {
    ok[t - 1] = cd <= 0 || (!!src && cd <= bank);
    luck[t - 1] = ok[t - 1] && cd > 0;
    let act = plan[t - 1], fires = false;
    if (act === '궁') {
      if (ok[t - 1]) { fires = true; pending = false; } else { act = '평'; pending = true; }
    } else if (act === '평' && pending && ok[t - 1]) { fires = true; act = '궁'; pending = false; }
    const imm = !!(immune && immune.has(t));
    if (per && cap) {
      stk = Math.min(cap, stk + (allyBasics ? (allyBasics[t - 1] || 0) : cap));
      if (act === '방') { if (!imm) cd -= per * stk; stk = 0; }
      if (act === '평') stk = Math.min(cap, stk + 1);
    } else {
      if (act === '방' && red && hooked && !imm) cd -= red;
      if (act === '평') hooked = true;
    }
    if (fires) { cd = fcd(meta, env); hooked = false; bank = 0; }
    if (!imm) bank += actAmt + (fires ? ultAmt : 0);
    if (immune && immune.fed && immune.fed.has(t)) [cd, bank] = fedStep(immune, imm, cd, bank, src, meta, env);
    cd -= 1;
  }
  ok.luck = luck;
  return ok;
}
/** 쿨 안 찬 턴의 궁을 평타로 내리고 폴백 궁을 반영(제자리). ultAvail 과 같은 CD 모델. */
export function normalizePlan(plan, meta, allyBasics, src, env = ENV0, immune = null) {
  const red = meta.cdDefendReduce || 0;
  const per = meta.cdDefendPerStack || 0, cap = meta.cdDefendStackCap || 0;
  const [actAmt, ultAmt] = procAmts(src);
  let cd = ffat(meta, env) - 1, hooked = false, stk = 0, pending = false, bank = 0;
  for (let t = 1; t <= plan.length; t++) {
    const ready = cd <= 0 || (!!src && cd <= bank);
    if (plan[t - 1] === '궁') {
      if (ready) pending = false; else { plan[t - 1] = '평'; pending = true; }
    } else if (plan[t - 1] === '평' && pending && ready) { plan[t - 1] = '궁'; pending = false; }
    const act = plan[t - 1];
    const imm = !!(immune && immune.has(t));
    if (per && cap) {
      stk = Math.min(cap, stk + (allyBasics ? (allyBasics[t - 1] || 0) : cap));
      if (act === '방') { if (!imm) cd -= per * stk; stk = 0; }
      if (act === '평') stk = Math.min(cap, stk + 1);
    } else {
      if (act === '방' && red && hooked && !imm) cd -= red;
      if (act === '평') hooked = true;
    }
    if (act === '궁') { cd = fcd(meta, env); hooked = false; bank = 0; }
    if (!imm) bank += actAmt + (act === '궁' ? ultAmt : 0);
    if (immune && immune.fed && immune.fed.has(t)) [cd, bank] = fedStep(immune, imm, cd, bank, src, meta, env);
    cd -= 1;
  }
  return plan;
}
/** 첫 궁 당기기: 확률 감소로 가장 이른 턴 + 이후 원래 주기. */
export function earlyUltPlan(meta, n, allyBasics, src, env = ENV0) {
  const plan = Array(n).fill('평');
  const ok = ultAvail(plan, meta, allyBasics, src, env);
  const first = ok.findIndex(Boolean) + 1 || ffat(meta, env);
  for (let t = first; t <= n; t += (fcd(meta, env) || 1)) plan[t - 1] = '궁';
  normalizePlan(plan, meta, allyBasics, src, env);
  return plan;
}
export function canEarlyUlt(meta, env = ENV0) {
  return (meta.actionsPerTurn || 1) === 1 && !meta.singleUlt && !HOLD_ULT_IDS.has(meta.id) && cdProcSources(meta, env).length > 0;
}
/**
 * [v2 신규] 모두 필살기: 쿨이 도는 턴마다 필살기. 단일 행동은 전 턴 '궁'을 CD 모델로 정리(확률 감소 가정 반영),
 * 다중 행동(이태호)은 매 턴 첫 행동을 궁(턴당 1회). 제토(전투당 1회)는 대상이 아니다(presetAvailable=false).
 */
export function allUltPlan(meta, n, allyBasics, src, env = ENV0, immune = null) {
  const apt = meta.actionsPerTurn || 1;
  if (apt > 1) {
    const p = Array(n * apt).fill('평');
    for (let t = 0; t < n; t++) p[t * apt] = '궁';
    return p;
  }
  return normalizePlan(Array(n).fill('궁'), meta, allyBasics, src, env, immune);
}
/** 임부언이 필살기를 쓰는 턴 집합(이태호 fed 추가 행동 위치). */
export function imbueonUltTurns(teamArr, turns, env = ENV0) {
  const im = (teamArr || []).find((t) => t && t.id === IMBUEON_ID);
  if (!im) return new Set();
  const meta = env.chars[IMBUEON_ID] || {};
  const set = new Set();
  if (im.usePlan && im.plan && im.plan.length) {
    const plan = im.plan.slice();
    normalizePlan(plan, meta, null, cdAssistSrc(im, meta, env), env);
    for (let t = 0; t < turns; t++) if (plan[t] === '궁') set.add(t + 1);
  } else {
    for (let t = ffat(meta, env) || 1; t <= turns; t += (fcd(meta, env) || 1)) set.add(t);
  }
  return set;
}
/**
 * 이태호(1번 자리)+임부언 동반 시 fed 슬롯 턴 집합, 아니면 null.
 * 도장 잠금해제를 끈 이태호(턴당 1회)는 엔진에서 다른 1번 자리 동료와 같은 규칙으로 추가 행동을 쓰므로(extra_basic 아님) 슬롯이 없다.
 */
export function taehoFedTurns(slot, teamArr, turns, env = ENV0) {
  if (!slot || slot.id !== TAEHO_ID) return null;
  if (env.chars[slot.id] && (env.chars[slot.id].actionsPerTurn || 1) < 2) return null;
  if (!(teamArr && teamArr[0] && teamArr[0].id === TAEHO_ID)) return null;
  if (!teamArr.some((t) => t && t.id === IMBUEON_ID)) return null;
  return imbueonUltTurns(teamArr, turns, env);
}
/** 임부언 필살기 CD 변동 면역 기간(엔진: 턴 T 필살 → T의 남은 행동·T+1·T+2). 플래너는 T+1·T+2 만 본다(1번 자리 동료는 T에 임부언보다 먼저 행동). */
export const IMBUEON_IMMUNE_TURNS = 3;
/** 1번 자리 동료가 임부언 CD 변동 면역인 턴 집합. teamArr 가 구체화된 편성(effectiveTeam)이면 임부언 핀·당겨진 리듬을 따른다. */
export function cdImmuneTurns(teamArr, turns, env = ENV0) {
  const out = new Set();
  imbueonUltTurns(teamArr, turns, env).forEach((t) => { for (let k = 1; k < IMBUEON_IMMUNE_TURNS; k++) out.add(t + k); });
  return out;
}
/** 자리 i(0-based) 동료에게 적용할 면역 턴 — 1번 자리 · 임부언이 아닌 동료 · 편성에 임부언이 있을 때만, 아니면 null. */
export function immuneFor(slot, i, teamArr, turns, env = ENV0) {
  if (i !== 0 || !slot || slot.id === IMBUEON_ID || !(teamArr || []).some((x) => x && x.id === IMBUEON_ID)) return null;
  const s = cdImmuneTurns(teamArr, turns, env);
  if (!s.size) return null;
  // 임부언 필살 턴의 받은 추가 행동(fed carry — 엔진 _mark_fed_carries: 턴당 2회 동료·제토 제외). 캐리가 그 추가 행동에서
  // 필살기를 쓰면 CD·성공 가정 적립이 초기화되므로 다음 턴 판정이 달라진다(IMBUEON_IMMUNITY.md §4 (b2) 3·6·9).
  const meta = env.chars[slot.id] || {};
  const im = (teamArr || []).find((x) => x && x.id === IMBUEON_ID);
  if ((meta.actionsPerTurn || 1) === 1 && !meta.singleUlt) {
    s.fed = imbueonUltTurns(teamArr, turns, env);
    s.cut = IMBUEON_CD_CUT;
    s.extra = !!(im && im.rune !== false);          // 도장 필살기만 행동 횟수 회복
  }
  return s;
}
/** 임부언 필살기 CD 감소량(skills.json 10410 arg1). */
export const IMBUEON_CD_CUT = 3;
/**
 * 임부언 필살 턴 T, 캐리 자기 행동 뒤: CD -3(이미 면역이면 무효) → (도장) 받은 추가 행동에서 준비됐으면 필살기(CD 초기화·적립 비움).
 * 추가 행동은 면역이 걸린 뒤라 적립이 없다. → [cd, bank]
 */
function fedStep(immune, immNow, cd, bank, src, meta, env) {
  if (!immNow) cd -= immune.cut || 0;
  if (immune.extra && (cd <= 0 || (!!src && cd <= bank))) { cd = fcd(meta, env); bank = 0; }
  return [cd, bank];
}
/** 히토하·모이루: ultTurn 에 궁이 나가도록 앞 턴을 방어로(제자리). true 성공 / false 불가 / null 가정만으로 이미 가능. */
export function enforceCdDefend(plan, meta, ultTurn, allyBasics, src, env = ENV0, immune = null) {
  if (src) {
    const t0 = plan.slice(); t0[ultTurn - 1] = '궁';
    if (ultAvail(t0, meta, allyBasics, src, env, immune)[ultTurn - 1]) return null;
  }
  if (!(meta.cdDefendReduce > 0) || ultTurn < 2) return false;
  const per = meta.cdDefendPerStack || 0, cap = meta.cdDefendStackCap || 0;
  if (per && cap) {
    for (let nDef = 1; nDef <= ultTurn - 1; nDef++) {
      const test = plan.slice();
      for (let k = 0; k < nDef; k++) test[ultTurn - 2 - k] = '방';
      test[ultTurn - 1] = '궁';
      if (ultAvail(test, meta, allyBasics, src, env, immune)[ultTurn - 1]) {
        for (let k = 0; k < nDef; k++) plan[ultTurn - 2 - k] = '방';
        return true;
      }
    }
    return false;
  }
  const test = plan.slice();
  test[ultTurn - 2] = '방';
  let lastUlt = 0;
  for (let t = 1; t < ultTurn - 1; t++) if (test[t - 1] === '궁') lastUlt = t;
  let hasBasic = false;
  for (let t = lastUlt + 1; t <= ultTurn - 2; t++) if (test[t - 1] === '평') { hasBasic = true; break; }
  if (!hasBasic) for (let t = lastUlt + 1; t <= ultTurn - 2; t++) if (test[t - 1] !== '궁') { test[t - 1] = '평'; break; }
  test[ultTurn - 1] = '궁';
  if (!ultAvail(test, meta, allyBasics, src, env, immune)[ultTurn - 1]) return false;
  for (let i = 0; i < plan.length; i++) plan[i] = test[i];
  return true;
}
/** anchor 턴 뒤의 궁을 가장 이른 주기로 다시 놓는다(개수·방어 유지, 제자리). */
export function reflowUlts(plan, meta, anchor, env = ENV0) {
  let lastUlt = 0;
  for (let t = 1; t <= anchor; t++) if (plan[t - 1] === '궁') lastUlt = t;
  let count = 0;
  for (let t = anchor + 1; t <= plan.length; t++) if (plan[t - 1] === '궁') { count++; plan[t - 1] = '평'; }
  let next = lastUlt ? lastUlt + fcd(meta, env) : ffat(meta, env);
  for (let t = anchor + 1; t <= plan.length && count > 0; t++) {
    if (t < next || plan[t - 1] === '방') continue;
    plan[t - 1] = '궁'; next = t + fcd(meta, env); count--;
  }
  return plan;
}
/** 궁 간격 맞추기: 첫 궁은 그대로, 이후 궁을 쿨이 차는 턴마다(제자리). */
export function reflowFromFirst(plan, meta, env = ENV0) {
  const first = plan.indexOf('궁');
  if (first >= 0) reflowUlts(plan, meta, first + 1, env);
  return plan;
}
/** 아직 손대지 않은 기본 계획인가(화면 기준). */
export function isPristinePlan(view, meta, n, ab, src, env = ENV0) {
  const base = defaultPlan(meta, n, env);
  padPlan(base, meta, n, env);
  if ((meta.actionsPerTurn || 1) === 1) normalizePlan(base, meta, ab, src, env);
  const len = Math.min(view.length, base.length);
  for (let i = 0; i < len; i++) if (view[i] !== base[i]) return false;
  return true;
}

/**
 * 플래너 화면 모델(v1 renderPlanner 계산부). 저장된 계획은 바꾸지 않는다.
 * → { apt, view, ok|null, luck|null, okIf|null, lockUlt[턴], fedTurns:Set|null, fed:{턴:토큰} }
 */
export function planView(slot, i, team, n, env = ENV0) {
  const meta = env.chars[slot.id] || {};
  const apt = meta.actionsPerTurn || 1;
  const view = (slot.plan && slot.plan.length ? slot.plan : defaultPlan(meta, n, env)).slice();
  padPlan(view, meta, n, env);
  const ab = allyBasicCounts(team, i, n, env);
  const src = cdAssistSrc(slot, meta, env);
  const immune = immuneFor(slot, i, team, Math.max(n, Math.ceil(view.length / apt)), env);   // 임부언 CD 변동 면역(1번 자리 동료)
  if (apt === 1) normalizePlan(view, meta, ab, src, env, immune);
  const ok = apt === 1 ? ultAvail(view, meta, ab, src, env, immune) : null;
  const okIf = (apt === 1 && !src && ultOf(slot).mode !== 'asap' && cdProcSources(meta, env).length)
    ? ultAvail(view, meta, ab, cdProcSources(meta, env), env, immune) : null;
  const lockUlt = Array.from({ length: n }, (_, ti) => apt === 1 && !ok[ti] && !(meta.cdDefendReduce > 0));
  const fedTurns = taehoFedTurns(slot, team, n, env);
  return { apt, view, ok, luck: ok ? ok.luck : null, okIf, lockUlt, fedTurns, fed: { ...(slot.fedActions || {}) }, immune };
}
/**
 * 플래너 칸 클릭(v1 renderPlanner onclick). 슬롯을 바꾸지 않고 새 계획을 돌려준다.
 * → { status: 'noop'|'ok'|'defended'|'impossible'|'locked', plan?, reason?: 'stack'|'cd' }
 */
export function planClick(slot, i, team, n, idx, a, env = ENV0) {
  const meta = env.chars[slot.id] || {};
  const pv = planView(slot, i, team, n, env);
  const { apt, view } = pv;
  const ti = Math.floor(idx / apt);
  if (a === '궁' && pv.lockUlt[ti]) return { status: 'locked' };
  if (view[idx] === a) return { status: 'noop' };
  const ab = allyBasicCounts(team, i, n, env);
  const src = cdAssistSrc(slot, meta, env);
  const pristine = isPristinePlan(view, meta, n, ab, src, env);
  const plan = view.slice();
  plan[idx] = a;
  if (apt > 1 && a === '궁') {
    for (let a2 = 0; a2 < apt; a2++) { const j = ti * apt + a2; if (j !== idx && plan[j] === '궁') plan[j] = '평'; }
  }
  if (a === '궁' && meta.singleUlt) for (let j = 0; j < plan.length; j++) if (j !== idx && plan[j] === '궁') plan[j] = '평';
  let status = 'ok';
  const def = (a === '궁' && meta.cdDefendReduce > 0) ? enforceCdDefend(plan, meta, idx + 1, ab, src, env) : undefined;
  if (def === null) { if (pristine) reflowUlts(plan, meta, idx + 1, env); }
  else if (a === '궁' && meta.cdDefendReduce > 0) {
    if (def) status = 'defended';
    else return { status: 'impossible', reason: meta.cdDefendPerStack ? 'stack' : 'cd' };
  } else if (apt === 1 && a === '궁' && pristine) reflowUlts(plan, meta, idx + 1, env);
  if (apt === 1) normalizePlan(plan, meta, ab, src, env);
  return { status, plan };
}

// ── 프리셋 ───────────────────────────────────────────────────────────────
/** 토글형 프리셋(켜면 이전 계획 보관, 끄면 복원) + 일회성(reflow·fill). 표시 순서 = 목업. */
export const PRESETS = Object.freeze(['allUlt', 'ult3', 'early', 'pdef', 'reflow']);
export const TOGGLE_PRESETS = Object.freeze(['allUlt', 'ult3', 'early', 'pdef']);
export function presetAvailable(name, meta, env = ENV0) {
  const apt = meta.actionsPerTurn || 1;
  switch (name) {
    case 'allUlt': return !meta.singleUlt;
    case 'ult3': return ULT3_IDS.has(meta.id);
    case 'early': return canEarlyUlt(meta, env);
    case 'pdef': return !!DEF_BEFORE_ULT[meta.id] && !meta.singleUlt;
    // 3턴마다 · 직전 방어: 기본 주기가 3턴보다 짧은 '직전 방어' 동료(란 CD 2턴) — 3턴 이상이면 'pdef' 와 같은 리듬이라 숨김
    case 'ult3def': return !!DEF_BEFORE_ULT[meta.id] && apt === 1 && !meta.singleUlt && fcd(meta, env) < 3;
    // 방어로 필살기 앞당기기: 방어가 필살기 CD 를 줄이는 동료(엔진 메타 cdDefendReduce)
    case 'defRush': return meta.cdDefendReduce > 0 && apt === 1 && !meta.singleUlt;
    case 'reflow': return apt === 1 && !meta.singleUlt;
    case 'fill': return true;
    default: return false;
  }
}
/** 프리셋 계획 길이 — 기록의 계획 길이(보통 30)를 유지한다(v1 planLen). */
export const presetLen = (turns) => Math.max(30, +turns || 30);
/** 토글 프리셋의 목표 계획(v1 main 모달과 같은 인자). reflow 는 현재 계획 기준 일회성. */
export function presetTarget(name, slot, i, team, turns, env = ENV0) {
  const meta = env.chars[slot.id] || {};
  const n = presetLen(turns);
  switch (name) {
    case 'ult3': return ult3Plan(meta, n);
    case 'pdef': return defBeforePlan(meta, n, env);
    case 'ult3def': return defBeforePlan(meta, n, env, 3);
    case 'defRush': return defRushPlan(meta, n, allyBasicCounts(team, i, n, env), cdAssistSrc(slot, meta, env), env, immuneFor(slot, i, team, n, env));
    case 'early': return earlyUltPlan(meta, n, allyBasicCounts(team, i, n, env), cdProcSources(meta, env), env);
    case 'allUlt': return allUltPlan(meta, n, allyBasicCounts(team, i, n, env), cdAssistSrc(slot, meta, env), env, immuneFor(slot, i, team, n, env));
    case 'reflow': {
      const plan = (slot.plan && slot.plan.length ? slot.plan : defaultPlan(meta, 30, env)).slice();
      padPlan(plan, meta, +turns || 30, env);
      return reflowFromFirst(plan, meta, env);
    }
    default: return null;
  }
}
/** '모두 평타/방어' 채우기 — 3턴 주기가 켜져 있으면 그 궁 턴을 유지한다(v1 data-fill). */
export function fillTarget(slot, action, turns, env = ENV0) {
  const meta = env.chars[slot.id] || {};
  const n = presetLen(turns);
  return isUlt3Plan(slot.plan, meta) ? ult3Plan(meta, n, action) : fillPlan(meta, action, n, env);
}
/** 토글 프리셋이 지금 켜져 있는가(v1 syncPdef 판정). */
export function presetIsOn(name, slot, i, team, turns, env = ENV0) {
  if (!slot || !slot.usePlan || !slot.plan) return false;
  const meta = env.chars[slot.id] || {};
  const apt = meta.actionsPerTurn || 1;
  switch (name) {
    case 'pdef': return slot.plan.join('') === defBeforePlan(meta, (slot.plan.length || 30) / apt, env).join('');
    case 'ult3': return isUlt3Plan(slot.plan, meta);
    case 'early': return !!cdAssistSrc(slot, meta, env) && slot.plan.join('') === presetTarget('early', slot, i, team, turns, env).join('');
    case 'allUlt': return slot.plan.join('') === presetTarget('allUlt', slot, i, team, turns, env).join('');
    default: return false;
  }
}

// ── 잠긴 턴 보조 — 엔진 프로브 결과로 재조정(v1 advReconcile 순수 이식, 스토어는 쓰지 않음 — 턴 편집 시트용) ──
// manual = { plans:{턴:[{p,a}]}, prevBudget:{턴:{pos:n}} } (제자리 변경). v2.1 에서는 plans = locked.
export const teamFingerprint = (team) => (team || []).map((s) => (s ? s.id : 0)).join(',');
/** v1 advReconcile — 직전 예산 대비 늘어난 만큼 평타를 붙이고, 줄어든 꼬리를 뺀다. */
export function reconcileTurn(manual, probe, turn) {
  const seq = manual.plans[turn];
  const live = (probe && probe.plan && probe.plan[String(turn)]) || {};
  const budget = live.budget || {};
  const prev = manual.prevBudget[turn];
  manual.prevBudget[turn] = { ...budget };
  const none = { changed: false, added: 0, removed: 0 };
  if (!seq || !prev) return none;
  const want = {};
  seq.forEach((e) => { want[e.p] = (want[e.p] || 0) + 1; });
  let changed = false, added = 0, removed = 0;
  for (const key of new Set([...Object.keys(budget), ...Object.keys(prev)])) {
    const pos = +key, now = budget[key] || 0, was = prev[key] || 0;
    const grew = now - was;
    if (grew > 0) {
      for (let k = 0; k < grew; k++) seq.push({ p: pos, a: '평' });
      added += grew; changed = true;
    }
    let excess = (want[pos] || 0) + (grew > 0 ? grew : 0) - now;
    while (excess > 0) {
      const at = seq.map((e) => e.p).lastIndexOf(pos);
      if (at < 0) break;
      seq.splice(at, 1); excess--; changed = true; removed++;
    }
  }
  return { changed, added, removed };
}
/** v1 advReconcileAll(토스트 대신 합계를 돌려준다). */
export function reconcileAll(manual, probe) {
  let changed = false, added = 0, removed = 0;
  const turns = new Set([...Object.keys(manual.plans), ...Object.keys((probe && probe.plan) || {})].map(Number));
  turns.forEach((t) => {
    if (t >= 1) { const r = reconcileTurn(manual, probe, t); changed = changed || r.changed; added += r.added; removed += r.removed; }
  });
  return { changed, added, removed };
}
/** 잠긴 턴에 행동이 없는 현 편성 동료 이름(v1 advMissingActors — 대상은 잠긴 턴). */
export function missingActors(locked, team, turns, chars = {}) {
  const names = new Set();
  const present = team.map((x, i) => (x ? i + 1 : 0)).filter(Boolean);
  Object.keys(locked || {}).map(Number).forEach((t) => {
    const seq = locked[t]; if (!Array.isArray(seq) || t > turns) return;
    present.forEach((p) => { if (!seq.some((e) => e.p === p)) names.add((chars[team[p - 1].id] || {}).name || `P${p}`); });
  });
  return [...names];
}
/** 그 턴의 모든 항목이 요청대로 실행됐는가(v1 advTurnClean). */
export function turnClean(probe, turn, want) {
  const pl = probe && probe.plan && probe.plan[String(turn)];
  const ex = pl && pl.exec;
  return !!ex && ex.length === want.length && want.every((e, k) => ex[k] === e.a);
}
/** 실행이 어긋난 이유(v1 advWhyBad) — 문구 대신 개수. */
export function whyBad(probe, turn, want) {
  const ex = ((probe && probe.plan || {})[String(turn)] || {}).exec || [];
  return { cd: want.filter((e, k) => ex[k] != null && ex[k] !== e.a).length, over: want.filter((e, k) => ex[k] == null).length };
}
/** 잠긴 턴 중 요청과 다르게 실행되는 항목이 있는 턴인가(v1 renderAdv turnBad). */
export function turnBad(locked, probe, t) {
  const q = locked && locked[t], pl = probe && probe.plan && probe.plan[String(t)];
  if (!q || !pl || !pl.exec) return false;
  return q.some((e, k) => pl.exec[k] == null || pl.exec[k] !== e.a);
}
/** 프로브의 한 턴 순서 [{p,a}] (엔진 자동 행동 x 제외) | null. */
export function turnSeqFromProbe(probe, turn) {
  const src = probe && probe.plan && probe.plan[String(turn)];
  return src && Array.isArray(src.seq) ? src.seq.filter((e) => !e.x).map((e) => ({ p: e.p, a: e.a })) : null;
}
/** 프로브 → 턴별 순서. lockAllFromProbe·턴 편집 시트의 초기값(v1 advImportLegacy 변환부). */
export function plansFromProbe(probe, turns) {
  const next = {};
  for (let t = 1; t <= turns; t++) {
    const seq = turnSeqFromProbe(probe, t);
    if (seq) next[t] = seq;
  }
  return next;
}

// ── v2.1 핀(pins) · 잠긴 턴(locked) — ARCHITECTURE §9 ────────────────────
// pins   = { [turn]: { [pos]: '궁'|'방'|'평' } }  (턴당 행동이 2회인 이태호는 행동 수만큼의 문자열, 예: '궁평')
// locked = { [turn]: [{ p, a }] }                  (턴 전체를 직접 짠 턴 — 옛 완전 수동 turnPlans 의 후신)
//
// 엔진 입력으로의 구체화(compile, core/README.md §v2.1):
//   · 핀 → 그 동료의 줄(rotation). 핀 칸은 핀 행동, 핀 없는 칸은 규칙 채움(pinFillKind). v1 '직접 계획'과 같은 엔진 경로라
//     필살기 방식·성공 가정·방어 턴 유지·맞추기가 그대로 위에 얹히고, 확률 행동도 매 반복 새로 굴러간다.
//   · 잠긴 턴 → turnPlans[turn]. 1..turns 가 전부 잠기면 v1 완전 수동과 같은 페이로드(동료별 줄·우선순위·예외 턴 생략).
//   · 핀도 잠금도 없는 동료·턴은 아무것도 보내지 않는다(엔진 규칙이 그대로 진행).
export const PIN_ACTS = Object.freeze(['궁', '방', '평']);
const PIN_RE = /^[궁방평]+$/;
/** 줄 길이(턴) — 프리셋·v1 계획과 같은 max(30, turns). */
export const lineTurns = (turns) => presetLen(turns);
export const pinCount = (pins) => Object.values(pins || {}).reduce((n, row) => n + Object.keys(row || {}).length, 0);
/** 한 동료(pos)의 핀 → { turn: 값 }. */
export function pinsRowOf(pins, pos) {
  const row = {};
  Object.keys(pins || {}).forEach((t) => { const v = pins[t] && pins[t][pos]; if (v) row[+t] = v; });
  return row;
}
/** pos 의 핀 줄을 row 로 바꾼 새 pins(빈 턴 정리). */
export function withPinsRow(pins, pos, row) {
  const out = {};
  Object.keys(pins || {}).forEach((t) => {
    const r = { ...pins[t] }; delete r[pos];
    if (Object.keys(r).length) out[t] = r;
  });
  Object.keys(row || {}).forEach((t) => { if (row[t]) { out[t] = out[t] || {}; out[t][pos] = row[t]; } });
  return sortPins(out);
}
/** 키를 숫자 순으로(스냅샷 바이트 안정) + 검증: 턴 1..30, 자리 1..5, 행동 문자열(궁·방·평). */
export function sortPins(pins) {
  const out = {};
  Object.keys(pins || {}).map(Number).filter((t) => t >= 1 && t <= 30).sort((a, b) => a - b).forEach((t) => {
    const r = (pins[t] && typeof pins[t] === 'object') ? pins[t] : {}, rr = {};
    Object.keys(r).map(Number).filter((p) => p >= 1 && p <= 5).sort((a, b) => a - b).forEach((p) => { if (PIN_RE.test(String(r[p]))) rr[p] = String(r[p]); });
    if (Object.keys(rr).length) out[t] = rr;
  });
  return out;
}
/** 잠긴 턴 정리(턴 오름차순, 배열만). 자리 번호는 검증하지 않는다(v1 turnPlans 도 그대로 보냈다 → 코덱이 '*' 로 물러남). */
export function sortLocked(locked) {
  const out = {};
  Object.keys(locked || {}).map(Number).filter((t) => t >= 1).sort((a, b) => a - b).forEach((t) => {
    if (Array.isArray(locked[t])) out[t] = locked[t].map((e) => ({ p: e.p, a: e.a }));
  });
  return out;
}
/** 1..turns 전부 잠겼는가(= v1 완전 수동 페이로드). */
export function isFullyLocked(plans, turns) {
  const n = Math.max(1, +turns || 30);
  for (let t = 1; t <= n; t++) if (!Array.isArray(plans && plans[t])) return false;
  return true;
}
/** 현재 턴 수 안의 잠긴 턴(엔진 turnPlans). */
export function lockedWithin(locked, turns) {
  const n = Math.max(1, +turns || 30), out = {};
  Object.keys(locked || {}).map(Number).sort((a, b) => a - b).forEach((t) => { if (t >= 1 && t <= n && Array.isArray(locked[t])) out[t] = locked[t].map((e) => ({ p: e.p, a: e.a })); });
  return out;
}

/**
 * 규칙 채움 방식 — 핀 없는 칸에 줄이 무엇을 넣는가.
 *   'cycle'   : 단일 행동 동료(방식 무관 — 아래 참고) — 마지막 필살기(핀 포함)에서 기본 주기(fcd)만큼 뒤, 첫 필살기는 ffat. 준비 턴이 방어 핀이면
 *               다음 핀 없는 칸으로 넘어간다(엔진 '준비되면 쓴다'와 같음). defaultPlan 의 주기를 핀 뒤로 이어 붙인 것.
 *   'default' : 이태호(턴당 2회)·제토(전투당 1회) — defaultPlan 의 그 칸(역할 기본 리듬).
 * [2026-09-28 ADV_AUDIT 모순 1·2] 방식과 관계없이 단일 행동 동료는 모두 'cycle' — "고정하지 않은 칸 = 그 동료의 방식이 만들었을 행동".
 *   · 자동: 핀 없는 엔진 규칙 = 준비되면 궁(마타야도 — 엔진 기본 정책은 아끼지 않는다. 예전 'default' 채움은 궁이 하나도 없어 2387→2155만).
 *   · 정해진 턴만: 기본 턴(자동 리듬) + 고정 칸 — 예전 '평' 채움은 핀 하나만 찍어도 기본 턴 궁이 사라졌다(K1b).
 *   · 준비되면 바로: 쿨 되는 턴마다(엔진은 어차피 준비되면 쓰지만, 줄·① 표시가 실제와 같아진다).
 *   pinsFromPlan 이 같은 채움으로 최소 핀을 찍으므로 v1 직접 계획의 rotation 은 바이트까지 그대로다(왕복 대칭).
 */
export function pinFillKind(slot, meta) {
  if ((meta.actionsPerTurn || 1) > 1 || meta.singleUlt || meta.firstUltOnly) return 'default';
  return 'cycle';
}
/**
 * [2026-09-28 성공 가정 정책 — FEEDBACK_CASES #27] 성공 가정이 적용되는 동료의 첫 필살기 턴.
 * 확률 CD 감소를 '필요한 만큼 성공'으로 본 가장 이른 턴(earlyUltPlan 과 같은 규칙: CD 3턴 → 3턴째, CD 2턴 → 2턴째).
 * 성공 가정이 꺼져 있거나(cdAssistSrc null — 꺼짐·준비되면 바로·제단 없음) 당길 수 없는 동료(canEarlyUlt 아님)면 ffat.
 * 규칙 채움(cycleFill)의 첫 필살기가 이 턴을 쓴다 → '자동 + 성공 가정' = 당겨진 리듬(3·6·9·12), 고정 칸이 있어도 같은 리듬.
 */
export function assistFirstUlt(slot, meta, env = ENV0) {
  const base = ffat(meta, env);
  if (!slot || !cdAssistSrc(slot, meta, env) || !canEarlyUlt(meta, env)) return base;
  const ok = ultAvail(Array(Math.max(1, base)).fill('평'), meta, null, cdAssistSrc(slot, meta, env), env);
  const k = ok.findIndex(Boolean);
  return k >= 0 && k + 1 < base ? k + 1 : base;
}
/** 성공 가정이 첫 필살기를 실제로 당기는가(= 핀이 없어도 줄을 보내야 엔진이 가정을 쓴다 — harness 는 rotation 이 있을 때만 assist 적용). */
export const assistPulls = (slot, meta, env = ENV0) => assistFirstUlt(slot, meta, env) < ffat(meta, env);
const cycleFill = (t, lastUlt, meta, env, first = ffat(meta, env)) => (t >= (lastUlt ? lastUlt + Math.max(1, fcd(meta, env)) : first) ? '궁' : '평');
/** 핀 값 → 그 턴의 행동 칸(행동 수만큼, 모자라면 보통 공격). 턴당 2회 동료의 '궁' 핀 = '궁평'. */
export function cellsOf(v, apt) { const a = [...String(v)]; while (a.length < apt) a.push('평'); return a.slice(0, apt); }
/**
 * 핀 줄 → 엔진 rotation 토큰 배열(길이 lineTurns(n) × 행동 수). row = { turn: 값 }.
 * 핀이 하나도 없으면 null(줄을 보내지 않음 = 규칙).
 */
export function lineFromPins(slot, row, n, env = ENV0, { always = false } = {}) {
  if (!slot || !row || (!always && !Object.keys(row).length)) return null;
  const meta = env.chars[slot.id] || {};
  const apt = meta.actionsPerTurn || 1, L = lineTurns(n), kind = pinFillKind(slot, meta);
  const first = assistFirstUlt(slot, meta, env);
  const base = kind === 'default' ? defaultPlan(meta, L, env) : null;
  const out = [];
  let lastUlt = 0;
  for (let t = 1; t <= L; t++) {
    const v = row[t];
    let cells;
    if (v) cells = cellsOf(v, apt);
    else if (kind === 'default') cells = base.slice((t - 1) * apt, t * apt);
    else if (kind === 'basic') cells = ['평'];
    else cells = [cycleFill(t, lastUlt, meta, env, first)];
    if (apt === 1 && cells[0] === '궁') lastUlt = t;
    out.push(...cells);
  }
  return out;
}
/**
 * 계획 배열(v1 직접 계획 또는 프리셋 결과) → 최소 핀 줄. 단일 행동: 궁·방 칸은 모두 핀, 평 칸은 규칙 채움이 평이 아닐 때만 핀 —
 * 그래야 lineFromPins 가 원래 계획과 똑같은 rotation 을 만든다(v1 페이로드 동일). 턴당 2회·default 채움 동료는 채움과 다른 턴만 핀.
 * opt.marker = true: 결과가 비면 1턴 칸을 핀으로 남긴다(v1 에서 직접 계획이 켜져 있었다 = rotation 을 보낸다는 사실을 보존).
 */
export function pinsFromPlan(slot, plan, n, env = ENV0, { marker = false } = {}) {
  const meta = env.chars[slot.id] || {};
  const apt = meta.actionsPerTurn || 1, L = lineTurns(n), kind = pinFillKind(slot, meta);
  const p = (plan || []).slice(0, L * apt);
  if (!p.length) return {};
  padPlan(p, meta, L, env);
  const base = kind === 'default' ? defaultPlan(meta, L, env) : null;
  const first = assistFirstUlt(slot, meta, env);
  const row = {};
  let lastUlt = 0;
  for (let t = 1; t <= L; t++) {
    const v = p.slice((t - 1) * apt, t * apt).join('');
    if (kind === 'default') {
      if (v !== base.slice((t - 1) * apt, t * apt).join('') || (apt === 1 && v !== '평')) row[t] = v;
    } else {
      const fill = kind === 'basic' ? '평' : cycleFill(t, lastUlt, meta, env, first);
      if (v === '궁' || v === '방' || v !== fill) row[t] = v;
      if (v === '궁') lastUlt = t;
    }
  }
  if (marker && !Object.keys(row).length) row[1] = p.slice(0, apt).join('');
  return row;
}
/**
 * 엔진에 보낼 편성 — 핀이 있는 동료는 v1 '직접 계획' 모양의 가상 슬롯({usePlan:true, plan:줄})으로 바꾼다.
 * payload.slotPayload·fedPayload·imbueonUltTurns 를 그대로 재사용하기 위한 내부 표현(상태에 저장하지 않는다).
 * 핀이 없는 동료에 남은 옛 usePlan/plan 은 무시한다(읽기 호환은 applySnap 이 처리).
 */
export function effectiveTeam(team, pins, turns, env = ENV0) {
  return (team || []).map((s, i) => {
    if (!s) return null;
    const n = { ...s };
    delete n.usePlan; delete n.plan;
    // [2026-09-28 #27] 핀이 없어도 성공 가정이 첫 필살기를 당기면 당겨진 리듬의 줄을 보낸다(엔진 변경 없이 '자동 + 성공 가정' 구현).
    //   전에는 핀 없는 동료는 줄을 보내지 않아 엔진이 가정을 쓰지 않았다(자동 리듬 4·7·10 그대로 — 제단 앞당김을 모름).
    //   임부언이 추가 행동을 주는 1번 자리 캐리(fed carry)는 제외 — 엔진은 줄이 있으면 캐리의 '평' 토큰을 지켜 궁 체인이 바뀐다.
    const row = pinsRowOf(pins, i + 1);
    const fedCarry = i === 0 && s.id !== IMBUEON_ID && (team || []).some((x) => x && x.id === IMBUEON_ID);
    const line = lineFromPins(s, row, turns, env)
      || (!fedCarry && assistPulls(s, env.chars[s.id] || {}, env) ? lineFromPins(s, row, turns, env, { always: true }) : null);
    if (line) { n.usePlan = true; n.plan = line; n.rotation = line.join(''); } else n.rotation = '';
    return n;
  });
}
/**
 * v1 스냅샷의 행동 계획 → v2.1 상태(읽기 호환). 입력을 바꾸지 않는다.
 *   · usePlan + plan → 그 동료의 핀(pinsFromPlan, marker) · 슬롯에서 usePlan/plan 제거, rotation ''
 *   · advOn=true + turnPlans → locked(그 턴들 그대로 — 정보 손실 없음). advOn=false 로 남아 있던 turnPlans 는 버린다(v1 에서도 무시되던 값).
 *   · strict/asap/fixed 는 ult 그대로(방식 select 에 드러난다).
 * pins/locked 가 이미 있으면(v2.1 스냅샷) 그것이 우선한다. → { team, pins, locked }
 */
export function adoptLegacyPlans(team, { advOn = false, turnPlans = null, turns = 30, env = ENV0, pins = null, locked = null } = {}) {
  let outPins = sortPins(pins || {});
  const outTeam = (team || []).map((s, i) => {
    if (!s) return null;
    const n = JSON.parse(JSON.stringify(s));
    if (n.usePlan && Array.isArray(n.plan) && n.plan.length) {
      const row = pinsFromPlan(n, n.plan, turns, env, { marker: true });
      outPins = withPinsRow(outPins, i + 1, { ...row, ...pinsRowOf(outPins, i + 1) });
    }
    delete n.usePlan; delete n.plan;
    n.rotation = '';
    return n;
  });
  const outLocked = sortLocked(locked || {});
  if (advOn && turnPlans && typeof turnPlans === 'object') {
    Object.keys(turnPlans).forEach((t) => { if (!outLocked[t] && Array.isArray(turnPlans[t])) outLocked[t] = turnPlans[t].map((e) => ({ p: e.p, a: e.a })); });
  }
  return { team: outTeam, pins: outPins, locked: sortLocked(outLocked) };
}
/**
 * 프리셋 → 그 동료의 새 핀 줄(교체용). 기존 프리셋 함수(presetTarget)로 계획을 만든 뒤 pinsFromPlan 으로 최소 핀만 찍는다
 * (궁·방 칸 + 규칙 채움과 다른 평 칸 — 보통 공격은 규칙과 같으면 핀으로 찍지 않는다).
 * 'reflow'(간격 맞추기)는 지금 줄(핀 + 규칙 채움)을 기준으로 다시 놓는다. → row | null(이 동료에게 불가)
 */
export function presetPinsRow(name, slot, i, team, pins, turns, env = ENV0) {
  const meta = env.chars[slot.id] || {};
  if (!presetAvailable(name, meta, env)) return null;
  const eff = effectiveTeam(team, pins, turns, env);
  let target;
  if (name === 'reflow') {
    const line = eff[i].plan || defaultPlan(meta, lineTurns(turns), env);
    target = reflowFromFirst(line.slice(), meta, env);
  } else target = presetTarget(name, eff[i], i, eff, turns, env);
  if (!target) return null;
  return pinsFromPlan(slot, target, turns, env);
}
/** 지금 줄(핀 + 규칙 채움, 쿨타임 반영 — 직접 지정 줄에 보이는 그대로)을 줄 길이(lineTurns)만큼. 턴당 행동 수만큼의 토큰 배열. */
function shownLine(i, team, pins, turns, env) {
  const eff = effectiveTeam(team, pins, turns, env);
  return planView(eff[i], i, eff, lineTurns(turns), env).view;
}
/**
 * 「모두 보통 공격」「모두 방어」(v1 모두 평타·모두 방어): 지금 줄에서 필살기 칸은 그대로 두고 나머지 행동을 모두 action 으로.
 * 턴당 2회 동료는 필살기가 아닌 행동 칸 전부. → 새 핀 줄(교체용)
 */
export function fillRowPins(slot, i, team, pins, turns, action, env = ENV0) {
  const plan = shownLine(i, team, pins, turns, env).map((a) => (a === '궁' ? '궁' : action));
  return pinsFromPlan(slot, plan, turns, env);
}
/**
 * 패턴 반복: 지금 줄의 from~to 턴 행동을 to 다음 턴부터 줄 끝까지 같은 순서로 반복(필살기 포함). from 앞 턴은 그대로.
 * 쿨타임이 안 돌아온 턴에 놓인 필살기는 엔진 규칙대로(보통 공격 대체 → 준비되면 사용) 실행된다. → 새 핀 줄 | null(구간 오류)
 */
export function repeatRowPins(slot, i, team, pins, turns, from, to, env = ENV0) {
  const L = lineTurns(turns), apt = (env.chars[slot.id] || {}).actionsPerTurn || 1;
  const a = Math.round(+from), b = Math.round(+to);
  if (!(a >= 1 && b >= a && b < L)) return null;
  const line = shownLine(i, team, pins, turns, env);
  const plan = line.slice(0, L * apt);
  const len = b - a + 1;
  for (let t = b + 1; t <= L; t++) {
    const src = a + ((t - a) % len);
    for (let k = 0; k < apt; k++) plan[(t - 1) * apt + k] = line[(src - 1) * apt + k] || '평';
  }
  return pinsFromPlan(slot, plan, turns, env);
}
/**
 * 필살기 칸 고정의 동료별 규칙(v1 renderPlanner onclick 이식 — 핀 버전). 칸을 '필살기'로 고정할 때 UI 가 먼저 부른다.
 *   · 방어로 CD 가 주는 동료(cdDefendReduce: 모이루·히토하): 그 턴에 필살기가 나가도록 앞 턴을 방어로 자동 배치(enforceCdDefend).
 *     어떤 구성으로도 불가하면 'impossible'(칸을 바꾸지 않는다). 확률 CD 감소 성공 가정만으로 되면 방어 없이 고정.
 *   · 전투당 1회 필살기(singleUlt: 제토): 다른 턴의 필살기 고정을 푼다.
 *   · 그 밖(턴당 2회 포함): 'plain' — 호출부가 칸 하나만 고정한다(종전 동작).
 * → { status: 'plain'|'ok'|'defended'|'single'|'impossible', row?(그 동료의 새 핀 줄 — 기존 핀 중 결과와 같은 칸은 유지),
 *     reason?: 'stack'|'cd'|'overlap', defs?: [방어로 바꾼 턴] }. turn 1-based, i = 0-based 자리.
 */
export function pinUltRow(slot, i, team, pins, turns, turn, env = ENV0) {
  const meta = env.chars[slot.id] || {};
  const apt = meta.actionsPerTurn || 1;
  const row0 = pinsRowOf(pins, i + 1);
  if (apt !== 1) return { status: 'plain' };
  if (meta.singleUlt) {
    const row = {};
    Object.keys(row0).forEach((t) => { if (row0[t] !== '궁' || +t === turn) row[t] = row0[t]; });
    row[turn] = '궁';
    return { status: Object.keys(row0).some((t) => row0[t] === '궁' && +t !== turn) ? 'single' : 'ok', row };
  }
  if (!(meta.cdDefendReduce > 0)) return { status: 'plain' };
  const L = lineTurns(turns);
  const eff = effectiveTeam(team, pins, turns, env);
  const plan = (eff[i].plan && eff[i].plan.length ? eff[i].plan : defaultPlan(meta, L, env)).slice(0, L);
  padPlan(plan, meta, L, env);
  const ab = allyBasicCounts(eff, i, L, env);
  const src = cdAssistSrc(slot, meta, env);
  const immune = immuneFor(eff[i], i, eff, L, env);
  const before = plan.slice();
  plan[turn - 1] = '궁';
  if (ultAvail(plan, meta, ab, src, env, immune)[turn - 1]) return { status: 'plain' };   // 방어 없이도 그 턴에 준비됨(예: 기본 리듬의 필살기 턴)
  const def = enforceCdDefend(plan, meta, turn, ab, src, env, immune);
  if (def === false) return { status: 'impossible', reason: meta.cdDefendPerStack ? 'stack' : 'cd' };
  // 사용자가 고정한 앞선 필살기를 방어로 덮어야만 되는 턴은 불가(규칙 채움의 필살기는 v1 처럼 방어로 바뀌어도 된다)
  for (let k = 0; k < turn - 1; k++) if (row0[k + 1] === '궁' && plan[k] !== '궁') return { status: 'impossible', reason: 'overlap' };
  normalizePlan(plan, meta, ab, src, env, immune);
  if (plan[turn - 1] !== '궁') return { status: 'impossible', reason: meta.cdDefendPerStack ? 'stack' : 'cd' };
  const row = pinsFromPlan(slot, plan, turns, env);
  Object.keys(row0).forEach((t) => { if (!row[t] && plan[t - 1] === row0[t]) row[t] = row0[t]; });   // 결과와 같은 기존 고정은 표시 유지
  const defs = [];
  for (let k = 0; k < turn - 1; k++) if (plan[k] === '방' && before[k] !== '방') defs.push(k + 1);
  return { status: def && defs.length ? 'defended' : 'ok', row, defs };
}

// ── 방탈출 제단: 쿨감 제단 스위치 (§9 quickCd) ───────────────────────────
/** 달의 제단 id(altars.json 과 같은 값 — tests/pins.test.js 가 대조). 나머지 id 는 별의 제단. */
export const ALTAR_MOON_IDS = Object.freeze({ 1: [1011, 1012, 1013], 2: [1014, 1015, 1016, 1017], 3: [1018, 1019, 1020, 1021, 1022] });
/** 쿨감 제단만: 전 층 사용 · 별 제단 전부 점등(off 없음) · 달 제단은 1012·1013 만 점등. */
export function quickCdAltar() {
  const floors = {};
  ALTAR_FLOORS.forEach((f) => {
    const off = {};
    ALTAR_MOON_IDS[f].forEach((id) => { if (!ALTAR_CD_PROC_IDS.includes(id)) off[id] = true; });
    floors[f] = { on: true, off };
  });
  return { on: true, floors };
}
/** 제단이 정확히 '쿨감 제단만' 구성인가. */
export function isQuickCdAltar(altar) {
  if (!altar || !altar.on) return false;
  const q = quickCdAltar();
  return ALTAR_FLOORS.every((f) => {
    const c = altar.floors && altar.floors[f];
    if (!c || c.on === false) return false;
    const a = Object.keys(c.off || {}).filter((k) => c.off[k]).map(Number).sort((x, y) => x - y);
    const b = Object.keys(q.floors[f].off).map(Number).sort((x, y) => x - y);
    return a.length === b.length && a.every((x, k) => x === b[k]);
  });
}

// ── 기본값 · 파생(목업 아코디언 요약 / 변경 표식 / 행동 순서) ─────────────
/** 전투 조건 기본값. 적 공격 대상 수 기본 = 'all'(2026-09-28 사용자 지시, v1 초기값 '5'에서 변경 — 코덱 트림 기본값도 'all'이라 저장값 판독은 그대로). */
export const COND_DEFAULTS = Object.freeze({ runs: 50, turns: 30, dummyElement: 0, dummies: 1, enemyHits: 'all',
  forceProc: false, hp10: false, incomingOn: false, incomingPct: 30 });

const validGroups = (gs) => normalizeSyncGroups(gs).filter((g) => g.anchor && g.members.length);
const overrideTurns = (state) => Object.keys(state.overrides || {}).map(Number)
  .filter((t) => Array.isArray(state.overrides[t]) && state.overrides[t].length && t <= +state.cond.turns).sort((a, b) => a - b);

/** 기본 행동 순서(우선순위) → [{ pos, id, name }]. */
export function deriveOrderSlots(state) {
  return teamOrder(state.team, state.chars).map((o) => ({ pos: o.i + 1, id: o.s.id, name: (state.chars[o.s.id] || {}).name || String(o.s.id) }));
}
/** 행동 순서 이름 배열(chars 의 name = kr). 다국어 이름은 UI가 id 로 다시 찾는다. */
export const deriveOrder = (state) => deriveOrderSlots(state).map((o) => o.name);

/**
 * 아코디언 요약 — 문자열이 아니라 { key, vars } 로 돌려주고 i18n(t)이 조립한다.
 * 키 목록은 core/README.md §요약 키.
 */
export const summary = Object.freeze({
  order(state) {
    const slots = deriveOrderSlots(state);
    if (!slots.length) return { key: 'plan.sum.order.empty', vars: {} };
    const locked = lockedWithin(state.locked, state.cond.turns);
    if (Object.keys(locked).length && isFullyLocked(locked, state.cond.turns)) return { key: 'plan.sum.order.manual', vars: { n: Object.keys(locked).length } };
    const modes = slots.map((o) => ultModeOf(state.team[o.pos - 1]));
    return { key: 'plan.sum.order', vars: { ids: slots.map((o) => o.id), names: slots.map((o) => o.name), positions: slots.map((o) => o.pos), modes,
      custom: modes.filter((m) => m !== 'auto').length, pins: pinCount(state.pins), locked: Object.keys(locked).length } };
  },
  exceptions(state) {
    const turns = overrideTurns(state);
    return turns.length ? { key: 'plan.sum.exceptions', vars: { n: turns.length, turns } } : { key: 'plan.sum.exceptions.none', vars: {} };
  },
  sync(state) {
    const gs = validGroups(state.sync);
    if (!gs.length) return { key: 'plan.sum.sync.none', vars: {} };
    return { key: 'plan.sum.sync', vars: { n: gs.length, anchors: gs.map((g) => g.anchor), members: gs.reduce((a, g) => a + g.members.length, 0) } };
  },
  cond(state) {
    const c = state.cond;
    return { key: c.forceProc && !(state.altar && state.altar.on) ? 'cond.sum.forced' : 'cond.sum', vars: {
      turns: +c.turns, runs: +c.runs, dummies: +c.dummies, enemyHits: String(c.enemyHits), dummyElement: +c.dummyElement,
      hp10: !!c.hp10, incoming: c.incomingOn ? +c.incomingPct : 0 } };
  },
  tdmg(state) {
    const t = state.tdmg;
    if (!t || !t.on) return { key: 'cond.tdmg.sum.off', vars: {} };
    const n = Math.max(1, +state.cond.turns || 30);
    const vals = [];
    for (let k = 1; k <= n; k++) {
      const v = t.adv && t.per && t.per[k] != null && t.per[k] !== '' && Number.isFinite(+t.per[k]) ? Math.max(0, Math.min(99, Math.round(+t.per[k]))) : t.pct;
      vals.push(v);
    }
    const min = Math.min(...vals), max = Math.max(...vals), hits = Math.max(1, Math.min(5, +t.hits || 5));
    return { key: min === max ? 'cond.tdmg.sum' : 'cond.tdmg.sum.range', vars: { pct: t.pct, min, max, hits } };
  },
  altar(state) {
    const a = state.altar;
    if (!a || !a.on) return { key: 'cond.altar.sum.off', vars: {} };
    let floors = 0;
    for (const f of ALTAR_FLOORS) { const v = a.floors && a.floors[f]; if (v && v.on !== false) floors = f; else break; }
    const off = ALTAR_FLOORS.slice(0, floors).reduce((s, f) => s + Object.keys((a.floors[f] && a.floors[f].off) || {}).length, 0);
    return { key: 'cond.altar.sum', vars: { floors, off, cdPlus: cdPlusOf(a), procIds: altarProcCdActive(a) } };
  },
});

/** 변경 표식 — 기본값이면 true. */
export const isDefault = Object.freeze({
  order: (state) => !(state.team || []).some((s) => s && s.priority != null),
  ults: (state) => !(state.team || []).some((s) => s && ultModeOf(s) !== 'auto'),
  ult: (slot) => !slot || (ultModeOf(slot) === 'auto' && ultIsDefault(ultOf(slot)) && !slot.allyUltAfter),
  step1: (state) => isDefault.order(state) && (state.team || []).every((s) => isDefault.ult(s)),
  exceptions: (state) => overrideTurns(state).length === 0,
  sync: (state) => validGroups(state.sync).length === 0,
  pins: (state) => pinCount(state.pins) === 0,
  locked: (state) => Object.keys(state.locked || {}).length === 0,
  plan: (state) => isDefault.step1(state) && isDefault.exceptions(state) && isDefault.sync(state) && isDefault.pins(state) && isDefault.locked(state),
  cond: (state) => Object.keys(COND_DEFAULTS).every((k) => (k === 'incomingPct' && !state.cond.incomingOn) || String(state.cond[k]) === String(COND_DEFAULTS[k])),
  tdmg: (state) => !(state.tdmg && state.tdmg.on),
  altar: (state) => !(state.altar && state.altar.on),
});

/** v2.1: 규칙·핀·잠긴 턴은 항상 함께 쓴다 — 패널을 잠그지 않는다. 잠긴 턴 목록만 준다(격자의 자물쇠 열). */
export const lockState = (state) => ({ order: false, exceptions: false, plans: false,
  turns: Object.keys(lockedWithin(state.locked, state.cond.turns)).map(Number) });
