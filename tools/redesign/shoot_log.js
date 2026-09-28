// 전투 로그 화면 촬영(검수용). 실결과 fixture 를 store 에 넣고 단계별로 펼쳐 찍는다.
//   node tools/redesign/shoot_log.js [fixture.json]
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const FIX = process.argv[2] || path.join(__dirname, 'fixtures', 'result_barrier.json');
const OUT = path.join(__dirname, 'shots', 'v2');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(browser, { width, height, theme, mobile = false }) {
  const p = await browser.newPage();
  await p.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:8778/', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.evaluate((th) => { document.documentElement.dataset.theme = th; }, theme);
  const data = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  await p.waitForFunction(() => window.__woofia && window.__woofia.store, { timeout: 30000 });
  await p.evaluate((d) => window.__woofia.store.setResult(d), data);
  await p.waitForSelector('.bl .bl-t', { timeout: 15000 });
  await wait(600);
  return { p, errors };
}
const shot = async (p, name, sel = '.bl') => {
  const el = await p.$(sel);
  await el.scrollIntoView();
  await wait(250);
  await el.screenshot({ path: path.join(OUT, `${name}.png`) });
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  const report = [];
  try {
    for (const theme of ['light', 'dark']) {
      const { p, errors } = await boot(browser, { width: 1440, height: 1100, theme });
      await shot(p, `log_${theme}_1_turn1`);
      // 배리어 비례 딜이 있는 첫 턴으로 → 그 행동 펼치기 → 배리어 구성 첫 항목 펼치기
      const barTurn = await p.evaluate(() => {
        const d = window.__woofia.store.get().result;
        const l = d.log.find((x) => x.detail && x.detail.barrierComp && x.detail.barrierComp.length);
        return l ? { turn: l.turn, act: l.act } : null;
      });
      if (barTurn) {
        await p.click(`.bl-t[data-turn="${barTurn.turn}"]`);
        await wait(200);
        await p.evaluate((a) => {
          const card = document.querySelector(`.bl-act[data-act="${a}"]`) || [...document.querySelectorAll('.bl-enemy-b .bl-act')].find((c) => c.dataset.act === String(a));
          const enemy = document.querySelector('.bl-enemy > .bl-act-h');
          if (!card.offsetParent && enemy) enemy.click();
          if (card.querySelector('.bl-act-h').getAttribute('aria-expanded') !== 'true') card.querySelector('.bl-act-h').click();
          const hit = card.querySelector('.bl-hit');
          if (hit && hit.getAttribute('aria-expanded') !== 'true') hit.click();
          card.querySelector('.bl-barcomp .bl-row')?.click();
          card.querySelector('.rc-toggle')?.click();
        }, barTurn.act);
        await wait(300);
        await shot(p, `log_${theme}_2_barrier`, `.bl-act[data-act="${barTurn.act}"]`);
      }
      // 첫 필살기 행동(기본 펼침)의 ATK 출처 펼치기
      await p.click('.bl-t[data-turn="4"]').catch(() => {});
      await wait(200);
      await p.evaluate(() => {
        const card = document.querySelector('.bl-act.is-ult') || document.querySelector('.bl-act');
        if (card.querySelector('.bl-act-h').getAttribute('aria-expanded') !== 'true') card.querySelector('.bl-act-h').click();
        const hit = card.querySelector('.bl-hit');
        if (hit && hit.getAttribute('aria-expanded') !== 'true') hit.click();
        card.querySelectorAll('.rc-toggle').forEach((b) => b.click());
        const eff = card.querySelector('.bl-eff [role="button"]');
        eff?.click();
      });
      await wait(300);
      await shot(p, `log_${theme}_3_ult`, '.bl-insp');
      // 출처 스킬 설명
      await p.evaluate(() => document.querySelector('.rc-src .bl-sk')?.click());
      await p.waitForSelector('.sheet .bl-skill-desc', { timeout: 10000 }).catch(() => {});
      await wait(400);
      await p.screenshot({ path: path.join(OUT, `log_${theme}_4_skill.png`) });
      report.push({ theme, errors });
      await p.close();
    }
    // 모바일
    const { p, errors } = await boot(browser, { width: 390, height: 844, theme: 'light', mobile: true });
    await shot(p, 'log_mobile_1_list');
    await p.click('.bl-t[data-turn="4"]');
    await wait(400);
    await p.evaluate(() => { const c = document.querySelector('.bl-act'); if (c && c.querySelector('.bl-act-h').getAttribute('aria-expanded') !== 'true') c.querySelector('.bl-act-h').click(); });
    await wait(300);
    await shot(p, 'log_mobile_2_detail');
    report.push({ theme: 'mobile', errors });
    await p.close();
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(report));
})();
