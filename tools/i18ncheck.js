/**
 * 다국어 커버리지 검사 — 화면을 실제로 띄워 '번역되지 않고 남은 한국어'를 찾는다.
 *
 * i18n.js 는 렌더된 DOM 위에 텍스트를 덮어쓰는 오버레이라, 소스만 훑어서는
 * 무엇이 실제로 화면에 뜨는지 알 수 없다. 그래서 jsdom 으로 각 화면을 열어
 * 텍스트 노드와 title/placeholder 를 모은 뒤, 언어별로 translateString 을 돌려
 * 한글이 남는 것만 보고한다.
 *
 *   python server.py &  →  node tools/i18ncheck.js            (실패 시 종료코드 1)
 *                          node tools/i18ncheck.js --keys     (누락분을 EXACT 초안으로 출력)
 */
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('jsdom 필요: npm install --no-save jsdom'); process.exit(2); }
const fs = require('fs'), path = require('path');
const BASE = process.env.UITEST_BASE || 'http://localhost:8777';
const DASH = path.join(__dirname, '..', 'dashboard');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HANGUL = /[가-힣]/;
const KEYS_ONLY = process.argv.includes('--keys');

async function boot() {
  const dom = new JSDOM(fs.readFileSync(path.join(DASH, 'index.html'), 'utf8'),
    { url: BASE + '/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  w.fetch = (u, o) => fetch(new URL(u, BASE).href, o);
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
  w.Worker = function () {};
  w.CompressionStream = CompressionStream; w.DecompressionStream = DecompressionStream;
  w.Response = Response; w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
  w.atob = (s) => Buffer.from(s, 'base64').toString('binary');
  w.eval(fs.readFileSync(path.join(DASH, 'spec.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(DASH, 'app.js'), 'utf8') + `
    ;window.__a={get CHARS(){return CHARS},get team(){return team},
      openModal(i){return openModal(i)}, openSpecPanel(i){return openSpecPanel(i)},
      get cmpTeam(){return cmpTeam},set cmpTeam(v){cmpTeam=v},
      get cmpCommon(){return cmpCommon},get cmpAdvOn(){return cmpAdvOn},
      openCmpInfo(c){return openCmpInfo(c)}, openPrioPop(x){return openPrioPop(x)}};`);
  // i18n.js 는 IIFE 라 내부가 닫혀 있다 — module 을 미리 만들어 두면 끝에서 내보내 준다
  w.module = { exports: {} };
  w.eval(fs.readFileSync(path.join(DASH, 'i18n.js'), 'utf8'));
  const A = w.__a, I = w.module.exports;
  while (!Object.keys(A.CHARS || {}).length) await sleep(80);
  while (!A.team || A.team.filter(Boolean).length < 3) await sleep(80);
  return { w, A, I };
}

/** 지금 DOM에 떠 있는 한국어 문자열을 모은다 (텍스트 노드 + title/placeholder). */
function collect(w, into, where) {
  const d = w.document;
  const tw = d.createTreeWalker(d.body, w.NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || ['SCRIPT', 'STYLE'].includes(p.tagName) || p.closest('.i18n-skip')) return w.NodeFilter.FILTER_REJECT;
      return n.nodeValue && HANGUL.test(n.nodeValue) ? w.NodeFilter.FILTER_ACCEPT : w.NodeFilter.FILTER_REJECT;
    },
  });
  let n;
  while ((n = tw.nextNode())) {
    const s = n.nodeValue.trim();
    if (s && !into.has(s)) into.set(s, where);
  }
  d.querySelectorAll('[title],[placeholder]').forEach((el) => {
    if (el.closest('.i18n-skip')) return;
    for (const a of ['title', 'placeholder']) {
      const v = (el.getAttribute(a) || '').trim();
      if (v && HANGUL.test(v) && !into.has(v)) into.set(v, `${where}(${a})`);
    }
  });
}

(async () => {
  const { w, A, I } = await boot();
  const d = w.document;
  const click = (el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const found = new Map();

  collect(w, found, '메인');

  // 가이드
  click(d.querySelector('#guideBtn'));
  await sleep(300);
  collect(w, found, '가이드');
  d.querySelector('#guideModal').hidden = true;

  // 캐릭터 모달 + 스펙 패널 (켠 상태 · 스타를 낮춰 잠금 문구까지)
  await A.openModal(0);
  await sleep(500);
  collect(w, found, '캐릭터 모달');
  A.openSpecPanel(0);
  await sleep(400);
  collect(w, found, '스펙 패널(꺼짐)');
  d.querySelector('#csUse').checked = true;
  d.querySelector('#csUse').dispatchEvent(new w.Event('change'));
  await sleep(300);
  collect(w, found, '스펙 패널(켜짐)');
  for (const evo of [0, 2, 3]) {
    const r = d.querySelector('#csEvo');
    r.value = String(evo);
    r.dispatchEvent(new w.Event('input')); r.dispatchEvent(new w.Event('change'));
    await sleep(250);
    collect(w, found, `스펙 패널(스타${evo})`);
  }
  d.querySelector('#csClose').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(300);
  d.querySelector('#modal').hidden = true;

  // 행동 고급 설정
  click(d.querySelector('#advOpen'));
  await sleep(400);
  collect(w, found, '고급 설정(꺼짐)');
  d.querySelector('#advSwitch').checked = true;
  d.querySelector('#advSwitch').dispatchEvent(new w.Event('change'));
  await sleep(2500);
  collect(w, found, '고급 설정(켜짐)');
  click(d.querySelector('#advGridBtn'));            // 전체 보기
  await sleep(600);
  collect(w, found, '고급 설정(전체 보기)');
  click(d.querySelector('#advCopy'));
  await sleep(300);
  collect(w, found, '고급 설정(복사 후)');
  click(d.querySelector('[data-advclose]'));
  await sleep(500);
  d.querySelector('.priopop')?.remove();

  // 비교 모달의 캐릭터 카드
  A.cmpTeam = { a: [{ id: 10409, skill: 10, rune: true, rotation: '' }], b: [] };
  A.openCmpInfo({ id: 10409, name: '카 라트', elementKey: 'water', position: 1,
                  damage: null, cfg: A.cmpTeam.a[0], slotIdx: 0, side: 'a' });
  await sleep(300);
  collect(w, found, '비교 카드');
  click(d.querySelector('[data-cspec]'));
  await sleep(400);
  collect(w, found, '비교 스펙 패널');
  d.querySelector('.cmpinfo')?.remove();

  // ── 언어별 커버리지 ──
  const LANGS = ['en', 'zh', 'zhs', 'ja'];
  const charNames = new Set(Object.values(A.CHARS).map((c) => (c.name || '').trim()).filter(Boolean));
  const missing = new Map();          // 문자열 → 못 하는 언어 목록
  for (const code of LANGS) {
    I._setLang(code);
    await I.loadNames(code);
    for (const [s, where] of found) {
      if (charNames.has(s)) continue;                     // 캐릭터 이름은 names 로 처리
      const out = I.translateString(s);
      if (out == null || HANGUL.test(out)) {
        if (!missing.has(s)) missing.set(s, { where, langs: [] });
        missing.get(s).langs.push(code);
      }
    }
  }
  I._setLang('kr');

  console.log(`화면에서 수집한 한국어 ${found.size}개 · 언어 ${LANGS.length}종`);
  if (!missing.size) { console.log('\n통과 — 모든 언어에서 남는 한국어 없음'); process.exit(0); }

  if (KEYS_ONLY) {                                        // i18n.js 에 붙일 초안
    for (const [s] of missing) console.log(`        ${JSON.stringify(s)}:\n          '',`);
    process.exit(0);
  }
  const byWhere = new Map();
  for (const [s, v] of missing) {
    if (!byWhere.has(v.where)) byWhere.set(v.where, []);
    byWhere.get(v.where).push([s, v.langs]);
  }
  console.log(`\n번역 누락 ${missing.size}개:`);
  for (const [where, list] of byWhere) {
    console.log(`\n  [${where}]`);
    for (const [s, langs] of list) {
      const tag = langs.length === LANGS.length ? '전 언어' : langs.join(',');
      console.log(`    (${tag}) ${s.length > 90 ? s.slice(0, 90) + '…' : s}`);
    }
  }
  console.log(`\n실패 ${missing.size}건`);
  process.exit(1);
})().catch((e) => { console.log('FAIL', e.stack); process.exit(1); });
