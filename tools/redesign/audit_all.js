// UX 감사용 전 화면·상태 스크린샷 + DOM 계측 (읽기 전용 — 사이트 상태는 임시 프로필 안에서만 바뀜)
// 실행: NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/audit_all.js
// 주의: 피드백 모달은 열기만 하고 절대 전송하지 않는다.
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const BASE = process.env.UITEST_BASE || 'https://xxl-famido.github.io/xxl/';
const BOSS = process.env.BOSS_BASE || 'http://localhost:8777/boss.html';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'shots', 'audit');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const metrics = {};
const log = (...a) => console.log(...a);

async function shot(page, name, opts = {}) {
  const file = path.join(OUT, name + '.png');
  try {
    if (opts.sel) {
      const el = await page.$(opts.sel);
      if (!el) { log('  !no el', opts.sel); return; }
      await el.screenshot({ path: file });
    } else await page.screenshot({ path: file, fullPage: !!opts.full });
    log('  shot', name);
  } catch (e) { log('  !shot fail', name, e.message); }
}
async function click(page, sel) {
  const ok = await page.evaluate(s => { const el = document.querySelector(s); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; }, sel);
  if (!ok) log('  !no click target', sel);
  await sleep(500);
  return ok;
}
async function esc(page) { await page.keyboard.press('Escape'); await sleep(350); }

