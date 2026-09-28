/**
 * 동료별 행동 규칙(docs/redesign/CHAR_SPECIALS.md) 계약.
 *   (a) '필살기 직전 방어' 표(DEF_BEFORE_ULT)가 data/skills.json 원문 근거와 맞다(방어 시 효과 · 란은 필살기로 얻는 기운)
 *   (b) 프리셋 가용성: 해당 동료에게만(3턴마다 · 3턴마다 + 직전 방어 · 필살기 직전 방어 · 방어로 필살기 앞당기기)
 *   (c) 파미도 '필살기 직전 방어' = v1 passiveDefendPlan, 란 리듬(첫 필살기 앞 방어 없음), 402 에서 3턴마다 + 직전 방어 숨김
 *   (d) 방어로 필살기 앞당기기(모이루·히토하): 모든 필살기가 v1 CD 모델(ultAvail)에서 가능 · 앞 3명 보통 공격 모이루 = 방·방·필살기 → 이후 추격이 남아 보통 공격·방어·필살기
 *   (e) 필살기 칸 고정(pinUltRow): 모이루·히토하 = v1 칸 클릭(enforceCdDefend)과 같은 줄 · 불가 판정 · 고정한 필살기 보호 · 제토 1회
 *   (f) 스토어 경로(UI pinUltWithRules): 되돌리기 한 번에 방어 자동 배치까지 원복
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadV1, CHARS } from './helpers/v1.js';
import { full, slot, ID, COND0 } from './helpers/samples.js';
import { createStore } from '../src/core/store.js';
import * as L from '../src/core/plan.js';
import { pinUltWithRules, pinUltNotice } from '../src/ui/plan-helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILLS = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', 'data', 'skills.json'), 'utf8'));
const v1 = loadV1();
v1.exec("API.probe = cfg => Promise.resolve({ plan: {} }); API.simulate = () => Promise.resolve({ error: 'x' });");
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const F = (f1 = {}) => ({ 1: { on: true, off: f1 }, 2: { on: true, off: {} }, 3: { on: true, off: {} } });
const ALTAR402 = { on: true, floors: F({ 402: true, 1012: true, 1013: true }) };
const RAN = 10426;
const ultTurns = (p, n = 13) => p.map((x, k) => (x === '궁' ? k + 1 : 0)).filter((t) => t && t <= n);
const defTurns = (p, n = 13) => p.map((x, k) => (x === '방' ? k + 1 : 0)).filter((t) => t && t <= n);
const skillText = (id) => Object.values(SKILLS[String(id)] || {}).filter((s) => s && s.levels)
  .map((s) => { const lv = s.levels; return (lv[String(Math.max(...Object.keys(lv).map(Number)))] || {}).desc_kr || ''; }).join('\n');

test('(a) 필살기 직전 방어 표 = 스킬 원문 근거', () => {
  assert.deepEqual(Object.keys(L.DEF_BEFORE_ULT).map(Number).sort(), [ID.FAMIDO, RAN]);
  assert.match(skillText(ID.FAMIDO), /방어 시 "자신 기초 ATK \$\{arg1\}% 증가 \(\$\{arg2\}턴\)"/, '파미도 롱 패스 준비');
  const ran = skillText(RAN);
  assert.match(ran, /필살기 발동 시 【란의 기운】 발동/, '란: 기운은 필살기로 얻는다 → needUlt');
  assert.match(ran, /방어 시 "자신에게 부여된 【란의 기운】 제거/, '란: 기운 보유 방어');
  assert.match(ran, /포지션 4/, '란: 4번 자리 동료');
  assert.equal(L.DEF_BEFORE_ULT[RAN].needUlt, true);
  assert.equal(L.DEF_BEFORE_ULT[ID.FAMIDO].needUlt, false);
  // 방어로 CD 가 주는 동료는 엔진 메타(cdDefendReduce)로 판정 — 원문에도 '방어 시 … CD … 감소'
  for (const id of [ID.MOIRU, ID.HITOHA]) {
    assert.ok(CHARS[id].cdDefendReduce > 0, `${id} cdDefendReduce`);
    assert.match(skillText(id), /방어 시.*필살기 CD/s, `${id} 원문`);
  }
});

test('(b) 동료별 프리셋 가용성', () => {
  const env = L.makeEnv({ chars: CHARS });
  const av = (p) => Object.values(CHARS).filter((m) => L.presetAvailable(p, m, env)).map((m) => m.id).sort();
  assert.deepEqual(av('ult3'), [ID.INVIS, ID.MATAYA]);
  assert.deepEqual(av('pdef'), [ID.FAMIDO, RAN]);
  assert.deepEqual(av('ult3def'), [RAN]);
  assert.deepEqual(av('defRush'), [ID.HITOHA, ID.MOIRU]);
  assert.deepEqual(L.PRESETS, ['allUlt', 'ult3', 'early', 'pdef', 'reflow'], 'v1 프리셋 목록 계약은 그대로');
  const env402 = L.makeEnv({ chars: CHARS, altar: ALTAR402 });
  assert.equal(L.presetAvailable('ult3def', CHARS[RAN], env402), false, '402 → 란 CD 3턴 = 직전 방어와 같은 리듬이라 숨김');
});

test('(c) 필살기 직전 방어 · 3턴마다 + 직전 방어', () => {
  const env = L.makeEnv({ chars: CHARS });
  v1.setState(full({ team: [null, null, null, null, null], altar: null, cond: { ...COND0, turns: 30 } }));
  assert.deepEqual(L.defBeforePlan(CHARS[ID.FAMIDO], 30, env), v1.eval('passiveDefendPlan(CHARS[10421], 30)'), '파미도 = v1');
  const pd = L.defBeforePlan(CHARS[RAN], 30, env);
  assert.deepEqual(ultTurns(pd), [3, 5, 7, 9, 11, 13]);
  assert.deepEqual(defTurns(pd), [4, 6, 8, 10, 12], '첫 필살기(3턴) 앞은 방어 없음');
  const u3 = L.defBeforePlan(CHARS[RAN], 30, env, 3);
  assert.deepEqual(ultTurns(u3), [3, 6, 9, 12]);
  assert.deepEqual(defTurns(u3), [5, 8, 11]);
  // 핀 경로: 프리셋 → 최소 핀 → 구체화된 줄이 목표 계획과 같다
  const st = createStore({ storage: mem(), chars: CHARS });
  st.set({ chars: CHARS });
  st.applySnap({ team: [slot(RAN), slot(ID.FAMIDO), slot(ID.HANIEL), slot(ID.RICANO), null], turns: 13, runs: 1, enemyHits: '5' });
  assert.ok(st.pins.applyPreset(1, 'ult3def'));
  assert.deepEqual(st.pins.line(1), u3);
  assert.ok(st.pins.applyPreset(2, 'pdef'));
  assert.deepEqual(st.pins.line(2), v1.eval('passiveDefendPlan(CHARS[10421], 30)'));
});

/** v1 칸 클릭(renderPlanner onclick) 결과 계획 — 직접 계획 켠 기본 계획에서 idx 칸을 '궁'으로. */
function v1Click(team, pos, turns, idx) {
  v1.setState(full({ team, altar: null, cond: { ...COND0, turns } }));
  return v1.eval(`(() => { const s = team[${pos - 1}]; s.usePlan = true; s.plan = defaultPlan(CHARS[s.id], 30); renderPlanner(s, CHARS[s.id]);
    $('#planner').onclick({ target: { closest: () => ({ dataset: { idx: '${idx}', a: '궁' }, disabled: false }) } });
    return s.plan; })()`);
}

