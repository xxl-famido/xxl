/**
 * 가이드 스크린샷 캡처 — 행동 고급 설정의 「궁극기 사용 방식」·「연동」 탭을 실제 브라우저(headless Chrome)로 찍는다.
 *
 *   python server.py &  →  node tools/guide_shots.js
 *
 * 산출: dashboard/guide/altar-ult.png · dashboard/guide/altar-sync.png (+ docs/images/altar-sync.png 복사)
 * 편성은 피드백 사례(마타야 · 욱영 · 리카노)로 고정하고, 연동 그룹은 "마타야 방어 → 욱영 궁 → 마타야 궁" 예시를 만든다.
 * puppeteer-core 는 C:\Users\ZRUN\node_modules 전역 설치본, Chrome 은 기본 설치 경로를 쓴다.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const BASE = process.env.UITEST_BASE || 'http://localhost:8777';
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = path.join(__dirname, '..', 'dashboard', 'guide');
const DOCS = path.join(__dirname, '..', 'docs', 'images');
const MATAYA = 10442, UK = 10439, RICANO = 10428;

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1180, height: 1000, deviceScaleFactor: 2 });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });   // version.json 폴링 때문에 networkidle 은 안 끝난다
    // 로컬(8777)은 #boot 오버레이를 즉시 제거하고 fetch 로 로스터를 받는다 — 로스터·팀 슬롯이 그려질 때까지
    await page.waitForFunction(() => !document.getElementById('boot') && typeof CHARS !== 'undefined' && Object.keys(CHARS).length > 30
      && document.querySelector('#teamSlots') && document.querySelector('#teamSlots').children.length > 0, { timeout: 60000 });
    await page.evaluate(([m, u, r]) => {
      localStorage.setItem('woofia_lang', 'kr');
      const slot = id => ({ id, skill: 10, rune: true, rotation: '' });
      team = [slot(m), slot(u), slot(r), null, null];
      renderTeam(); renderPrio();
      applyAltarSnap(null);
      applySyncSnap([{ anchor: 2, members: [{ p: 1, order: 'before', base: 'defend' }, { p: 3, order: 'before' }], miss: 'wait' }]);
      turnOverrides = {}; advOn = false;
      document.querySelectorAll('.guide-fab, .patch-fab, .lang-fab').forEach(el => { el.style.visibility = 'hidden'; });
    }, [MATAYA, UK, RICANO]);
    await page.waitForFunction(() => altarNames && Object.keys(altarNames).length > 0, { timeout: 20000 });

    const shoot = async (tab, file) => {
      await page.evaluate(t => { advTab = t; openAdvPop(); }, tab);
      await page.waitForSelector(`.adv-card .adv-pane-${tab}:not([hidden]) ${tab === 'ult' ? '.au-row' : '.sg-flow'}`, { timeout: 30000 });
      await new Promise(r => setTimeout(r, 600));                       // 프로브·렌더 안정화
      const card = await page.$('.adv-card');
      await card.screenshot({ path: path.join(OUT, file) });
      await page.evaluate(() => { if (advCloseFn) advCloseFn(); });
      console.log('saved', file);
    };
    // 머리말 + 탭 + 타임라인 탭 머리(우측 상단 '사용' 스위치)까지 — 가이드 adv-head.png
    await page.evaluate(() => { advTab = 'time'; openAdvPop(); });
    await page.waitForSelector('.adv-card .adv-pane-time:not([hidden]) .adv-timehead', { timeout: 30000 });
    await new Promise(r => setTimeout(r, 600));
    const box = await page.evaluate(() => {
      const c = document.querySelector('.adv-card').getBoundingClientRect(), h = document.querySelector('.adv-timehead').getBoundingClientRect();
      return { x: c.left, y: c.top, width: c.width, height: h.bottom - c.top + 4 };
    });
    await page.screenshot({ path: path.join(OUT, 'adv-head.png'), clip: box });
    await page.evaluate(() => { if (advCloseFn) advCloseFn(); });
    console.log('saved adv-head.png');
    await shoot('ult', 'altar-ult.png');
    await shoot('sync', 'altar-sync.png');
    fs.copyFileSync(path.join(OUT, 'altar-sync.png'), path.join(DOCS, 'altar-sync.png'));
    console.log('copied docs/images/altar-sync.png');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.stack || e); process.exit(1); });
