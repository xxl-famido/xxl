// 한 턴 여러 행동(이태호 턴당 2회 · 임부언/욱영이 주는 추가 행동) 표시 점검 — v2(8778) 화면을 찍는다.
// NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/shoot_multi_action.js [tag]
//   (playwright-core — puppeteer-core 는 더 이상 설치돼 있지 않음)
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TAG = process.argv[2] || 'before';
const OUT = path.join(__dirname, 'shots', 'multi_action', TAG);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TAEHO_TEAM = [10423, 10428, 10421, 10425, 10410];   // 이태호(1) · 리카노 · 파미도 · 하니엘 · 임부언
const UK_TEAM = [10401, 10442, 10439, 10421, 10425];      // 욱영(3) 인접 = 마타야(2) · 파미도(4)

async function boot(browser, { width = 1440, height = 1000, theme = 'light' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'ko-KR', isMobile: width < 600, hasTouch: width < 600 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto('http://localhost:8778/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.__woofia && window.__woofia.store && document.querySelector('#app-plan details'), null, { timeout: 60000 });
  if (theme !== 'light') await p.evaluate((th) => { document.documentElement.dataset.theme = th; }, theme);
  await sleep(1000);
  return p;
}
async function setTeam(p, ids) {
  await p.evaluate((ids) => {
    const s = window.__woofia.store;
    const cur = s.get().team;
    for (let i = cur.length - 1; i >= 0; i--) if (cur[i]) s.team.remove(i);
    ids.forEach((id, i) => { if (id) s.team.add(id, i); });
  }, ids);
  await sleep(1500);
}
const shot = (p, name) => p.screenshot({ path: path.join(OUT, `${name}.png`) });
async function elShot(p, sel, name) {
  const el = await p.$(sel);
  if (!el) { console.log('missing', sel); return; }
  await el.scrollIntoViewIfNeeded();
  await el.screenshot({ path: path.join(OUT, `${name}.png`) });
}
async function openAdv(p) {
  await p.evaluate(() => { const b = document.querySelector('#app-plan .adv-enter'); b && b.click(); });
  await sleep(1200);
  await p.evaluate(() => { const i = document.querySelector('[data-fk="advUse"]'); if (i && !i.checked) i.click(); });
  await sleep(2500);
}
async function clickCell(p, pos, t) {
  await p.evaluate(({ pos, t }) => { const c = document.querySelector(`.sheet .pg-c[data-pos="${pos}"][data-t="${t}"]`); c.scrollIntoView({ block: 'center' }); c.click(); }, { pos, t });
  await sleep(600);
}
const pickRow = (p, row, re) => p.evaluate(({ row, src }) => { const rows = [...document.querySelectorAll('.menu.pl-pop .pl-pop-row')]; const b = rows[row] && [...rows[row].querySelectorAll('button')].find((x) => new RegExp(src).test(x.textContent)); if (b) b.click(); return !!b; }, { row, src: re.source });
const pickMenu = (p, re) => p.evaluate((src) => { const rx = new RegExp(src); const b = [...document.querySelectorAll('.menu.pl-pop button')].find((x) => rx.test(x.textContent)); if (b) b.click(); return !!b; }, re.source);

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--lang=ko-KR'] });
  try {
    // A. 이태호(1) + 임부언 — 메인(직접 지정 줄 · 미리보기) → 고급 설정(④ 격자 · 칸 메뉴 · 턴 편집)
    let p = await boot(browser);
    await setTeam(p, TAEHO_TEAM);
    const pos = await p.evaluate(() => window.__woofia.store.get().team.findIndex((s) => s && s.id === 10423) + 1);
    await p.selectOption(`#app-plan [data-fk="mode:${pos}"]`, 'direct');
    await sleep(1800);
    await elShot(p, `#app-plan li[data-pos="${pos}"]`, 'A1_main_taeho_strip');
    await elShot(p, '#app-plan .preview', 'A1b_main_preview');
    // 2턴 칸 → 2번째 행동 필살기
    await p.evaluate((pos) => { document.querySelector(`#app-plan [data-fk="cell:${pos}:2"]`).click(); }, pos);
    await sleep(500);
    await shot(p, 'A1c_main_cell_pick');
    await pickRow(p, 1, /필살기/);
    await sleep(1500);
    // 4턴 칸 → 받은 추가 행동 방어
    await p.evaluate((pos) => { document.querySelector(`#app-plan [data-fk="cell:${pos}:4"]`).click(); }, pos);
    await sleep(500);
    await shot(p, 'A1d_main_fed_pick');
    await pickRow(p, 2, /방어/);
    await sleep(1800);
    await elShot(p, `#app-plan li[data-pos="${pos}"]`, 'A1e_main_taeho_strip_edited');
    await elShot(p, '#app-plan .preview', 'A1f_main_preview_edited');
    const stA = await p.evaluate(async () => {
      const w = window.__woofia, s = w.store.get();
      const r = await w.api.probe(w.store.buildCfg({ mode: 'probe' }));
      const acts = (t) => ((r.plan[String(t)] || {}).seq || []).filter((e) => e.p === 1).map((e) => e.a).join('');
      return { pins: s.pins, fed: s.team[0] && s.team[0].fedActions, t2: acts(2), t4: acts(4), ignored: w.store.pinsIgnored(r) };
    });
    console.log('A state', JSON.stringify(stA));
    await openAdv(p);
    await elShot(p, '.sheet .pg-wrap', 'A3_adv_grid');
    await clickCell(p, pos, 4);
    await shot(p, 'A4_adv_cell_pop_t4');
    await p.keyboard.press('Escape'); await sleep(300);
    await clickCell(p, pos, 3);
    await shot(p, 'A4b_adv_cell_pop_t3');
    // 3턴 두 번째 행동 → 방어(줄 고정)
    await p.evaluate(() => { const rows = [...document.querySelectorAll('.menu.pl-pop .pl-pop-row')]; const b = rows[1] && [...rows[1].querySelectorAll('button')].find((x) => /방어/.test(x.textContent)); b && b.click(); });
    await sleep(2500);
    const stA2 = await p.evaluate(() => ({ pins: window.__woofia.store.get().pins }));
    console.log('A after grid pick', JSON.stringify(stA2));
    await elShot(p, '.sheet .pg-wrap', 'A4c_adv_grid_after_pick');
    await p.evaluate(() => { const c = document.querySelector('.sheet .pg-th[data-th="4"]'); c && c.click(); });
    await sleep(2500);
    await elShot(p, '.sheet', 'A5_turn_edit_t4');
    await p.close();

    // B. 욱영 팀 — 받은 추가 행동(인접 동료)
    p = await boot(browser);
    await setTeam(p, UK_TEAM);
    await elShot(p, '#app-plan .preview', 'B1_main_preview_uk');
    await openAdv(p);
    await elShot(p, '.sheet .pg-wrap', 'B2_adv_grid_uk');
    await clickCell(p, 2, 4);
    await shot(p, 'B3_adv_cell_pop_extra');
    await p.keyboard.press('Escape'); await sleep(300);
    await p.close();

    // C. 도장 잠금해제를 끈 이태호 — 턴당 1회
    p = await boot(browser);
    await setTeam(p, TAEHO_TEAM);
    await p.evaluate(() => {
      const s = window.__woofia.store;
      const t = s.get().team.map((x) => x && JSON.parse(JSON.stringify(x)));
      t[0].spec = { on: true, level: 60, evo: 5, pevo: 5, compat: 5, lv: {} }; t[0].rune = false;
      s.set({ team: t });
    });
    await sleep(800);
    await p.selectOption('#app-plan [data-fk="mode:1"]', 'direct');
    await sleep(1800);
    await elShot(p, '#app-plan li[data-pos="1"]', 'C1_main_taeho_rune_off');
    await elShot(p, '#app-plan .preview', 'C2_main_preview_rune_off');
    const stC = await p.evaluate(() => { const w = window.__woofia; return { apt: w.store.env().chars[10423].actionsPerTurn, rot: (w.store.buildCfg({ mode: 'probe' }).team[0].rotation || '').slice(0, 10) }; });
    console.log('C state', JSON.stringify(stC));
    await p.close();

    // D. 모바일(390) — ④ 격자 · 칸 시트
    p = await boot(browser, { width: 390, height: 844 });
    await setTeam(p, TAEHO_TEAM);
    await openAdv(p);
    await p.evaluate(() => { const g = document.querySelector('.sheet .pg-wrap'); g && g.scrollIntoView({ block: 'start' }); });
    await sleep(500);
    await shot(p, 'D1_mobile_grid');
    await clickCell(p, 1, 4);
    await sleep(600);
    await shot(p, 'D2_mobile_cell_sheet');
    await p.close();

    // D'. 모바일(390) — 메인 직접 지정 줄(턴당 2회 + 받은 추가 행동)
    p = await boot(browser, { width: 390, height: 844 });
    await setTeam(p, TAEHO_TEAM);
    await p.evaluate(() => { const b = [...document.querySelectorAll('[role="tab"], .tabs button, nav button')].find((x) => /행동/.test(x.textContent)); b && b.click(); });
    await sleep(600);
    await p.selectOption('#app-plan [data-fk="mode:1"]', 'direct');
    await sleep(1800);
    await elShot(p, '#app-plan li[data-pos="1"]', 'D3_mobile_main_strip');
    await p.close();

    // F. 줄 유틸 — 모두 방어 · 패턴 반복(리카노 1~4턴 → 끝까지) · ④ 행 메뉴
    p = await boot(browser);
    await setTeam(p, TAEHO_TEAM);
    await p.selectOption('#app-plan [data-fk="mode:2"]', 'direct');
    await sleep(1200);
    await elShot(p, '#app-plan li[data-pos="2"] .plan-strip', 'F1_util_buttons');
    await p.evaluate(() => document.querySelector('#app-plan [data-fk="cell:2:1"]').click());   // 1턴 → 방어
    await sleep(400); await pickMenu(p, /^방어$/); await sleep(900);
    await p.evaluate(() => document.querySelector('#app-plan [data-fk="cell:2:3"]').click());   // 3턴 칸 메뉴 → 여기까지 패턴 반복
    await sleep(400);
    await shot(p, 'F2_cell_menu_repeat');
    await pickMenu(p, /패턴으로 반복/); await sleep(700);
    await elShot(p, '.sheet', 'F3_repeat_sheet');
    await p.evaluate(() => { const b = [...document.querySelectorAll('.sheet .btn-primary')].find((x) => /반복 적용/.test(x.textContent)); b && b.click(); });
    await sleep(1500);
    await elShot(p, '#app-plan li[data-pos="2"] .plan-strip', 'F4_after_repeat');
    await p.selectOption('#app-plan [data-fk="mode:1"]', 'direct');
    await sleep(1200);
    await p.evaluate(() => document.querySelector('#app-plan [data-fk="util:1:fillDef"]').click());   // 이태호 모두 방어
    await sleep(1500);
    await elShot(p, '#app-plan li[data-pos="1"] .plan-strip', 'F5_taeho_fill_def');
    await openAdv(p);
    await p.evaluate(() => { const b = document.querySelector('.sheet .pg-nm[data-row="2"]'); b.scrollIntoView({ block: 'center' }); b.click(); });
    await sleep(600);
    await shot(p, 'F6_adv_row_menu');
    await p.close();

    // E. 다크 — 메인 미리보기 · ④ 격자(욱영 팀)
    p = await boot(browser, { theme: 'dark' });
    await setTeam(p, UK_TEAM);
    await elShot(p, '#app-plan .preview', 'E1_dark_preview_uk');
    await openAdv(p);
    await elShot(p, '.sheet .pg-wrap', 'E2_dark_grid_uk');
    await p.close();
    console.log('ok', OUT);
  } finally { await browser.close(); }
})();
