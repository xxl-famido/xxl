/**
 * 정적 DOM 참조 검사 — JS가 찾는 id/data 속성이 마크업에 실제로 있는지 본다.
 *
 * `node --check`는 문법만 보고, 마크업 삽입이 조용히 실패해 `$('#x')`가 null이 되는 오류는
 * 실행해야 드러난다(실제로 두 번 겪음). uitest.js가 그걸 잡지만 서버와 jsdom이 필요하다.
 * 이 검사는 **의존성 없이 1초**에 같은 부류의 상당수를 걸러낸다 — 커밋 전 첫 관문용.
 *
 *   node tools/domlint.js        (문제 있으면 종료코드 1)
 */
const fs = require('fs');
const path = require('path');

const DASH = path.join(__dirname, '..', 'dashboard');
const js = fs.readFileSync(path.join(DASH, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(DASH, 'index.html'), 'utf8');

// 마크업에서 실제로 만들어지는 id: 정적 속성 + 런타임 대입(el.id = 'x')
const have = new Set();
for (const src of [html, js]) {
  for (const m of src.matchAll(/id=["']([\w-]+)["']/g)) have.add(m[1]);
}
for (const m of js.matchAll(/\.id\s*=\s*['"]([\w-]+)['"]/g)) have.add(m[1]);

// JS가 참조하는 id. 계산된 선택자($('#cmp' + side))는 접두사만 남아 오탐이므로 건너뛴다.
const refs = new Map();
const line = (i) => js.slice(0, i).split('\n').length;
for (const m of js.matchAll(/\$\('#([\w-]+)'(\s*\+)?/g)) {
  if (m[2]) continue;                       // '#cmp' + ... = 동적 조합
  if (!refs.has(m[1])) refs.set(m[1], line(m.index));
}
for (const m of js.matchAll(/getElementById\(['"]([\w-]+)['"]\)/g)) {
  if (!refs.has(m[1])) refs.set(m[1], line(m.index));
}
for (const m of js.matchAll(/\.id === ['"]([\w-]+)['"]/g)) {
  if (!refs.has(m[1])) refs.set(m[1], line(m.index));
}

// data 속성: dataset.foo 로 읽는 것이 data-foo 로 실제 붙는지 (값 없는 속성도 인정)
const dataHave = new Set();
for (const src of [html, js]) {
  for (const m of src.matchAll(/data-([a-z][\w-]*)/gi)) dataHave.add(m[1].toLowerCase());
}
const dataRefs = new Map();
for (const m of js.matchAll(/dataset\.([a-zA-Z]\w*)/g)) {
  const k = m[1].toLowerCase();
  if (!dataRefs.has(k)) dataRefs.set(k, line(m.index));
}

const problems = [];
for (const [id, ln] of refs) if (!have.has(id)) problems.push(`app.js:${ln}  #${id} — 마크업에 없음`);
for (const [d, ln] of dataRefs) if (!dataHave.has(d)) problems.push(`app.js:${ln}  data-${d} — 마크업에 없음`);

console.log(`id 참조 ${refs.size} · data 참조 ${dataRefs.size} 검사`);
if (problems.length) {
  problems.forEach((p) => console.log('  ✗ ' + p));
  console.log(`\n실패 ${problems.length}건 — 마크업 삽입이 누락됐을 가능성이 큽니다`);
  process.exit(1);
}
console.log('통과 — 참조가 모두 마크업에 존재');
