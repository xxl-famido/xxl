// 현재 v2(8778) 편성으로 1회 실행한 결과 JSON을 떨군다(로그 UI 개발·검증용).
//   node tools/redesign/dump_result.js <out.json> [teamIds 쉼표] [incomingPct]
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const [,, out = 'tools/redesign/fixtures/result.json', ids = '', inc = '0'] = process.argv;
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
  try {
    const p = await b.newPage();
    await p.goto('http://localhost:8778/', { waitUntil: 'networkidle0', timeout: 60000 });
    const res = await p.evaluate(async (ids, inc) => {
      const { store, api } = window.__woofia;
      const { buildCfg } = await import('/src/core/payload.js');
      const cfg = buildCfg(store.get());
      if (ids) cfg.team = ids.split(',').map((id, i) => ({ id: +id, position: i + 1 }));
      cfg.runs = 1; cfg.turns = 12;
      if (+inc) cfg.incomingHpPct = +inc;
      return api.simulate(cfg);
    }, ids, inc);
    fs.writeFileSync(out, JSON.stringify(res));
    const kinds = {};
    for (const l of res.log || []) { const k = l.detail ? (l.detail.kind || (l.detail.calc ? 'calc:' + l.detail.calc : 'hit')) : 'text'; kinds[k] = (kinds[k] || 0) + 1; }
    console.log(out, 'log', (res.log || []).length, JSON.stringify(kinds), res.error || '');
  } finally { await b.close(); }
})();
