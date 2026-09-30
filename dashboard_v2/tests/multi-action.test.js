/**
 * 한 턴 여러 행동 — 이태호 턴당 2회(도장 패시브) · 받은 추가 행동 표시·설정 계약.
 *   (a) 도장 잠금해제를 끈 이태호는 턴당 1회(makeEnv 편성 덮어쓰기) — 줄 길이·임부언 받은 추가 행동 칸·필살기 리듬이 엔진과 같다
 *   (b) 턴당 2회 핀 '궁' = '궁평' — 실행이 같으면 '실행이 다름'(pinsIgnored)으로 잡지 않는다
 *   (c) 칸 조각(actSegs)·설명(actsLabel): 턴당 행동 수를 넘는 행동만 추가 행동
 *   (d) 전투 로그 턴 요약: 이태호의 두 번째 행동은 추가 행동이 아니다
 *   (g) 대각선 분할 칸(splitStyle): 띠 경계 k/n · 추가 행동 막대 = 추가 행동 띠가 닿는 아래 변 · 띠 가운데(splitCenter)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARS } from './helpers/v1.js';
import { slot, ID } from './helpers/samples.js';
import { createStore } from '../src/core/store.js';
import * as L from '../src/core/plan.js';
import { actSegs, actsLabel, segsKey, splitStyle, splitCenter } from '../src/ui/plan-helpers.js';
import { groupTurns } from '../src/ui/log.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
// 엔진 메타(sim_api char_meta)의 actionsPerTurnNoRune — 픽스처는 이 필드 이전에 찍혔다
const chars = { ...CHARS, [ID.TAEHO]: { ...CHARS[ID.TAEHO], actionsPerTurnNoRune: 1 } };
const runeOff = (s) => ({ ...s, rune: false, spec: { on: true, level: 60, evo: 5, pevo: 5, compat: 5, lv: {} } });
const team = (taeho) => [taeho, slot(ID.RICANO), slot(ID.FAMIDO), slot(ID.HANIEL), slot(ID.IMBUEON)];
const t = (key, vars = {}) => key.replace(/^plan\.act\./, '').replace('extra.tag', `${vars.act}+`);

test('(a) makeEnv: 도장 잠금해제를 끈 이태호만 턴당 1회 · 필살기 리듬은 첫 턴 한 번', () => {
  const on = L.makeEnv({ chars, team: team(slot(ID.TAEHO)) });
  assert.equal(on.chars[ID.TAEHO].actionsPerTurn, 2);
  assert.equal(on.chars, chars, '바꿀 동료가 없으면 원본 그대로(사본을 만들지 않는다)');
  const specOnly = L.makeEnv({ chars, team: team({ ...runeOff(slot(ID.TAEHO)), rune: true }) });
  assert.equal(specOnly.chars[ID.TAEHO].actionsPerTurn, 2, '육성 설정을 켜도 도장이 켜져 있으면 2회');
  const lowStar = L.makeEnv({ chars, team: team({ ...runeOff(slot(ID.TAEHO)), rune: true, spec: { on: true, level: 60, evo: 2, pevo: 5, compat: 5, lv: {} } }) });
  assert.equal(lowStar.chars[ID.TAEHO].actionsPerTurn, 1, '★2 는 도장을 잠금해제할 수 없다(엔진 can_unlock_rune)');
  const off = L.makeEnv({ chars, team: team(runeOff(slot(ID.TAEHO))) });
  assert.equal(off.chars[ID.TAEHO].actionsPerTurn, 1);
  assert.equal(off.chars[ID.TAEHO].firstUltOnly, true);
  assert.equal(chars[ID.TAEHO].actionsPerTurn, 2, '원본 meta 는 바꾸지 않는다');
  // 필살기 리듬: 턴 1 필살기 뒤 보통 공격(엔진 hold_fatal — 쿨마다 쓰지 않는다)
  const dp = L.defaultPlan(off.chars[ID.TAEHO], 30, off);
  assert.equal(dp.length, 30);
  assert.deepEqual(dp.slice(0, 4), ['궁', '평', '평', '평']);
  assert.equal(L.pinFillKind(null, off.chars[ID.TAEHO]), 'default');
});

test('(a) 도장을 끈 이태호: 줄 길이 30(턴당 1개) · 임부언 받은 추가 행동 칸 없음 · 2칸 핀은 첫 행동만', () => {
  const tm = team(runeOff(slot(ID.TAEHO)));
  const env = L.makeEnv({ chars, team: tm });
  assert.equal(L.taehoFedTurns(tm[0], tm, 30, env), null);
  const line = L.lineFromPins(tm[0], { 3: '방' }, 30, env);
  assert.equal(line.length, 30);
  assert.deepEqual(line.slice(0, 4), ['궁', '평', '방', '평']);
  assert.deepEqual(L.lineFromPins(tm[0], { 2: '평궁' }, 30, env).slice(0, 3), ['궁', '평', '평'], '도장을 끄기 전의 2칸 핀은 첫 행동으로 읽는다');
  const tmOn = team(slot(ID.TAEHO));
  const envOn = L.makeEnv({ chars, team: tmOn });
  assert.ok(L.taehoFedTurns(tmOn[0], tmOn, 30, envOn).has(4), '도장이 켜져 있으면 임부언 필살기 턴(4)에 칸');
  assert.equal(L.lineFromPins(tmOn[0], { 2: '평궁' }, 30, envOn).length, 60);
});

test('(a) 실행 cfg: 도장을 끈 이태호의 줄은 턴당 1토큰(엔진 base_actions 1 과 정렬)', () => {
  const st = createStore({ storage: mem(), chars });
  st.set({ team: team(runeOff(slot(ID.TAEHO))), pins: { 3: { 1: '방' } } });
  const cfg = st.buildCfg({ mode: 'run' });
  const rot = cfg.team.find((m) => m.id === ID.TAEHO).rotation;
  assert.equal([...rot].length, 30);
  assert.equal(rot.slice(0, 4), '궁평방평');
  assert.equal(cfg.team.find((m) => m.id === ID.TAEHO).fedActions, null);
});

test('(b) 턴당 2회 핀 "궁" 은 "궁평" — 실행이 같으면 경고하지 않고, 다르면 경고', () => {
  const st = createStore({ storage: mem(), chars });
  st.set({ team: team(slot(ID.TAEHO)), pins: { 2: { 1: '궁' }, 3: { 1: '평궁' } } });
  const seq = (acts) => ({ seq: acts.map((a) => ({ p: 1, a })) });
  const probe = { plan: { 2: seq(['궁', '평']), 3: seq(['궁', '평']) } };
  assert.deepEqual(st.pinsIgnored(probe), [{ pos: 1, id: ID.TAEHO, turns: [3] }]);
});

test('(c) 칸 조각 · 설명: 턴당 행동 수를 넘는 행동만 추가 행동', () => {
  assert.deepEqual(actSegs(['궁', '평', '방'], 2).map((s) => [s.cls, s.extra]), [['ult', false], ['atk', false], ['def', true]]);
  assert.deepEqual(actSegs(['평', '궁'], 1).map((s) => s.extra), [false, true]);
  assert.deepEqual(actSegs([], 1), []);
  assert.equal(segsKey(actSegs(['평', '궁'], 1)), 'atk ult+');
  assert.equal(actsLabel(t, ['평', '궁'], 1), 'atk → ult+');
  assert.equal(actsLabel(t, ['궁', '평'], 2), 'ult → atk');
});

test('(d) 전투 로그 턴 요약: 턴당 행동 수 안의 반복은 추가 행동이 아니다', () => {
  const ev = (act, actorId, kind) => ({ turn: 1, act, actorId, kind, amount: 0 });
  const log = [ev(1, ID.TAEHO, '필살기'), ev(2, ID.TAEHO, '보통공격'), ev(3, ID.IMBUEON, '필살기'), ev(4, ID.TAEHO, '보통공격')];
  const g = groupTurns(log, (id) => (id === ID.TAEHO ? 2 : 1)).get(1);
  assert.deepEqual(g.main.filter((m) => m.id === ID.TAEHO).map((m) => m.extra), [false, false, true]);
  const legacy = groupTurns(log).get(1);
  assert.deepEqual(legacy.main.filter((m) => m.id === ID.TAEHO).map((m) => m.extra), [false, true, true], '턴당 행동 수를 모르면 종전처럼 두 번째부터');
});

test('(e) 모두 보통 공격 · 모두 방어: 필살기 칸은 그대로, 나머지만 채움 · 되돌리기 한 번', () => {
  const st = createStore({ storage: mem(), chars });
  st.set({ team: team(slot(ID.TAEHO)) });
  const env = st.env();
  const ricanoLine = () => L.lineFromPins(st.get().team[1], L.pinsRowOf(st.get().pins, 2), 30, env) || [];
  const tok = st.pins.fill(2, '방');
  assert.ok(tok);
  const line = ricanoLine();
  const ults = line.map((a, k) => (a === '궁' ? k + 1 : 0)).filter(Boolean);
  assert.deepEqual(ults.slice(0, 3), [4, 7, 10], '기본 필살기 리듬 유지');
  assert.ok(line.every((a) => a === '궁' || a === '방'), '나머지는 전부 방어');
  st.pins.revert(tok);
  assert.deepEqual(L.pinsRowOf(st.get().pins, 2), {}, '되돌리기 = 채우기 전');
  // 턴당 2회: 필살기가 아닌 행동 칸 전부(1턴 '궁방', 이후 '방방')
  st.plan.setFed(0, 7, '궁');
  const tokT = st.pins.fill(1, '방');
  const tl = L.lineFromPins(st.get().team[0], L.pinsRowOf(st.get().pins, 1), 30, st.env());
  assert.deepEqual(tl.slice(0, 6), ['궁', '방', '방', '방', '방', '방']);
  const fed = st.get().team[0].fedActions;
  assert.equal(fed[4], '방', '임부언에게 받은 추가 행동도 방어');
  assert.equal(fed[7], '궁', '받은 추가 행동의 필살기는 그대로');
  st.pins.revert(tokT);
  assert.deepEqual(st.get().team[0].fedActions, { 7: '궁' }, '되돌리기 = 받은 추가 행동까지 채우기 전');
  assert.equal(st.pins.fill(1, '궁'), null, '채우기는 보통 공격·방어만');
});

test('(f) 패턴 반복: from~to 행동을 뒤 턴에 같은 순서로 · 앞 턴 유지 · 구간 오류는 null', () => {
  const st = createStore({ storage: mem(), chars });
  st.set({ team: team(slot(ID.TAEHO)), pins: { 2: { 2: '방' }, 1: { 1: '궁평' } } });
  const tok = st.pins.repeat(2, 1, 4);   // 리카노: 평 방 평 궁 → 5~8, 9~12 …
  assert.ok(tok);
  const line = L.lineFromPins(st.get().team[1], L.pinsRowOf(st.get().pins, 2), 30, st.env());
  assert.deepEqual(line.slice(0, 12), ['평', '방', '평', '궁', '평', '방', '평', '궁', '평', '방', '평', '궁']);
  // 이태호(턴당 2회): 2턴 패턴 1~2 → 3·5·7 … = 1턴, 4·6 … = 2턴
  st.pins.set(2, 1, '평방');
  st.pins.repeat(1, 1, 2);
  const tl = L.lineFromPins(st.get().team[0], L.pinsRowOf(st.get().pins, 1), 30, st.env());
  assert.deepEqual(tl.slice(0, 8), ['궁', '평', '평', '방', '궁', '평', '평', '방']);
  assert.equal(st.pins.repeat(2, 3, 2), null, '끝 턴 < 시작 턴');
  assert.equal(st.pins.repeat(2, 1, 30), null, '뒤에 채울 턴 없음');
  st.pins.revert(tok);
  assert.deepEqual(L.pinsRowOf(st.get().pins, 2), { 2: '방' });
});

test('(g) 대각선 분할 칸: 띠 경계 k/n · 추가 행동 막대 너비 · 띠 가운데', () => {
  assert.equal(splitStyle(actSegs(['궁'], 1)), '', '한 행동 칸은 분할 없음');
  assert.equal(splitStyle([]), '');
  const two = splitStyle(actSegs(['궁', '평'], 2));
  assert.match(two, /var\(--pc-ult\) 0%, var\(--pc-ult\) calc\(50% - \.4px\), var\(--pc-atk\) calc\(50% \+ \.4px\), var\(--pc-atk\) 100%/);
  assert.match(two, /var\(--ds-line\) 50%/);
  assert.doesNotMatch(two, /right bottom/, '추가 행동이 없으면 막대 없음');
  assert.match(two, /background-repeat:no-repeat$/);
  // 이태호 + 받은 추가 행동: 마지막 띠가 닿는 아래 변 = 오른쪽 2/3
  assert.match(splitStyle(actSegs(['평', '평', '궁'], 2)), /background-size:66\.667% var\(--ds-bar, 3px\),auto,auto;background-position:right bottom,0 0,0 0/);
  // 턴당 1회 + 추가 행동 1: 두 번째 띠가 아래 변 전체
  assert.match(splitStyle(actSegs(['평', '궁'], 1)), /background-size:100% var\(--ds-bar, 3px\)/);
  // 추가 행동 둘(1회 + 2): 두 추가 띠가 아래 변 전체를 덮는다
  assert.match(splitStyle(actSegs(['평', '궁', '평'], 1)), /background-size:100% var\(--ds-bar, 3px\)/);
  // 넷 중 마지막 하나만 추가: 오른쪽 2/4
  assert.match(splitStyle(actSegs(['평', '평', '평', '궁'], 3)), /background-size:50% var\(--ds-bar, 3px\)/);
  assert.deepEqual([0, 1].map((k) => splitCenter(k, 2)), [0.25, 0.75]);
  assert.deepEqual([0, 1, 2].map((k) => splitCenter(k, 3)), [0.1667, 0.5, 0.8333]);
});
