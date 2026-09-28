/**
 * 메인 → 라운지 연결 스크린샷 + 딥링크 수동 확인(피드백 코드 A).
 *   NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/shoot_lounge_link.js [--base http://localhost:8778]
 * 출력: tools/redesign/shots/v2/lounge_link_{topbar_desktop,topbar_mobile,menu_guide,result_buttons,grow_link,deeplink_toast}.png
 * 라이브 주소로 돌리지 말 것(읽기만 하지만 규칙상 로컬 전용).
 */
const path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = (process.argv.indexOf('--base') > 0 ? process.argv[process.argv.indexOf('--base') + 1] : null) || 'http://localhost:8778';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) { console.error('로컬 주소만 허용:', BASE); process.exit(2); }
const OUT = path.join(__dirname, 'shots', 'v2');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const booted = (p) => p.waitForFunction(() => window.__woofia && window.__woofia.store.get().ui && window.__woofia.store.get().ui.booted && !!window.__woofia.store.get().result, { timeout: 90000 });
const loungeShown = (p) => p.waitForFunction(() => { const a = document.querySelector('#app-topbar .tb-lounge'); return a && !a.hidden; }, { timeout: 8000 }).catch(() => {});

(async () => {
  const { CODES } = await import('file:///' + path.join(__dirname, '..', 'feedback_cases', 'cases.mjs').replace(/\\/g, '/'));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  try {
    // 데스크톱: 딥링크(피드백 코드 A, run=1) → 편성 적용 · 되돌리기 토스트 · 1회 실행
    const p = await browser.newPage();
    await p.setViewport({ width: 1440, height: 900 });
    await p.evaluateOnNewDocument(() => {
      window.__runCount = 0; let c0;
      Object.defineProperty(window, '__woofia', { configurable: true, get: () => c0, set: (c) => { c0 = c; let fn;
        Object.defineProperty(c, 'run', { configurable: true, get: () => fn && (async (...a) => { window.__runCount++; return fn(...a); }), set: (f) => { fn = f; } }); } });
    });
    await p.goto(`${BASE}/#code=${encodeURIComponent(CODES.A)}&run=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await booted(p); await loungeShown(p); await sleep(900);
    const dl = await p.evaluate(async (code) => {
      const m = await import('./src/core/codec.js'); const st = window.__woofia.store; const d = await m.decodeShare(code, st.get().chars);
      return { applied: JSON.stringify(d[0].snap.team.map((x) => x && x.id)) === JSON.stringify(st.get().team.map((x) => x && x.id)),
        runs: window.__runCount, hash: location.hash, toast: [...document.querySelectorAll('.toast')].map((t) => t.textContent) };
    }, CODES.A);
    console.log('deeplink A:', JSON.stringify(dl));
    await p.screenshot({ path: path.join(OUT, 'lounge_link_deeplink_toast.png') });
    await p.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
    await p.evaluate(() => scrollTo(0, 0)); await sleep(300);
    await (await p.$('#app-topbar')).screenshot({ path: path.join(OUT, 'lounge_link_topbar_desktop.png') });

    await p.click('#app-topbar .topnav [aria-haspopup]'); await sleep(300);
    await p.screenshot({ path: path.join(OUT, 'lounge_link_menu_guide.png'), clip: { x: 1440 - 420, y: 0, width: 420, height: 560 }, captureBeyondViewport: false });
    await p.keyboard.press('Escape'); await sleep(200);

    const head = await p.$('#app-result .result-head');
    await head.scrollIntoView(); await sleep(300);
    await head.screenshot({ path: path.join(OUT, 'lounge_link_result_buttons.png') });
    console.log('result share button:', await p.evaluate(() => { const b = document.querySelector('[data-lounge-share]'); return b && !b.hidden && b.textContent; }));

    await p.evaluate(async () => { const i = window.__woofia.store.get().team.findIndex(Boolean); const m = await import('./src/ui/grow.js'); m.openGrow(window.__woofia, i); }); await sleep(800);
    const gh = await p.$('#app-sheets .grow-head');
    if (gh) await gh.screenshot({ path: path.join(OUT, 'lounge_link_grow_link.png') });
    console.log('grow link:', await p.evaluate(() => document.querySelector('[data-lounge-char]')?.getAttribute('href')));
    await p.close();

    // 모바일 상단바
    const mo = await browser.newPage();
    await mo.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await mo.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await booted(mo); await loungeShown(mo); await sleep(600);
    await mo.evaluate(() => scrollTo(0, 0)); await sleep(300);
    await (await mo.$('#app-topbar')).screenshot({ path: path.join(OUT, 'lounge_link_topbar_mobile.png') });
    console.log('mobile overflow:', await mo.evaluate(() => document.documentElement.scrollWidth), 'select width:', await mo.evaluate(() => Math.round(document.querySelector('#histSelect').getBoundingClientRect().width)));
    await mo.close();
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
