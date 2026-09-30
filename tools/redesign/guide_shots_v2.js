/**
 * v2 가이드 그림 촬영 → dashboard_v2/guide/*.png (라이트, 1280px, 2배율).
 * 그림 이름은 src/ui/guide-content.js 의 fig 와 1:1. 부분 그림(kind:'crop')은 화면에서 절반 크기로 표시된다.
 *   v2 서버가 떠 있는 상태에서:  NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/guide_shots_v2.js
 *   주소는 GUIDE_BASE(기본 http://localhost:8778/). 예: GUIDE_BASE=http://127.0.0.1:8779/
 * ≡ 메뉴의 「구버전」은 v1/ 이 조립된 빌드에서만 보이므로(빌드가 menu.js 의 V1_BUILT 를 true 로 바꿈), 촬영 중에는 menu.js 응답에서만 같은 치환을 한다.
 * 새 브라우저 프로필에서 돌므로 사용자 브라우저의 기록·설정과 무관하다.
 * 순서: 기본 편성 화면 → 전투 조건 → 실행·결과 → 고급 설정 → 제단 → 두 번째 실행·기록·팀 비교 → 육성(편성 상태를 바꾸므로 마지막).
 */
const puppeteer = require('puppeteer-core'); const path = require('path'); const fs = require('fs');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.GUIDE_BASE || 'http://localhost:8778/';
const OUT = path.join(__dirname, '..', '..', 'dashboard_v2', 'guide');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  const made = [];
  try {
    const p = await b.newPage();
    await p.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.setRequestInterception(true);
    // core/api.js 는 포트 8778 일 때만 개발 서버 API(fetch)를 쓰고 그 밖은 Pyodide 워커로 부팅한다
    // → 다른 포트(예: 8779)에서 찍을 때는 api.js 응답의 FETCH_PORT 만 그 포트로 바꿔 준다(파일은 그대로).
    const V2 = path.join(__dirname, '..', '..', 'dashboard_v2');
    const basePort = new URL(BASE).port;
    p.on('request', r => {
      const u = new URL(r.url());
      if (u.origin === new URL(BASE).origin && u.pathname === '/src/ui/menu.js') {
        const src = fs.readFileSync(path.join(V2, 'src', 'ui', 'menu.js'), 'utf8').replace('const V1_BUILT = false;', 'const V1_BUILT = true;');
        return r.respond({ status: 200, contentType: 'text/javascript; charset=utf-8', body: src });
      }
      if (basePort && basePort !== '8778' && u.origin === new URL(BASE).origin && u.pathname === '/src/core/api.js') {
        const src = fs.readFileSync(path.join(V2, 'src', 'core', 'api.js'), 'utf8').replace("FETCH_PORT = '8778'", `FETCH_PORT = '${basePort}'`);
        return r.respond({ status: 200, contentType: 'text/javascript; charset=utf-8', body: src });
      }
      return r.continue();
    });
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.__woofia && window.__woofia.store.get().ui.booted && window.__woofia.store.get().result, { timeout: 180000 });
    const ev = (fn, ...a) => p.evaluate(fn, ...a);
    await ev(() => { document.documentElement.dataset.theme = 'light'; });
    await sleep(800);

    // 요소 촬영: 상단바(sticky)·토스트를 가리고 ElementHandle 로 찍는다(시트는 fixed 라 수동 clip 이 어긋남).
    const hideChrome = on => ev(v => {
      const t = document.getElementById('app-topbar'); if (t) t.style.visibility = v ? 'hidden' : '';
      document.querySelectorAll('.toasts, #app-toast').forEach(x => { x.style.visibility = v ? 'hidden' : ''; });
    }, on);
    // pad > 0 이면 요소 둘레에 여백을 두고 자른다. 시트는 내용 높이에 맞춰 줄인 뒤 찍는다.
    const shot = async (sel, name, { pad = 0 } = {}) => {
      const el = await p.$(sel);
      if (!el) throw new Error(`[${name}] 요소 없음: ${sel}`);
      await el.evaluate((e, padded) => e.scrollIntoView({ block: padded ? 'center' : 'nearest', behavior: 'instant' }), pad > 0);
      await ev(() => document.querySelectorAll('#app-sheets .sheet').forEach(sh => { sh.style.bottom = 'auto'; sh.style.maxHeight = 'calc(100vh - 32px)'; }));
      await ev(() => document.activeElement?.blur?.());
      await p.mouse.move(2, 2);                                     // 메뉴 위 호버 강조가 찍히지 않게
      await sleep(300);
      await hideChrome(true);
      try {
        if (pad) {
          // ElementHandle.screenshot 과 같은 방식: 뷰포트 기준 상자 + 스크롤 = 문서 좌표
          const bb = await el.boundingBox();
          const [sx, sy] = await ev(() => [window.scrollX, window.scrollY]);
          const [px, py] = Array.isArray(pad) ? pad : [pad, pad];     // [가로, 세로] 여백 — 위아래에 다른 절이 붙어 있으면 세로를 줄인다
          const x = Math.max(0, bb.x + sx - px), y = Math.max(0, bb.y + sy - py);
          const clip = { x, y, width: bb.x + sx + bb.width + px - x, height: bb.y + sy + bb.height + py - y };
          await p.screenshot({ path: path.join(OUT, `${name}.png`), clip });
        } else {
          await el.screenshot({ path: path.join(OUT, `${name}.png`) });
        }
      } finally {
        await hideChrome(false);
        await ev(() => document.querySelectorAll('#app-sheets .sheet').forEach(sh => { sh.style.bottom = ''; sh.style.maxHeight = ''; }));
      }
      made.push(name);
    };
    // 두 요소를 감싸는 상자로 자른다(위 요소 → 아래 요소, 같은 스크롤 문맥).
    const shotUnion = async (sels, name, pad = 16) => {
      const els = await Promise.all(sels.map(s => p.$(s)));
      if (els.some(e => !e)) throw new Error(`[${name}] 요소 없음: ${sels.join(' , ')}`);
      await els[0].evaluate(e => e.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await ev(() => document.activeElement?.blur?.()); await p.mouse.move(2, 2); await sleep(300);
      await hideChrome(true);
      try {
        const [sx, sy] = await ev(() => [window.scrollX, window.scrollY]);
        const bbs = await Promise.all(els.map(e => e.boundingBox()));
        const x0 = Math.min(...bbs.map(b => b.x)), y0 = Math.min(...bbs.map(b => b.y));
        const x1 = Math.max(...bbs.map(b => b.x + b.width)), y1 = Math.max(...bbs.map(b => b.y + b.height));
        const x = Math.max(0, x0 + sx - pad), y = Math.max(0, y0 + sy - pad);
        await p.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x, y, width: x1 + sx + pad - x, height: y1 + sy + pad - y } });
      } finally { await hideChrome(false); }
      made.push(name);
    };
    // 전투 조건 패널은 sticky + 자체 스크롤이라 촬영 동안만 풀어 전체가 보이게 한다.
    const unstickCond = on => ev(v => { const c = document.getElementById('app-cond'); c.style.position = v ? 'static' : ''; c.style.maxHeight = v ? 'none' : ''; c.style.overflow = v ? 'visible' : ''; }, on);
    const clickText = (sel, re) => ev((s, src) => {
      const r = new RegExp(src); const el = [...document.querySelectorAll(s)].find(x => r.test(x.textContent));
      if (!el) throw new Error(`버튼 없음: ${s} /${src}/`); el.click();
    }, sel, re.source);
    const closeSheet = async () => { await p.keyboard.press('Escape'); await sleep(600); };
    const closeMenus = () => ev(() => document.querySelectorAll('.menu, .pl-pop').forEach(m => m.remove()));
    const run = async () => { await ev(() => window.__woofia.run()); await p.waitForFunction(() => !window.__woofia.isRunning(), { timeout: 180000 }); await sleep(1200); };

    // ── 전체 화면 · 팀 편성 · 행동 계획 ──
    await ev(() => window.scrollTo(0, 0)); await sleep(300);
    await hideChrome(false); await ev(() => document.querySelectorAll('.toasts, #app-toast').forEach(x => { x.style.visibility = 'hidden'; }));
    await p.screenshot({ path: path.join(OUT, 'overview.png') }); made.push('overview');
    // 상단바(가리지 않고 그대로) · ≡ 메뉴
    await (await p.$('#app-topbar')).screenshot({ path: path.join(OUT, 'topbar.png') }); made.push('topbar');
    await p.click('#app-topbar button[aria-haspopup="menu"]'); await sleep(600);
    await p.mouse.move(2, 2); await sleep(200);
    await (await p.$('.top-menu')).screenshot({ path: path.join(OUT, 'menu.png') }); made.push('menu');
    await p.keyboard.press('Escape'); await sleep(300); await closeMenus();
    await shot('#app-team', 'team');
    await shot('#app-plan', 'plan');
    // 직접 지정 줄(파미도 = 3번 자리)
    await ev(() => { const s = document.querySelector('#app-plan ol.prio > li[data-pos="3"] select'); s.value = 'direct'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(900);
    await shot('#app-plan ol.prio > li[data-pos="3"]', 'plan-direct', { pad: 16 });
    // 칸 선택 팝오버(5턴 칸)
    await p.click('#app-plan ol.prio > li[data-pos="3"] .plan-cells > button:nth-child(5)'); await sleep(600);
    await shot('.pl-pop', 'plan-cell');
    await p.keyboard.press('Escape'); await sleep(300); await closeMenus();
    await ev(() => { const s = document.querySelector('#app-plan ol.prio > li[data-pos="3"] select'); s.value = 'rule'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(600);
    // 예외 턴 시트: 4·7·10턴 선택
    await ev(() => { const d = document.querySelector('#app-plan .acc.steps > details:nth-child(2)'); d.open = true; });
    await sleep(300);
    await ev(() => document.querySelector('#app-plan [data-fk="excAdd"]').click()); await sleep(900);
    await ev(() => { const chips = [...document.querySelectorAll('#app-sheets .turn-chips > button')]; [3, 6, 9].forEach(i => chips[i]?.click()); });
    await sleep(400);
    await shot('#app-sheets .sheet', 'plan-exc');
    await closeSheet();
    await ev(() => { const d = document.querySelector('#app-plan .acc.steps > details:nth-child(2)'); d.open = false; });
    await shot('#app-plan .preview', 'plan-preview', { pad: [16, 2] });

    // ── 전투 조건 · 턴마다 받는 데미지 ──
    await ev(() => document.querySelectorAll('#app-cond .acc > details').forEach(d => { d.open = true; })); await sleep(600);
    await unstickCond(true); await shot('#app-cond', 'cond'); await unstickCond(false);
    await clickText('#app-cond button', /턴별로 다르게/); await sleep(800);
    await ev(() => { const s = [...document.querySelectorAll('#app-sheets .switch input')]; if (s[0] && !s[0].checked) s[0].click(); }); await sleep(400);
    await shot('#app-sheets .sheet', 'tdmg');
    await ev(() => { const s = [...document.querySelectorAll('#app-sheets .switch input')]; if (s[0] && s[0].checked) s[0].click(); }); await sleep(300);
    await closeSheet();
    await ev(() => document.querySelectorAll('#app-cond .acc > details').forEach((d, i) => { d.open = i === 0; })); await sleep(300);

    // ── 실행 → 결과 ──
    await run();
    await shot('#app-result .hero', 'result-hero', { pad: [16, 2] });
    await shot('#app-result figure.turns', 'result-turns', { pad: [16, 2] });
    await shot('#app-result .contrib', 'result-contrib', { pad: [16, 2] });
    await ev(() => document.querySelector('#app-result .turn-strip .tb:nth-child(4)').click()); await sleep(900);
    await shot('#app-result .bl', 'result-log', { pad: 16 });
    await ev(() => { const c = document.querySelector('#app-result .bl-act.is-ult > .bl-act-h') || document.querySelector('#app-result .bl-act > .bl-act-h'); c.click(); }); await sleep(500);
    await ev(() => { const h = document.querySelector('#app-result .bl-act.open .bl-row.bl-hit'); h && h.click(); }); await sleep(500);
    await shot('#app-result .bl-act.open', 'result-calc');
    await ev(() => document.querySelector('#app-result .result-head .btn').click()); await sleep(900);
    await shot('#app-sheets .sheet', 'export');
    await closeSheet();

    // ── 고급 설정 ──
    await ev(() => window.scrollTo(0, 0));
    await ev(() => document.querySelector('#app-plan > .deep-enter').click()); await sleep(1400);
    await ev(() => document.querySelector('#app-sheets [data-fk="advUse"]').click()); await sleep(1400);
    await shot('#app-sheets .deep-switch', 'deep-switch', { pad: 16 });
    await ev(() => document.querySelector('#app-sheets [data-fk="stImport"]').click()); await sleep(1000);
    await shot('#app-sheets section[aria-labelledby="advp-h1"]', 'deep-step1', { pad: 16 });
    // 필살기 연동: 그룹 1개 + 따라가는 동료 1명
    await ev(() => document.querySelector('#app-sheets [data-fk="syncAdd"]').click()); await sleep(700);
    await ev(() => { const s = document.querySelector('#app-sheets [data-fk="sadd:0"]'); if (s) { s.value = s.options[1].value; s.dispatchEvent(new Event('change', { bubbles: true })); } });
    await sleep(900);
    await shot('#app-sheets section[aria-labelledby="deep-h-sync"]', 'deep-sync', { pad: 16 });
    // 격자: 칸 메뉴 → 방어 고정 → 줄 메뉴 → 격자 전체
    await ev(() => document.querySelector('#app-sheets .pg').scrollIntoView({ block: 'center' })); await sleep(300);
    await p.click('#app-sheets .pg .pg-c[data-pos="3"][data-t="3"]'); await sleep(500);
    await shot('[role="menu"]', 'deep-cell');
    await ev(() => { const it = [...document.querySelectorAll('[role="menu"] button')].find(x => x.textContent.trim().startsWith('방어')); it && it.click(); });
    await sleep(1600); await closeMenus();
    console.log('고정 칸:', await ev(() => document.querySelector('#app-sheets .pg .pg-c[data-pos="3"][data-t="3"]').title));
    await p.click('#app-sheets .pg .pg-nm'); await sleep(500);
    await shot('[role="menu"]', 'deep-row');
    await closeMenus(); await sleep(300);
    await shot('#app-sheets section[aria-labelledby="deep-h-grid"]', 'deep-grid', { pad: 16 });
    await ev(() => document.querySelector('#app-sheets .pg .pg-th[data-th="7"]').click()); await sleep(1900);
    await shot('#app-sheets .sheet', 'turn-edit');
    await closeSheet(); await sleep(900);
    await closeSheet();

    // ── 방탈출 제단 ──
    await ev(() => window.__woofia.store.altar.setOn(true)); await sleep(1000);
    await clickText('#app-cond button', /층별 점등/); await sleep(1300);
    await shot('#app-sheets .sheet', 'altar');
    await closeSheet();
    // 제단(확률 CD 감소 점등) → 고급 설정 자동 켜짐 · 성공 가정 안내와 행 체크
    await ev(() => window.scrollTo(0, 0));
    await ev(() => document.querySelector('#app-plan > .deep-enter').click()); await sleep(1600);
    await shotUnion(['#app-sheets .deep-note', '#app-sheets section[aria-labelledby="advp-h1"]'], 'deep-proc');
    await closeSheet();
    await ev(() => window.__woofia.store.altar.setOn(false)); await sleep(800);

    // ── 두 번째 기록 → 기록 관리 · 팀 비교 ──
    await ev(() => { const s = window.__woofia.store; s.team.remove(4); s.team.add(10439, 4); }); await sleep(800);
    await run();
    await ev(async () => { const m = await import('./src/ui/records.js'); m.open(window.__woofia); }); await sleep(1000);
    await shot('#app-sheets .sheet', 'records');
    await closeSheet();
    await ev(() => window.__woofia.openCompare()); await sleep(1000);
    await ev(() => { const s = document.querySelectorAll('#app-sheets .cmp-pick select'); s[0].value = s[0].options[1].value; s[0].dispatchEvent(new Event('change')); });
    await sleep(400);
    await ev(() => { const s = document.querySelectorAll('#app-sheets .cmp-pick select'); s[1].value = s[1].options[2].value; s[1].dispatchEvent(new Event('change')); });
    await p.waitForFunction(() => document.querySelector('#app-sheets .cmp-chart'), { timeout: 180000 }); await sleep(1500);
    await shot('#app-sheets .sheet', 'compare');
    await closeSheet();

    // ── 동료 육성(편성 상태를 바꾸므로 마지막) ──
    await ev(() => window.scrollTo(0, 0));
    await ev(() => document.querySelector('#app-team .slots > .slot:nth-child(3) .slot-btn').click()); await sleep(1500);
    await shot('#app-sheets .sheet', 'grow');
    await closeSheet();
    await ev(() => window.__woofia.store.team.update(0, s => { s.spec = { on: true, level: 50, evo: 3, pevo: 4, compat: 2, lv: { basicAtk: 7 } }; }));
    await sleep(800);
    await ev(() => document.querySelector('#app-team .slots > .slot:nth-child(1) .slot-btn').click()); await sleep(1500);
    await shot('#app-sheets .grow-col:first-child', 'grow-spec', { pad: 16 });
    await shot('#app-sheets .grow-skills', 'grow-skills');
    await closeSheet();
    await shot('#app-team .slots > .slot:first-child', 'team-chips', { pad: 12 });

    if (errs.length) console.log('페이지 오류:', errs);
  } finally {
    await b.close();
  }
  console.log('ok', made.length, made.join(' '));
})().catch(e => { console.error(e); process.exit(1); });
