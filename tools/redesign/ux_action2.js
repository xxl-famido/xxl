// ux_action.js 보충 — (1) 제단 '사용' 스위치가 FAB에 가려지는지 뷰포트별 점검 + S6 재측정
// (2) 고급 설정 OFF 기록으로 비교군 캐릭터 → 행동 팝업(궁극기 사용 방식 직접 편집) 캡처
// 실행: NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/ux_action2.js   (읽기 전용 · 임시 프로필)
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const BASE = process.env.UITEST_BASE || 'https://xxl-famido.github.io/xxl/';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'shots', 'ux_action');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = { fabCover: {}, s6: [], notes: [] };

async function boot(page) {
  await page.goto(BASE + '?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => typeof CHARS !== 'undefined' && Object.keys(CHARS).length > 30 && document.querySelector('#teamSlots .slot'), { timeout: 180000 });
  await page.evaluate(() => { const b = document.getElementById('boot'); if (b) b.remove(); });
  try { await page.waitForFunction(() => !document.querySelector('#runBtn.busy'), { timeout: 180000 }); } catch { }
  await sleep(1200);
}
const hit = sel => {           // 요소 중심을 실제로 누르면 무엇이 맞는가
  const el = document.querySelector(sel); if (!el) return { missing: true };
  const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  const ok = top && (top === el || el.contains(top) || top.contains(el) && top.tagName === 'LABEL');
  return { ok: !!ok, x: Math.round(x), y: Math.round(y), hitEl: top ? (top.className || top.tagName) + '' : null };
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  try {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    page.on('dialog', d => d.dismiss());
    for (const [w, h] of [[1280, 800], [1440, 900], [1920, 1080]]) {
      await page.setViewport({ width: w, height: h });
      if (w === 1280) await boot(page); else { await sleep(800); }
      await page.evaluate(() => { window.scrollTo(0, 0); if (!document.querySelector('#altarSide') || document.querySelector('#altarSide').hidden) document.querySelector('#altarOpen').click(); });
      await sleep(900);
      const r = await page.evaluate(src => { const h2 = eval('(' + src + ')'); return { sw: h2('#altarSide .altar-head label.toggle'), close: h2('#altarSide [data-altarclose]') }; }, hit.toString());
      out.fabCover[`${w}x${h}`] = r;
      console.log(w, h, JSON.stringify(r));
      await page.screenshot({ path: path.join(OUT, `F_altarHead_${w}.png`), clip: { x: w - 460, y: 60, width: 460, height: 160 } });
    }
    // S6 재측정(1440×900): 가려진 스위치는 사용자가 FAB을 피해 누를 수 없으므로 '가려짐'을 기록하고 스위치는 직접 조작
    await page.setViewport({ width: 1440, height: 900 }); await sleep(600);
    const steps = out.s6; let clicks = 0, trans = 0;
    const st = (m, t) => { clicks++; if (t) trans++; steps.push(`${clicks}. ${m}`); };
    // (패널은 이미 열림) 1. 길드 제단 설정 열기
    st('길드 제단 설정 열기 → 오른쪽 사이드 패널', 1);
    await page.evaluate(() => { const i = document.querySelector('#altarSide input[data-altarsw]'); if (!i.checked) i.click(); });
    await sleep(900);
    st('제단 「사용」 켜기 (1440×900에선 스위치가 FAB 아래 — 실제 클릭은 패치 히스토리를 연다)', 0);
    const afterOn = await page.evaluate(() => ({ altarOn, advOpenVisible: !!document.querySelector('#advOpen').getBoundingClientRect().width, procCd: altarProcCdActive() }));
    out.notes.push('S6 제단 ON 후: ' + JSON.stringify(afterOn));
    await page.evaluate(() => document.querySelector('#advOpen').scrollIntoView({ block: 'center' })); await sleep(300);
    await page.click('#advOpen'); await sleep(1400); st('행동 우선순위 옆 「행동 고급 설정」', 1);
    const tab = await page.evaluate(() => (document.querySelector('[data-advtab].on') || {}).dataset?.advtab);
    if (tab !== 'ult') { await page.click('[data-advtab="ult"]'); await sleep(900); st('「궁극기 사용 방식」 탭', 1); }
    await page.screenshot({ path: path.join(OUT, 'S6_advUltWarn.png') });
    const warnTop = await page.evaluate(() => { const b = document.querySelector('[data-ultall="asap"]'); const r = b.getBoundingClientRect(); return Math.round(r.top); });
    out.notes.push('S6 「모두 준비되면 바로」 버튼 y=' + warnTop);
    await page.evaluate(() => document.querySelector('[data-ultall="asap"]').scrollIntoView({ block: 'center' })); await sleep(200);
    await page.click('[data-ultall="asap"]'); await sleep(1500); st('「모두 ‘준비되면 바로’로」', 0);
    const modes = await page.evaluate(() => team.map(s => s && ultOf(s).mode));
    out.notes.push('S6 전환 후 모드: ' + JSON.stringify(modes));
    await page.screenshot({ path: path.join(OUT, 'S6_advUltAsap.png') });
    await page.click('[data-advclose]'); await sleep(600); st('고급 설정 닫기', 1);
    st('시뮬레이션 실행', 0);
    out.s6Summary = { clicks, trans, note: '제단 패널 ↔ 고급 설정 궁 탭 왕복. 제단 패널엔 대응 안내·바로가기 없음' };
    // 되돌리기 원복
    await page.evaluate(() => { setAltarOn(false); closeAltar(); team.forEach(s => s && delete s.ult); });
    await sleep(500);

    // (2) 비교 — 고급 설정 OFF 기록 2개 만들고 비교군 캐릭터 → 행동 팝업
    await page.evaluate(() => { const r = document.getElementById('runs'); r.value = 2; r.dispatchEvent(new Event('input', { bubbles: true })); });
    for (let i = 0; i < 2; i++) {
      await page.evaluate(k => { if (k) { const s = team[3]; s.priority = 0; renderPrio(); } }, i);
      await page.evaluate(() => run(true));
      await page.waitForFunction(() => !document.querySelector('#runBtn.busy'), { timeout: 240000 }); await sleep(800);
    }
    await page.click('#cmpBtn'); await sleep(1200);
    const ids = await page.evaluate(() => simHistory.slice(0, 2).map(r => r.id));
    await page.select('#cmpA', String(ids[1])); await sleep(2500);
    await page.select('#cmpB', String(ids[0])); await sleep(4000);
    await page.click('.cmp-bwrap .cmp-cell:not(.empty)'); await sleep(800);
    await page.screenshot({ path: path.join(OUT, 'S8_cmpInfo_off.png') });
    const hasPlan = await page.$('.cmpinfo [data-plan]');
    if (hasPlan) { await hasPlan.click(); await sleep(900); await page.screenshot({ path: path.join(OUT, 'S8_cmpPlan.png') });
      out.notes.push('S8 비교 행동 팝업에서 궁극기 사용 방식 직접 편집: ' + await page.evaluate(() => !!document.querySelector('.planpop [data-ultmode]')));
      out.cmpPlan = await page.evaluate(() => { const c = document.querySelector('.pp-card'); return { h: c.scrollHeight, ch: c.clientHeight }; }); }
    // 비교 우선순위 팝업 → 고급 설정 → 닫으면 어디로 돌아가나
    await page.evaluate(() => document.querySelectorAll('.planpop,.cmpinfo').forEach(x => x.remove()));
    await page.click('.ct-prio[data-prio="a"]'); await sleep(700);
    await page.screenshot({ path: path.join(OUT, 'S8_cmpPrio_a.png') });
    await page.click('.priopop [data-cadv]'); await sleep(1500);
    await page.screenshot({ path: path.join(OUT, 'S8_cmpAdv.png') });
    await page.click('[data-advclose]'); await sleep(900);
    out.notes.push('S8 비교 고급 설정 닫은 뒤 레이어: ' + await page.evaluate(() => [document.querySelector('.priopop') ? 'priopop' : '', !document.querySelector('#cmpModal').hidden ? 'cmp' : ''].filter(Boolean).join('|')));
  } catch (e) { console.log('FAIL', e.stack || e); out.notes.push('FAIL ' + e.message); }
  finally { fs.writeFileSync(path.join(OUT, 'metrics2.json'), JSON.stringify(out, null, 2)); console.log(JSON.stringify(out, null, 1)); await browser.close(); }
})();
