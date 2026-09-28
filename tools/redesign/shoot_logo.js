/**
 * 로고 교체 확인 캡처 — 상단바(데스크톱 2x · 모바일 3x) · 로딩 오버레이, 라이트/다크.
 *   NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/shoot_logo.js [--base http://localhost:8778]
 * 출력: tools/redesign/shots/v2/logo_{topbar_desktop,topbar_mobile,boot}_{light,dark}.png  + 로고 표시 크기 로그
 */
const path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = (process.argv.indexOf('--base') > 0 ? process.argv[process.argv.indexOf('--base') + 1] : null) || 'http://localhost:8778';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) { console.error('로컬 주소만 허용:', BASE); process.exit(2); }
const OUT = path.join(__dirname, 'shots', 'v2');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  try {
    for (const theme of ['light', 'dark']) {
      for (const vp of [
        { tag: 'desktop', width: 1440, height: 900, deviceScaleFactor: 2 },
        { tag: 'mobile', width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
      ]) {
        const p = await browser.newPage();
        await p.setViewport(vp);
        await p.evaluateOnNewDocument((t) => { try { localStorage.setItem('woofia_theme', t); } catch { /* noop */ } }, theme);
        await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        if (vp.tag === 'desktop') {
          // 로딩이 빨라 오버레이가 금방 접히므로, 부팅 뒤 같은 마크업을 다시 띄워 캡처한다(페이드인 종료 후).
          await p.waitForFunction(() => window.__woofia && window.__woofia.store.get().ui && window.__woofia.store.get().ui.booted, { timeout: 90000 });
          await p.evaluate(async () => { const r = await fetch('index.html'); const d = new DOMParser().parseFromString(await r.text(), 'text/html');
            const b = d.getElementById('app-boot'); b.querySelector('#bootBar').style.setProperty('--p', '60%'); b.querySelector('#bootMsg').textContent = '엔진 준비 중'; document.body.append(document.adoptNode(b)); });
          await sleep(900);
          const box = await p.$('#app-boot .boot-box');
          if (box) await box.screenshot({ path: path.join(OUT, `logo_boot_${theme}.png`) });
          await p.evaluate(() => document.getElementById('app-boot')?.remove());
        }
        await p.waitForFunction(() => window.__woofia && window.__woofia.store.get().ui && window.__woofia.store.get().ui.booted, { timeout: 90000 });
        await sleep(800);
        await p.evaluate(() => scrollTo(0, 0)); await sleep(200);
        const info = await p.evaluate(() => {
          const img = document.querySelector('#app-topbar .brand-logo'); const bar = document.querySelector('#app-topbar .topbar-in');
          const r = img.getBoundingClientRect(), b = bar.getBoundingClientRect();
          return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), top: +(r.top - b.top).toFixed(1), bottom: +(b.bottom - r.bottom).toFixed(1), bar: b.height,
            src: img.currentSrc.split('/').pop(), natural: img.naturalHeight, overflow: document.documentElement.scrollWidth, aria: img.closest('a').getAttribute('aria-label') };
        });
        console.log(theme, vp.tag, JSON.stringify(info));
        await (await p.$('#app-topbar .topbar-in')).screenshot({ path: path.join(OUT, `logo_topbar_${vp.tag}_${theme}.png`) });
        await p.close();
      }
    }
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