// 터치 타깃·FAB 겹침·가로 넘침·텍스트 잘림 계측
async function measure(page, key) {
  metrics[key] = await page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const label = el => (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') + ' "' + (el.textContent || el.value || el.title || '').trim().slice(0, 18) + '"';
    const ctrls = [...document.querySelectorAll('button, a, input, select, [role=tab], .slot, .rc, .prio li, .turn-h, .act-h, .altar-row, .sk-h')].filter(vis);
    const small = ctrls.map(el => { const r = el.getBoundingClientRect(); return { el: label(el), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter(x => x.w < 44 || x.h < 44);
    const byClass = {};
    small.forEach(s => { const k = s.el.replace(/ ".*$/, ''); (byClass[k] = byClass[k] || { n: 0, w: s.w, h: s.h }).n++; });
    const fabs = [...document.querySelectorAll('.cmp-fab,.guide-fab,.patch-fab,.fb-fab,.lang-fab,.last-update')].filter(vis).map(el => {
      const r = el.getBoundingClientRect(); return { el: el.className, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    // FAB 가 덮는 인터랙티브 요소
    const covered = [];
    fabs.forEach(f => {
      ctrls.forEach(c => {
        if (c.closest('.cmp-fab,.guide-fab,.patch-fab,.fb-fab,.lang-fab,.lang-menu')) return;
        const r = c.getBoundingClientRect();
        if (r.x < f.x + f.w && r.x + r.width > f.x && r.y < f.y + f.h && r.y + r.height > f.y) covered.push(f.el + ' ⟂ ' + label(c));
      });
    });
    const clipped = [...document.querySelectorAll('button, label, span, b, h2, h3, .nm, .tag')].filter(vis)
      .filter(el => el.children.length === 0 && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible')
      .slice(0, 40).map(label);
    return {
      vw: innerWidth, docH: document.documentElement.scrollHeight, hOverflow: document.documentElement.scrollWidth > innerWidth,
      scrollW: document.documentElement.scrollWidth,
      ctrlCount: ctrls.length, smallCount: small.length, smallByClass: byClass, fabs, covered: covered.slice(0, 60), clipped,
    };
  });
  log('  measure', key, 'small', metrics[key].smallCount, '/', metrics[key].ctrlCount, 'docH', metrics[key].docH, 'hOverflow', metrics[key].hOverflow);
}

async function boot(page, lang) {
  await page.evaluateOnNewDocument(l => { try { localStorage.setItem('woofia_lang', l); } catch { } }, lang || 'kr');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => typeof CHARS !== 'undefined' && Object.keys(CHARS).length > 30 && document.querySelector('#teamSlots .slot'), { timeout: 120000 });
  await page.evaluate(() => { const b = document.getElementById('boot'); if (b) b.remove(); });
  await sleep(1800);
}

async function runSim(page) {
  await page.evaluate(() => { const r = document.getElementById('runs'); if (r) { r.value = 10; r.dispatchEvent(new Event('input', { bubbles: true })); } });
  await click(page, '#runBtn');
  try {
    await page.waitForFunction(() => { const r = document.getElementById('results'); const t = document.getElementById('hTotal'); return r && !r.hidden && t && t.textContent.trim() !== '—' && !document.querySelector('#runBtn.busy'); }, { timeout: 180000 });
  } catch (e) { log('  !run timeout'); }
  await sleep(1500);
}

async function mainFlow(browser, vpName, vp) {
  const P = vpName;
  const page = await browser.newPage();
  await page.setViewport({ ...vp, deviceScaleFactor: 1 });
  await boot(page, 'kr');
  log(P, 'booted');
  await shot(page, `${P}_01_main_top`);
  await shot(page, `${P}_02_main_full`, { full: true });
  await measure(page, `${P}_main`);

  // 포커스 표시: Tab 6회
  await page.evaluate(() => window.scrollTo(0, 0));
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
  await sleep(300);
  await shot(page, `${P}_03_focus_tab6`);
  metrics[`${P}_focus`] = await page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { el: a.outerHTML.slice(0, 120), outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor, boxShadow: cs.boxShadow }; });

  // (2) 캐릭터 모달
  await click(page, '#teamSlots .slot.filled');
  await sleep(1500);
  await shot(page, `${P}_10_char_modal`);
  await measure(page, `${P}_char_modal`);
  await click(page, '#usePlan');
  await sleep(600);
  await shot(page, `${P}_11_char_modal_planner`);
  await page.evaluate(() => { const c = document.getElementById('modalCard'); if (c) c.scrollTop = c.scrollHeight; });
  await click(page, '#skills .sk-h');
  await sleep(500);
  await shot(page, `${P}_12_char_modal_skill_open`);
  await page.evaluate(() => { const c = document.getElementById('modalCard'); if (c) c.scrollTop = 0; });
  await click(page, '#csOpen');
  await sleep(900);
  await shot(page, `${P}_13_char_spec_panel`);
  await measure(page, `${P}_spec_panel`);
  await page.evaluate(() => { const u = document.querySelector('#specPanel .cs-use input, #specPanel input[type=checkbox]'); if (u) u.click(); });
  await sleep(600);
  await shot(page, `${P}_14_char_spec_panel_on`);
  await page.evaluate(() => { const u = document.querySelector('#specPanel .cs-use input, #specPanel input[type=checkbox]'); if (u) u.click(); });
  await page.evaluate(() => { const u = document.querySelector('#usePlan'); if (u && u.checked) u.click(); });
  await esc(page); await esc(page);
  await page.evaluate(() => { document.getElementById('modal').hidden = true; });

  // (3) 길드 제단
  await page.evaluate(() => window.scrollTo(0, 0));
  await click(page, '#altarOpen');
  await sleep(1200);
  await shot(page, `${P}_20_altar`);
  await shot(page, `${P}_21_altar_full`, { full: true });
  await measure(page, `${P}_altar`);
  // 사용 켜기
  await page.evaluate(() => { const host = document.querySelector('.altar-side.in, .altar-card'); const t = host && host.querySelector('.adv-head input[type=checkbox]'); if (t) t.click(); });
  await sleep(700);
  await shot(page, `${P}_22_altar_on`);
  await page.evaluate(() => { const host = document.querySelector('.altar-side.in, .altar-card'); const t = host && host.querySelector('.adv-head input[type=checkbox]'); if (t && t.checked) t.click(); });
  // 턴 피해
  await click(page, '#tdmgOpen');
  await sleep(1000);
  await shot(page, `${P}_23_tdmg`);
  await esc(page);
  await page.evaluate(() => { document.querySelectorAll('.advpop').forEach(p => p.remove()); });
  await click(page, '#tdmgOpen'); // 데스크탑 토글 닫기용
  await sleep(500);
  await page.evaluate(() => { if (document.querySelector('#tdmgSide.in, #altarSide.in')) document.querySelector('#tdmgOpen').click(); });
  await sleep(500);

  // (4) 행동 고급 설정
  await click(page, '#advOpen');
  await sleep(1500);
  await shot(page, `${P}_30_adv_time_off`);
  await page.evaluate(() => { const s = document.getElementById('advSwitch'); if (s && !s.checked) s.click(); });
  await sleep(2500);
  await shot(page, `${P}_31_adv_time_on`);
  await measure(page, `${P}_adv_time`);
  await click(page, '.adv-tools .btn-ghost:last-of-type');
  await sleep(800);
  await shot(page, `${P}_32_adv_time_tools`);
  await click(page, '[data-advtab="ult"]');
  await sleep(900);
  await shot(page, `${P}_33_adv_ult`);
  await measure(page, `${P}_adv_ult`);
  await click(page, '[data-advtab="sync"]');
  await sleep(900);
  await shot(page, `${P}_34_adv_sync`);
  await page.evaluate(() => { const b = document.querySelector('.adv-pane-sync .as-group input[type=checkbox], .adv-pane-sync .as-anchor'); if (b && b.tagName === 'SELECT') { b.selectedIndex = Math.min(1, b.options.length - 1); b.dispatchEvent(new Event('change', { bubbles: true })); } else if (b) b.click(); });
  await sleep(900);
  await shot(page, `${P}_35_adv_sync_group`);
  await measure(page, `${P}_adv_sync`);
  await click(page, '[data-advtab="time"]');
  await page.evaluate(() => { const s = document.getElementById('advSwitch'); if (s && s.checked) s.click(); });
  await sleep(1500);
  await click(page, '[data-advclose]');
  await page.evaluate(() => { document.querySelectorAll('.advpop').forEach(p => p.remove()); });

  // (5) 실행 → 결과
  await runSim(page);
  await page.evaluate(() => document.getElementById('results').scrollIntoView());
  await sleep(800);
  await shot(page, `${P}_40_result_view`);
  await shot(page, `${P}_41_result_panel`, { sel: '#results' });
  await measure(page, `${P}_result`);
  // 차트 호버
  const col = await page.$('#chart .col:nth-child(4)');
  if (col) { await col.hover(); await sleep(400); await shot(page, `${P}_42_chart_hover`, { sel: '.chart-card' }); }
  // 로그 펼침
  await click(page, '#log .turn .turn-h');
  await sleep(600);
  await page.evaluate(() => { const hs = [...document.querySelectorAll('#log .turn.open .act-h')]; const h = hs.find(x => /\d/.test((x.querySelector('.at') || {}).textContent || '')); if (h) { h.scrollIntoView({ block: 'center' }); h.click(); } });
  await sleep(600);
  await page.evaluate(() => { const t = document.querySelector('#log .turn.open'); if (t) t.scrollIntoView(); });
  await sleep(300);
  await shot(page, `${P}_43b_log_open_view`);
  await shot(page, `${P}_43_log_open`, { sel: '.log-card' });
  await page.evaluate(() => { const ch = document.querySelector('#log .turn.open .chan'); if (ch) ch.click(); });
  await sleep(600);
  await shot(page, `${P}_44_log_srcpop`);
  await esc(page);
  await page.evaluate(() => document.querySelectorAll('.srcpop').forEach(e => e.remove()));
  await shot(page, `${P}_45_full_after_run`, { full: true });

  // 기록 관리
  await page.evaluate(() => window.scrollTo(0, 0));
  await click(page, '#histManage');
  await sleep(700);
  await shot(page, `${P}_50_hist_manage`);
  await page.evaluate(() => { document.getElementById('histModal').hidden = true; });

  // (6) 조합 비교 — 서로 다른 두 기록이 필요하므로 턴 13으로 한 번 더 실행
  await page.evaluate(() => { const t = document.getElementById('turns'); t.value = 13; t.dispatchEvent(new Event('input', { bubbles: true })); });
  await runSim(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, `${P}_46_top_after_2runs`);
  await measure(page, `${P}_after_2runs`);
  await click(page, '#cmpBtn');
  await sleep(1200);
  await shot(page, `${P}_60_cmp_empty`);
  await page.evaluate(() => {
    const vals = id => [...document.getElementById(id).options].map(o => o.value).filter(v => v && !/^(new|custom|)$/.test(v));
    const set = (id, v) => { const s = document.getElementById(id); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); };
    const a = vals('cmpA'); if (a.length >= 2) { set('cmpA', a[0]); set('cmpB', a[1]); }
  });
  await sleep(1200);
  await shot(page, `${P}_61_cmp_loaded`);
  await click(page, '#cmpRun');
  try { await page.waitForFunction(() => document.querySelector('.cc-plot') || document.querySelector('.cmp-total'), { timeout: 120000 }); } catch { log('  !cmp timeout'); }
  await sleep(1500);
  await shot(page, `${P}_62_cmp_result`);
  await measure(page, `${P}_cmp`);
  await page.evaluate(() => { const b = document.querySelector('.cmp-body'); if (b) b.scrollTop = b.scrollHeight; const w = document.querySelector('.cmp-wrap'); if (w) w.scrollTop = w.scrollHeight; });
  await sleep(500);
  await shot(page, `${P}_63_cmp_result_bottom`);
  await page.evaluate(() => { const c = document.querySelector('#cmpBody .cmp-cell:not(.empty)'); if (c) c.click(); });
  await sleep(900);
  await shot(page, `${P}_64_cmp_charinfo`);
  await page.evaluate(() => document.querySelectorAll('.cmpinfo,.priopop,.planpop,.sealpop,.swappop').forEach(e => e.remove()));
  await page.evaluate(() => { const b = document.querySelector('.ct-prio'); if (b) b.click(); });
  await sleep(900);
  await shot(page, `${P}_65_cmp_prio`);
  await page.evaluate(() => document.querySelectorAll('.cmpinfo,.priopop,.planpop,.sealpop,.swappop').forEach(e => e.remove()));
  await page.evaluate(() => { document.getElementById('cmpModal').hidden = true; });

  // (7) 가이드
  await click(page, '#guideBtn');
  await sleep(1500);
  await shot(page, `${P}_70_guide`);
  await page.evaluate(() => { const b = document.querySelector('.guide-body'); if (b) b.scrollTop = 2600; });
  await sleep(800);
  await shot(page, `${P}_71_guide_mid`);
  metrics[`${P}_guide`] = await page.evaluate(() => { const b = document.querySelector('.guide-body'); return { scrollH: b.scrollHeight, clientH: b.clientHeight, imgs: b.querySelectorAll('img').length, notes: b.querySelectorAll('.g-note').length }; });
  await page.evaluate(() => { document.getElementById('guideModal').hidden = true; });

  // (8) 패치 히스토리
  await click(page, '#patchBtn');
  await sleep(1500);
  await shot(page, `${P}_80_patch`);
  await page.evaluate(() => { const b = document.querySelector('.patch-body'); if (b) b.scrollTop = 1400; });
  await sleep(500);
  await shot(page, `${P}_81_patch_mid`);
  metrics[`${P}_patch`] = await page.evaluate(() => { const b = document.querySelector('.patch-body'); return { scrollH: b.scrollHeight, clientH: b.clientHeight, entries: b.querySelectorAll('.pr').length, majors: b.querySelectorAll('.pr.major').length }; });
  await page.evaluate(() => { document.getElementById('patchModal').hidden = true; });

  // (9) 피드백 — 열기만(전송 금지)
  await click(page, '.fb-fab');
  await sleep(700);
  await shot(page, `${P}_90_feedback`);
  await page.evaluate(() => document.querySelector('.fb-modal')?.classList.remove('open'));

  // (10) 언어 메뉴
  await page.evaluate(() => window.scrollTo(0, 0));
  await click(page, '.lang-fab');
  await sleep(400);
  await shot(page, `${P}_95_lang_menu`);
  await esc(page);
  await page.close();
}

async function langFlow(browser, vpName, vp, lang) {
  const P = `${vpName}_${lang}`;
  const page = await browser.newPage();
  await page.setViewport({ ...vp, deviceScaleFactor: 1 });
  await boot(page, lang);
  await sleep(1500);
  await shot(page, `${P}_01_main_top`);
  await shot(page, `${P}_02_main_full`, { full: true });
  await measure(page, `${P}_main`);
  await click(page, '#teamSlots .slot.filled');
  await sleep(1500);
  await shot(page, `${P}_10_char_modal`);
  await click(page, '#csOpen'); await sleep(900);
  await shot(page, `${P}_13_char_spec`);
  await esc(page); await esc(page);
  await page.evaluate(() => { document.getElementById('modal').hidden = true; });
  await click(page, '#altarOpen'); await sleep(1200);
  await shot(page, `${P}_20_altar`);
  await esc(page); await page.evaluate(() => { document.querySelectorAll('.advpop').forEach(p => p.remove()); if (document.querySelector('#altarSide.in')) document.querySelector('#altarOpen').click(); });
  await sleep(500);
  await click(page, '#advOpen'); await sleep(1500);
  await page.evaluate(() => { const s = document.getElementById('advSwitch'); if (s && !s.checked) s.click(); });
  await sleep(2200);
  await shot(page, `${P}_31_adv_time`);
  await click(page, '[data-advtab="ult"]'); await sleep(800);
  await shot(page, `${P}_33_adv_ult`);
  await click(page, '[data-advtab="sync"]'); await sleep(800);
  await shot(page, `${P}_34_adv_sync`);
  await click(page, '[data-advtab="time"]');
  await page.evaluate(() => { const s = document.getElementById('advSwitch'); if (s && s.checked) s.click(); });
  await sleep(1200);
  await click(page, '[data-advclose]');
  await page.evaluate(() => { document.querySelectorAll('.advpop').forEach(p => p.remove()); });
  await runSim(page);
  await page.evaluate(() => document.getElementById('results').scrollIntoView());
  await click(page, '#log .turn .turn-h'); await sleep(500);
  await click(page, '#log .turn.open .act-h'); await sleep(500);
  await shot(page, `${P}_41_result_panel`, { sel: '#results' });
  await measure(page, `${P}_result`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await click(page, '#cmpBtn'); await sleep(1200);
  await shot(page, `${P}_60_cmp`);
  await page.evaluate(() => { document.getElementById('cmpModal').hidden = true; });
  await page.close();
}

async function bossFlow(browser, vpName, vp) {
  const P = `${vpName}_boss`;
  const page = await browser.newPage();
  await page.setViewport({ ...vp, deviceScaleFactor: 1 });
  try {
    await page.goto(BOSS, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('#teamSlots .slot') && document.querySelector('#bossPick button'), { timeout: 30000 });
  } catch (e) { log('  !boss boot fail', e.message); await page.close(); return; }
  await sleep(1200);
  await shot(page, `${P}_01_top`);
  await shot(page, `${P}_02_full`, { full: true });
  await measure(page, `${P}_main`);
  await click(page, '#teamSlots .slot.filled'); await sleep(1200);
  await shot(page, `${P}_10_char_modal`);
  await esc(page); await page.evaluate(() => { document.getElementById('modal').hidden = true; });
  await click(page, '#runBtn');
  try { await page.waitForFunction(() => !document.getElementById('results').hidden && document.getElementById('hResult').textContent.trim() !== '—', { timeout: 120000 }); } catch { log('  !boss run timeout'); }
  await sleep(1500);
  await page.evaluate(() => document.getElementById('results').scrollIntoView());
  await shot(page, `${P}_40_result_view`);
  await shot(page, `${P}_41_result_full`, { full: true });
  await measure(page, `${P}_result`);
  await page.close();
}

(async () => {
  const only = process.argv[2] || 'all';
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  const VPS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844, isMobile: true, hasTouch: true } };
  try {
    for (const [n, vp] of Object.entries(VPS)) {
      if (only === 'all' || only === 'main' || only === n) { try { await mainFlow(browser, n, vp); } catch (e) { log('mainFlow fail', n, e.stack); } }
      if (only === 'all' || only === 'lang' || only === n) {
        for (const l of ['en', 'ja', 'zh']) { try { await langFlow(browser, n, vp, l); } catch (e) { log('langFlow fail', n, l, e.message); } }
      }
      if (only === 'all' || only === 'boss' || only === n) { try { await bossFlow(browser, n, vp); } catch (e) { log('bossFlow fail', n, e.message); } }
    }
  } finally {
    const mf = path.join(OUT, `metrics_${only}.json`);
    fs.writeFileSync(mf, JSON.stringify(metrics, null, 1));
    log('metrics ->', mf);
    await browser.close();
  }
})();
