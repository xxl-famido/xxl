// 행동 설정 UX 과업 측정 — 라이브 사이트에서 실제 클릭으로 시나리오를 수행하며
// 클릭 수 · 화면(레이어) 전환 수 · 스크롤 거리 · 접촉한 설정 표면 수를 센다. (읽기 전용: 임시 프로필)
// 실행: NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/ux_action.js
// 주의: 피드백 폼은 열지도 전송하지도 않는다. 소스 수정 없음.
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const BASE = process.env.UITEST_BASE || 'https://xxl-famido.github.io/xxl/';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'shots', 'ux_action');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const results = { scenarios: {}, density: {}, notes: [] };

// ── 레이어(화면) 지문: 열린 오버레이 목록 ──
const LAYER_JS = () => {
  const vis = el => el && !el.hidden && el.getBoundingClientRect().width > 0;
  const out = [];
  [['#modal', 'char'], ['#histModal', 'hist'], ['#cmpModal', 'cmp'], ['#guideModal', 'guide'], ['#patchModal', 'patch']]
    .forEach(([s, n]) => { if (vis(document.querySelector(s))) out.push(n); });
  [['.advpop', 'adv'], ['.priopop', 'cmpPrio'], ['.planpop', 'cmpPlan'], ['.cmpinfo', 'cmpInfo'], ['.altar-modal', 'altarPop'],
   ['.adv-cellpop', 'cellPop'], ['.specpanel:not([hidden])', 'spec']]
    .forEach(([s, n]) => { if (document.querySelector(s)) out.push(n); });
  const side = document.querySelector('#altarSide'); if (side && !side.hidden) out.push('altarSide');
  if (document.querySelector('.advpop')) {
    const t = document.querySelector('[data-advtab].on'); if (t) out.push('tab:' + t.dataset.advtab);
  }
  return out.join('|');
};

