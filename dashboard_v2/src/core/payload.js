/**
 * core/payload.js — 엔진 페이로드 조립 (v1 app.js 이식).
 *   · planRotation/fedPayload/slotPayload L3740-3773, specPayload(core/spec.js)
 *   · ultPayload L3210 · altarPayload L3363 · tdmgPayload L2913 · syncPayload L3265
 *   · buildCfg = run() L4626-4638 / advCfg() L1707-1738(프로브) + v2.1 핀·잠긴 턴(§9) · buildCompareCfg = cfgFromTeam() L654-669
 * 입력은 스토어 state(또는 같은 모양의 객체)다. DOM을 읽지 않는다.
 */
import { specPayload } from './spec.js';
import { padPlan, taehoFedTurns, ultOf, ultIsDefault, syncPayloadOf, ALTAR_FLOORS, ENV0, makeEnv, effectiveTeam, lockedWithin, isFullyLocked } from './plan.js';

export { specPayload, syncPayloadOf };

/** 궁극기 사용 방식 — 기본(fixed·방어 유지·가정 끔)이면 null. */
export function ultPayload(s) { const u = ultOf(s); return ultIsDefault(u) ? null : u; }

/** 줄(rotation)이 있는 슬롯(v1 직접 계획 · v2.1 effectiveTeam 가상 슬롯)의 rotation 문자열(턴 수보다 짧으면 사본에 기본 주기로 이어 붙임). */
export function planRotation(s, turns, env = ENV0) {
  if (!s || !s.usePlan || !(s.plan && s.plan.length)) return null;
  const meta = env.chars[s.id] || {};
  const plan = s.plan.slice();
  padPlan(plan, meta, Math.max(1, +turns || 30), env);
  return plan.join('');
}
/** 이태호 fed 추가 행동 — 줄이 있고(핀이 있는 동료), 지금 보이는 fed 턴(임부언 궁 턴)만. */
export function fedPayload(s, roster, turns, env = ENV0) {
  if (!s || !s.usePlan || !s.fedActions) return null;
  const ft = taehoFedTurns(s, roster, Math.max(1, +turns || 30), env);
  if (!ft) return null;
  const out = {};
  Object.entries(s.fedActions).forEach(([t, v]) => { if (v && ft.has(+t)) out[t] = v; });
  return Object.keys(out).length ? out : null;
}
/** adv = 전 턴 잠김(v1 완전 수동) → 동료별 줄·우선순위는 보내지 않는다. */
export function slotPayload(s, pos, roster, turns, adv, env = ENV0) {
  return {
    id: s.id, position: pos, skill: s.skill, rune: s.rune,
    rotation: adv ? null : planRotation(s, turns, env),
    fedActions: fedPayload(s, roster, turns, env),
    allyUltAfter: !!s.allyUltAfter,
    priority: adv ? null : (s.priority ?? null),
    sealAtk: s.sealOn ? (s.sealAtk ?? 0) : 0, sealHp: s.sealOn ? (s.sealHp ?? 0) : 0,
    ult: ultPayload(s),
    ...specPayload(s),
  };
}

/** 제단: OFF면 null, ON이면 { on:true, floors:{1:{on, off:[id…]}} }. altar = state.altar. */
export function altarPayload(altar) {
  if (!altar || !altar.on) return null;
  const floors = {};
  ALTAR_FLOORS.forEach((f) => {
    const c = (altar.floors && altar.floors[f]) || { on: true, off: {} };
    floors[f] = { on: c.on !== false, off: Object.keys(c.off || {}).map(Number).filter((n) => n > 0).sort((a, b) => a - b) };
  });
  return { on: true, floors };
}

export const tdmgClamp = (v) => Math.max(0, Math.min(99, Math.round(+v || 0)));
/** 현재 턴 수 안의 유효한 턴별 값 {턴: %}. */
export function tdmgPerClean(tdmg, turns) {
  const n = Math.max(1, +turns || 30), out = {};
  Object.entries((tdmg && tdmg.per) || {}).forEach(([t, v]) => {
    const tt = +t;
    if (tt >= 1 && tt <= n && v !== '' && v != null && Number.isFinite(+v)) out[tt] = tdmgClamp(v);
  });
  return out;
}
/** 턴 피해: OFF면 null, ON이면 { on:true, pct, per?, hits?(5 미만만) }. */
export function tdmgPayload(tdmg, turns) {
  if (!tdmg || !tdmg.on) return null;
  const out = { on: true, pct: tdmg.pct };
  if (tdmg.adv) { const per = tdmgPerClean(tdmg, turns); if (Object.keys(per).length) out.per = per; }
  const hits = Math.max(1, Math.min(5, +tdmg.hits || 5));
  if (hits < 5) out.hits = hits;
  return out;
}

