#!/usr/bin/env node
/**
 * 피드백 재현 하네스 — node tools/feedback_cases/run.mjs [--only 24] [--no-v1] [--out path] [--conc 3]
 *
 * 1차 판정 = 행동 일치: 케이스의 expectTimeline(턴 → [동료, 행동, 추가 행동]) 을 결과 log 에서 뽑은 같은 모양의
 * 타임라인과 턴 단위로 비교한다. 메커니즘·표시 케이스(kind:'mechanism')는 fn 검사로 판정. 데미지는 참고 열.
 * 상태는 스토어 API로만 만들고 store.buildCfg 로 페이로드를 얻는다(UI와 같은 경로 → core 수정 자동 반영).
 * 출력: docs/redesign/FEEDBACK_CASES.md + tools/feedback_cases/last_run.json. 로컬 전용, 소스·서버 무수정.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const V2 = path.join(ROOT, 'dashboard_v2');
const imp = (p) => import(pathToFileURL(path.join(V2, p)).href);

const { createStore } = await imp('src/core/store.js');
const P = await imp('src/core/plan.js');
const { decodeShare } = await imp('src/core/codec.js');
const { loadV1, CHARS } = await imp('tests/helpers/v1.js');
let UIH = null;
try { UIH = await imp('src/ui/plan-helpers.js'); } catch { UIH = null; }   // assistEffect(UI 활성 규칙) — 없으면 생략
const { CASES, CODES } = await import(pathToFileURL(path.join(HERE, 'cases.mjs')).href);

// ── 인자 ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const ONLY = arg('--only');
const NO_V1 = argv.includes('--no-v1');
const OUT = path.resolve(arg('--out', path.join(ROOT, 'docs', 'redesign', 'FEEDBACK_CASES.md')));
const CONC = Math.max(1, Math.min(6, +arg('--conc', 3) || 3));
const TIMEOUT_MS = 180000;

// ── 서버 ───────────────────────────────────────────────────────────────────
async function post(port, p, cfg) {
  const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`http://localhost:${port}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg), signal: ac.signal });
    if (!r.ok) throw new Error(`${port}${p} HTTP ${r.status}`);
    const j = await r.json();
    if (j && j.error) throw new Error(`${port}${p}: ${j.error}`);
    return j;
  } finally { clearTimeout(tm); }
}
const sim = (port, cfg) => post(port, '/api/simulate', cfg);
const probe = (port, cfg) => post(port, '/api/probe', cfg);
async function alive(port) { try { const r = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(4000) }); return r.status < 500; } catch { return false; } }

// ── 스토어·v1 ───────────────────────────────────────────────────────────────
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const newStore = () => { const st = createStore({ storage: mem(), chars: CHARS }); st.set({ chars: CHARS }); return st; };
const M = (x) => (x == null || !Number.isFinite(x) ? '—' : (x / 1e4).toFixed(1) + '만');

let V1 = null, v1Lock = Promise.resolve();
/** v1 앱(legacy)을 vm에 올려 applySnap → run(false) 페이로드 캡처. 전역 __cap 공유라 직렬화. */
function v1cfg(snap) {
  const job = v1Lock.then(async () => {
    if (!V1) { V1 = loadV1(); V1.exec(`__cap = []; API.simulate = cfg => { __cap.push(JSON.parse(JSON.stringify(cfg))); return Promise.resolve({ error: 'captured' }); }; API.probe = cfg => Promise.resolve({ plan: {} });`); }
    V1.exec('__cap = []');
    V1.exec(`applySnap(${JSON.stringify(snap)})`);
    await V1.execAsync('run(false)');
    return V1.eval('__cap[0]');
  });
  v1Lock = job.catch(() => {});
  return job;
}
/** [CHAR_SPECIALS] v1 가상 머신에서 동료별 계획(v1 함수·칸 클릭)을 만들어 스냅샷을 돌려준다. build(V1, setState) → snapshot. 직렬화. */
function v1snapOf(build) {
  const job = v1Lock.then(async () => {
    if (!V1) { V1 = loadV1(); V1.exec(`__cap = []; API.simulate = cfg => { __cap.push(JSON.parse(JSON.stringify(cfg))); return Promise.resolve({ error: 'captured' }); }; API.probe = cfg => Promise.resolve({ plan: {} });`); }
    const COND = { runs: 1, turns: 13, dummyElement: 0, dummies: 1, enemyHits: '5', forceProc: false, hp10: false, incomingOn: false, incomingPct: 30 };
    const setState = (team, turns = 13, extra = {}) => V1.setState({ team: team.map((x) => (x ? { skill: 10, rune: true, rotation: '', ...x } : null)), cond: { ...COND, turns },
      overrides: extra.overrides || {}, advOn: false, turnPlans: {}, sync: extra.sync || [], altar: extra.altar || null, tdmg: null });
    return build(V1, setState);
  });
  v1Lock = job.catch(() => {});
  return job;
}

