/**
 * dashboard/spec.js ↔ woofia_sim/stats.py 대조 검사.
 *
 * 스펙 패널은 서버 왕복 없이 스탯을 즉시 보여주려고 공식을 JS에도 두고 있다.
 * 두 구현이 갈라지면 화면 숫자와 시뮬 결과가 조용히 달라지므로, 파이썬이 만든
 * 골든값과 전수 비교한다. (같은 부류의 사고를 turnPlans 때 겪었다.)
 *
 * 평소에는 tests/test_spec_js.py 가 골든을 임시로 구워 이 검사를 돌린다(산출물이
 * 수 MB라 저장소에 두지 않는다). 수동으로 볼 때만 아래처럼 쓴다.
 *
 *   python tools/statgolden.py                           (골든 생성)
 *   node tools/statcheck.js [골든경로]                    (검사, 실패 시 종료코드 1)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SPEC = require(path.join(ROOT, 'dashboard', 'spec.js'));
const GOLDEN = process.argv[2] || path.join(__dirname, 'statgolden.json');

if (!fs.existsSync(GOLDEN)) {
  console.log(`골든 파일 없음: ${GOLDEN}\n  python tools/statgolden.py 로 생성하세요`);
  process.exit(2);
}
const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));

let checked = 0;
const bad = [];
const cmp = (label, got, want) => {
  checked++;
  if (got !== want) bad.push(`${label}  JS=${got}  PY=${want}`);
};

for (const g of golden.gating) {
  cmp(`unlockedPassives(${g.evo})`, SPEC.unlockedPassives(g.evo), g.unlocked);
  cmp(`levelablePassives(${g.evo})`, SPEC.levelablePassives(g.evo), g.levelable);
  cmp(`canUnlockRune(${g.evo})`, SPEC.canUnlockRune(g.evo), g.rune);
  cmp(`pevoCap(${g.evo})`, SPEC.pevoCap(g.evo), g.pevoCap);
}

for (const r of golden.stats) {
  const [atk, hp] = SPEC.scaleAtkHp(r.baseATK, r.baseHP, r.rarity, r.inv);
  const key = `${r.id} Lv${r.inv.level}★${r.inv.evo}p${r.inv.pevo}b${r.inv.compat}s${r.inv.sigil}`;
  cmp(`${key} ATK`, atk, r.atk);
  cmp(`${key} HP`, hp, r.hp);
}

for (const s of golden.slotStates) {
  cmp(`slotState(${s.slot},★${s.evo})`, SPEC.slotState(s.slot, s.evo), s.state);
}

console.log(`대조 ${checked}건 (스탯 ${golden.stats.length}조합 · 게이팅 ${golden.gating.length}성급)`);
if (bad.length) {
  bad.slice(0, 20).forEach((b) => console.log('  ✗ ' + b));
  if (bad.length > 20) console.log(`  … 외 ${bad.length - 20}건`);
  console.log(`\n실패 ${bad.length}건 — spec.js 와 stats.py 가 어긋났습니다`);
  process.exit(1);
}
console.log('통과 — JS 공식이 파이썬과 완전히 일치');
