// 현재 라이브 사이트 디자인 감사용 스크린샷 (데스크톱 1440 / 모바일 390)
const puppeteer = require('puppeteer-core');
const path = require('path');
const BASE = process.env.UITEST_BASE || 'https://xxl-famido.github.io/xxl/';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'shots');
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  try {
    for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
      const page = await browser.newPage();
      await page.setViewport({ ...vp, deviceScaleFactor: 1 });
      await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => typeof CHARS !== 'undefined' && Object.keys(CHARS).length > 30 && document.querySelector('#teamSlots'), { timeout: 60000 });
      await page.evaluate(() => { localStorage.setItem('woofia_lang', 'kr'); const b = document.getElementById('boot'); if (b) b.remove(); });
      await new Promise(r => setTimeout(r, 1500));
      await page.screenshot({ path: path.join(OUT, `${name}_top.png`) });
      await page.screenshot({ path: path.join(OUT, `${name}_full.png`), fullPage: true });
      // 실행 후 결과 화면
      const ran = await page.evaluate(async () => {
        const btn = document.querySelector('#runBtn, button[onclick*="run"], .run-btn');
        if (!btn) return 'no-run-btn';
        btn.click(); return 'clicked';
      });
      await new Promise(r => setTimeout(r, 6000));
      await page.screenshot({ path: path.join(OUT, `${name}_result_full.png`), fullPage: true });
      console.log(name, ran);
      await page.close();
    }
  } finally { await browser.close(); }
})();