const decodeCache = {};
for (const k of Object.keys(CODES)) {
  const recs = await decodeShare(CODES[k], CHARS);
  const rec = Array.isArray(recs) ? recs[0] : recs;
  if (!rec || !rec.snap) throw new Error('code ' + k + ': snap 없음');
  decodeCache[k] = rec.snap;
}
const PIN_NAME = { '평': '보통 공격', '방': '방어', '궁': '필살기' };

function makeCtx() {
  const ctx = {
    P, M, sim, probe, snap: null, notes: [],
    v1snapOf,
    decode(key) { const snap = JSON.parse(JSON.stringify(decodeCache[key])); const st = newStore(); st.applySnap(snap); ctx.snap = snap; return st; },
    mk(ids, turns = 13, extra = {}) { const st = newStore(); st.applySnap({ team: ids.map((id) => id && { id, skill: 10, rune: true }), turns, runs: 1, enemyHits: '5', ...extra }); return st; },
    cdAltar(st) {
      if (st.altar.quickCd) st.altar.quickCd(true); else st.altar.apply(P.quickCdAltar());
      if (!st.env().procIds.length) throw new Error('쿨감 제단이 켜지지 않음');
    },
    altar402(st) {
      st.altar.setOn(true); st.altar.setFloor(1, true);
      const off = () => (st.get().altar.floors[1].off || {});
      if (!off()[402]) st.altar.toggle(1, 402);
      [1012, 1013].forEach((id) => { if (!off()[id]) st.altar.toggle(1, id); });
      if (st.env().cdPlus !== 1) throw new Error('402 적용 실패 cdPlus=' + st.env().cdPlus);
    },
    /** UI 규칙대로 성공 가정 체크: assistEffect 가 비활성이면 체크하지 않고 이유를 기록. → 켜졌는지 */
    uiAssist(st, pos) {
      const nm = (CHARS[(st.get().team[pos - 1] || {}).id] || {}).name || `P${pos}`;
      if (UIH && UIH.assistEffect) {
        const e = UIH.assistEffect(st.get(), pos, st.env());
        if (!e.live) { ctx.notes.push(`${nm} 성공 가정 비활성(${e.reason}) → 체크 불가`); return false; }
      }
      st.plan.setAssist(pos, true); ctx.notes.push(`${nm} 성공 가정 켬`); return true;
    },
    /** UI 규칙대로 필살기 칸 고정: ultAllowed 가 false 면 칸이 막혀 있으므로 누르지 못함 → 기록. */
    uiPinUlt(st, turn, pos) {
      const nm = (CHARS[(st.get().team[pos - 1] || {}).id] || {}).name || `P${pos}`;
      if (!st.pins.ultAllowed(turn, pos)) { ctx.notes.push(`${nm} ${turn}턴 필살기 칸 막힘`); return false; }
      st.pins.set(turn, pos, '궁'); return true;
    },
    /** [CHAR_SPECIALS] UI 칸 선택과 같은 경로(막힌 칸은 못 누름 → plan-helpers.pinUltWithRules: 앞 턴 방어 자동 배치·전투당 1회). */
    uiPinUltRules(st, turn, pos) {
      const nm = (CHARS[(st.get().team[pos - 1] || {}).id] || {}).name || `P${pos}`;
      if (!st.pins.ultAllowed(turn, pos)) { ctx.notes.push(`${nm} ${turn}턴 필살기 칸 막힘`); return false; }
      const r = UIH.pinUltWithRules(st, pos, turn);
      ctx.notes.push(`${nm} ${turn}턴 ${r.status}${r.reason ? `(${r.reason})` : ''}${r.defs && r.defs.length ? ` 방어 ${r.defs.join('·')}` : ''}`);
      return r.status !== 'impossible';
    },
    buildS23(c = ctx) {
      const st = c.decode('A');
      st.applySnap({ ...c.snap, advOn: false, turnPlans: {}, turnOverrides: {} });
      st.pins.clearAll(); st.pins.unlockAll();
      if (st.plan.resetExceptions) st.plan.resetExceptions();
      st.sync.set([{ anchor: 2, members: [{ p: 1, order: 'before', base: 'defend' }, { p: 3, order: 'before' }], miss: 'wait' }]);
      st.plan.setUltMode(0, 'asap');
      st.pins.set(1, 1, '방');
      return st;
    },
  };
  return ctx;
}

