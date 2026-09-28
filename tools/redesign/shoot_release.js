// 릴리스 검수용 전 화면 스크린샷 — 정적 빌드(_site_v2) 기준, 1440·390 × 라이트·다크, 콘솔 오류 수집.
//   (python -m http.server 8790 --bind 127.0.0.1 --directory _site_v2) 후
//   NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/shoot_release.js [base]
// 출력: tools/redesign/shots/release/<w>_<theme>_<screen>.png, 콘솔 오류 요약. 서버에 쓰지 않는다(피드백은 열기만).
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let BASE = process.argv[2] || 'http://127.0.0.1:8790/';
if (!BASE.endsWith('/')) BASE += '/';
const OUT = path.join(__dirname, 'shots', 'release');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 화면 = [이름, 여는 함수(페이지 안에서 실행)]
const SCREENS = [
  ['main', null],
  ['menu', `document.querySelector('.topnav button[aria-haspopup="menu"]').click()`],
  ['records', `import('./src/ui/records.js').then(m => m.open(window.__woofia))`],
  ['guide', `window.__woofia.openGuide()`],
  ['patch', `window.__woofia.openPatch()`],
  ['feedback', `window.__woofia.openFeedback()`],
  ['advanced', `import('./src/ui/advanced.js').then(m => m.openAdvanced(window.__woofia))`],
  ['grow', `import('./src/ui/grow.js').then(m => m.openGrow(window.__woofia, 0))`],
  ['altar', `window.__woofia.openAltar()`],
  ['compare', `window.__woofia.openCompare()`],
  ['turnedit', `import('./src/ui/turn-edit.js').then(m => m.openTurnEdit(window.__woofia, 4))`],
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  const errs = [];
  let n = 0;
  try {
    for (const [w, hgt] of [[1440, 900], [390, 844]]) {
      for (const theme of ['light', 'dark']) {
        const p = await browser.newPage();
        await p.setViewport({ width: w, height: hgt, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
        const tag = `${w}_${theme}`;
        p.on('pageerror', (e) => errs.push(`${tag} pageerror ${e.message}`));
        p.on('console', (m) => { const u = (m.location() && m.location().url) || ''; if (m.type() === 'error' && !/favicon|lounge\.html|v1\/index\.html/.test(m.text() + u)) errs.push(`${tag} console ${m.text()} ${u}`); });
        await p.evaluateOnNewDocument((th) => { try { localStorage.setItem('woofia_theme', th); } catch {} }, theme);
        await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await p.waitForFunction(() => window.__woofia && window.__woofia.store.get().ui.booted && window.__woofia.store.get().result, { timeout: 180000 });
        await sleep(800);
        for (const [name, js] of SCREENS) {
          try {
            if (js) { await p.evaluate(js); await sleep(900); }
            await p.screenshot({ path: path.join(OUT, `${tag}_${name}.png`), fullPage: name === 'main' });
            n++;
          } catch (e) { errs.push(`${tag} ${name} 열기 실패: ${e.message}`); }
          await p.keyboard.press('Escape'); await sleep(250);
        }
        // 구버전
        await p.goto(BASE + 'v1/', { waitUntil: 'domcontentloaded', timeout: 90000 });
        await p.waitForFunction(() => !document.getElementById('boot') && typeof CHARS !== 'undefined' && Object.keys(CHARS).length > 30, { timeout: 180000 });
        await sleep(1200);
        await p.screenshot({ path: path.join(OUT, `${tag}_v1.png`) }); n++;
        await p.close();
      }
    }
  } finally { await browser.close(); }
  console.log(`shots ${n} → ${OUT}`);
  console.log(errs.length ? `오류 ${errs.length}\n  ${errs.join('\n  ')}` : '콘솔 오류 0');
  process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.error('FAIL', e.stack || e.message); process.exit(1); });
