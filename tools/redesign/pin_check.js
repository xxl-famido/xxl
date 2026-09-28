// 행동 계획 v2.1(핀) 빠른 점검: 부팅 → 콘솔 에러 → 행동 계획 패널 스크린샷(데스크톱·모바일)
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:8778';
const OUT = __dirname + '/shots/v2/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  for (const mobile of [false, true]) {
    const p = await b.newPage();
    await p.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
    const errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
    p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => { localStorage.clear(); if (process.argv) {} }).catch(() => {});
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.__woofia && window.__woofia.store.get().ui.booted, { timeout: 90000 }).catch(() => errs.push('boot timeout'));
    await sleep(1500);
    if (process.argv.includes('--adv')) { await p.evaluate(() => { const i = document.querySelector('#app-plan [data-fk="adv"]'); i && i.closest('label').click(); }); await sleep(900); }
    const el = await p.$('#app-plan');
    if (el) await el.screenshot({ path: OUT + `pin_check_${mobile ? 'm' : 'd'}${process.argv.includes('--adv') ? '_adv' : ''}.png` });
    console.log(mobile ? 'mobile' : 'desktop', 'errors:', JSON.stringify(errs));
    await p.close();
  }
  await b.close();
})();
