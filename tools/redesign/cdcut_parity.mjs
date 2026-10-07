// 하쿠이 '자신 제외 아군 필살 CD −1' — JS 플래너 쪽 계산(cdcut_parity.py 가 부른다, 해석 10444-AUTO-pull).
//   node tools/redesign/cdcut_parity.mjs <입력 JSON> <출력 JSON>
//   입력 { chars: {id: meta}, cases: [{ team: [{id, priority?}|null], pins: {턴: {자리: 값}}, turns, overrides? }] }
//   출력 [{ lines: [rotation 문자열|''], views: [[필살 턴…]|null], cut: [true|false], demoted: [true|false] }] — 자리 순서
import fs from 'node:fs';
import { makeEnv, effectiveTeam, planView, cdCutSource } from '../../dashboard_v2/src/core/plan.js';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('usage: node cdcut_parity.mjs <in.json> <out.json>');
  process.exit(2);
}
const { chars, cases } = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const out = cases.map((c) => {
  const team = c.team.map((s) => (s ? { id: s.id, rune: true, ...(s.priority != null ? { priority: s.priority } : {}) } : null));
  const env = makeEnv({ chars, altar: null, team, overrides: c.overrides || null });
  const eff = effectiveTeam(team, c.pins || {}, c.turns, env);
  const lines = eff.map((s) => (s && s.rotation) || '');
  const views = eff.map((s, i) => {
    if (!s) return null;
    const meta = env.chars[s.id] || {};
    if ((meta.actionsPerTurn || 1) !== 1) return null;
    const v = planView(s, i, eff, c.turns, env).view;
    const turns = [];
    for (let t = 1; t <= c.turns; t++) if (v[t - 1] === '궁') turns.push(t);
    return turns;
  });
  const cut = team.map((s, i) => !!(s && cdCutSource(team, i, env)));
  // 쿨 미충족으로 화면이 내린 '꽂은 필살기' 칸이 있는 줄(엔진 '차는 즉시 폴백' 예약) — 기존 차이 유형 분류용
  const demoted = eff.map((s, i) => {
    if (!s || !s.plan) return false;
    const v = planView(s, i, eff, c.turns, env).view;
    return Object.keys(c.pins || {}).some((t) => (c.pins[t] || {})[i + 1] === '궁' && v[+t - 1] !== '궁');
  });
  return { lines, views, cut, demoted };
});
fs.writeFileSync(outPath, JSON.stringify(out));
