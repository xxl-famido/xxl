// 계산 그래픽 촬영(검수용): 고정 ATK 가 든 타격 → 계산 그래픽 → 고정 ATK 출처 → 부여 계산.
//   node tools/redesign/shoot_calc.js [fixture.json]
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const FIX = process.argv[2] || path.join(__dirname, 'fixtures', 'result_default.json');
const OUT = path.join(__dirname, 'shots', 'v2');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  const report = [];
  try {
    for (const [theme, width, mobile] of [['light', 1440, false], ['dark', 1440, false], ['light', 390, true]]) {
      const p = await browser.newPage();
      await p.setViewport({ width, height: 1000, isMobile: mobile, hasTouch: mobile });
      const errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto('http://localhost:8778/', { waitUntil: 'networkidle0', timeout: 60000 });
      await p.evaluate((th) => { document.documentElement.dataset.theme = th; }, theme);
      const data = JSON.parse(fs.readFileSync(FIX, 'utf8'));
      await p.evaluate((d) => window.__woofia.store.setResult(d), data);
      await p.waitForSelector('.bl .bl-t');
      // 고정 ATK 가 든 첫 필살기 타격
      const isHit = (l) => l.detail && l.detail.act && !l.detail.kind;
      const target = data.log.find((l) => isHit(l) && (l.detail.flat || []).length && l.kind === '필살기')
        || data.log.find((l) => isHit(l) && (l.detail.flat || []).length);
      const hitIdx = data.log.filter((l) => l.act === target.act && l.turn === target.turn && isHit(l)).indexOf(target);
      await p.evaluate((tg) => {
        document.querySelector(`.bl-t[data-turn="${tg.turn}"]`).click();
        const card = document.querySelector(`.bl-act[data-act="${tg.act}"]`);
        card._setOpen(true);
        const hit = card.querySelectorAll('.bl-hit')[tg.hitIdx];
        if (hit.getAttribute('aria-expanded') !== 'true') hit.click();
        const flat = [...card.querySelectorAll('.cv-step')].find((s) => s.querySelector('.cv-l')?.textContent.includes('고정'));
        flat?._toggle(true);
      }, { turn: target.turn, act: target.act, hitIdx });
      await wait(400);
      const name = mobile ? 'calc_mobile' : `calc_${theme}`;
      const el = await p.evaluateHandle((i) => document.querySelectorAll(`.bl-act .bl-hit`)[0] && [...document.querySelectorAll('.bl-hit')].filter((x) => x.getAttribute('aria-expanded') === 'true')[0].parentElement, hitIdx);
      await el.evaluate((n) => n.scrollIntoView({ block: 'start' }));
      await wait(300);
      await el.screenshot({ path: path.join(OUT, `${name}.png`) });
      report.push({ name, turn: target.turn, errors });
      await p.close();
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify(report));
})();