// ── 로그 → 타임라인 ─────────────────────────────────────────────────────────
const ACT = { '보통공격': '평', '방어': '방', '필살기': '궁' };
/** → { [turn]: [{ actor, a, x }] } — 같은 act 번호의 첫 행동 로그 = 그 행동의 주체, 한 턴의 두 번째 이후 행동 = 추가 행동. */
function parseLog(log, teamIds) {
  const seen = new Set(), out = {}, cnt = {};
  for (const e of log || []) {
    if (seen.has(e.act) || !ACT[e.kind] || (teamIds && !teamIds.has(e.actorId))) continue;
    seen.add(e.act);
    const k = `${e.turn}:${e.actor}`; cnt[k] = (cnt[k] || 0) + 1;
    (out[e.turn] = out[e.turn] || []).push({ actor: e.actor, a: ACT[e.kind], x: cnt[k] > 1 });
  }
  return out;
}
const short = (n) => ({ '오야마다 마타야': '마타야', '명계 경비견 아누비로스': '아누', '크로크라인': '크로' }[n] || n);
const stepStr = (s) => `${short(s.actor)} ${s.a}${s.x === true ? '⁺' : ''}`;
const seqStr = (arr) => (arr || []).map(stepStr).join(' → ') || '(행동 없음)';
const stepEq = (e, a) => e.actor === a.actor && e.a === a.a && (e.x === undefined || e.x === a.x);

/**
 * 한 턴 비교. → { status: 'ok'|'order'|'orderBad'|'bad', exp, got, bold: {expIdx:Set, gotIdx:Set} }
 * got = 실제 중 기대에 등장하는 동료의 행동만(순서 유지).
 */
function cmpTurn(spec, actual) {
  const exp = Array.isArray(spec) ? spec : spec.seq;
  const order = Array.isArray(spec) ? exp.slice(1).map((_, i) => [i, i + 1]) : (spec.order || exp.slice(1).map((_, i) => [i, i + 1]));
  const names = new Set(exp.map((s) => s.actor));
  const got = (actual || []).filter((s) => names.has(s.actor));
  const expBad = new Set(), gotBad = new Set();
  if (got.length === exp.length && exp.every((e, i) => stepEq(e, got[i]))) return { status: 'ok', exp, got, expBad, gotBad };
  // 같은 행동 집합인가(순서만 다름) — 기대 각 항목을 실제의 아직 안 쓴 항목에 탐욕 매칭
  const used = new Array(got.length).fill(false), map = [];
  exp.forEach((e, i) => { const j = got.findIndex((g, k) => !used[k] && stepEq(e, g)); if (j >= 0) { used[j] = true; map[i] = j; } else expBad.add(i); });
  got.forEach((g, k) => { if (!used[k]) gotBad.add(k); });
  if (!expBad.size && !gotBad.size) {
    const broken = order.filter(([i, j]) => !(map[i] < map[j]));
    // 순서가 어긋난 위치 굵게
    exp.forEach((e, i) => { if (map[i] !== i) { expBad.add(i); gotBad.add(map[i]); } });
    // loose: 기대에 적은 순서 중 order 쌍 외에는 사용자가 정한 적 없는 순서 → 쌍만 지키면 일치로 본다
    if (!broken.length && !Array.isArray(spec) && spec.loose) return { status: 'ok', exp, got, expBad: new Set(), gotBad: new Set() };
    return { status: broken.length ? 'orderBad' : 'order', exp, got, expBad, gotBad, broken };
  }
  return { status: 'bad', exp, got, expBad, gotBad };
}
const boldSeq = (arr, bad) => (arr || []).map((s, i) => (bad.has(i) ? `**${stepStr(s)}**` : stepStr(s))).join(' → ') || '**(행동 없음)**';

