// XXL 라운지 목업 스크린샷 + 콘솔 오류 수집 (로컬 v2 서버 8778).
// 실행: NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/shoot_lounge.js [route...]
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const BASE = process.env.LOUNGE_BASE || 'http://localhost:8778/lounge.html';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'shots', 'lounge');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/c/10441', '/tier', '/tier/new', '/tier/tt1', '/team', '/team/new', '/team/mt1', '/me'];
const VIEWPORTS = [
  ['d-light', { width: 1440, height: 900 }, 'light'],
  ['d-dark', { width: 1440, height: 900 }, 'dark'],
  ['m-light', { width: 390, height: 844, isMobile: true, hasTouch: true }, 'light'],
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  const errors = [];
  try {
    for (const [tag, vp, theme] of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewport({ ...vp, deviceScaleFactor: 1 });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`); });
      page.on('pageerror', (e) => errors.push(`[${tag}] pageerror ${e.message}`));
      page.on('requestfailed', (r) => errors.push(`[${tag}] reqfail ${r.url()}`));
      await page.goto(BASE, { waitUntil: 'networkidle0' });
      await page.evaluate((t) => { localStorage.setItem('woofia_theme', t); }, theme);
      for (const r of ROUTES) {
        await page.goto(`${BASE}#${r}`, { waitUntil: 'networkidle0' });
        await page.reload({ waitUntil: 'networkidle0' });
        await sleep(900);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (overflow > 0) errors.push(`[${tag}] ${r} 가로 넘침 ${overflow}px`);
        const name = `${tag}_${r.replace(/\//g, '_') || 'root'}.png`;
        await page.screenshot({ path: path.join(OUT, name), fullPage: true });
        console.log('shot', name);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
})();
