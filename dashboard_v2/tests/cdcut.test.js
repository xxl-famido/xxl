/**
 * 하쿠이(10444) '자신 제외 아군 필살 CD −1' — 플래너가 동료 줄을 당겨 그리는 계약(해석 10444-AUTO-pull, 2026-10-07 사용자 결정).
 *   (a) 자동 동료: 줄은 보내지 않고(엔진이 같은 규칙으로 당김) 화면 표시용 autoView 만 당겨진다 — CD 3 동료 [3,6,8,11]
 *   (b) 직접 지정: 꽂은 칸은 그대로, 규칙 칸만 당겨 보낸다 · 핀 도구(모두 방어)가 같은 규칙으로 줄을 되살린다
 *   (c) 하쿠이가 없으면 줄이 종전과 같다([4,7,10])
 *   (d) 1번 자리 캐리 + 임부언: 당겨진 임부언 필살 턴·면역·받은 추가 행동 필살을 따라 자기 행동 필살 [3,6,9]
 *   (e) 안내용 cdCutSource — 받지 않는 동료(하쿠이 자신·턴당 2회·제토)는 null
 * 엔진과의 대조(무작위 편성·핀)는 tools/redesign/cdcut_parity.py 가 한다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARS } from './helpers/v1.js';
import * as L from '../src/core/plan.js';

const HAKUI = 10444, SHIN = 10402, GOLDEN = 10403, CHOI = 10416, DAYANG = 10412, LIMBUEON = 10410,
  TAEHO = 10423, ZETTO = 10441, MUMYEONG = 10443;
// sim_api.char_meta(10444) 의 계획 관련 필드(fixtures/chars.json 은 하쿠이 추가 전 스냅샷)
const HAKUI_META = { id: HAKUI, name: '은빛투신 하쿠이', role: '보조', priority: 1.01, fatalCd: 5, firstFatal: 2, singleUlt: false,
  autoExtra: false, grantsExtra: false, actionsPerTurn: 1, actionsPerTurnNoRune: 1, cdDefendReduce: 0, cdDefendPerStack: 0,
  cdDefendStackCap: 0, allyCdCut: { amt: 1, scope: 'others' } };
const chars = { ...CHARS, [HAKUI]: HAKUI_META };
const N = 12;

const team = (ids) => ids.map((id) => ({ id, rune: true }));
const ults = (line, n = N) => { const out = []; for (let t = 1; t <= n; t++) if (line[t - 1] === '궁') out.push(t); return out; };   // copy-lint-allow
const setup = (ids, pins = {}) => {
  const tm = team(ids);
  const env = L.makeEnv({ chars, team: tm });
  return { tm, env, eff: L.effectiveTeam(tm, pins, N, env) };
};

test('(a) 자동 동료: 줄은 보내지 않고 표시만 하쿠이 감소로 당겨진다', () => {
  const { eff, env } = setup([HAKUI, SHIN, GOLDEN, CHOI, DAYANG]);
  for (let i = 1; i < 5; i++) {
    assert.equal(eff[i].rotation, '', `자리 ${i + 1} 은 엔진 자동 계획`);
    assert.deepEqual(ults(eff[i].autoView), [3, 6, 8, 11]);
    assert.deepEqual(ults(L.planView(eff[i], i, eff, N, env).view), [3, 6, 8, 11]);
  }
  assert.equal(eff[0].autoView, undefined, '하쿠이 자신은 받지 않는다');
  assert.deepEqual(ults(L.planView(eff[0], 0, eff, N, env).view), [2, 7, 12]);
});

test('(b) 직접 지정: 꽂은 칸은 그대로 · 규칙 칸만 당겨 보낸다 · 핀 도구도 같은 규칙', () => {
  const { tm, env, eff } = setup([HAKUI, SHIN, GOLDEN, CHOI, DAYANG], { 5: { 2: '방' } });
  const line = eff[1].plan;
  assert.equal(eff[1].rotation, line.join(''));
  assert.equal(line[4], '방');
  assert.deepEqual(ults(line), [3, 6, 8, 11]);
  const row = L.fillRowPins(tm[1], 1, tm, {}, N, '방', env);           // 모두 방어 — 필살기 칸은 유지
  const eff2 = L.effectiveTeam(tm, L.withPinsRow({}, 2, row), N, env);
  assert.deepEqual(ults(eff2[1].plan), [3, 6, 8, 11]);
  assert.ok(eff2[1].plan.slice(0, N).every((a) => a === '궁' || a === '방'));
});

test('(c) 하쿠이가 없으면 자동·직접 지정 줄이 종전과 같다', () => {
  const { eff, env } = setup([MUMYEONG, SHIN, GOLDEN, CHOI, DAYANG], { 5: { 2: '방' } });
  assert.deepEqual(ults(eff[1].plan), [4, 7, 10]);
  assert.equal(eff[2].autoView, undefined);
  assert.deepEqual(ults(L.planView(eff[2], 2, eff, N, env).view), [4, 7, 10]);
});

test('(d) 1번 자리 캐리 + 임부언: 당겨진 임부언 필살·면역·받은 추가 행동 필살을 따라간다', () => {
  // 엔진(tests/test_hakui.py::test_auto_pull_fed_carry_double_ult_with_limbueon): 신리랑 자기 행동 필살 3·6·9
  //   (3·6턴은 임부언 −3 → 받은 추가 행동에서 한 번 더, 7턴 하쿠이 −1·8턴 임부언 −3 은 면역으로 무효)
  const { eff, env } = setup([SHIN, LIMBUEON, HAKUI, CHOI, DAYANG]);
  assert.deepEqual(ults(eff[1].autoView), [3, 6, 8, 11]);
  assert.deepEqual([...L.imbueonUltTurns(eff, N, env)], [3, 6, 8, 11]);
  // 11턴: 임부언 −3 → 받은 추가 행동 필살(면역 11~13) → 12턴 하쿠이 −1 무효 → 자기 행동 필살은 3·6·9 (엔진 프로브와 같음)
  assert.deepEqual(ults(L.planView(eff[0], 0, eff, N, env).view), [3, 6, 9]);
});

test('(e) cdCutSource: 받는 동료만 하쿠이, 하쿠이 자신·턴당 2회·제토는 null', () => {
  const tm = team([HAKUI, SHIN, TAEHO, ZETTO, DAYANG]);
  const env = L.makeEnv({ chars, team: tm });
  assert.equal(L.cdCutSource(tm, 0, env), null);
  assert.equal(L.cdCutSource(tm, 1, env).id, HAKUI);
  assert.equal(L.cdCutSource(tm, 2, env), null);
  assert.equal(L.cdCutSource(tm, 3, env), null);
  assert.equal(L.cdCutSource(team([SHIN, DAYANG]), 0, L.makeEnv({ chars })), null);
});
