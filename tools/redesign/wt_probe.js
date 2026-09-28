const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto('http://localhost:8778/', { waitUntil: 'networkidle0', timeout: 90000 });
  await new Promise(r => setTimeout(r, 2500));
  const info = await p.evaluate(() => {
    const w = window.__woofia, s = w.store.get();
    const box = id => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x|0, y: (r.y+scrollY)|0, w: r.width|0, h: r.height|0 }; };
    const nm = id => w.i18n.nameOf ? w.i18n.nameOf(id) : id;
    const chars = Object.entries(s.chars).map(([id, c]) => id + ':' + nm(+id) + ':cd' + (c.fatalCd)).join(' | ');
    return { team: s.team.map(x => x && (x.id + ' ' + nm(x.id))), boxes: { team: box('app-team'), plan: box('app-plan'), cond: box('app-cond'), result: box('app-result') },
      accs: [...document.querySelectorAll('#app-cond details, #app-plan details')].map(d => (d.querySelector('summary')||{}).textContent.trim().slice(0,60) + ' open=' + d.open + ' y=' + ((d.getBoundingClientRect().y+scrollY)|0)),
      chars };
  });
  console.log(JSON.stringify(info, null, 1));
  await p.screenshot({ path: 'shots/walkthrough/v2_00_first_view.png' });
  await p.screenshot({ path: 'shots/walkthrough/v2_00_full.png', fullPage: true });
  await b.close();
})();