function evalTimeline(cs, parsed) {
  const tl = cs.expectTimeline, turns = Object.keys(tl).map(Number).sort((a, b) => a - b);
  const core = new Set(cs.core || turns);
  const rows = turns.map((t) => {
    const c = cmpTurn(tl[t], parsed[t]);
    const isCore = core.has(t);
    const level = c.status === 'ok' ? 'pass' : c.status === 'order' ? 'partial' : isCore ? 'fail' : 'partial';
    return { t, core: isCore, ...c, level, full: seqStr(parsed[t]) };
  });
  const verdict = rows.some((r) => r.level === 'fail') ? 'fail' : rows.some((r) => r.level === 'partial') ? 'partial' : 'pass';
  return { verdict, rows };
}

// ── 메커니즘·참고 검사 ───────────────────────────────────────────────────────
const V = { pass: '✓', partial: '△', fail: '✗', info: 'ⓘ', na: '—', err: '✗' };
const EVAL = {
  band(c, r) {
    const m = (r.stat || r.logRun).meta; const { totalFloor: f, totalCeil: ce, totalMin: mn, total: av, totalMax: mx } = m;
    if (![f, ce].every(Number.isFinite)) return { verdict: 'fail', actual: 'totalFloor/totalCeil 없음' };
    const eps = 1e-6 * ce;
    const ok = f < ce && f <= mn + eps && mn <= av + eps && av <= mx + eps && mx <= ce + eps;
    return { verdict: ok ? 'pass' : (f < ce ? 'partial' : 'fail'), actual: `바닥 ${M(f)} ≤ 최소 ${M(mn)} ≤ 평균 ${M(av)} ≤ 최대 ${M(mx)} ≤ 천장 ${M(ce)}` };
  },
  async v1same(c, r, ctx) {
    if (NO_V1) return { verdict: 'info', actual: '--no-v1 로 생략' };
    if (!r.v1alive) return { verdict: 'info', actual: '8777 응답 없음' };
    let cfg1 = r.cfg;
    if (c.mode === 'v1vm') {
      if (!ctx.snapForV1) return { verdict: 'info', actual: 'v1 대조용 스냅 없음' };
      cfg1 = await v1cfg(ctx.snapForV1);
      if (!cfg1) return { verdict: 'fail', actual: 'v1 페이로드 캡처 실패' };
    }
    const x = await sim(8777, { ...cfg1, ...r.runsCfg });
    const y = r.stat || r.logRun; const d = Math.abs(x.meta.total - y.meta.total) / y.meta.total;
    const same = c.mode === 'v1vm' ? deepEq(stripRun(cfg1), stripRun(r.cfg)) : true;
    return { verdict: d <= 0.001 ? 'pass' : 'fail', actual: `v1 ${M(x.meta.total)} / v2 ${M(y.meta.total)}${c.mode === 'v1vm' ? ` · 페이로드 ${same ? '동일' : '다름'}` : ''}` };
  },
  pinsIgnored(c, r) {
    const ig = r.ignored || [];
    return { verdict: ig.length ? 'fail' : 'pass', actual: ig.length ? '실행이 다른 고정 칸 ' + ig.map((x) => `P${x.pos}:${x.turns.join(',')}`).join(' ') : '고정 칸 = 실행' };
  },
  async fn(c, r, ctx) { return c.fn(r, ctx); },
  /** [CHAR_SPECIALS] v1(8777)에서 같은 설정(c.v1: v1 가상 머신에서 만든 스냅샷)으로 돌린 턴별 행동 == v2 턴별 행동(전 동료·전 턴). */
  async v1flow(c, r, ctx) {
    if (NO_V1) return { verdict: 'info', actual: '--no-v1 로 생략' };
    if (!r.v1alive) return { verdict: 'info', actual: '8777 응답 없음' };
    const snap = await v1snapOf(c.v1);
    const cfg1 = await v1cfg(snap);
    if (!cfg1) return { verdict: 'fail', actual: 'v1 페이로드 캡처 실패' };
    const x = await sim(8777, { ...cfg1, runs: 1, seed: r.logCfg.seed, forceProc: r.logCfg.forceProc });
    const p1 = parseLog(x.log, r.teamIds);
    const n = +r.cfg.turns || 13, bad = [];
    // 동료별 행동 목록(순서 무시)이 같으면 '순서만 다름'(△) — 추가 행동·필살기 턴은 같고 우선순위상 자리만 바뀐 경우
    const byActor = (arr) => { const m = {}; (arr || []).forEach((s) => { (m[s.actor] = m[s.actor] || []).push(s.a + (s.x ? '+' : '')); }); return JSON.stringify(Object.keys(m).sort().map((k) => [k, m[k]])); };
    let orderOnly = true;
    for (let t = 1; t <= n; t++) {
      const a = seqStr(p1[t]), b = seqStr(r.parsed[t]);
      if (a !== b) { bad.push(`T${t} v1 ${a} / v2 ${b}`); if (byActor(p1[t]) !== byActor(r.parsed[t])) orderOnly = false; }
    }
    const rot = (cfg) => (cfg.team || []).map((m) => m.rotation || '').join('|');
    if (!bad.length) return { verdict: 'pass', actual: `${n}턴 전부 같음 (줄 ${rot(cfg1) === rot(r.cfg) ? '동일' : '다름'})` };
    return { verdict: orderOnly ? 'partial' : 'fail', actual: `${bad.length}턴 ${orderOnly ? '순서만 다름(동료별 행동 같음)' : '다름'} — ${bad.slice(0, 3).join(' · ')}` };
  },
};
const stripRun = (c) => { const o = JSON.parse(JSON.stringify(c || {})); ['runs', 'seed', 'forceProc'].forEach((k) => delete o[k]); return o; };
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const deepEq = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

