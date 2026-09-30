// v1(8777) 기준 화면 — 이태호 턴당 2회 플래너 · 임부언 추가 행동 칸 · 고급 설정 격자(한 칸 여러 행동)를 찍어 v2 와 비교한다.
// NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/shoot_multi_action_v1.js
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'shots', 'multi_action', 'v1');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--lang=ko-KR'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR' });
    const p = await ctx.newPage();
    await p.goto('http://localhost:8777/', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await p.waitForFunction(() => typeof addToTeam === 'function' && typeof CHARS === 'object' && Object.keys(CHARS).length > 10, null, { timeout: 60000 });
    await sleep(1500);
    await p.evaluate(() => { for (let i = 0; i < 5; i++) if (team[i]) removeFromTeam(i); [10423, 10428, 10421, 10425, 10410].forEach((id) => addToTeam(id)); renderTeam(); renderPrio(); });
    await sleep(1200);
    await p.evaluate(() => openModal(team.findIndex((s) => s && s.id === 10423)));
    await sleep(1500);
    await p.evaluate(() => { const c = document.querySelector('#usePlan'); if (c && !c.checked) c.click(); });
    await sleep(800);
    const card = await p.$('#modalCard');
    if (card) await card.screenshot({ path: path.join(OUT, 'v1_taeho_planner.png') });
    const plan = await p.$('#plannerWrap');
    if (plan) await plan.screenshot({ path: path.join(OUT, 'v1_taeho_planner_cells.png') });
    console.log('ok', OUT);
  } finally { await browser.close(); }
})();
