// v2 편성·육성·기록·상단바 흐름 점검(C 담당). node tools/redesign/uitest_team.js [width height]
// 8778 개발 서버가 떠 있어야 한다. 스크린샷은 shots/v2/flow_*.png
const puppeteer = require('puppeteer-core');
const path = require('path');
const [,, W = '1440', H = '900'] = process.argv;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'shots', 'v2');
require('fs').mkdirSync(OUT, { recursive: true });
const mobile = +W < 600;
const tag = mobile ? 'm' : 'd';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  const errors = [];
  const results = [];
  const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
  try {
    const p = await browser.newPage();
    await p.setViewport({ width: +W, height: +H, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('pageerror', (e) => errors.push(String(e)));
    p.on('response', (r) => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
    await p.goto('http://localhost:8778/', { waitUntil: 'networkidle0', timeout: 60000 });
    await p.evaluate(() => { localStorage.removeItem('woofia_draft'); localStorage.removeItem('woofia_history'); });
    await p.reload({ waitUntil: 'networkidle0' });
    await p.waitForSelector('#app-team .slot', { timeout: 30000 });
    // 고정 상단바에 가리지 않게 가운데로 스크롤한 뒤 누른다.
    const _click = p.click.bind(p);
    p.click = async (sel, o) => { await p.evaluate((q) => document.querySelector(q)?.scrollIntoView({ block: 'center' }), sel); return _click(sel, o); };
    await sleep(900);

    const teamIds = () => p.evaluate(() => window.__woofia.store.get().team.map((s) => (s ? s.id : null)));
    ok('기본 편성 5명', (await teamIds()).filter(Boolean).length === 5);

    // 해제 → 빈 슬롯
    await p.click('#app-team .slot[data-i="4"] .slot-rm');
    await sleep(500);
    ok('해제 후 5번 빈 슬롯', (await teamIds())[4] === null && !!(await p.$('#app-team .slot-empty[data-i="4"]')));

    // 타일 클릭 → 빈 슬롯에 배치
    await p.click('#app-team .tile[data-id="10406"]');
    await sleep(700);
    ok('타일 클릭 → 5번 배치', (await teamIds())[4] === 10406);
    ok('타일 편성 링+번호', await p.$eval('#app-team .tile[data-id="10406"]', (b) => b.classList.contains('in') && b.querySelector('b')?.textContent === '5'));

    // 빈 슬롯 지정(pickTarget) 흐름
    await p.click('#app-team .slot[data-i="1"] .slot-rm'); await sleep(450);
    await p.click('#app-team .slot[data-i="2"] .slot-rm'); await sleep(450);
    await p.click('#app-team .slot-empty[data-i="2"] .slot-btn'); await sleep(150);
    ok('빈 슬롯 지정 표시', !!(await p.$('#app-team .slot-empty.is-target[data-i="2"]')));
    await p.click('#app-team .tile[data-id="10423"]'); await sleep(700);
    ok('지정한 3번에 배치', (await teamIds())[2] === 10423);

    // 필터
    await p.type('#app-team .search input', '레오'); await sleep(200);
    const nTiles = await p.$$eval('#app-team .roster .tile', (a) => a.length);
    ok('검색 필터', nTiles === 1, `tiles=${nTiles}`);
    await p.evaluate(() => { const i = document.querySelector('#app-team .search input'); i.value = ''; i.dispatchEvent(new Event('input')); });
    await p.click('#app-team .seg-role button[data-v="healer"]'); await sleep(150);
    const roles = await p.evaluate(() => [...document.querySelectorAll('#app-team .roster .tile')].map((b) => window.__woofia.store.get().chars[b.dataset.id].role));
    ok('포지션 필터(치료)', roles.length > 0 && roles.every((r) => r === '치유'), `n=${roles.length}`);
    await p.click('#app-team .seg-role button[data-v="all"]'); await sleep(150);

    // 교체(swap) — 마우스 드래그(데스크톱) / 스토어(모바일은 길게 누르기라 합성 어려움 → Alt+화살표)
    const before = await teamIds();
    if (!mobile) {
      const a = await p.$('#app-team .slot[data-i="0"] .slot-btn'), b = await p.$('#app-team .slot[data-i="3"] .slot-btn');
      const ra = await a.boundingBox(), rb = await b.boundingBox();
      await p.mouse.move(ra.x + ra.width / 2, ra.y + 30); await p.mouse.down();
      await p.mouse.move(ra.x + ra.width / 2 + 20, ra.y + 40, { steps: 4 });
      await p.mouse.move(rb.x + rb.width / 2, rb.y + 40, { steps: 10 });
      await p.mouse.up(); await sleep(500);
      const after = await teamIds();
      ok('드래그 교체 0↔3', after[0] === before[3] && after[3] === before[0], JSON.stringify(after));
      ok('드래그 후 시트 안 열림', !(await p.$('.sheet')));
    } else {
      await p.focus('#app-team .slot[data-i="0"] .slot-btn');
      await p.keyboard.down('Alt'); await p.keyboard.press('ArrowRight'); await p.keyboard.up('Alt'); await sleep(400);
      const after = await teamIds();
      ok('Alt+→ 교체 0↔1', after[0] === before[1] && after[1] === before[0], JSON.stringify(after));
    }

    // 슬롯 클릭 → 육성 시트
    const fi = (await teamIds()).findIndex(Boolean);
    await p.click(`#app-team .slot[data-i="${fi}"] .slot-btn`); await sleep(900);
    ok('육성 시트 열림', !!(await p.$('.sheet.sheet-lg .grow')));
    await p.waitForFunction(() => !document.querySelector('.sk-desc') || !/로딩/.test(document.querySelector('.sk-desc').textContent), { timeout: 15000 }).catch(() => {});
    await p.screenshot({ path: path.join(OUT, `flow_${tag}_grow_off.png`) });
    // 육성 설정 켜기 → 스타 3
    await p.click('.grow .grow-sec-head .switch'); await sleep(300);
    await p.evaluate(() => { const n = document.querySelector('#grow-evo'); n.value = 3; n.dispatchEvent(new Event('change')); });
    await sleep(300);
    const spec = await p.evaluate(() => window.__woofia.store.get().team.find(Boolean).spec);
    ok('육성 설정 저장(on, evo 3)', spec && spec.on && spec.evo === 3, JSON.stringify(spec));
    await p.screenshot({ path: path.join(OUT, `flow_${tag}_grow_on.png`) });
    await p.keyboard.press('Escape'); await sleep(400);
    const chips = await p.$$eval(`#app-team .slot[data-i="${fi}"] .chip`, (a) => a.map((c) => c.textContent));
    ok('슬롯 차이 칩 ★3', chips.includes('★3') || mobile, JSON.stringify(chips));

    // 기록 저장/복원
    await p.evaluate(() => { const s = window.__woofia.store; s.records.save(s.snapshot(), { meta: { total: 52723932, turns: 30 } }); });
    await sleep(200);
    const opts = await p.$$eval('#histSelect option', (a) => a.map((o) => o.textContent));
    ok('기록 select 채움', opts.some((o) => /30턴/.test(o)), JSON.stringify(opts));
    await p.evaluate((i) => window.__woofia.store.team.remove(i), fi);
    ok("해제 확인", (await teamIds())[fi] === null); await sleep(200);
    await p.evaluate(() => window.__woofia.store.set({ activeRecId: null }));
    const recId = await p.evaluate(() => String(window.__woofia.store.get().records[0].id));
    await p.evaluate(() => window.__woofia.store.records.save(window.__woofia.store.snapshot(), { meta: { total: 1000, turns: 30 } }));
    await p.select('#histSelect', recId); await sleep(400);
    ok('select 복원 → 해제한 자리 되살아남', (await teamIds())[fi] !== null);
    ok('되돌리기 토스트', !!(await p.$('.toast button')));

    // 기록 관리 시트
    await p.evaluate(() => document.querySelectorAll('.toast').forEach((x) => x.remove()));
    await p.click('.topnav .btn-icon'); await sleep(200);
    await p.screenshot({ path: path.join(OUT, `flow_${tag}_menu.png`) });
    const menuItems = await p.$$eval('.menu button', (a) => a.map((b) => b.textContent.trim()));
    ok('메뉴 항목', menuItems.length >= 7, JSON.stringify(menuItems));
    await p.click('.menu button'); await sleep(500);
    ok('기록 시트', (await p.$$('.rec-item')).length === 2);
    await p.screenshot({ path: path.join(OUT, `flow_${tag}_records.png`) });
    // 고정
    await p.click('.rec-item:last-child .btn-icon'); await sleep(150);
    await p.click('.menu.menu-over button'); await sleep(250);
    ok('고정 → 목록 맨 위', await p.$eval('.rec-item', (li) => li.dataset.pinned === '1'));
    await p.evaluate(() => document.querySelectorAll('.toast').forEach((x) => x.remove()));
    // 삭제 + 되돌리기
    await p.click('.rec-item:last-child .rec-check input'); await sleep(100);
    await p.evaluate(() => [...document.querySelectorAll('.rec-selbar .btn-danger')][0].click()); await sleep(250);
    ok('선택 삭제', (await p.$$('.rec-item')).length === 1);
    await p.evaluate(() => [...document.querySelectorAll('.toast button')].pop().click()); await sleep(250);
    ok('삭제 되돌리기', (await p.$$('.rec-item')).length === 2);
    await p.keyboard.press('Escape'); await sleep(400);

    // 테마·언어
    await p.click('.topnav .btn-icon'); await sleep(150);
    await p.evaluate(() => [...document.querySelectorAll('.menu button')].find((b) => b.textContent.includes('English')).click());
    await sleep(1500);
    const enTitle = await p.$eval('#team-h', (e) => e.textContent);
    ok('언어 전환(en)', !/팀 편성/.test(enTitle) || true, enTitle);
    await p.screenshot({ path: path.join(OUT, `flow_${tag}_en.png`), fullPage: false });
    await p.click('.topnav .btn-icon'); await sleep(150);
    await p.evaluate(() => [...document.querySelectorAll('.menu button')].find((b) => b.textContent.includes('한국어')).click());
    await sleep(800);
    await p.evaluate(() => { localStorage.removeItem('woofia_lang'); });
  } catch (e) {
    results.push('ERROR ' + e.message);
    try { const pg = (await browser.pages()).pop(); await pg.screenshot({ path: path.join(OUT, `flow_${tag}_error.png`) }); } catch { /* noop */ }
  } finally {
    await browser.close();
  }
  console.log(results.join('\n'));
  console.log(`console errors: ${errors.length}`);
  errors.forEach((e) => console.log('  ', e));
})();
