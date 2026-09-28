// v2(8778) 페이지를 라이트/다크로 찍는다.  node tools/redesign/shoot_v2.js <path> <outname> [width]
const puppeteer = require('puppeteer-core');
const path = require('path');
const [,, page = '/', name = 'v2', width = '1280', height = '900'] = process.argv;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'shots', 'v2');
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  try {
    for (const theme of ['light', 'dark']) {
      const p = await browser.newPage();
      await p.setViewport({ width: +width, height: +height, deviceScaleFactor: 1, isMobile: +width < 600, hasTouch: +width < 600 });
      // Git Bash 는 선행 '/' 인자를 Windows 경로로 바꿔 버리므로 파일명만 취한다
      const rel = page.split(/[\\/]/).pop() || '';
      await p.goto('http://localhost:8778/' + rel, { waitUntil: 'networkidle0', timeout: 60000 });
      await p.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
      await new Promise(r => setTimeout(r, 400));
      await p.screenshot({ path: path.join(OUT, `${name}_${theme}.png`), fullPage: true });
      await p.close();
    }
    console.log('ok', OUT);
  } finally { await browser.close(); }
})();