test('(d) 방어로 필살기 앞당기기: v1 CD 모델에서 모든 필살기 가능', () => {
  const env = L.makeEnv({ chars: CHARS });
  const cases = [
    { team: [slot(ID.RICANO), slot(ID.FAMIDO), slot(ID.HANIEL), slot(ID.MOIRU), null], pos: 4, ults: [3, 6, 9, 12], defs: [1, 2, 5, 8, 11] },
    { team: [slot(ID.HITOHA), slot(ID.FAMIDO), slot(ID.HANIEL), null, null], pos: 1, ults: [4, 7, 10, 13], defs: [3, 6, 9, 12] },
    { team: [slot(ID.MOIRU), slot(ID.FAMIDO), null, null, null], pos: 1 },   // 아군 1명 — 리듬이 느려도 필살기는 전부 가능해야 한다
  ];
  for (const c of cases) {
    const eff = L.effectiveTeam(c.team, {}, 13, env);
    const p = L.presetTarget('defRush', eff[c.pos - 1], c.pos - 1, eff, 13, env);
    if (c.ults) { assert.deepEqual(ultTurns(p), c.ults); assert.deepEqual(defTurns(p), c.defs); }
    v1.setState(full({ team: c.team, altar: null, cond: { ...COND0, turns: 30 } }));
    const ok = v1.eval(`ultAvail(${JSON.stringify(p)}, CHARS[${c.team[c.pos - 1].id}], allyBasicCounts(team, ${c.pos - 1}, 30), null)`);
    ultTurns(p, 30).forEach((t) => assert.ok(ok[t - 1], `${c.team[c.pos - 1].id} ${t}턴 필살기 v1 CD 모델`));
    assert.ok(ultTurns(p, 30).length >= 3, '필살기가 있다');
  }
});