// ── 케이스 실행 ─────────────────────────────────────────────────────────────
async function runCase(cs, env) {
  const out = { id: cs.id, fb: cs.fb, intent: cs.intent, flow: cs.flow, config: cs.config, recipe: cs.recipe || [], path: cs.path || null, onMismatch: cs.onMismatch || null,
    note: cs.note || '', refFb: cs.refFb ?? null, kind: cs.kind || 'flow', checks: [], timeline: null, verdict: 'na', diag: '', notes: [] };
  if (cs.na) return out;
  const ctx = makeCtx();
  const t0 = Date.now();
  try {
    const st = await cs.setup(ctx);
    ctx.snapForV1 = ctx.snap;
    out.notes = ctx.notes.slice();
    const cfg = st.buildCfg({ mode: 'run' });
    const altarOn = !!(st.get().altar && st.get().altar.on);
    const teamIds = new Set(st.get().team.filter(Boolean).map((s) => s.id));
    const rand = cs.runs && cs.runs.mode === 'rand';
    const runsCfg = rand ? { forceProc: false, runs: cs.runs.runs || 200, seed: cs.runs.seed ?? 777 } : { forceProc: !altarOn, runs: 1, seed: 777 };
    // 행동 판정용 1회: 제단이 없으면 확률 100%(결정론), 있으면 payload 규칙대로 확률 그대로 + 시드 777
    const logCfg = { ...cfg, runs: 1, seed: 777, forceProc: !altarOn };
    const [logRun, stat, pr] = await Promise.all([
      sim(8778, logCfg),
      rand ? sim(8778, { ...cfg, ...runsCfg }) : Promise.resolve(null),
      probe(8778, st.buildCfg({ mode: 'probe' })).catch((e) => ({ error: e.message })),
    ]);
    const parsed = parseLog(logRun.log, teamIds);
    let ignored = [];
    try { ignored = pr && pr.plan ? st.pinsIgnored(pr) : []; } catch { ignored = []; }
    const r = { st, cfg, logRun, logCfg, teamIds, det: altarOn ? null : logRun, stat, log: logRun.log, parsed, probe: pr, ignored, runsCfg, v1alive: env.v1alive };
    const src = stat || logRun;
    out.meta = { total: src.meta.total, runs: src.meta.runs, altar: altarOn, logForceProc: logCfg.forceProc, floor: src.meta.totalFloor, ceil: src.meta.totalCeil };
    if (cs.expectTimeline) out.timeline = evalTimeline(cs, parsed);
    for (const c of cs.checks || []) {
      let res;
      try { res = await EVAL[c.type](c, r, ctx); } catch (e) { res = { verdict: 'err', actual: '검사 오류: ' + e.message }; }
      if (c.info && res.verdict !== 'err') res.verdict = 'info';
      out.checks.push({ label: c.label, basis: c.basis, info: !!c.info, ...res });
    }
    out.notes = ctx.notes.slice();
  } catch (e) {
    out.checks.push({ label: '케이스 구성/실행', basis: '스토어 API · 서버', verdict: 'err', actual: String(e && e.message || e).slice(0, 200) });
  }
  out.ms = Date.now() - t0;
  const parts = [];
  if (out.timeline) parts.push(out.timeline.verdict);
  out.checks.filter((c) => !c.info).forEach((c) => parts.push(c.verdict === 'err' ? 'fail' : c.verdict));
  out.verdict = !parts.length ? 'na' : parts.includes('fail') ? 'fail' : parts.includes('partial') ? 'partial' : 'pass';
  if (out.checks.some((c) => c.verdict === 'err')) out.diag = '하네스/스토어 오류 — ' + out.checks.find((c) => c.verdict === 'err').actual;
  else if (out.verdict !== 'pass' && out.onMismatch) {
    const orderOnly = out.timeline && out.timeline.rows.every((x) => x.status === 'ok' || x.status === 'order');
    out.diag = orderOnly ? '엔진 규칙 — 행동은 같고 순서만 다름(추가 행동 대상·체인 순서는 유지, 의도 영향 없음)' : `${out.onMismatch.cat} — ${out.onMismatch.why}`;
  }
  return out;
}

