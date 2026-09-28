// v2.1 행동 계획(핀 격자) 워크스루 재측정 — T2·T3·T4·T6·T8(WALKTHROUGH_V1_USERS §0) + 사용자 코드(파미도 핀 · 4턴 아누비로스 '뒤에서').
// 과업마다 새 컨텍스트(localStorage 비움), 1440×900. 클릭 = 사용자가 누르는 횟수(select 는 고르기 1회). 스크린샷 shots/v2/pin_*.png
//   NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/wt_pins.js
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:8778';
const OUT = __dirname + '/shots/v2/';
const CODE = '$eJzNkDsKw0AQQ-8ytbClnZ395CrLFMa5_xmCHZIufZB4hUAqtJb6ZPTWuosTZqiqI5rK5gFirVWpxKrixSIERLxlZNFP0-7GuBmZcEKwMBDxnThno28fDvr2PLqq_j5qdIP5Y9_t-s2KDsvMF2ZtS_o';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

async function fresh(browser, setup) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) p.errors.push(m.text()); });
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__woofia && window.__woofia.store.get().ui.booted, { timeout: 90000 });
  if (setup) { await p.evaluate(setup); }
  await sleep(1200);
  p.clicks = 0;
  p.tap = async (sel) => { await p.waitForSelector(sel, { visible: true, timeout: 10000 }); await p.click(sel); p.clicks++; await sleep(350); };
  p.tapEval = async (fn, arg) => { await p.evaluate(fn, arg); p.clicks++; await sleep(350); };
  return { ctx, p };
}
const shot = async (p, name, sel = '#app-plan') => { const el = await p.$(sel); if (el) await el.screenshot({ path: OUT + name }); else await p.screenshot({ path: OUT + name }); };
const S = (p) => p.evaluate(() => window.__woofia.store.get());
const posOf = (p, id) => p.evaluate((i) => window.__woofia.store.get().team.findIndex((s) => s && s.id === i) + 1, id);
const menuPick = (p, re) => p.tapEval((src) => { const r = new RegExp(src); const b = [...document.querySelectorAll('.menu button')].find((x) => r.test(x.textContent)); b.click(); }, re);
const advOn = (p) => p.tapEval(() => document.querySelector('#app-plan [data-fk="adv"]').closest('label').click());

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  try {
    // T2 — 확률 CD 제단 켠 채 전원 '준비되면 바로' (제단은 이미 켜짐: 행동 계획 안내 줄 버튼 1번)
    {
      const { ctx, p } = await fresh(browser, () => { window.__woofia.store.altar.quickCd(true); });
      await p.tap('#app-plan .pv-note .btn');
      const st = await S(p);
      const ok = st.team.filter(Boolean).every((s) => s.ult && s.ult.mode === 'asap');
      await shot(p, 'pin_T2.png');
      results.push({ task: 'T2 전원 준비되면 바로(제단 켜진 상태)', clicks: p.clicks, ok, errors: p.errors.length });
      await ctx.close();
    }
    // T2' — 제단이 꺼진 상태에서: 조건 › 방탈출 제단 펼침 → 층별 점등 설정 → 쿨감 제단만 켜기 → 전원 준비되면 바로
    {
      const { ctx, p } = await fresh(browser);
      await p.tapEval(() => { document.querySelectorAll('#app-cond .acc details')[3].querySelector('summary').click(); });
      await p.tapEval(() => { [...document.querySelectorAll('#app-cond button')].find((b) => /층별 점등/.test(b.textContent)).click(); });
      await sleep(800);
      await p.tapEval(() => { [...document.querySelectorAll('.altar-quick button')][0].click(); });
      await p.tapEval(() => { [...document.querySelectorAll('.altar-quick button')][1].click(); });
      const st = await S(p);
      const ok = st.altar.on && st.team.filter(Boolean).every((s) => s.ult && s.ult.mode === 'asap');
      await shot(p, 'pin_T2_altar.png', '#app-sheets .sheet');
      results.push({ task: "T2' 제단 시트에서 쿨감 제단 + 전원 준비되면 바로", clicks: p.clicks, ok, errors: p.errors.length });
      await ctx.close();
    }
    // T3 — 확률 쿨 감소 성공 가정(동료 하나): 세부 설정 → ⋯ → 확률 CD 감소 성공 가정 → 배지
    {
      const { ctx, p } = await fresh(browser, () => { window.__woofia.store.altar.quickCd(true); });
      const pos = await posOf(p, 10428);   // 리카노
      await advOn(p);
      await p.tap(`#app-plan .pl-rows li[data-pos="${pos}"] .pl-more`);
      await menuPick(p, '성공 가정');
      const st = await S(p);
      const badge = await p.evaluate((q) => !!document.querySelector(`#app-plan .pl-rows li[data-pos="${q}"] .pl-badge.on`), pos);
      await shot(p, 'pin_T3.png');
      results.push({ task: 'T3 성공 가정(동료별) + 배지', clicks: p.clicks, ok: !!(st.team[pos - 1].ult && st.team[pos - 1].ult.assist) && badge, errors: p.errors.length });
      await ctx.close();
    }
    // T4 — 리카노 4·7·10턴에만: 방식 select '정해진 턴만'(자동 턴 = 4·7·10) 1번
    {
      const { ctx, p } = await fresh(browser);
      const pos = await posOf(p, 10428);
      await p.select(`#app-plan .pl-rows li[data-pos="${pos}"] select`, 'strict'); p.clicks++;
      await sleep(1200);
      const ults = await p.evaluate((q) => {
        const pr = window.__woofia.store.get().probe; const out = [];
        for (let t = 1; t <= 12; t++) if (((pr.plan[String(t)] || {}).seq || []).some((e) => e.p === q && e.a === '궁')) out.push(t);
        return out;
      }, pos);
      await shot(p, 'pin_T4.png');
      results.push({ task: 'T4 리카노 정해진 턴만(4·7·10)', clicks: p.clicks, ok: ults.join(',') === '4,7,10', detail: ults.join(','), errors: p.errors.length });
      await ctx.close();
    }
    // T6 — 파미도 필살기 직전 방어: 세부 설정 → ⋯ → 필살기 직전 방어
    {
      const { ctx, p } = await fresh(browser);
      const pos = await posOf(p, 10421);
      await advOn(p);
      await p.tap(`#app-plan .pl-rows li[data-pos="${pos}"] .pl-more`);
      await menuPick(p, '직전 방어');
      await sleep(900);
      const st = await S(p);
      const row = Object.entries(st.pins).filter(([, r]) => r[pos]).map(([t, r]) => t + r[pos]).slice(0, 4).join(' ');
      await shot(p, 'pin_T6.png');
      results.push({ task: 'T6 파미도 필살기 직전 방어(프리셋 → 핀)', clicks: p.clicks, ok: /3방/.test(row), detail: row, errors: p.errors.length });
      await ctx.close();
    }
    // T8 — 전 턴 잠김(옛 완전 수동) → 규칙 복귀: 초기화 ▾ → 고정 칸·잠긴 턴만 (세부 설정은 잠긴 턴이 있어 자동으로 켜짐)
    {
      const { ctx, p } = await fresh(browser, async () => { const st = window.__woofia.store; await st.probe(); st.pins.lockAllFromProbe(); });
      await sleep(800);
      await shot(p, 'pin_T8_before.png');
      await p.tapEval(() => { [...document.querySelectorAll('#app-plan .pl-tools .btn')].find((b) => /초기화/.test(b.textContent)).click(); });
      await menuPick(p, '잠긴 턴만');
      const st = await S(p);
      await sleep(600);
      await shot(p, 'pin_T8.png');
      results.push({ task: 'T8 전 턴 잠김 → 규칙 복귀', clicks: p.clicks, ok: Object.keys(st.locked).length === 0, errors: p.errors.length });
      await ctx.close();
    }
    // 사용자 코드: 기록 가져오기 → 불러오기 → 파미도 핀 · 4턴 아누비로스 칸 경고
    {
      const { ctx, p } = await fresh(browser);
      const info = await p.evaluate(async (code) => {
        const st = window.__woofia.store;
        await st.records.importText(code);
        st.records.restore(st.get().records[0].id);
        return true;
      }, CODE);
      await sleep(1800);
      const r = await p.evaluate(() => {
        const st = window.__woofia.store.get();
        const pf = st.team.findIndex((s) => s && s.id === 10421) + 1, an = st.team.findIndex((s) => s && s.id === 10401) + 1;
        const c4 = document.querySelector(`#app-plan .pg-c[data-pos="${an}"][data-t="4"]`);
        const pins = document.querySelectorAll(`#app-plan .pg-c.pin[data-pos="${pf}"]`).length;
        const acts = ((st.probe.plan['4'] || {}).seq || []).filter((e) => e.p === an).length;
        return { adv: document.querySelector('#app-plan').classList.contains('pl-adv-on'), pins, badge: !!document.querySelector(`#app-plan .pl-rows li[data-pos="${pf}"] .pl-badge.pin`),
          warn: c4 && c4.classList.contains('warn'), tip: c4 && c4.title, acts4: acts, note: !!document.querySelector('#app-plan .sentence .s-note') };
      });
      await shot(p, 'pin_usercode.png');
      await p.hover(`#app-plan .pg-c.warn`).catch(() => {});
      results.push({ task: '사용자 코드: 파미도 핀 표시 · 4턴 아누비로스 1칸 이유', clicks: 0, ok: r.adv && r.pins >= 10 && r.badge && r.warn && /뒤에서/.test(r.tip || '') && r.acts4 === 1 && r.note,
        detail: JSON.stringify({ ...r, tip: (r.tip || '').split('\n').slice(-2).join(' / ') }), errors: p.errors.length });
      // 맞추기를 '앞에서'로 바꾸면 칸 2개(추가 행동)가 되는지
      await p.evaluate(() => { const s = document.querySelector('#app-plan .sentence select[data-fk^="sx:"]'); s.value = 'before'; s.dispatchEvent(new Event('change', { bubbles: true })); });
      await sleep(1500);
      const after = await p.evaluate(() => { const st = window.__woofia.store.get(); const an = st.team.findIndex((s) => s && s.id === 10401) + 1; return ((st.probe.plan['4'] || {}).seq || []).filter((e) => e.p === an).length; });
      await shot(p, 'pin_usercode_before.png');
      results.push({ task: "사용자 코드: 맞추기 '앞에서'로 바꾸면 4턴 아누비로스 칸 2개", clicks: 1, ok: after === 2, detail: String(after), errors: p.errors.length });
      await ctx.close();
    }
  } catch (e) { console.error(e); results.push({ task: '예외', ok: false, detail: e.message }); } finally { await browser.close(); }
  console.table(results);
  require('fs').writeFileSync(OUT + 'pin_walkthrough.json', JSON.stringify(results, null, 1));
  process.exit(results.every((r) => r.ok && !r.errors) ? 0 : 1);
})();
