const puppeteer = require('puppeteer-core');
const fs = require('fs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto('http://localhost:8777/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise(r => setTimeout(r, 6000));
  await p.evaluate(() => document.getElementById('runBtn').click());
  for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 1000)); const n = await p.evaluate(() => simHistory.length); if (n) break; }
  const out = await p.evaluate(async () => {
    const r = JSON.parse(JSON.stringify(simHistory[0]));
    r.id = r.id + 12345; r.name = 'v1 워크스루 코드';
    const plan = Array(30).fill('평'); [3, 6, 9].forEach(i => plan[i] = '궁');
    r.snap.team = [
      { id: 10401, skill: 10, rune: true, rotation: '', ult: { mode: 'fixed', keepDef: true, assist: true } },
      { id: 10439, skill: 10, rune: true, rotation: '' },
      { id: 10442, skill: 10, rune: true, rotation: '', ult: { mode: 'asap', keepDef: true } },
      { id: 10421, skill: 10, rune: true, rotation: '', ult: { mode: 'fixed', keepDef: false } },
      { id: 10428, skill: 10, rune: true, usePlan: true, plan, rotation: plan.join(''), ult: { mode: 'strict', keepDef: true } },
    ];
    r.snap.altar = { on: true, floors: { 1: { on: true, off: [] }, 2: { on: true, off: [] }, 3: { on: false, off: [] } } };
    r.snap.sync = [{ anchor: 2, members: [{ p: 3, order: 'before', base: 'defend', other: 'own' }], miss: 'wait' }];
    r.snap.turnOverrides = { 4: [5, 4, 3, 2, 1], 7: [5, 4, 3, 2, 1], 10: [5, 4, 3, 2, 1] };
    const code = await compressCode([r]);
    return { code, rec: r };
  });
  fs.writeFileSync('shots/walkthrough/v1_code.txt', out.code);
  fs.writeFileSync('shots/walkthrough/v1_code_rec.json', JSON.stringify(out.rec, null, 1));
  console.log(out.code.length, out.code.slice(0, 80));
  await b.close();
})();