async function pool(items, n, fn) {
  const res = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; res[k] = await fn(items[k], k); } }));
  return res;
}

// ── 보고서 ──────────────────────────────────────────────────────────────────
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
function mismatchSummary(r) {
  if (r.timeline) {
    const bad = r.timeline.rows.filter((x) => x.status !== 'ok');
    if (!bad.length) return '없음';
    const head = bad.slice(0, 3).map((x) => `T${x.t}${x.core ? '' : '(비핵심)'}: 기대 ${seqStr(x.exp)} / 실제 ${seqStr(x.got)}`);
    return head.join('<br>') + (bad.length > 3 ? `<br>…외 ${bad.length - 3}턴` : '');
  }
  const bad = r.checks.filter((c) => !c.info && c.verdict !== 'pass');
  return bad.length ? bad.map((c) => `${c.label}: ${c.actual}`).join('<br>') : '없음';
}
function dmgRef(r) {
  if (!r.meta) return '—';
  const s = `${M(r.meta.total)} (${r.meta.runs}회${r.meta.altar ? '·제단' : ''})`;
  return r.refFb ? `${s} · 피드백 ${r.refFb}만` : s;
}
function report(results, env) {
  const cnt = { pass: 0, partial: 0, fail: 0, na: 0 };
  results.forEach((r) => { cnt[r.verdict]++; });
  const noPath = results.filter((r) => r.path && r.path.status === '없음');
  const L = [];
  L.push('# 피드백 재현 시나리오 — 행동 일치 판정');
  L.push('');
  L.push(`- 실행 시각: **${env.startedAt}** (소요 ${(env.ms / 1000).toFixed(0)}초) · \`node tools/feedback_cases/run.mjs${ONLY ? ' --only ' + ONLY : ''}${NO_V1 ? ' --no-v1' : ''}\``);
  L.push(`- 기준 코드: 성공 가정 정책 반영 후(ADV_REVIEW §1 — 제단이 켜져 있으면 성공 가정은 방식·고정 칸과 무관하게 켤 수 있음, 자동 + 성공 가정 = 당겨진 리듬, 프리셋이 성공 가정을 스스로 켜지 않음). 서버 8778 ${env.v2alive ? '응답' : '없음'} · 8777 ${env.v1alive ? '응답' : '없음'}(재시작 없음).`);
  L.push('- **1차 판정 = 행동 일치.** 피드백 본문의 흐름을 턴별 기대 타임라인으로 적고(케이스 `expectTimeline`), 결과 `log`에서 같은 모양을 뽑아 턴 단위로 비교한다. 그 턴 실제 행동 중 **기대에 나오는 동료만** 골라 비교하고, 명시하지 않은 턴·동료는 검사하지 않는다(와일드카드). ⁺ = 추가 행동(한 턴의 두 번째 이후 행동).');
  L.push('- 판정: ✓ 명시한 턴 전부 일치 · △ 핵심 턴은 일치하고 비핵심 턴만 다르거나, 순서만 다르고 의도(추가 행동 부여 대상·체인 순서·쿨 되돌림)에 영향 없음 · ✗ 핵심 턴 불일치 또는 의도에 영향 주는 순서 차이. 메커니즘·표시 피드백(#9·#15·#16·#17·#18~21)은 로그 규칙 검사로 판정.');
  L.push('- 행동 판정 실행: 제단 없으면 확률 100% 1회, 제단 있으면(확률 100% 금지 규칙) 시드 777 1회. **데미지는 참고 열**(200회 평균 등, 판정에 안 씀).');
  L.push('- 진단 분류: **설정 경로 없음**(원하는 흐름을 고급 설정으로 만들 수 없음) · **엔진 규칙**(만들었는데 엔진이 다르게 돈다) · **UI 유도**(기본값·안내가 다른 설정으로 이끈다). 만들 수 있으면 「설정 순서」에 창에서 누를 순서를 적었다(= setup 이 부르는 스토어 API 순서).');
  L.push(`- 합계: **✓ ${cnt.pass} · △ ${cnt.partial} · ✗ ${cnt.fail}** (재현 대상 없음 ${cnt.na}) · 흐름을 만들 수 없는 케이스: ${noPath.map((r) => '#' + r.id).join(', ') || '없음'}`);
  L.push('');
  L.push('## 요약표');
  L.push('');
  L.push('| 피드백 | 사용자가 원하는 흐름 | 구성 | 행동 판정 | 어긋난 턴(기대 / 실제) | 원인 진단 | 만들 수 있나(설정 경로) | 데미지(참고) |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const pathS = r.path ? `${r.path.status} — ${r.path.how}` : '—';
    const diag = [r.diag, r.verdict === 'pass' && r.note ? r.note : ''].filter(Boolean).join('<br>') || '—';
    L.push(`| #${cell(r.id)} | ${cell(r.flow || r.intent)} | ${cell(r.config)} | ${V[r.verdict]} | ${cell(r.verdict === 'na' ? '—' : mismatchSummary(r))} | ${cell(diag)} | ${cell(pathS)} | ${cell(dmgRef(r))} |`);
  }
  L.push('');
  L.push('## 케이스별 상세');
  for (const r of results.filter((x) => x.verdict !== 'na')) {
    L.push('');
    L.push(`### #${r.id} ${V[r.verdict]} — ${r.intent}`);
    L.push(`- 원하는 흐름: ${r.flow}`);
    L.push(`- 구성: ${r.config}`);
    if (r.timeline) {
      L.push('');
      L.push('| 턴 | 핵심 | 기대 | 실제(기대에 나온 동료만) | 그 턴 실제 전체 순서 | 결과 |');
      L.push('|---|---|---|---|---|---|');
      for (const x of r.timeline.rows) {
        const res = x.status === 'ok' ? '✓' : x.status === 'order' ? '△ 순서만(의도 영향 없음)' : x.status === 'orderBad' ? `${x.core ? '✗' : '△'} 순서(의도 영향)` : `${x.core ? '✗' : '△'} 불일치`;
        L.push(`| ${x.t} | ${x.core ? '●' : ''} | ${cell(boldSeq(x.exp, x.expBad))} | ${cell(boldSeq(x.got, x.gotBad))} | ${cell(x.full)} | ${res} |`);
      }
      L.push('');
    }
    r.checks.forEach((c) => L.push(`- ${V[c.verdict]} ${c.label} — ${c.actual} _(근거: ${c.basis})_`));
    if (r.notes && r.notes.length) L.push(`- UI 조작 기록: ${r.notes.join(' · ')}`);
    if (r.diag) L.push(`- **진단:** ${r.diag}`);
    if (r.path) L.push(`- **만들 수 있나:** ${r.path.status} — ${r.path.how}`);
    if (r.recipe.length) { L.push('- **설정 순서(고급 설정 창):**'); r.recipe.forEach((s, i) => L.push(`  ${i + 1}. ${s}`)); }
    L.push(`- 데미지(참고): ${dmgRef(r)}${r.meta ? ` · 밴드 ${M(r.meta.floor)}~${M(r.meta.ceil)}` : ''}`);
    if (r.note) L.push(`- 메모: ${r.note}`);
  }
  const fails = results.filter((r) => r.verdict === 'fail');
  L.push('');
  L.push('## 요약');
  L.push('');
  L.push(`- ✓ ${cnt.pass} / △ ${cnt.partial} / ✗ ${cnt.fail} (행동·메커니즘 판정 ${results.length - cnt.na}건, 재현 대상 없음 ${cnt.na})`);
  L.push(`- △: ${results.filter((r) => r.verdict === 'partial').map((r) => `#${r.id}(${r.diag.split(' — ')[0] || '—'})`).join(', ') || '없음'}`);
  L.push(`- ✗: ${fails.map((r) => `#${r.id}(${r.diag.split(' — ')[0] || '—'})`).join(', ') || '없음'}`);
  L.push(`- 흐름을 고급 설정으로 만들 수 없는 케이스: ${noPath.map((r) => `#${r.id}`).join(', ') || '없음'} · 부분: ${results.filter((r) => r.path && r.path.status === '부분').map((r) => '#' + r.id).join(', ') || '없음'}`);
  L.push(`- 실행 ${env.startedAt} — core/UI 모순 해결(§8) 반영본 기준.`);
  return { md: L.join('\n') + '\n', cnt, noPath };
}

// ── main ────────────────────────────────────────────────────────────────────
const started = new Date();
const pad = (n) => String(n).padStart(2, '0');
const env = { startedAt: `${started.getFullYear()}-${pad(started.getMonth() + 1)}-${pad(started.getDate())} ${pad(started.getHours())}:${pad(started.getMinutes())}:${pad(started.getSeconds())}`, v2alive: await alive(8778), v1alive: NO_V1 ? false : await alive(8777) };
if (!env.v2alive) { console.error('8778(v2) 서버가 응답하지 않습니다 — 서버를 띄운 뒤 다시 실행하세요(이 하네스는 서버를 시작하지 않음).'); process.exit(2); }
try {
  const raw = fs.readFileSync(path.join(ROOT, 'docs', 'redesign', 'USER_FEEDBACK_RAW.txt'), 'utf8');
  const miss = Object.entries(CODES).filter(([, c]) => !raw.includes(c)).map(([k]) => k);
  if (miss.length) console.warn('경고: 원문에 없는 코드', miss.join(','));
} catch { /* 원문 없음 */ }

const sel = CASES.filter((c) => !ONLY || String(c.fb) === ONLY || String(c.id) === ONLY || String(c.id).startsWith(ONLY + '-'));
if (!sel.length) { console.error('선택된 케이스 없음: --only ' + ONLY); process.exit(2); }
console.log(`케이스 ${sel.length}개 실행(동시 ${CONC}) — ${env.startedAt}`);
const results = await pool(sel, CONC, async (cs) => {
  const r = await runCase(cs, env);
  const bad = r.timeline ? r.timeline.rows.filter((x) => x.status !== 'ok').map((x) => `T${x.t}[${x.status}] ${seqStr(x.got)}`).join(' | ') : r.checks.filter((c) => !c.info && c.verdict !== 'pass').map((c) => c.actual).join(' | ');
  console.log(`  #${r.id.padEnd(9)} ${V[r.verdict]}  ${bad.slice(0, 200)}`);
  return r;
});
env.ms = Date.now() - started.getTime();
const { md, cnt, noPath } = report(results, env);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, md, 'utf8');
const ser = results.map((r) => ({ ...r, timeline: r.timeline && { verdict: r.timeline.verdict, rows: r.timeline.rows.map((x) => ({ ...x, expBad: [...x.expBad], gotBad: [...x.gotBad] })) } }));
fs.writeFileSync(path.join(HERE, 'last_run.json'), JSON.stringify({ env, results: ser }, null, 1), 'utf8');
console.log(`\n보고서: ${OUT}`);
console.log(`✓ ${cnt.pass} · △ ${cnt.partial} · ✗ ${cnt.fail} · — ${cnt.na} · 경로 없음: ${noPath.map((r) => '#' + r.id).join(' ') || '없음'}`);
