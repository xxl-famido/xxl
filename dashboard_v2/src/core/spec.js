/**
 * core/spec.js — 동료 육성 스펙(스탯 공식·성급 해금) + 슬롯 스펙 읽기 도우미.
 *
 * `legacy/spec.v1.js`(= woofia_sim/stats.py 이식본)를 ES 모듈로 옮기고, app.js L306-319
 * (promoteLegacySpec)·L3698-3783(specOf/specOn/specInv/specLevel/specAtkHp/specPayload)을 합쳤다.
 * 공식을 고치면 tools/statcheck.js 골든값과 다시 대조할 것.
 */

export const MAX_LEVEL = 60;
export const MAX_EVO = 5;
const LEVEL_GROWTH_BASE = 1.05;
export const RUNE_UNLOCK_STAR = 3;
export const PASSIVE_COUNT = 5;
const RUNE_COEF = { 1: 0, 2: 0, 3: 0.03, 4: 0.04 };
const SIGIL_TABLE = [[60, 1000], [55, 900], [50, 800], [45, 700], [40, 600],
  [35, 500], [30, 400], [25, 300], [20, 200], [15, 100]];

function clamp(v, lo, hi) {
  v = Math.floor(Number(v));
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : (v > hi ? hi : v);
}
export const runeCoef = (rarity) => RUNE_COEF[rarity] || 0;
export function sigilCap(evo, rarity, level) {
  if (evo < 3) return 0;
  if (rarity !== 3 && rarity !== 4) return 0;
  for (const [lv, cap] of SIGIL_TABLE) if (level > lv - 1) return cap;
  return 0;
}
export const pevoCap = (evo) => (evo >= MAX_EVO ? 0 : (evo + 1) * 5 - 1);
export function unlockedPassives(evo) { evo = clamp(evo, 0, MAX_EVO); return evo < 3 ? 2 : evo; }
export function levelablePassives(evo) { evo = clamp(evo, 0, MAX_EVO); return evo < 2 ? 1 : evo; }
export const canUnlockRune = (evo) => clamp(evo, 0, MAX_EVO) >= RUNE_UNLOCK_STAR;
/** 'open'(레벨업 가능) | 'pinned'(1레벨 고정) | 'locked'(미해방) */
export function slotState(slot, evo) {
  if (slot === 'basicAtk' || slot === 'ultimate') return 'open';
  if (slot === 'sigil') return canUnlockRune(evo) ? 'open' : 'locked';
  const m = /^passive(\d)$/.exec(slot);
  if (!m) return 'open';
  const i = +m[1];
  if (i >= unlockedPassives(evo)) return 'locked';
  return i < levelablePassives(evo) ? 'open' : 'pinned';
}
export function normalize(inv) {
  const evo = clamp((inv && inv.evo) != null ? inv.evo : MAX_EVO, 0, MAX_EVO);
  return {
    level: clamp((inv && inv.level) != null ? inv.level : MAX_LEVEL, 1, MAX_LEVEL),
    evo,
    pevo: clamp((inv && inv.pevo) || 0, 0, pevoCap(evo)),
    sigil: Math.max(0, Math.floor((inv && inv.sigil) || 0)),
    compat: Math.max(0, Math.floor((inv && inv.compat) != null ? inv.compat : 5)),
  };
}
export function scaleStat(base, rarity, inv) {
  inv = normalize(inv);
  const sigilFlat = Math.min(inv.sigil, sigilCap(inv.evo, rarity, inv.level));
  const v = 0.02 * inv.pevo + 0.10 * (inv.evo * (inv.evo + 1) / 2);
  const ue = inv.compat * runeCoef(rarity);
  const mult = Math.pow(LEVEL_GROWTH_BASE, Math.max(0, inv.level - 1));
  return Math.floor((base + sigilFlat) * mult * (1 + v) * (1 + ue));
}
export const scaleAtkHp = (baseAtk, baseHp, rarity, inv) => [scaleStat(baseAtk, rarity, inv), scaleStat(baseHp, rarity, inv)];

