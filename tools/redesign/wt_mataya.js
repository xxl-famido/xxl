const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  await p.goto('http://localhost:8778/', { waitUntil: 'networkidle0', timeout: 90000 });
  await p.waitForFunction(() => window.__woofia && document.querySelector('#app-plan details'));
  await sleep(1500);
  const r = await p.evaluate(async () => {
    const w = window.__woofia, s = w.store;
    const cur = s.get().team; for (let i = cur.length - 1; i >= 0; i--) if (cur[i]) s.team.remove(i);
    [10401, 10442, 10439, 10421, 10425].forEach((id, i) => s.team.add(id, i));
    await new Promise(r => setTimeout(r, 1500));
    const pr = await w.api.probe(s.buildCfg({ mode: 'probe' }));
    const row = [...document.querySelectorAll('#app-plan li[data-pos="2"] .ult-mode select')].map(x => x.selectedOptions[0].textContent);
    const acts = [1,2,3,4,5,6].map(t => ((pr.plan[t] || {}).seq || []).filter(e => e.p === 2).map(e => e.a).join(''));
    return { row, acts, ult: s.get().team[1].ult || null, usePlan: s.get().team[1].usePlan };
  });
  console.log(JSON.stringify(r));
  await b.close();
})();
