/**
 * 공유 코드 코덱 검사 — 왕복 무결성 + 형식 선택 + 구코드 호환.
 *
 * 기록 내보내기/불러오기와 공유 코드는 같은 코덱을 쓴다. 여기서 보는 것:
 *   1) 새 기능을 안 쓰면 **예전과 같은 '#' 코드**가 그대로 나오는가 (바이트 동일)
 *   2) 스펙·고급 설정을 쓰면 '$'(개선판)로 가고, 코드가 실제로 짧아지는가
 *   3) 어떤 형식이든 왕복하면 값이 온전한가 (특히 '빈 턴'과 '미지정 턴' 구분)
 *   4) 예전에 만든 '#'·'*' 코드가 여전히 열리는가
 *
 *   python server.py &  →  node tools/codeccheck.js      (실패 시 종료코드 1)
 */
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('jsdom 필요: npm install --no-save jsdom'); process.exit(2); }
const fs = require('fs'), path = require('path');
const BASE = process.env.UITEST_BASE || 'http://localhost:8777';
const DASH = path.join(__dirname, '..', 'dashboard');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => { fails++; console.log('  ✗ ' + m); };

async function boot() {
  const dom = new JSDOM(fs.readFileSync(path.join(DASH, 'index.html'), 'utf8'),
    { url: BASE + '/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  w.fetch = (u, o) => fetch(new URL(u, BASE).href, o);
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
  w.Worker = function () {};
  // jsdom에 없는 브라우저 API를 node 것으로 채운다
  w.CompressionStream = CompressionStream; w.DecompressionStream = DecompressionStream;
  w.Response = Response; w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
  w.atob = (s) => Buffer.from(s, 'base64').toString('binary');
  w.eval(fs.readFileSync(path.join(DASH, 'spec.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(DASH, 'app.js'), 'utf8') + `
    ;window.__c={get CHARS(){return CHARS},
      compressCode(r){return compressCode(r)}, decompressCode(c){return decompressCode(c)},
      packRecords(r,v){return packRecords(r,v)}, unpackRecords(a,v){return unpackRecords(a,v)},
      encTP(t){return _encTP(t)}, decTP(s){return _decTP(s)}};`);
  const A = w.__c;
  while (!Object.keys(A.CHARS || {}).length) await sleep(80);
  return A;
}

const TEAM = () => [10423, 10410, 10421, 10439, 10428]
  .map((id) => ({ id, skill: 10, rune: true, rotation: '' }));
const rec = (extra = {}, id = 1) => ({
  id, total: 1234567, snap: {
    team: TEAM(), turns: 30, dummies: 1, enemyHits: 'all', dummyElement: 0, runs: 50,
    forceProc: false, hp10: false, incomingOn: false, incomingPct: 0,
    turnOverrides: {}, advOn: false, turnPlans: {}, ...extra,
  },
});
const denseTP = () => {
  const tp = {};
  for (let t = 1; t <= 30; t++) {
    const n = 5 + (t % 4 === 0 ? 4 : 0);
    tp[t] = Array.from({ length: n }, (_, i) => ({ p: (i % 5) + 1, a: ['평', '궁', '방'][(t + i) % 3] }));
  }
  return tp;
};
const SPEC = () => ({ on: true, level: 47, evo: 3, pevo: 11, compat: 4,
  lv: { basicAtk: 8, ultimate: 9, sigil: 9, passive0: 10, passive1: 7, passive2: 10, passive3: 10, passive4: 6 } });

// 값이 온전한가 — 키 순서는 복원 과정에서 달라지므로 정렬해 비교한다(label은 재생성이라 제외)
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) { if (k !== 'label') o[k] = canon(v[k]); }
    return o;
  }
  return v;
}
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
/** 새 기능은 느슨하게 넘어가면 안 되므로 따로 엄격 비교한다. */
function newFeaturesSame(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (JSON.stringify(canon(a[i].snap.turnPlans || {})) !== JSON.stringify(canon(b[i].snap.turnPlans || {}))) return 'turnPlans';
    const A2 = a[i].snap.team || [], B2 = b[i].snap.team || [];
    for (let j = 0; j < A2.length; j++) {
      if (JSON.stringify(canon((A2[j] || {}).spec || null)) !== JSON.stringify(canon((B2[j] || {}).spec || null))) return `team[${j}].spec`;
    }
  }
  return null;
}

(async () => {
  const A = await boot();
  const roundTrip = async (records) => {
    const code = await A.compressCode(records);
    const back = JSON.parse(await A.decompressCode(code));
    return { code, back, tag: code[0] };
  };

  // ── 1. 새 기능 미사용 → 예전과 같은 '#'
  {
    const r = [rec()];
    const { code, back, tag } = await roundTrip(r);
    tag === '#' ? ok(`미사용 기록은 기존 '#' 형식 유지 (${code.length}자)`) : bad(`미사용인데 태그 ${tag}`);
    same(r, back) ? ok('미사용 왕복 무결') : bad('미사용 왕복에서 값 변형');
  }

  // ── 2. 새 기능 사용 → '$' 로 가고 짧아진다
  let lenV1 = 0, lenV2 = 0;
  {
    const r = [rec({ advOn: true, turnPlans: denseTP() })];
    r[0].snap.team.forEach((t) => { t.spec = SPEC(); });
    const { code, back, tag } = await roundTrip(r);
    tag === '$' ? ok(`스펙·고급 설정 기록은 개선판 '$' 사용`) : bad(`새 기능인데 태그 ${tag}`);
    const nf = newFeaturesSame(r, back);
    same(r, back) && !nf ? ok('개선판 왕복 무결 (30턴 타임라인 + 5명 스펙)')
                         : bad(`개선판 왕복에서 값 변형 ${nf || ''}`);
    lenV2 = code.length;
    // 같은 내용을 구형식으로 강제해 길이 비교
    const v1 = JSON.stringify(A.packRecords(r, false));
    lenV1 = v1.length;
    console.log(`      전처리 JSON  구형식 ${lenV1}B  →  개선판 ${JSON.stringify(A.packRecords(r, true)).length}B`);
  }

  // ── 3. 경계: '빈 턴'(아무도 행동 안 함)과 '미지정 턴'은 다르다
  {
    const tp = { 1: [{ p: 1, a: '궁' }], 3: [], 5: [{ p: 5, a: '방' }] };
    const enc = A.encTP(tp);
    const dec = A.decTP(enc);
    JSON.stringify(dec) === JSON.stringify(tp)
      ? ok(`빈 턴·미지정 턴 구분 보존 ("${enc}")`) : bad(`구분 실패 ${enc} → ${JSON.stringify(dec)}`);
    const r = [rec({ advOn: true, turnPlans: tp })];
    const { back } = await roundTrip(r);
    same(r, back) ? ok('희소 타임라인 왕복 무결') : bad('희소 타임라인 왕복 실패');
  }

  // ── 4. 표현 밖 값이면 구형식으로 물러난다 (버려지지 않는다)
  {
    const r = [rec({ advOn: true, turnPlans: { 1: [{ p: 9, a: '궁' }] } })];
    A.encTP(r[0].snap.turnPlans) === null ? ok('범위 밖 포지션은 개선판이 거부') : bad('범위 밖인데 개선판이 받음');
    const { back, tag } = await roundTrip(r);
    tag !== '$' ? ok(`범위 밖은 구형식/전체로 폴백 (태그 ${tag})`) : bad('범위 밖인데 개선판으로 나감');
    same(r, back) ? ok('폴백 경로도 값 보존') : bad('폴백에서 값 유실');
  }

  // ── 5. 스펙만 / 고급 설정만
  for (const [name, r] of [
    ['스펙만', (() => { const x = [rec()]; x[0].snap.team.forEach((t) => { t.spec = SPEC(); }); return x; })()],
    ['고급 설정만', [rec({ advOn: true, turnPlans: denseTP() })]],
  ]) {
    const { back, tag, code } = await roundTrip(r);
    tag === '$' ? ok(`${name} → '$' (${code.length}자)`) : bad(`${name} 태그 ${tag}`);
    same(r, back) ? ok(`${name} 왕복 무결`) : bad(`${name} 왕복 실패`);
  }

  // ── 6. 여러 건 · 섞인 기록
  {
    const mixed = [rec({}, 1), rec({ advOn: true, turnPlans: denseTP() }, 2), rec({}, 3)];
    mixed[2].snap.team[0].spec = SPEC();
    const { back, tag, code } = await roundTrip(mixed);
    tag === '$' ? ok(`섞인 3건 → '$' (${code.length}자)`) : bad(`섞인 기록 태그 ${tag}`);
    same(mixed, back) ? ok('섞인 기록 왕복 무결') : bad('섞인 기록 왕복 실패');
  }

  // ── 7. 구코드 호환 — 예전 '#'(타임라인을 날것으로 담은 형태)도 열려야 한다
  {
    const r = [rec({ advOn: true, turnPlans: { 2: [{ p: 1, a: '궁' }, { p: 3, a: '평' }] } })];
    const legacy = A.packRecords(r, false);                 // 구형식으로 직접 굽고
    const back = A.unpackRecords(JSON.parse(JSON.stringify(legacy)), false);
    same(r, back) ? ok("구형식 '#' 기록 그대로 복원") : bad('구형식 복원 실패');
  }

  // ── 8. 구버전 스펙 문자열(스킬 8자 고정)도 읽혀야 한다
  {
    const r = [rec()];
    r[0].snap.team[0].spec = { on: true, level: 60, evo: 5, pevo: 0, compat: 5,
      lv: Object.fromEntries(['basicAtk', 'ultimate', 'sigil', 'passive0', 'passive1', 'passive2', 'passive3', 'passive4'].map((k) => [k, 10])) };
    const { back } = await roundTrip(r);
    const sp = back[0].snap.team[0].spec;
    sp && sp.on && sp.lv.passive4 === 10 ? ok('전 슬롯 10인 스펙도 왕복 (생략분 복원)') : bad(`스펙 복원 이상 ${JSON.stringify(sp)}`);
  }

  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL', e.stack); process.exit(1); });
