// v2 공개 후 라이브 점검(읽기 전용 — 서버에 아무것도 쓰지 않는다. 기록·초안은 임시 브라우저 프로필의 localStorage 에만 생김).
//   NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/live_smoke_v2.js [base]
//   base 기본값 https://xxl-famido.github.io/xxl/   (로컬 정적 빌드 확인: http://127.0.0.1:8790/)
// 검사
//   v2: 부팅(Pyodide) → 자동 실행 결과 · ≡ 메뉴에 「구버전」 · 딥링크(#code=…&run=1) 적용
//   v1: v1/ 부팅 → 실행 → 「새 버전」 링크 · 빌드 버전 주입
//   왕복: v1 기록 → v2 기록 목록에 보임, v2 공유 코드 → v1 에서 해독(같은 기록)
//   라운지: lounge.html 이 있으면 live_smoke_lounge.js(읽기 전용)를 이어서 실행, 없으면 "빌드에서 제외됨" 확인
const puppeteer = require('puppeteer-core');
const { spawnSync } = require('child_process');
const path = require('path');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let BASE = process.argv[2] || 'https://xxl-famido.github.io/xxl/';
if (!BASE.endsWith('/')) BASE += '/';
const SKIP_LOUNGE_SMOKE = process.argv.includes('--no-lounge-smoke');

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function watch(page, errs, tag) {
  page.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));
  // 게이트 탐침(lounge.html·v1/index.html HEAD)의 404 는 의도된 것 — 라운지 제외·로컬 개발 빌드에서 정상.
  page.on('console', (m) => { const u = (m.location() && m.location().url) || ''; if (m.type() === 'error' && !/favicon|lounge\.html|v1\/index\.html/.test(m.text() + u)) errs.push(`${tag} console: ${m.text()} ${u}`); });
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400 && !/favicon|lounge\.html|v1\/index\.html/.test(u)) errs.push(`${tag} http ${r.status()} ${u}`);
  });
}

async function bootV2(page, hash = '') {
  await page.goto(BASE + '?t=' + Date.now() + hash, { waitUntil: 'domcontentloaded', timeout: 90000 });
  try {
    await page.waitForFunction(() => window.__woofia && window.__woofia.store.get().ui && window.__woofia.store.get().ui.booted, { timeout: 180000 });
    await page.waitForFunction(() => !!window.__woofia.store.get().result, { timeout: 180000 });
  } catch (e) {
    const st = await page.evaluate(() => { const w = window.__woofia; const s = w && w.store.get();
      return s ? { booted: s.ui.booted, result: !!s.result, busy: s.ui.busy, hash: location.hash } : { ctx: false, boot: (document.getElementById('app-boot') || {}).textContent }; }).catch(() => null);
    throw new Error(`v2 부팅 대기 실패 ${JSON.stringify(st)}`);
  }
}
async function bootV1(page) {
  await page.goto(BASE + 'v1/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('boot') && typeof CHARS !== 'undefined' && Object.keys(CHARS).length > 30
    && document.querySelector('#teamSlots') && document.querySelector('#teamSlots').children.length > 0, { timeout: 180000 });
}

