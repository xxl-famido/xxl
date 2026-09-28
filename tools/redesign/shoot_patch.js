// 가이드·패치 히스토리 시트 촬영.  node tools/redesign/shoot_patch.js [v2|v1] [light|dark] [width]
// v2(8778): ≡ 메뉴 '가이드' · '패치 히스토리'.  v1(8777): 📖 가이드 · 📜 패치 히스토리 FAB.
const puppeteer = require('puppeteer-core');
const path = require('path');
const [,, which = 'v2', theme = 'light', width = '1280'] = process.argv;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'shots', 'patch');
require('fs').mkdirSync(OUT, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));

async function clickText(p, sel, text) {
  const ok = await p.evaluate((s, tx) => {
    const el = [...document.querySelectorAll(s)].find(e => e.textContent.trim().includes(tx) && e.offsetParent !== null);
    if (el) el.click();
    return !!el;
  }, sel, text);
  if (!ok) throw new Error(`not found: ${sel} "${text}"`);
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  try {
    const p = await browser.newPage();
    const mobile = +width < 600;
    await p.setViewport({ width: +width, height: 900, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    const port = which === 'v1' ? 8777 : 8778;
    await p.goto(`http://localhost:${port}/`, { waitUntil: which === 'v1' ? 'load' : 'domcontentloaded', timeout: 60000 });
    if (which === 'v2') { await p.waitForFunction(() => window.__woofia && window.__woofia.store.get().ui.booted, { timeout: 180000 }); await p.evaluate(t => { document.documentElement.dataset.theme = t; }, theme); }
    await wait(which === 'v1' ? 3000 : 600);
    const shot = async name => { await wait(900); await p.screenshot({ path: path.join(OUT, `${which}_${name}_${theme}_${width}.png`) }); };

    if (which === 'v1') {
      await p.click('#patchBtn'); await shot('patch');
      await p.evaluate(() => { document.getElementById('patchModal').hidden = true; });
      await p.click('#guideBtn'); await shot('guide');
    } else {
      await p.click('.topbar [aria-haspopup], .topnav button:last-child');
      await wait(300);
      await clickText(p, '[role^="menuitem"], .menu button', '패치');
      await shot('patch');
      // 스크롤: 1.8(메이저·대표 동료) 과 그 아래 접힌 패치 릴리스
      for (const [ver, tag] of [['v2.0', 'patch_v20'], ['v1.8', 'patch_major'], ['v1.4.4', 'patch_minor']]) {
        await p.evaluate(v => {
          const s = [...document.querySelectorAll('.pn-ver')].find(e => e.textContent === v);
          s?.closest('details')?.scrollIntoView({ block: 'start' });
        }, ver);
        await shot(tag);
      }
      await p.keyboard.press('Escape'); await wait(400);
      // 가이드는 2026-09-28 상단바 버튼에서 ≡ 메뉴로 이동
      await p.click('.topnav [aria-haspopup]'); await wait(300);
      await clickText(p, '[role^="menuitem"], .menu button', '가이드');
      await shot('guide');
    }
    console.log('ok', OUT);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