/** v1 전역 `SPEC` 과 같은 모양(UI가 한 이름으로 쓰도록). */
export const SPEC = Object.freeze({
  MAX_LEVEL, MAX_EVO, PASSIVE_COUNT, RUNE_UNLOCK_STAR,
  runeCoef, sigilCap, pevoCap, unlockedPassives, levelablePassives,
  canUnlockRune, slotState, normalize, scaleStat, scaleAtkHp,
});

// ── 슬롯 스펙 (app.js L3698-3783) ────────────────────────────────────────
export const SPEC_SLOTS = Object.freeze(['basicAtk', 'ultimate', 'sigil',
  'passive0', 'passive1', 'passive2', 'passive3', 'passive4']);
export const SPEC_FULL = Object.freeze({ level: 60, evo: 5, pevo: 0, compat: 5 });
export const SPEC_NEED = Object.freeze({ sigil: 3, passive2: 3, passive3: 4, passive4: 5 });
export const SPEC_NEED_LV = Object.freeze({ passive1: 2 });

/** 편집용 — 없으면 만든다(슬롯을 바꾼다). 읽기 경로에서는 쓰지 말 것. */
export function specOf(s) {
  if (!s.spec) s.spec = { on: false, ...SPEC_FULL, lv: {} };
  if (!s.spec.lv) s.spec.lv = {};
  return s.spec;
}
export const specOn = (s) => !!(s && s.spec && s.spec.on);
/** 엔진에 보낼 투자값. 꺼져 있으면 풀육성(읽기 전용). */
export function specInv(s) {
  const p = s && s.spec;
  return (p && p.on) ? { level: p.level, evo: p.evo, pevo: p.pevo, compat: p.compat } : { ...SPEC_FULL };
}
export const specEvo = (s) => specInv(s).evo;
export const specRune = (s) => (specOn(s) ? (s.rune !== false && canUnlockRune(specEvo(s))) : true);
export const specSlotState = (s, slot) => slotState(slot, specEvo(s));
/** 슬롯 실효 레벨 — 레벨업이 잠긴 패시브는 1(엔진과 같은 규칙). */
export function specLevel(s, slot) {
  if (specSlotState(s, slot) === 'pinned') return 1;
  if (!specOn(s)) return 10;
  const v = (s.spec.lv || {})[slot];
  return v == null ? 10 : Math.max(1, Math.min(10, v));
}
/** 도장 강화 가산 전 기본 ATK/HP. chars = id→meta. */
export function specAtkHp(s, chars = {}) {
  const c = chars[s.id] || {};
  if (c.baseATK == null) return [c.atk || 0, c.hp || 0];
  return scaleAtkHp(c.baseATK, c.baseHP, c.rarity, specInv(s));
}
/** 서버로 보낼 스펙 조각. 꺼져 있으면 { specOn:false } = 풀육성. v1 `specPayload`(specOf 부작용 포함). */
export function specPayload(s) {
  if (!specOn(s)) return { specOn: false };
  const p = specOf(s);
  const lv = {};
  SPEC_SLOTS.forEach((k) => { lv[k] = specLevel(s, k); });
  return { specOn: true, level: p.level, evo: p.evo, pevo: p.pevo, compat: p.compat, skillLevels: lv };
}
/**
 * 스펙 설정 이전 기록 승격(v1 `promoteLegacySpec`) — 스킬 레벨·도장 해제가 기본값이 아니던 옛 슬롯은
 * 스펙을 켠 상태로 옮겨 담아야 예전 결과가 재현된다. 슬롯을 제자리에서 바꾸고 그대로 돌려준다.
 */
export function promoteLegacySpec(s) {
  if (!s || s.spec) return s;
  const skill = s.skill ?? 10, rune = s.rune !== false;
  if (skill === 10 && rune) return s;
  s.spec = { on: true, ...SPEC_FULL, lv: {} };
  if (skill !== 10) SPEC_SLOTS.forEach((k) => { s.spec.lv[k] = skill; });
  return s;
}
