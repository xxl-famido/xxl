/**
 * 캐릭터 육성 스펙 — 스탯 공식과 성급별 해금 규칙.
 *
 * woofia_sim/stats.py 의 이식본이다. 스펙 패널이 슬라이더를 끌 때마다 서버를
 * 왕복하지 않으려고 클라이언트에도 둔 것이라, **두 구현이 어긋나면 표시값과
 * 실제 시뮬 결과가 달라진다**. tools/statcheck.js 가 파이썬이 만든 골든값과
 * 전수 대조하므로, 이 파일을 고치면 반드시 그 검사를 돌릴 것.
 *
 * 원본 공식은 sectionhunk.moe 클라이언트 번들에서 확인했고 파미도 Lv60
 * (ATK 9,891 / HP 39,937) 로 검증했다.
 */
(function (root) {
  'use strict';

  var MAX_LEVEL = 60;
  var MAX_EVO = 5;
  var LEVEL_GROWTH_BASE = 1.05;
  var RUNE_UNLOCK_STAR = 3;
  var PASSIVE_COUNT = 5;

  // 희귀도별 도장 궁합 계수 (사이트 ye)
  var RUNE_COEF = { 1: 0, 2: 0, 3: 0.03, 4: 0.04 };
  // 시길 플랫 보너스 상한: 레벨이 넘긴 가장 높은 문턱이 이긴다 (사이트 ve)
  var SIGIL_TABLE = [[60, 1000], [55, 900], [50, 800], [45, 700], [40, 600],
                     [35, 500], [30, 400], [25, 300], [20, 200], [15, 100]];

  function clamp(v, lo, hi) {
    v = Math.floor(Number(v));
    if (!isFinite(v)) return lo;
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function runeCoef(rarity) { return RUNE_COEF[rarity] || 0; }

  function sigilCap(evo, rarity, level) {
    if (evo < 3) return 0;
    if (rarity !== 3 && rarity !== 4) return 0;
    for (var i = 0; i < SIGIL_TABLE.length; i++) {
      if (level > SIGIL_TABLE[i][0] - 1) return SIGIL_TABLE[i][1];
    }
    return 0;
  }

  /** 성급 안에서 밟을 수 있는 진화 단계 상한. ★5는 더 없음. */
  function pevoCap(evo) { return evo >= MAX_EVO ? 0 : (evo + 1) * 5 - 1; }

  // ── 성급별 해금 (게임 TCharacterStarData) ─────────────────────────────
  // ★0·★1 p0·p1 해방 / 레벨업은 p0 만 · ★2 p1 렙업 · ★3 p2+도장 · ★4 p3 · ★5 p4
  // 평타·필살기는 성급과 무관하게 항상 레벨업 가능하다.
  function unlockedPassives(evo) { evo = clamp(evo, 0, MAX_EVO); return evo < 3 ? 2 : evo; }
  function levelablePassives(evo) { evo = clamp(evo, 0, MAX_EVO); return evo < 2 ? 1 : evo; }
  function canUnlockRune(evo) { return clamp(evo, 0, MAX_EVO) >= RUNE_UNLOCK_STAR; }

  /** 슬롯이 이 성급에서 어떤 상태인지: 'open'(렙업 가능) | 'pinned'(1레벨 고정) | 'locked'(미해방) */
  function slotState(slot, evo) {
    if (slot === 'basicAtk' || slot === 'ultimate') return 'open';
    if (slot === 'sigil') return canUnlockRune(evo) ? 'open' : 'locked';
    var m = /^passive(\d)$/.exec(slot);
    if (!m) return 'open';
    var i = +m[1];
    if (i >= unlockedPassives(evo)) return 'locked';
    return i < levelablePassives(evo) ? 'open' : 'pinned';
  }

  function normalize(inv) {
    var evo = clamp((inv && inv.evo) != null ? inv.evo : MAX_EVO, 0, MAX_EVO);
    return {
      level: clamp((inv && inv.level) != null ? inv.level : MAX_LEVEL, 1, MAX_LEVEL),
      evo: evo,
      pevo: clamp((inv && inv.pevo) || 0, 0, pevoCap(evo)),
      sigil: Math.max(0, Math.floor((inv && inv.sigil) || 0)),
      compat: Math.max(0, Math.floor((inv && inv.compat) != null ? inv.compat : 5)),
    };
  }

  /** 기본값 하나를 최종 표시 스탯으로. ATK·HP에 같은 배수가 걸린다. */
  function scaleStat(base, rarity, inv) {
    inv = normalize(inv);
    var sigilFlat = Math.min(inv.sigil, sigilCap(inv.evo, rarity, inv.level));
    var v = 0.02 * inv.pevo + 0.10 * (inv.evo * (inv.evo + 1) / 2);
    var ue = inv.compat * runeCoef(rarity);
    var mult = Math.pow(LEVEL_GROWTH_BASE, Math.max(0, inv.level - 1));
    return Math.floor((base + sigilFlat) * mult * (1 + v) * (1 + ue));
  }

  function scaleAtkHp(baseAtk, baseHp, rarity, inv) {
    return [scaleStat(baseAtk, rarity, inv), scaleStat(baseHp, rarity, inv)];
  }

  var API = {
    MAX_LEVEL: MAX_LEVEL, MAX_EVO: MAX_EVO, PASSIVE_COUNT: PASSIVE_COUNT,
    RUNE_UNLOCK_STAR: RUNE_UNLOCK_STAR,
    runeCoef: runeCoef, sigilCap: sigilCap, pevoCap: pevoCap,
    unlockedPassives: unlockedPassives, levelablePassives: levelablePassives,
    canUnlockRune: canUnlockRune, slotState: slotState,
    normalize: normalize, scaleStat: scaleStat, scaleAtkHp: scaleAtkHp,
  };

  root.SPEC = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