class Scn {
  constructor(page, id, title) {
    this.page = page; this.id = id; this.title = title;
    this.clicks = 0; this.trans = 0; this.scroll = 0; this.steps = []; this.surfaces = new Set(); this.shots = [];
  }
  async layer() { return this.page.evaluate(LAYER_JS); }
  // 요소를 찾아 (필요하면) 스크롤 → 실제 마우스 클릭. 스크롤 거리 = 모든 스크롤 조상 + 창의 |Δ| 합
  async tap(sel, label, surface, opts = {}) {
    const before = await this.layer();
    const sc = await this.page.evaluate((s, txt) => {
      let el = null;
      if (txt) el = [...document.querySelectorAll(s)].find(e => (e.textContent || '').trim().includes(txt) && e.getBoundingClientRect().width > 0);
      else el = [...document.querySelectorAll(s)].find(e => e.getBoundingClientRect().width > 0) || document.querySelector(s);
      if (!el) return null;
      const scs = []; let p = el.parentElement;
      while (p) { if (p.scrollHeight > p.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(p).overflowY)) scs.push(p); p = p.parentElement; }
      const snap = () => scs.map(x => x.scrollTop).concat([window.scrollY]);
      const b = snap();
      const r = el.getBoundingClientRect();
      const inView = r.top >= 0 && r.bottom <= window.innerHeight && scs.every(x => { const q = x.getBoundingClientRect(); return r.top >= q.top && r.bottom <= q.bottom; });
      if (!inView) el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const a = snap();
      document.querySelectorAll('[data-uxtap]').forEach(x => x.removeAttribute('data-uxtap'));
      el.setAttribute('data-uxtap', '1');
      return b.reduce((s2, v, i) => s2 + Math.abs(a[i] - v), 0);
    }, sel, opts.text || null);
    if (sc == null) { this.steps.push(`✗ 대상 없음: ${label} (${sel})`); log('  ✗ no target', sel, opts.text || ''); return false; }
    this.scroll += sc;
    await sleep(150);
    const h = await this.page.$('[data-uxtap]');
    try { await h.click(); } catch (e) { await this.page.evaluate(() => document.querySelector('[data-uxtap]').click()); }
    this.clicks++;
    if (surface) this.surfaces.add(surface);
    await sleep(opts.wait ?? 500);
    await this.settle();
    const after = await this.layer();
    const t = before !== after ? 1 : 0; this.trans += t;
    this.steps.push(`${this.clicks}. ${label}${sc ? ` (스크롤 ${Math.round(sc)}px)` : ''}${t ? ` → 화면 [${after || 'main'}]` : ''}`);
    return true;
  }
  async choose(sel, value, label, surface) {          // <select>: 열기+고르기 = 2 클릭
    const before = await this.layer();
    const sc = await this.page.evaluate(s => {
      const el = document.querySelector(s); if (!el) return null;
      const y0 = window.scrollY; const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center' });
      return Math.abs(window.scrollY - y0);
    }, sel);
    if (sc == null) { this.steps.push(`✗ 대상 없음: ${label}`); return false; }
    await this.page.select(sel, String(value));
    this.clicks += 2; this.scroll += sc; if (surface) this.surfaces.add(surface);
    await sleep(700); await this.settle();
    const after = await this.layer(); const t = before !== after ? 1 : 0; this.trans += t;
    this.steps.push(`${this.clicks - 1}~${this.clicks}. ${label} (select)${t ? ` → 화면 [${after || 'main'}]` : ''}`);
    return true;
  }
  async settle() {
    try {
      await this.page.waitForFunction(() => (typeof advBusy === 'undefined' || !advBusy)
        && !document.querySelector('#runBtn.busy'), { timeout: 120000 });
    } catch { }
    await sleep(200);
  }
  async shot(name, opts = {}) {
    const file = path.join(OUT, `${this.id}_${name}.png`);
    try {
      if (opts.sel) { const el = await this.page.$(opts.sel); if (el) await el.screenshot({ path: file }); else return; }
      else await this.page.screenshot({ path: file, fullPage: !!opts.full });
      this.shots.push(path.basename(file));
    } catch (e) { log('  shot fail', name, e.message); }
  }
  async esc() { const before = await this.layer(); await this.page.keyboard.press('Escape'); this.clicks++; await sleep(400);
    const after = await this.layer(); if (before !== after) this.trans++; this.steps.push(`${this.clicks}. Esc 닫기${before !== after ? ` → 화면 [${after || 'main'}]` : ''}`); }
  done(extra = {}) {
    results.scenarios[this.id] = { title: this.title, clicks: this.clicks, transitions: this.trans, scrollPx: Math.round(this.scroll),
      surfaces: [...this.surfaces], steps: this.steps, shots: this.shots, ...extra };
    log(`■ ${this.id} ${this.title}: 클릭 ${this.clicks} · 전환 ${this.trans} · 스크롤 ${Math.round(this.scroll)}px · 표면 ${this.surfaces.size}`);
  }
}

