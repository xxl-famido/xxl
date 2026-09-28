// 가이드 시트 렌더 확인용: 시트 본문을 스크롤하며 여러 장 찍는다.  node tools/redesign/shoot_guide_render.js [light|dark] [width] [lang]
const puppeteer = require('puppeteer-core'); const path = require('path'); const fs = require('fs');
const [,, theme = 'light', width = '1280', lang = 'kr'] = process.argv;
const OUT = path.join(__dirname, 'shots', 'guide'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--lang=ko-KR'] });
  try {
    const p = await b.newPage(); const mobile = +width < 600;
    await p.setViewport({ width: +width, height: 900, isMobile: mobile, hasTouch: mobile });
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('response', r => r.status() >= 400 && errs.push(r.status() + ' ' + r.url())); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto('http://localhost:8778/', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.__woofia && window.__woofia.store.get().ui.booted && typeof window.__woofia.openGuide === 'function', { timeout: 180000 });
    if (lang !== 'kr') { await p.evaluate(l => window.__woofia.i18n.setLang(l), lang); await sleep(800); }
    await p.evaluate(t => { document.documentElement.dataset.theme = t; window.__woofia.openGuide(); }, theme);
    await sleep(1500);
    const total = await p.evaluate(() => document.querySelector('#app-sheets .sheet-body').scrollHeight);
    let i = 0;
    for (let y = 0; y < total; y += 820) {
      await p.evaluate(v => { document.querySelector('#app-sheets .sheet-body').scrollTop = v; }, y);
      await sleep(700);
      await p.screenshot({ path: path.join(OUT, `g_${lang}_${theme}_${width}_${String(i++).padStart(2, '0')}.png`) });
    }
    console.log('shots', i, 'height', total, 'errors', errs);
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