test('(e) 필살기 칸 고정 규칙 = v1 칸 클릭', () => {
  const env = L.makeEnv({ chars: CHARS });
  const moiTeam = [slot(ID.RICANO), slot(ID.FAMIDO), slot(ID.HANIEL), slot(ID.MOIRU), null];
  const hitTeam = [slot(ID.HITOHA), slot(ID.FAMIDO), slot(ID.HANIEL), null, null];
  for (const [team, pos, turn] of [[moiTeam, 4, 3], [moiTeam, 4, 4], [moiTeam, 4, 9], [hitTeam, 1, 4], [hitTeam, 1, 5], [hitTeam, 1, 9]]) {
    const r = L.pinUltRow(team[pos - 1], pos - 1, team, {}, 13, turn, env);
    const want = v1Click(team, pos, 13, turn - 1);
    if (r.status === 'plain') { assert.equal(want[turn - 1], '궁', `${turn} 그대로 준비됨`); continue; }
    assert.equal(r.status, 'defended', `${team[pos - 1].id} ${turn}턴`);
    const pins = L.withPinsRow({}, pos, r.row);
    const line = L.effectiveTeam(team, pins, 13, env)[pos - 1].plan;
    assert.deepEqual(line.slice(0, 13), want.slice(0, 13), `${team[pos - 1].id} ${turn}턴 줄 == v1`);
    assert.ok(r.defs.length >= 1 && r.defs.every((t) => line[t - 1] === '방'));
  }
  // 불가: 모이루 2턴(방어 1번으로는 CD 6 을 못 채움) · 히토하 3턴
  assert.equal(L.pinUltRow(moiTeam[3], 3, moiTeam, {}, 13, 2, env).status, 'impossible');
  assert.equal(L.pinUltRow(moiTeam[3], 3, moiTeam, {}, 13, 2, env).reason, 'stack');
  assert.equal(L.pinUltRow(hitTeam[0], 0, hitTeam, {}, 13, 3, env).reason, 'cd');
  // 사용자가 고정한 필살기(3턴)를 방어로 덮어야만 되는 턴(5턴)은 불가
  const pins3 = L.withPinsRow({}, 4, L.pinUltRow(moiTeam[3], 3, moiTeam, {}, 13, 3, env).row);
  assert.equal(L.pinUltRow(moiTeam[3], 3, moiTeam, pins3, 13, 5, env).status, 'impossible');
  assert.equal(L.pinUltRow(moiTeam[3], 3, moiTeam, pins3, 13, 5, env).reason, 'overlap');
  // 일반 동료·턴당 2회는 칸 하나만(종전 동작)
  assert.equal(L.pinUltRow(slot(ID.RICANO), 0, moiTeam, {}, 13, 4, env).status, 'plain');
  assert.equal(L.pinUltRow(slot(ID.TAEHO), 0, [slot(ID.TAEHO)], {}, 13, 2, env).status, 'plain');
  // 제토: 다른 턴의 필살기 고정 해제
  const zTeam = [slot(ID.ZETO), slot(ID.FAMIDO), null, null, null];
  const z = L.pinUltRow(zTeam[0], 0, zTeam, { 5: { 1: '궁' }, 6: { 1: '방' } }, 13, 3, env);
  assert.equal(z.status, 'single');
  assert.deepEqual(z.row, { 3: '궁', 6: '방' });
});