/**
 * 메인 실행/프로브 cfg (ARCHITECTURE §9 — 규칙 + 핀 + 잠긴 턴).
 *   mode 'rules' = 핀·잠긴 턴 없이 규칙만(프로브 조건: 확률 100%·1회). "규칙이라면 어떻게 되나" 표시용.
 *   mode 'probe' = 규칙 + 핀(동료별 줄) + 잠긴 턴, 확률 100%·1회 고정(결정론) — v1 advCfg() 자리. plansOverride = 잠긴 턴 대신 시험할 {턴:[…]}.
 *   mode 'run'   = 규칙 + 핀 + 잠긴 턴, 실제 조건(forceProc·runs) — v1 run().
 * 핀은 effectiveTeam 이 동료별 rotation 으로 구체화하고, 잠긴 턴(현재 턴 수 안)은 turnPlans 로 보낸다.
 * 1..turns 가 전부 잠겼으면 v1 완전 수동과 같은 페이로드(rotation·priority null, turnOrders {}).
 * 제단이 켜져 있으면 확률 100%는 쓰지 않는다(v1 syncAltarLock 이 버튼을 막던 규칙).
 */
export function buildCfg(state, { mode = 'run', plansOverride = null } = {}) {
  const env = makeEnv({ chars: state.chars, altar: state.altar });
  const c = state.cond;
  const turns = +c.turns;
  const rules = mode === 'rules';
  const probe = mode === 'probe' || rules;
  const team = rules ? effectiveTeam(state.team, {}, turns, env) : effectiveTeam(state.team, state.pins, turns, env);
  const plans = rules ? {} : lockedWithin(plansOverride || state.locked, turns);
  const adv = Object.keys(plans).length > 0 && isFullyLocked(plans, turns);
  const cfg = {
    team: team.map((s, i) => s && slotPayload(s, i + 1, team, turns, adv, env)).filter(Boolean),
    turns, dummies: +c.dummies, enemyHits: String(c.enemyHits), dummyElement: +c.dummyElement,
    turnOrders: adv ? {} : state.overrides,
    turnPlans: plans,
  };
  if (probe) {
    Object.assign(cfg, {
      altar: altarPayload(state.altar), sync: syncPayloadOf(state.sync), turnDamage: tdmgPayload(state.tdmg, turns),
      forceProc: true, hp10: !!c.hp10, runs: 1, incomingHpPct: c.incomingOn ? +c.incomingPct : 0,
    });
  } else {
    Object.assign(cfg, {
      forceProc: !!c.forceProc && !(state.altar && state.altar.on), hp10: !!c.hp10, runs: +c.runs,
      incomingHpPct: c.incomingOn ? +c.incomingPct : 0,
      altar: altarPayload(state.altar), sync: syncPayloadOf(state.sync), turnDamage: tdmgPayload(state.tdmg, turns),
    });
  }
  return cfg;
}

/**
 * 팀 비교 한쪽 cfg(v1 cfgFromTeam). side = { roster, turnOv, adv(타임라인|null), advOn, sync }, snap = { turns, runs },
 * common = cmpCommon, shared = { chars, altar, tdmg, mainTurns } (제단·턴 피해는 메인 설정을 양쪽에 공통 적용).
 * v1 호환: 턴 피해의 턴별 값은 **메인** 턴 수(mainTurns) 기준으로 거른다(v1 tdmgPayload 가 #turns 를 읽음).
 */
export function buildCompareCfg(side, snap, common, shared) {
  const env = makeEnv({ chars: shared.chars, altar: shared.altar });
  const roster = side.roster || [];
  const adv = side.advOn ? side.adv : null;
  const altarOn = !!(shared.altar && shared.altar.on);
  const forced = common.forceProc && !altarOn;
  return {
    team: roster.map((t, i) => t && slotPayload(t, i + 1, roster, snap.turns, !!adv, env)).filter(Boolean),
    turns: +snap.turns, turnOrders: adv ? {} : (side.turnOv || {}), turnPlans: adv || {},
    dummies: common.dummies, enemyHits: common.enemyHits, dummyElement: common.dummyElement,
    forceProc: forced, hp10: common.hp10, runs: forced ? 1 : +(snap.runs || 50),
    incomingHpPct: common.incomingOn ? common.incomingPct : 0,
    altar: altarPayload(shared.altar),
    sync: syncPayloadOf(side.sync),
    turnDamage: tdmgPayload(shared.tdmg, shared.mainTurns ?? snap.turns),
  };
}