async function boot(page) {
  await page.goto(BASE + '?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => typeof CHARS !== 'undefined' && Object.keys(CHARS).length > 30 && document.querySelector('#teamSlots .slot'), { timeout: 180000 });
  await page.evaluate(() => { const b = document.getElementById('boot'); if (b) b.remove(); });
  try { await page.waitForFunction(() => !document.querySelector('#runBtn.busy'), { timeout: 180000 }); } catch { }
  await sleep(1500);
}
const runs1 = page => page.evaluate(() => { const r = document.getElementById('runs'); r.value = 3; r.dispatchEvent(new Event('input', { bubbles: true })); });
const waitRun = async page => { await sleep(600); await page.waitForFunction(() => !document.querySelector('#runBtn.busy') && !document.querySelector('#results').hidden, { timeout: 240000 }); await sleep(500); };

// 정보 밀도: 컨테이너 안 보이는 컨트롤 수 · 텍스트 글자 수 · 스크롤 높이/보이는 높이
async function density(page, key, sel) {
  results.density[key] = await page.evaluate(s => {
    const root = document.querySelector(s); if (!root) return null;
    const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('[hidden]'); };
    const ctrls = [...root.querySelectorAll('button, input, select, [role=tab], li[draggable]')].filter(vis);
    const small = ctrls.filter(el => { const r = el.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).length;
    let sc = root; while (sc && !(sc.scrollHeight > sc.clientHeight + 2)) sc = sc.parentElement;
    const r = root.getBoundingClientRect();
    const txt = (root.innerText || '').replace(/\s+/g, ' ');
    const hints = [...root.querySelectorAll('.adv-hint,.adv-note,.adv-order,.hint,.pt-label em,em,.ult-desc,.sg-flow,.adv-warn,.adv-lock,.altar-hint,.altar-note')].filter(vis)
      .reduce((n, e) => n + (e.innerText || '').replace(/\s+/g, '').length, 0);
    return { controls: ctrls.length, smallTargets: small, textChars: txt.replace(/ /g, '').length, hintChars: hints,
      boxH: Math.round(r.height), scrollH: sc ? sc.scrollHeight : null, clientH: sc ? sc.clientHeight : null, vw: innerWidth };
  }, sel);
  log('  density', key, JSON.stringify(results.density[key]));
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--window-size=1440,900'] });
  try {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on('dialog', d => d.dismiss());
    page.on('pageerror', e => results.notes.push('pageerror: ' + e.message));
    await boot(page);
    const names = await page.evaluate(() => Object.fromEntries(Object.values(CHARS).map(c => [c.id, c.name])));
    results.names = names;
    const teamNow = await page.evaluate(() => team.map(s => s && s.id));
    log('team', teamNow.map(i => names[i]).join(','));
    results.notes.push('초기 편성: ' + teamNow.map(i => names[i]).join(', '));
    await runs1(page);
    // 메인 첫 화면
    await page.screenshot({ path: path.join(OUT, '00_main_top.png') });
    await page.screenshot({ path: path.join(OUT, '00_main_full.png'), fullPage: true });
    await density(page, 'main.settingsPanel', 'aside.panel.settings');
    await density(page, 'main.prioField', 'aside.panel.settings .field:has(#prio)');
    results.density['main.prioField.offsetTop'] = await page.evaluate(() => {
      const f = document.querySelector('#prio'); return { prioTop: Math.round(f.getBoundingClientRect().top + scrollY), runBtnTop: Math.round(document.querySelector('#runBtn').getBoundingClientRect().top + scrollY), vh: innerHeight };
    });

    // ── S1 기본 편성으로 실행 ──
    { const s = new Scn(page, 'S1', '기본 편성으로 실행');
      await s.tap('#runBtn', '시뮬레이션 실행', 'run', { wait: 300 }); await waitRun(page);
      await s.shot('result'); s.done(); }

    // ── S2 우선순위 하나 바꾸고 재실행 ──
    { await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
      const s = new Scn(page, 'S2', '우선순위 하나(3번째를 위로) 바꾸고 재실행');
      await s.tap('#prio .mv[data-mv="up"][data-k="2"]', '행동 우선순위 3번째 ▲', 'prio');
      await s.shot('prio', { sel: 'aside.panel.settings .field:has(#prio)' });
      await s.tap('#runBtn', '시뮬레이션 실행', 'run', { wait: 300 }); await waitRun(page);
      s.done(); }

    // ── S3 3턴만 순서 다르게 ──
    { await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
      const s = new Scn(page, 'S3', '3턴만 순서 다르게(맨 뒤 캐릭터를 맨 앞으로)');
      await s.tap('#turnChips button[data-t="3"]', '특정 턴 칩 3', 'turnOv');
      for (let k = 4; k >= 1; k--) await s.tap(`#turnEditor .mv[data-mv="up"][data-k="${k}"]`, `3턴 순서 ${k + 1}번째 ▲`, 'turnOv', { wait: 250 });
      await s.shot('turnEditor', { sel: '.prio-turn' });
      await s.tap('#runBtn', '시뮬레이션 실행', 'run', { wait: 300 }); await waitRun(page);
      s.done({ note: '맨 뒤→맨 앞 = ▲ 4회. 드래그 1회로도 가능(데스크톱)' }); }

    // ── S4 특정 캐릭터 궁을 4·7·10턴에 고정(정해진 턴만) ──
    { await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
      const tgt = await page.evaluate(() => { const i = team.findIndex(s => s && s.id === 10428); return i; });
      const s = new Scn(page, 'S4', `리카노 궁을 4·7·10…턴에 고정(그 턴만)`);
      await s.tap(`#teamSlots .slot[data-i="${tgt}"]`, '편성 슬롯의 리카노 아이콘', 'charModal');
      await s.shot('charModal');
      await s.tap('.mc-plan label.toggle', '턴별 행동 직접 계획 켜기', 'charPlanner');
      await s.shot('planner', { sel: '#modalCard' });
      const firstUlt = await page.evaluate(() => { const b = [...document.querySelectorAll('#planner button.a궁.on')][0]; return b ? +b.dataset.idx + 1 : null; });
      results.notes.push(`S4 리카노 기본 계획의 첫 궁 턴: ${firstUlt}`);
      if (firstUlt !== 4) await s.tap('#planner button[data-idx="3"][data-a="궁"]', '4턴 궁 칸(기본 계획이면 뒤 궁 자동 재배치)', 'charPlanner');
      const ultTurns = await page.evaluate(() => [...document.querySelectorAll('#planner button.a궁.on')].map(b => +b.dataset.idx + 1));
      results.notes.push(`S4 플래너 궁 턴: ${ultTurns.join(',')}`);
      // '그 턴만' = 궁극기 사용 방식 strict → 캐릭터 창에선 요약만, 버튼으로 고급 설정 궁 탭 이동
      await s.tap('.mc-ult .ult-open', '궁극기 사용 방식 「행동 고급 설정에서 변경」', 'advUlt');
      await s.shot('advUlt');
      await density(page, 'adv.ultTab', '.adv-card');
      const pos = tgt + 1;
      await s.tap(`.adv-pane-ult [data-ultmode="strict"][data-pos="${pos}"]`, '리카노 행 「정해진 턴만」', 'advUlt');
      await s.shot('advUltStrict');
      await s.tap('[data-advclose]', '고급 설정 닫기', null);
      await s.tap('#runBtn', '시뮬레이션 실행', 'run', { wait: 300 }); await waitRun(page);
      s.done({ note: '계획(캐릭터 창)과 방식(고급 설정 탭)이 다른 창에 있어 창 이동 필요. 캐릭터 창은 바로가기 누를 때 닫혀 버려 계획을 다시 확인하려면 재진입' }); }

    // ── S6 확률 CD 제단 켜고 전원 준비되면 바로 ──
    { await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
      const s = new Scn(page, 'S6', '확률 CD 제단 켜고 전원 「준비되면 바로」');
      await s.tap('#altarOpen', '길드 제단 설정 열기', 'altar', { wait: 900 });
      await s.shot('altarPanel');
      await s.tap('.altar-head label.toggle', '제단 「사용」 켜기', 'altar', { wait: 700 });
      const hasLink = await page.evaluate(() => !!document.querySelector('#altarSide [data-advopen], .altar-modal [data-advopen]'));
      results.notes.push(`S6 제단 패널에 궁극기 사용 방식 바로가기 존재: ${hasLink}`);
      await s.tap('#advOpen', '행동 고급 설정 열기(제단 패널 연 채로)', 'advUlt', { wait: 900 });
      const tab = await page.evaluate(() => (document.querySelector('[data-advtab].on') || {}).dataset?.advtab);
      if (tab !== 'ult') await s.tap('[data-advtab="ult"]', '「궁극기 사용 방식」 탭', 'advUlt');
      await s.shot('advUltWarn');
      await density(page, 'adv.ultTab.altarOn', '.adv-card');
      await s.tap('[data-ultall="asap"]', '「모두 ‘준비되면 바로’로」', 'advUlt');
      await s.tap('[data-advclose]', '고급 설정 닫기', null);
      await s.tap('#runBtn', '시뮬레이션 실행', 'run', { wait: 300 }); await waitRun(page);
      await s.shot('result');
      s.done({ note: '제단 패널(원인)과 사용 방식 탭(대응)이 분리. 제단 패널 안에는 대응 안내 없음' });
      // 원복(측정 제외)
      await page.evaluate(() => { setAltarOn(false); closeAltar && closeAltar(); team.forEach(x => x && delete x.ult); });
      await sleep(500);
    }

    // ── S5 연동: 마타야 방어 → 욱영 궁 → 마타야 궁 (편성 교체 포함) ──
    { await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
      const s = new Scn(page, 'S5', '편성(마타야·욱영·리카노) 후 「마타야 방어 → 욱영 궁 → 마타야 궁」 연동 + 평소 매턴 궁');
      // 편성 변경: 리카노 이외 4명 빼고 마타야·욱영 추가
      const rmIdx = await page.evaluate(() => team.map((s, i) => (s && s.id !== 10428 ? i : -1)).filter(i => i >= 0));
      for (const i of rmIdx) await s.tap(`#teamSlots .rm[data-rm="${i}"]`, `슬롯 P${i + 1} 제외 ×`, 'team', { wait: 250 });
      await s.tap('#roster .rc[data-id="10442"]', '로스터 마타야', 'team', { wait: 300 });
      await s.tap('#roster .rc[data-id="10439"]', '로스터 욱영', 'team', { wait: 300 });
      const t2 = await page.evaluate(() => team.map(x => x && x.id));
      results.notes.push('S5 편성: ' + t2.map(i => i ? names[i] : '-').join(', '));
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(200);
      const mPos = t2.indexOf(10442) + 1, uPos = t2.indexOf(10439) + 1;
      await s.tap('#advOpen', '행동 고급 설정 열기', 'advSync', { wait: 900 });
      await s.tap('[data-advtab="sync"]', '「연동」 탭', 'advSync');
      await s.choose('.adv-pane-sync [data-anchor="0"]', uPos, '그룹1 앵커 = 욱영', 'advSync');
      await s.tap(`.adv-pane-sync .as-group[data-g="0"] .as-m[data-p="${mPos}"]`, '멤버 마타야', 'advSync');
      await s.tap('.adv-pane-sync .sm-row [data-sbase="defend"]', '「방어 → 받은 추가 행동에서 궁」', 'advSync');
      await s.shot('advSync');
      await density(page, 'adv.syncTab', '.adv-card');
      const flow = await page.evaluate(() => (document.querySelector('.sg-flow') || {}).innerText || '');
      results.notes.push('S5 흐름 문장: ' + flow.replace(/\s+/g, ' '));
      await s.tap('[data-advclose]', '고급 설정 닫기', null);
      // 1CD 마타야 '평소 매턴 궁' = 캐릭터 창 계획(기본 자동은 HOLD_ULT → 궁 아낌) — live_smoke 피드백 사례 재현
      await s.tap(`#teamSlots .slot[data-i="${mPos - 1}"]`, '편성 슬롯 마타야', 'charModal');
      await s.tap('.mc-plan label.toggle', '턴별 행동 직접 계획 켜기', 'charPlanner');
      await s.shot('matayaPlanner', { sel: '#modalCard' });
      const n = await page.evaluate(() => +document.querySelector('#turns').value);
      const plan0 = await page.evaluate(() => [...document.querySelectorAll('#planner .pcell')].map(c => (c.querySelector('button.on') || {}).dataset?.a || '?').join(''));
      results.notes.push(`S5 마타야 기본 계획(${n}턴): ${plan0}`);
      // 매 턴 궁으로: 궁 칸이 비어 있는 턴마다 클릭 (1CD라 전부 가능)
      let k = 0;
      for (let t = 1; t <= n; t++) {
        const need = await page.evaluate(i => { const b = document.querySelector(`#planner button[data-idx="${i}"][data-a="궁"]`); return b && !b.classList.contains('on') && !b.disabled; }, t - 1);
        if (need) { await s.tap(`#planner button[data-idx="${t - 1}"][data-a="궁"]`, `${t}턴 궁`, 'charPlanner', { wait: 120 }); k++; }
      }
      results.notes.push(`S5 마타야 매턴 궁 만들기 클릭 ${k}회`);
      await s.tap('#modal .mc-close', '캐릭터 창 닫기', null);
      await s.tap('#runBtn', '시뮬레이션 실행', 'run', { wait: 300 }); await waitRun(page);
      const kinds = await page.evaluate(() => { const at = turn => { const seen = new Set(), out = [];
        for (const ev of lastResult.log) { if (ev.turn !== turn || ev.actorId !== 10442 || seen.has(ev.act) || !['보통공격', '필살기', '방어'].includes(ev.kind)) continue; seen.add(ev.act); out.push(ev.kind); } return out; };
        return { t4: at(4), t5: at(5), top: document.querySelector('#topMeta').textContent }; });
      results.notes.push('S5 결과: ' + JSON.stringify(kinds));
      s.done({ note: '한 의도(마타야를 욱영 궁에 맞추되 평소엔 매턴 궁)가 연동 탭 + 캐릭터 창 계획 두 표면에 나뉨' }); }

    // ── S7 타임라인: 4턴 순서를 바꾸고 3턴 주기(7·10·…)에 복제 ──
    { await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
      const s = new Scn(page, 'S7', '타임라인 켜고 4턴 편집 → 7·10·13… 호환 턴에 복제');
      await s.tap('#advOpen', '행동 고급 설정 열기', 'advTime', { wait: 900 });
      await s.tap('[data-advtab="time"]', '「턴별 타임라인」 탭', 'advTime');
      await s.shot('advTimeOff');
      await s.tap('#advSwitchWrap', '「사용」 켜기', 'advTime', { wait: 1500 });
      await s.shot('advTimeOn');
      await density(page, 'adv.timeTab', '.adv-card');
      await s.tap('.adv-rail button[data-advt="4"]', '턴 4', 'advTime');
      await s.tap('.adv-track [data-mv="1"][data-k="0"]', '4턴 1번째 ▼', 'advTime', { wait: 1200 });
      await s.tap('#advCopy', '복사', 'advTime');
      await s.tap('#advPasteAll', '호환 턴 전부 체크', 'advTime', { wait: 2500 });
      const selTurns = await page.evaluate(() => advSelSet ? [...advSelSet].sort((a, b) => a - b) : []);
      results.notes.push('S7 호환 턴: ' + selTurns.join(','));
      await s.tap('#advPaste', '붙여넣기', 'advTime', { wait: 2500 });
      await s.shot('advTimePasted');
      await s.tap('#advGridBtn', '전체 보기', 'advTime');
      await s.shot('advGrid', { sel: '.adv-card' });
      await density(page, 'adv.timeTab.grid', '.adv-card');
      // 격자 셀 편집 1칸(파미도? 첫 행) 비용
      await s.tap('.adv-grid .g-row u[data-gt="6"]', '격자 칸(첫 캐릭터 6턴)', 'advTime');
      await s.shot('cellPop');
      await s.tap('.adv-cellpop [data-cpa="방"]', '칸 팝업 「방」', 'advTime', { wait: 1500 });
      await s.tap('.adv-cellpop [data-cpclose]', '칸 팝업 닫기', 'advTime');
      await s.tap('[data-advclose]', '고급 설정 닫기', null);
      const lock = await page.evaluate(() => ({ lockShown: !document.querySelector('#advLock').hidden, prioOpacity: getComputedStyle(document.querySelector('#prio')).opacity }));
      results.notes.push('S7 타임라인 ON 후 메인 잠금: ' + JSON.stringify(lock));
      await page.evaluate(() => document.querySelector('#prio').scrollIntoView({ block: 'center' })); await sleep(300);
      await s.shot('mainLocked', { sel: 'aside.panel.settings' });
      await s.tap('#runBtn', '시뮬레이션 실행', 'run', { wait: 300 }); await waitRun(page);
      s.done({ note: '칸 1개 수정 = 3클릭(칸→행동→닫기) + 프로브 대기. 캐릭터 1명의 30턴을 격자로 바꾸면 ≈90클릭(추정)' });
      await page.evaluate(() => { advOn = false; syncAdvLock(); }); }

    // ── S8 조합 비교에서 한쪽만 순서 변경 ──
    { await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
      const s = new Scn(page, 'S8', '조합 비교: 기록 2개 불러와 B만 우선순위 변경 후 비교');
      const ids = await page.evaluate(() => simHistory.slice(0, 2).map(r => r.id));
      await s.tap('#cmpBtn', '⚔️ 조합 비교하기', 'cmp', { wait: 1200 });
      await s.choose('#cmpA', ids[1], '비교군 A 기록 선택', 'cmp');
      await s.choose('#cmpB', ids[0], '비교군 B 기록 선택', 'cmp');
      await sleep(3000); await s.settle();
      await s.shot('cmp');
      await s.tap('.ct-prio[data-prio="b"]', 'B ⇅ 행동 우선순위', 'cmpPrio');
      await s.shot('cmpPrio');
      await s.tap('#prPrio .mv[data-mv="up"][data-k="2"]', 'B 우선순위 3번째 ▲', 'cmpPrio');
      await s.tap('.priopop [data-prclose]', '우선순위 팝업 닫기', null);
      await s.tap('#cmpRun', '비교하기', 'cmp', { wait: 4000 }); await sleep(3000);
      await s.shot('cmpAfter');
      // 비교 내 캐릭터 → 행동 → 궁극기 사용 방식이 직접 편집 가능한지(메인 캐릭터 창과 비교)
      await s.tap('.cmp-bwrap .cmp-cell:not(.empty)', 'B 첫 캐릭터 셀', 'cmpInfo');
      await s.shot('cmpInfo');
      const hasPlan = await page.evaluate(() => !!document.querySelector('.cmpinfo [data-plan]'));
      if (hasPlan) { await s.tap('.cmpinfo [data-plan]', '「행동 ▸」', 'cmpPlan'); await s.shot('cmpPlan'); }
      const editableUlt = await page.evaluate(() => !!document.querySelector('.planpop [data-ultmode]'));
      results.notes.push(`S8 비교 행동 팝업에서 궁극기 사용 방식 직접 편집 가능: ${editableUlt} (메인 캐릭터 창은 요약+이동 버튼)`);
      s.done({ note: '비교 전용 우선순위 팝업은 메인과 같은 UI를 복제. 고급 설정은 이 팝업 안 버튼으로만 진입' });
      await page.evaluate(() => { document.querySelectorAll('.planpop,.cmpinfo,.priopop').forEach(x => x.remove()); document.querySelector('#cmpModal').hidden = true; });
    }

    // ── S9 저장된 기록 불러와 한 명 교체 후 실행 ──
    { await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
      const s = new Scn(page, 'S9', '기록 불러와 한 명 교체 후 실행');
      const id = await page.evaluate(() => simHistory[simHistory.length - 1].id);
      await s.choose('#history', id, '상단 「기록」 드롭다운에서 첫 기록', 'hist');
      await sleep(2500); await s.settle();
      const before = await page.evaluate(() => team.map(x => x && x.id));
      const i = before.findIndex(x => x === 10425) >= 0 ? before.findIndex(x => x === 10425) : 4;
      await s.tap(`#teamSlots .rm[data-rm="${i}"]`, `P${i + 1} 제외 ×`, 'team');
      await s.tap('#roster .rc[data-id="10439"]', '로스터 욱영 추가', 'team');
      const after = await page.evaluate(() => ({ team: team.map(x => x && x.id), prio: teamOrder().map(o => o.s.id), ov: Object.keys(turnOverrides) }));
      results.notes.push('S9 교체 후: ' + JSON.stringify({ team: after.team.map(x => names[x] || '-'), prio: after.prio.map(x => names[x]), ov: after.ov }));
      await s.shot('prioAfterSwap', { sel: 'aside.panel.settings .field:has(#prio)' });
      await s.tap('#runBtn', '시뮬레이션 실행', 'run', { wait: 300 }); await waitRun(page);
      s.done(); }

    // ── 모바일 390×844: 메인 행동 영역 · 고급 설정 타임라인 · 격자 ──
    { const m = await ctx.newPage();
      await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      await boot(m);
      const mo = { };
      mo.prio = await m.evaluate(() => { const f = document.querySelector('#prio'); const r = f.getBoundingClientRect(); return { prioTop: Math.round(r.top + scrollY), runTop: Math.round(document.querySelector('#runBtn').getBoundingClientRect().top + scrollY), docH: document.documentElement.scrollHeight, turnChipsH: Math.round(document.querySelector('#turnChips').getBoundingClientRect().height) }; });
      await m.evaluate(() => document.querySelector('#prio').scrollIntoView({ block: 'start' })); await sleep(400);
      await m.screenshot({ path: path.join(OUT, 'M1_prio.png') });
      await m.evaluate(() => document.querySelector('#turnChips button[data-t="3"]').click()); await sleep(400);
      await m.evaluate(() => document.querySelector('.prio-turn').scrollIntoView({ block: 'start' })); await sleep(300);
      await m.screenshot({ path: path.join(OUT, 'M2_turnEditor.png') });
      await density(m, 'mobile.settingsPanel', 'aside.panel.settings');
      await m.evaluate(() => { window.scrollTo(0, 0); document.querySelector('#advOpen').click(); }); await sleep(1500);
      await m.evaluate(() => document.querySelector('#advSwitch').click()); await sleep(2500);
      await m.screenshot({ path: path.join(OUT, 'M3_advTime.png') });
      await density(m, 'mobile.adv.timeTab', '.adv-card');
      await m.evaluate(() => document.querySelector('#advGridBtn').click()); await sleep(800);
      await m.evaluate(() => document.querySelector('.adv-gridwrap').scrollIntoView({ block: 'start' })); await sleep(300);
      await m.screenshot({ path: path.join(OUT, 'M4_advGrid.png') });
      mo.grid = await m.evaluate(() => { const u = document.querySelector('.adv-grid .g-row u'); const r = u.getBoundingClientRect(); const g = document.querySelector('.adv-grid'); return { cellW: Math.round(r.width), cellH: Math.round(r.height), gridScrollW: g.scrollWidth, gridClientW: g.clientWidth, cardW: Math.round(document.querySelector('.adv-card').getBoundingClientRect().width) }; });
      await m.evaluate(() => document.querySelector('[data-advtab="ult"]').click()); await sleep(800);
      await m.screenshot({ path: path.join(OUT, 'M5_advUlt.png') });
      await density(m, 'mobile.adv.ultTab', '.adv-card');
      await m.evaluate(() => document.querySelector('[data-advtab="sync"]').click()); await sleep(800);
      await m.screenshot({ path: path.join(OUT, 'M6_advSync.png') });
      await density(m, 'mobile.adv.syncTab', '.adv-card');
      await m.evaluate(() => { const c = document.querySelector('[data-advclose]'); c && c.click(); }); await sleep(500);
      await m.evaluate(() => { advOn = false; syncAdvLock(); document.querySelector('#teamSlots .slot[data-i="3"]').click(); }); await sleep(1200);
      await m.evaluate(() => { const l = document.querySelector('.mc-plan label.toggle'); l && l.click(); }); await sleep(600);
      await m.screenshot({ path: path.join(OUT, 'M7_charModal.png'), fullPage: false });
      mo.charModal = await m.evaluate(() => { const c = document.querySelector('#modalCard'); return { scrollH: c.scrollHeight, clientH: c.clientHeight, plannerTop: Math.round(document.querySelector('#planner').getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop) }; });
      results.mobile = mo;
      log('mobile', JSON.stringify(mo));
      await m.close(); }
  } catch (e) { log('FAIL', e.stack || e); results.notes.push('FAIL ' + (e.message || e)); }
  finally {
    fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(results, null, 2));
    await browser.close();
  }
})();