(async () => {
  // 정적 파일
  const vRoot = await (await fetch(BASE + 'version.json', { cache: 'no-store' })).json().catch(() => null);
  const vV1 = await (await fetch(BASE + 'v1/version.json', { cache: 'no-store' })).json().catch(() => null);
  ok(!!(vRoot && vRoot.updated), `version.json (${vRoot && vRoot.updated})`);
  ok(!!(vV1 && vV1.updated === (vRoot && vRoot.updated)), 'v1/version.json 이 같은 빌드');
  const loungeRes = await fetch(BASE + 'lounge.html', { cache: 'no-store' });
  const loungeHtml = loungeRes.ok ? await loungeRes.text() : '';
  const loungeApi = (/<meta name="lounge-api" content="([^"]*)">/.exec(loungeHtml) || [])[1] || '';

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const errs = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    watch(page, errs, 'v2');

    // ── v2 부팅·실행
    await bootV2(page);
    const r2 = await page.evaluate(() => { const s = window.__woofia.store.get(); return { total: s.result && s.result.meta && s.result.meta.totalMid, team: s.team.filter(Boolean).length }; });
    ok(r2.total > 0, `v2 부팅·자동 실행 (합계 ${Math.round(r2.total || 0)})`);

    // ── ≡ 메뉴 「구버전」
    await sleep(500);
    const menuBtn = await page.$('.topnav button[aria-haspopup="menu"]');
    if (menuBtn) { await menuBtn.click(); await sleep(400); }
    const hasOld = await page.evaluate(() => [...document.querySelectorAll('.top-menu [role^="menuitem"], .top-menu button')].some((b) => /구버전|Classic version|旧バージョン|舊版/.test(b.textContent)));
    ok(hasOld, '≡ 메뉴에 「구버전」');
    await page.keyboard.press('Escape');

    // ── 라운지 링크 게이트
    const loungeShown = await page.evaluate(() => { const a = document.querySelector('.tb-lounge'); return !!a && !a.hidden; });
    ok(loungeRes.ok ? loungeShown : !loungeShown, loungeRes.ok ? `라운지 공개(서버 ${loungeApi || '없음'}) · 상단바 링크 보임` : '라운지 빌드 제외 · 상단바 링크 숨김');
    if (loungeRes.ok) ok(/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(loungeApi), '공개된 라운지가 서버 주소를 가짐(목업 공개 아님)');

    // ── 공유 코드(v2 → 딥링크)
    const code = await page.evaluate(async () => {
      const w = window.__woofia;
      const n0 = w.store.get().records.length;
      await w.run();                                   // 실행 버튼과 같은 경로(기록 1건 저장)
      for (let k = 0; k < 600 && w.store.get().records.length === n0; k++) await new Promise((r) => setTimeout(r, 100));
      const rec = w.store.get().records[0];
      return rec ? w.store.records.exportCode([rec.id]) : '';
    }).catch((e) => { console.log('  (v2 실행 오류: ' + e.message + ')'); return ''; });
    ok(!!code, 'v2 기록 → 공유 코드');

    // ── v1 부팅·실행 + 왕복(같은 origin localStorage)
    const p1 = await browser.newPage();
    await p1.setViewport({ width: 1440, height: 900 });
    watch(p1, errs, 'v1');
    await bootV1(p1);
    const r1 = await p1.evaluate(async (code) => {
      const before = simHistory.length;
      document.querySelector('#runs').value = '1'; document.querySelector('#runs').dispatchEvent(new Event('input'));
      await run(true);
      let decoded = null;
      if (code) { try { decoded = JSON.parse(await decompressCode(code)).map((r) => r.id); } catch (e) { decoded = 'ERR ' + e.message; } }
      const v1code = simHistory.length ? await compressCode(simHistory.slice(0, 1)) : '';
      const link = document.getElementById('newVersionLink');
      return { total: lastResult && lastResult.meta && lastResult.meta.total, before, after: simHistory.length, newest: simHistory[0] && simHistory[0].id,
        decoded, v1code, link: link && link.getAttribute('href'), build: BUILD_VERSION };
    }, code);
    ok(r1.total > 0, `v1/ 부팅·실행 (합계 ${Math.round(r1.total || 0)})`);
    ok(r1.link === '../', 'v1 「새 버전」 링크 → ../');
    ok(r1.build && r1.build !== '__BUILD_VERSION__', `v1 빌드 버전 주입 (${r1.build})`);
    ok(Array.isArray(r1.decoded) && r1.decoded.length === 1, `v2 공유 코드 → v1 해독 (${JSON.stringify(r1.decoded)})`);

    await p1.close();
    // v1 에서 만든 기록이 v2 에 보이는지
    await bootV2(page);
    const seen = await page.evaluate((id) => window.__woofia.store.get().records.some((r) => String(r.id) === String(id)), r1.newest);
    ok(r1.after > r1.before && seen, 'v1 기록 → v2 기록 목록');
    const imp = await page.evaluate(async (c) => { const w = window.__woofia;
      const before = w.store.get().records.length; const r = await w.store.records.importText(c); return { ok: r.ok, added: r.added, before }; }, r1.v1code).catch((e) => ({ ok: false, err: e.message }));
    ok(!!r1.v1code && imp.ok, `v1 공유 코드 → v2 가져오기 (${JSON.stringify(imp)})`);

    // 딥링크 적용(#code=…&run=1)
    if (code) {
      await bootV2(page, '#code=' + encodeURIComponent(code) + '&run=1');
      await sleep(1500);
      const dl = await page.evaluate(() => ({ hash: location.hash, total: window.__woofia.store.get().result && window.__woofia.store.get().result.meta.totalMid }));
      ok(!/code=/.test(dl.hash) && dl.total > 0, '딥링크 #code=…&run=1 적용·주소 정리');
    }
    ok(errs.length === 0, `페이지 오류 없음${errs.length ? '\n  ' + errs.join('\n  ') : ''}`);
  } finally { await browser.close(); }

  if (loungeRes.ok && !SKIP_LOUNGE_SMOKE) {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'live_smoke_lounge.js')], { stdio: 'inherit', env: { ...process.env, LOUNGE_LIVE: BASE + 'lounge.html' } });
    ok(r.status === 0, '라운지 읽기 전용 점검(live_smoke_lounge.js)');
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL', e.stack || e.message); process.exit(1); });