test('(f) 스토어 경로: 방어 자동 배치 · 되돌리기 한 번 · 알림 문구', () => {
  const st = createStore({ storage: mem(), chars: CHARS });
  st.set({ chars: CHARS });
  st.applySnap({ team: [slot(ID.RICANO), slot(ID.FAMIDO), slot(ID.HANIEL), slot(ID.MOIRU), null], turns: 13, runs: 1, enemyHits: '5' });
  const r = pinUltWithRules(st, 4, 3);
  assert.equal(r.status, 'defended');
  assert.deepEqual(st.pins.row(4)[1] + st.pins.row(4)[2] + st.pins.row(4)[3], '방방궁');
  const msgs = [];
  const t = (k, v) => { msgs.push([k, v]); return k; };
  assert.equal(pinUltNotice(t, r, 'M', 3), 'plan.pin.defended');
  assert.equal(msgs[0][1].turns, '1·2');
  assert.equal(pinUltWithRules(st, 4, 3).status, 'noop', '이미 필살기 고정');
  assert.equal(st.pins.undo(), 'pin:3:4');
  assert.equal(st.pins.count(), 0, '되돌리기 한 번에 방어까지 원복');
  const bad = pinUltWithRules(st, 4, 2);
  assert.equal(bad.status, 'impossible');
  assert.equal(st.pins.count(), 0, '불가면 바꾸지 않는다');
  assert.equal(pinUltNotice(t, bad, 'M', 2), 'plan.pin.impossible.stack');
  // 페이로드: 모이루 줄 = 방방궁 + 규칙 채움
  const cfg = st.buildCfg({ mode: 'run' });
  assert.ok(cfg.team.every((x) => !x.rotation), '핀이 없으면 줄 없음');
  pinUltWithRules(st, 4, 3);
  const c2 = st.buildCfg({ mode: 'run' });
  assert.ok(c2.team.find((x) => x.id === ID.MOIRU).rotation.startsWith('방방궁'));
});

test('(g) 임부언 CD 변동 면역: 1번 자리 동료의 면역 턴은 성공 가정·방어 CD 감소 없음(IMBUEON_IMMUNITY.md §5)', () => {
  const st = createStore({ storage: mem(), chars: CHARS });
  st.set({ chars: CHARS });
  st.applySnap({ team: [ID.ANUBIS, ID.IMBUEON, ID.FAMIDO, ID.HANIEL].map((id) => slot(id)), turns: 13, runs: 1, enemyHits: '5' });
  st.altar.apply(L.quickCdAltar());
  st.plan.setAssist(1, true); st.plan.setAssist(2, true);
  assert.ok(st.pins.applyPreset(2, 'allUlt'));
  assert.deepEqual(ultTurns(st.pins.line(2)), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], '임부언 매 턴 필살기(성공 가정)');
  const eff = st.effectiveTeam();
  const imm = L.immuneFor(eff[0], 0, eff, 13, st.env());
  assert.ok(imm && imm.has(4) && imm.has(5) && !imm.has(3), '면역 = 임부언 필살 턴 다음 두 턴');
  assert.equal(L.immuneFor(eff[1], 1, eff, 13, st.env()), null, '1번 자리가 아니면 없음');
  assert.ok(st.pins.applyPreset(1, 'allUlt'));
  assert.deepEqual(ultTurns(st.pins.line(1)), [3, 6, 9, 12], '엔진 결과(§4 b2)와 같은 3·6·9·12');
  assert.equal(st.pins.ultAllowed(4, 1), false, '면역 턴(적립 없음)은 필살기 칸 막힘');
  assert.equal(st.pins.ultAllowed(5, 1), false);
  assert.equal(st.pins.ultAllowed(6, 1), true, '자연 충전으로 6턴');
  // 인자 없으면 종전 모델(다른 호출부 무영향)
  const plain = L.normalizePlan(Array(13).fill('궁'), CHARS[ID.ANUBIS], null, L.cdProcSources(CHARS[ID.ANUBIS], st.env()), st.env());
  assert.ok(ultTurns(plain).length > 4);
  // 임부언이 없으면 면역 없음
  const t2 = [slot(ID.ANUBIS), slot(ID.FAMIDO)];
  assert.equal(L.immuneFor(t2[0], 0, t2, 13, st.env()), null);
});
