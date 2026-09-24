/**
 * 라이브(GitHub Pages) 스모크 — Pyodide 워커까지 실제로 띄워 연동 설정으로 시뮬을 1회 돌린다.
 *   node tools/live_smoke.js [url]     (기본 https://xxl-famido.github.io/xxl/)
 * 검사: 부팅 · 실행 오류 0 · meta.sync=1 · 4턴 마타야 [방어, 필살기] · 결과 헤더에 연동 표시.
 */
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.argv[2] || 'https://xxl-famido.github.io/xxl/';
const MATAYA = 10442, UK = 10439, RICANO = 10428;

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text() + m.location().url)) errors.push('console: ' + m.text()); });   // favicon.ico 404 는 사이트에 원래 없음
    page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push('http ' + r.status() + ' ' + r.url()); });
    await page.goto(URL + '?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !document.getElementById('boot') && typeof CHARS !== 'undefined' && Object.keys(CHARS).length > 30
      && document.querySelector('#teamSlots') && document.querySelector('#teamSlots').children.length > 0, { timeout: 180000 });
    const ver = await page.evaluate(() => BUILD_VERSION);
    const res = await page.evaluate(async ([m, u, r]) => {
      const slot = id => ({ id, skill: 10, rune: true, rotation: '' });
      team = [slot(m), slot(u), slot(r), null, null];
      renderTeam(); renderPrio();
      applyAltarSnap(null);
      applySyncSnap([{ anchor: 2, members: [{ p: 1, order: 'before', base: 'defend' }], miss: 'wait' }]);
      document.querySelector('#turns').value = '7'; document.querySelector('#turns').dispatchEvent(new Event('input'));
      document.querySelector('#runs').value = '1'; document.querySelector('#runs').dispatchEvent(new Event('input'));
      await run(false);
      const log = lastResult.log, seen = new Set(), kinds = [];
      for (const ev of log) {
        if (ev.turn !== 4 || ev.actorId !== m || seen.has(ev.act) || !['보통공격', '필살기', '방어'].includes(ev.kind)) continue;
        seen.add(ev.act); kinds.push(ev.kind);
      }
      return { total: lastResult.meta.total, sync: lastResult.meta.sync, kinds, top: document.querySelector('#topMeta').textContent };
    }, [MATAYA, UK, RICANO]);
    console.log('build', ver);
    console.log('result', JSON.stringify(res));
    const ok = res.sync === 1 && res.kinds.join(',') === '방어,필살기' && /연동 1그룹/.test(res.top) && errors.length === 0;
    console.log(errors.length ? errors.join('\n') : '(errors: none)');
    console.log(ok ? '라이브 스모크 통과' : '라이브 스모크 실패');
    process.exit(ok ? 0 : 1);
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.stack || e); process.exit(1); });
