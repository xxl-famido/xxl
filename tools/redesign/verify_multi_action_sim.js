// 한 턴 여러 행동 설정(v2.0.2) → 실제 시뮬레이션 반영 점검 — 화면에서 고른 계획과 /api/simulate 전투 로그의 턴별 행동을 대조한다.
//   메인(직접 지정 줄: 모두 방어 · 칸 메뉴 · 받은 추가 행동 · 패턴 반복 · 도장 끔) · 고급 설정(④ 격자 칸 메뉴 · 욱영 추가 행동 → 턴 잠금)
//   · 비교하기(A 팀 행동 계획 편집) · 실행 미리보기 = 실제 실행(확률 100%) · 무명 불굴 추가 효과 = 평타 판정
// 로컬 v2 서버(8778, fetch 모드)는 /api/simulate 요청·응답을 가로채 읽고, 정적 빌드(Pyodide 워커 — 라이브와 같은 경로)는 화면 결과(store.result)를
// 읽는다(워커 모드에선 요청 내용 확인과 비교하기 단계는 건너뜀). 읽기 전용(기록은 격리 프로필 안에서만 생긴다).
//   NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/verify_multi_action_sim.js [base]
//   예) 정적 빌드: bash tools/redesign/build_site_v2.sh → python -m http.server 8793 --bind 127.0.0.1 -d _site_v2 → … http://127.0.0.1:8793
const { chromium } = require('playwright-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = (process.argv[2] || 'http://localhost:8778').replace(/\/$/, '');
const WORKER = !/:8778$/.test(BASE);   // 8778 이외 = 정적 빌드(Pyodide 워커)
const TAEHO_TEAM = [10423, 10428, 10421, 10425, 10410];   // 이태호(1) · 리카노 · 파미도 · 하니엘 · 임부언(5)
const UK_TEAM = [10401, 10442, 10439, 10421, 10425];      // 욱영(3) 인접 = 마타야(2) · 파미도(4)
const MUMEI_TEAM = [10443, 10428, 10421, 10425, 10401];
const TAEHO = 10423, MUMEI = 10443;
const KIND_TOK = { '필살기': '궁', '보통공격': '평', '방어': '방' };   // 엔진 kind → 계획 토큰
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const fails = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}${extra ? ` — ${extra}` : ''}`); }
  else { fail++; fails.push(name); console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
};

/** 전투 로그 → 턴 → [{ id, a }] (실행 순서, 필살기·보통공격·방어만 — ui/log.js groupTurns 와 같은 묶음). */
function turnActs(log) {
  const byTurn = new Map();
  for (const l of log || []) {
    if (!l || !l.turn) continue;
    if (!byTurn.has(l.turn)) byTurn.set(l.turn, new Map());
    const acts = byTurn.get(l.turn);
    if (!acts.has(l.act)) acts.set(l.act, []);
    acts.get(l.act).push(l);
  }
  const out = new Map();
  for (const [tn, acts] of byTurn) {
    out.set(tn, [...acts.entries()].sort((a, b) => a[0] - b[0])
      .map(([, lines]) => ({ id: lines[0].actorId, a: KIND_TOK[(lines.find((x) => x.kind) || {}).kind] }))
      .filter((x) => x.id && x.a));
  }
  return out;
}
const actorLine = (acts, tn, id) => (acts.get(tn) || []).filter((x) => x.id === id).map((x) => x.a);

/** 계획(직접 지정 줄에 보이는 그대로) vs 실행 로그 — 자기 행동 apt 개 + 받은 추가 행동(있으면). */
function comparePlan(label, intent, acts, id, apt) {
  const bad = [];
  for (const c of intent) {
    const line = actorLine(acts, c.t, id);
    const own = line.slice(0, apt).join(''), fed = line[apt] || null;
    if (own !== c.own.join('')) bad.push(`${c.t}턴 계획 ${c.own.join('')} ≠ 실행 ${own || '-'}`);
    if (c.fed && fed !== c.fed) bad.push(`${c.t}턴 받은 추가 행동 계획 ${c.fed} ≠ 실행 ${fed || '-'}`);
  }
  const fedN = intent.filter((c) => c.fed).length;
  const good = intent.length > 0 && bad.length === 0;
  ok(label, good, bad.length ? bad.slice(0, 6).join(' · ') : `${intent.length}턴 일치${fedN ? ` (받은 추가 행동 ${fedN}턴 포함)` : ''}`);
  return good;
}

// ── 화면 읽기(페이지 안) ──
/** 직접 지정 줄 → [{ t, own:[토큰], fed:토큰|null }]. 대각선 칸은 --cK 조각 색, xlast = 마지막 조각이 받은 추가 행동. */
const readStrip = (p, scope, pos) => p.evaluate(({ scope, pos }) => {
  const TOK = { atk: '평', ult: '궁', def: '방' };
  return [...document.querySelectorAll(`${scope} li[data-pos="${pos}"] .plan-cells button`)].map((b) => {
    const t = +b.dataset.t;
    if (b.classList.contains('split')) {
      const segs = [...(b.getAttribute('style') || '').matchAll(/--c(\d):var\(--pc-(\w+)\)/g)].sort((x, y) => x[1] - y[1]).map((m) => TOK[m[2]]);
      const fed = b.classList.contains('xlast') ? segs.pop() : null;
      return { t, own: segs, fed };
    }
    const cls = ['atk', 'ult', 'def'].find((c) => b.classList.contains(c));
    return { t, own: cls ? [TOK[cls]] : [], fed: null };
  });
}, { scope, pos });
/** 실행 미리보기 → { pos: { 턴: [토큰...] } } (대각선 칸은 띠 색 순서, 한 칸은 클래스). */
const readPreview = (p) => p.evaluate(() => {
  const TOK = { atk: '평', ult: '궁', def: '방' };
  const out = {};
  document.querySelectorAll('#app-plan .preview .pv-cells i').forEach((i) => {
    const pos = +i.dataset.pos, t = +i.dataset.t;
    (out[pos] = out[pos] || {});
    if (i.classList.contains('dsplit')) {
      const stops = [...(i.getAttribute('style') || '').matchAll(/var\(--pc-(\w+)\)/g)].map((m) => TOK[m[1]]);
      out[pos][t] = stops.filter((_, k) => k % 2 === 0);
    } else {
      const cls = ['atk', 'ult', 'def'].find((c) => i.classList.contains(c));
      out[pos][t] = cls ? [TOK[cls]] : [];
    }
  });
  return out;
});

/** ④ 격자(열린 창) → { pos: { 턴: [토큰...] } } — 대각선 칸은 띠 색 순서, 한 칸은 클래스(행동 없음 = []). */
const readGrid = (p) => p.evaluate(() => {
  const TOK = { atk: '평', ult: '궁', def: '방' };
  const out = {};
  document.querySelectorAll('.sheet .pg-c[data-pos][data-t]').forEach((c) => {
    const pos = +c.dataset.pos, t = +c.dataset.t;
    (out[pos] = out[pos] || {});
    if (c.classList.contains('dsplit')) out[pos][t] = [...(c.getAttribute('style') || '').matchAll(/var\(--pc-(\w+)\)/g)].map((m) => TOK[m[1]]).filter((_, k) => k % 2 === 0);
    else { const cls = ['atk', 'ult', 'def'].find((x) => c.classList.contains(x)); out[pos][t] = cls ? [TOK[cls]] : []; }
  });
  return out;
});
/** 화면 표(미리보기·④ 격자) vs 실행 로그 — 동료 × 턴 행동 목록 대조. → 어긋난 곳 목록 */
function tableVsRun(table, acts, team) {
  const bad = [];
  team.forEach((id, i) => {
    if (!id) return;
    for (const [tn, list] of Object.entries(table[i + 1] || {})) {
      const got = actorLine(acts, +tn, id).join('');
      if (list.join('') !== got) bad.push(`${i + 1}번 ${tn}턴 화면 ${list.join('') || '-'} ≠ 실행 ${got || '-'}`);
    }
  });
  return bad;
}

/** 확률 100%(실행 1회)로 돌려 실행 미리보기(5명 × 턴)와 실제 실행 로그를 대조한다. 끝나면 확률 설정을 되돌린다. */
async function previewVsSim(p, sims, label) {
  const was = await p.evaluate(() => window.__woofia.store.get().cond.forceProc);
  await p.evaluate(() => window.__woofia.store.cond.set({ forceProc: true }));
  await sleep(800);
  const sim = await runMain(p, sims);
  await sleep(2500);
  const acts = turnActs(sim.res.log);
  const pv = await readPreview(p);
  const team = await p.evaluate(() => window.__woofia.store.get().team.map((s) => s && s.id));
  const bad = tableVsRun(pv, acts, team);
  ok(label, Object.keys(pv).length === team.filter(Boolean).length && bad.length === 0, bad.slice(0, 6).join(' · '));
  if (!was) await p.evaluate(() => window.__woofia.store.cond.set({ forceProc: false }));
  return { sim, acts };
}

async function boot(browser, sims) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR' });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  // 요청 순서대로 쌓고(비교하기는 A → B 순서로 보낸다) 응답은 같은 요청 칸에 채운다. sims 길이 = 응답이 온 요청 수.
  const pending = new Map();
  const sent = [];
  p.on('request', (r) => {
    if (!r.url().endsWith('/api/simulate')) return;
    const e = { req: JSON.parse(r.postData() || '{}'), res: null };
    pending.set(r, e); sent.push(e);
  });
  p.on('response', async (r) => {
    const e = pending.get(r.request());
    if (!e) return;
    try { e.res = await r.json(); } catch (err) { e.res = { log: [], error: String(err) }; }
    sims.length = 0; sims.push(...sent.filter((x) => x.res));
  });
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.__woofia && window.__woofia.store.get().ui && window.__woofia.store.get().ui.booted && !!window.__woofia.store.get().result, null, { timeout: 90000 });
  await sleep(800);
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
/** 메인 실행 → 그 실행의 { req, res } (워커 모드는 req 없이 화면 결과). */
async function runMain(p, sims) {
  const before = sims.length;
  await p.evaluate(() => { window.__verifyPrev = window.__woofia.store.get().result; document.querySelector('#app-cond .btn-run').click(); });
  await p.waitForFunction(() => { const s = window.__woofia.store.get(); return !s.ui.busy && s.result && s.result !== window.__verifyPrev; }, null, { timeout: 180000 });
  if (!WORKER) for (let k = 0; k < 60 && sims.length === before; k++) await sleep(250);
  await sleep(1200);   // 미리보기 프로브가 따라오도록
  if (WORKER) return { req: null, res: { log: await p.evaluate(() => window.__woofia.store.get().result.log || []) } };
  return sims[sims.length - 1];
}
const clickSel = (p, sel) => p.evaluate((sel) => { const b = document.querySelector(sel); if (b) { b.scrollIntoView({ block: 'center' }); b.click(); } return !!b; }, sel);
/** 칸 메뉴(행동별 줄)에서 row 번째 줄의 행동 버튼. */
const pickRow = (p, row, re) => p.evaluate(({ row, src }) => {
  const rows = [...document.querySelectorAll('.menu.pl-pop .pl-pop-row')];
  const b = rows[row] && [...rows[row].querySelectorAll('button')].find((x) => new RegExp(src).test(x.textContent));
  if (b) b.click();
  return !!b;
}, { row, src: re.source });
const menuRows = (p) => p.evaluate(() => [...document.querySelectorAll('.menu.pl-pop .pl-pop-row')].map((r) => r.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--lang=ko-KR'] });
  try {
    // ════ M. 메인 기본 설정 — 이태호 직접 지정 줄 ════
    console.log('[메인 · 직접 지정 줄]');
    const sims = [];
    const p = await boot(browser, sims);
    await setTeam(p, TAEHO_TEAM);
    await p.selectOption('#app-plan [data-fk="mode:1"]', 'direct');
    await sleep(1500);

    // M1 모두 방어
    ok('M1 「모두 방어」 버튼', await clickSel(p, '#app-plan [data-fk="util:1:fillDef"]'));
    await sleep(1200);
    let intent = await readStrip(p, '#app-plan', 1);
    let sim = await runMain(p, sims);
    let acts = turnActs(sim.res.log);
    comparePlan('M1 모두 방어 → 실행', intent, acts, TAEHO, 2);
    ok('M1 이태호 자기 행동에 보통 공격 없음', intent.every((c) => !c.own.includes('평')), intent.filter((c) => c.own.includes('평')).map((c) => c.t).join(',') || '');

    // M2 모두 보통 공격 → 2턴 칸 메뉴(1번째 방어 · 2번째 필살기) + 첫 받은 추가 행동 = 방어
    await clickSel(p, '#app-plan [data-fk="util:1:fillAtk"]');
    await sleep(1000);
    await clickSel(p, '#app-plan [data-fk="cell:1:2"]'); await sleep(500);
    const r0 = await pickRow(p, 0, /방어/); await sleep(700);
    await clickSel(p, '#app-plan [data-fk="cell:1:2"]'); await sleep(500);
    const r1 = await pickRow(p, 1, /필살기/); await sleep(700);
    const fedT = await p.evaluate(() => { const b = document.querySelector('#app-plan li[data-pos="1"] .plan-cells button.split.xlast'); return b ? +b.dataset.t : 0; });
    let r2 = false;
    if (fedT) {
      await clickSel(p, `#app-plan [data-fk="cell:1:${fedT}"]`); await sleep(500);
      console.log('       칸 메뉴 줄:', JSON.stringify(await menuRows(p)));
      r2 = await pickRow(p, 2, /방어/); await sleep(900);
    }
    ok('M2 칸 메뉴 선택(1번째 · 2번째 · 받은 추가 행동)', r0 && r1 && r2, `받은 추가 행동 턴 ${fedT || '없음'}`);
    intent = await readStrip(p, '#app-plan', 1);
    const t2 = intent.find((c) => c.t === 2), tf = intent.find((c) => c.t === fedT);
    ok('M2 줄 표시 = 고른 값', t2 && t2.own.join('') === '방궁' && tf && tf.fed === '방', `2턴 ${t2 && t2.own.join('')} · ${fedT}턴 받은 ${tf && tf.fed}`);
    sim = await runMain(p, sims);
    acts = turnActs(sim.res.log);
    comparePlan('M2 칸 메뉴 + 받은 추가 행동 → 실행', intent, acts, TAEHO, 2);
    if (sim.req) {
      const fedSent = ((sim.req.team || []).find((m) => m.id === TAEHO) || {}).fedActions;
      ok('M2 실행 요청에 받은 추가 행동이 실림', !!fedSent && fedSent[String(fedT)] === '방', JSON.stringify(fedSent));
    }

    // M3 패턴 반복: 1~3턴(1턴 필살기 · 2턴 방어+필살기 · 3턴 보통 공격 둘) → 4턴부터 30턴까지
    await clickSel(p, '#app-plan [data-fk="util:1:fillAtk"]'); await sleep(900);
    await clickSel(p, '#app-plan [data-fk="cell:1:2"]'); await sleep(500); await pickRow(p, 0, /방어/); await sleep(600);
    await clickSel(p, '#app-plan [data-fk="cell:1:2"]'); await sleep(500); await pickRow(p, 1, /필살기/); await sleep(600);
    ok('M3 「패턴 반복」 버튼', await clickSel(p, '#app-plan [data-fk="util:1:repeat"]'));
    await sleep(800);
    const selOk = await p.evaluate(() => {
      const sels = document.querySelectorAll('.repeat-sheet select');
      if (sels.length !== 2) return false;
      sels[0].value = '1'; sels[0].dispatchEvent(new Event('change'));
      const to = document.querySelectorAll('.repeat-sheet select')[1]; to.value = '3'; to.dispatchEvent(new Event('change'));
      const apply = [...document.querySelectorAll('.sheet .btn-primary')].pop();
      if (!apply) return false;
      apply.click();
      return true;
    });
    ok('M3 반복 시트 1~3턴 적용', selOk);
    await sleep(1500);
    intent = await readStrip(p, '#app-plan', 1);
    const cyc = (tn) => intent.find((c) => c.t === tn).own.join('');
    const periodic = intent.every((c) => c.t <= 3 || cyc(c.t) === cyc(1 + ((c.t - 1) % 3)));
    ok('M3 줄이 3턴 주기로 반복', periodic, `1~3턴 ${[1, 2, 3].map(cyc).join(' / ')}`);
    sim = await runMain(p, sims);
    acts = turnActs(sim.res.log);
    comparePlan('M3 패턴 반복 → 실행', intent, acts, TAEHO, 2);

    // M4 실행 미리보기 = 실제 실행(확률 100% — 실행 1회)
    await previewVsSim(p, sims, 'M4 실행 미리보기 = 실제 실행(5명 × 30턴)');
    const splitN = await p.evaluate(() => document.querySelectorAll('#app-plan .preview .pv-cells i.dsplit').length);
    ok('M4 미리보기 여러 행동 칸 = 대각선', splitN > 0, `${splitN}칸`);

    // M5 도장 잠금해제 끈 이태호 = 턴당 1회
    await p.evaluate(() => window.__woofia.store.team.update(0, (s) => { s.rune = false; s.spec = { on: true, level: 60, evo: 5, pevo: 5, compat: 5, lv: {} }; }));
    await sleep(1500);
    await clickSel(p, '#app-plan [data-fk="util:1:fillDef"]'); await sleep(1200);
    intent = await readStrip(p, '#app-plan', 1);
    ok('M5 도장 끔 → 줄이 한 칸씩(30칸, 나눔 없음)', intent.length === 30 && intent.every((c) => c.own.length === 1 && !c.fed));
    sim = await runMain(p, sims);
    acts = turnActs(sim.res.log);
    comparePlan('M5 도장 끔 · 모두 방어 → 실행', intent, acts, TAEHO, 1);
    // 턴당 1회가 된 이태호는 다른 1번 자리 동료처럼 임부언 필살기 턴에 추가 행동을 받는다(엔진 fed carry) — 그 턴에만 두 번째 행동
    const twice = [...acts.keys()].filter((tn) => actorLine(acts, tn, TAEHO).length > 1);
    const imbUlt = new Set([...acts.keys()].filter((tn) => actorLine(acts, tn, 10410).includes('궁')));
    ok('M5 실행: 자기 행동 턴당 1회 · 두 번째 행동은 임부언 필살기 턴에만', twice.every((tn) => imbUlt.has(tn)), `두 번째 행동 턴 ${twice.join(',') || '없음'}`);
    await previewVsSim(p, sims, 'M5 도장 끔 · 실행 미리보기 = 실제 실행');
    await p.evaluate(() => window.__woofia.store.team.update(0, (s) => { s.rune = true; delete s.spec; }));
    await sleep(1500);

    // ════ A. 고급 설정 — ④ 격자 칸 메뉴 ════
    console.log('[고급 설정 · ④ 격자]');
    await clickSel(p, '#app-plan .deep-enter'); await sleep(1500);
    await p.evaluate(() => { const i = document.querySelector('[data-fk="advUse"]'); if (i && !i.checked) i.click(); });
    await sleep(2500);
    await clickSel(p, '.sheet [data-fk="util:1:fillAtk"]'); await sleep(2000);
    const gridFed = await p.evaluate(() => { const c = [...document.querySelectorAll('.sheet .pg-c.dsplit.k3[data-pos="1"]')][0]; return c ? +c.dataset.t : 0; });
    await clickSel(p, '.sheet .pg-c[data-pos="1"][data-t="5"]'); await sleep(600);
    const g0 = await pickRow(p, 0, /방어/); await sleep(1800);
    let g2 = false;
    if (gridFed) { await clickSel(p, `.sheet .pg-c[data-pos="1"][data-t="${gridFed}"]`); await sleep(600); g2 = await pickRow(p, 2, /필살기|방어/); await sleep(1800); }
    ok('A1 ④ 칸 메뉴(5턴 1번째 방어 · 받은 추가 행동)', g0 && g2, `받은 추가 행동 턴 ${gridFed || '없음'}`);
    const gridDiag = await p.evaluate(() => ({ split: document.querySelectorAll('.sheet .pg-c.dsplit').length, old: document.querySelectorAll('.sheet .pg-segs').length }));
    ok('A1 ④ 여러 행동 칸 = 대각선(옛 세로 조각 없음)', gridDiag.split > 0 && gridDiag.old === 0, JSON.stringify(gridDiag));
    intent = await readStrip(p, '.sheet', 1);
    await p.keyboard.press('Escape'); await sleep(1200);
    sim = await runMain(p, sims);
    acts = turnActs(sim.res.log);
    comparePlan('A1 고급 설정(④ 격자) → 실행', intent, acts, TAEHO, 2);
    ok('A1 페이지 오류 없음', p.errors.length === 0, p.errors.slice(0, 3).join(' | '));

    // ════ C. 비교하기 — A 팀(이태호) 행동 계획 편집 ════
    console.log('[비교하기]');
    if (WORKER) console.log('  skip 워커 모드 — 비교하기 실행 결과는 화면 밖(요청 가로채기)이라 8778 에서만');
    else {
    const recs = await p.evaluate(() => window.__woofia.store.records.list().map((r) => String(r.id)));
    ok('C 기록 2건 이상', recs.length >= 2, `${recs.length}건`);
    await p.evaluate(() => window.__woofia.openCompare()); await sleep(1000);
    const cmpBefore = sims.length;
    await p.selectOption('.cmp-pickcol.side-a select', recs[0]); await sleep(800);
    await p.selectOption('.cmp-pickcol.side-b select', recs[recs.length - 1]);
    for (let k = 0; k < 80 && sims.length < cmpBefore + 2; k++) await sleep(250);
    await sleep(800);
    ok('C 비교 실행(두 팀)', sims.length >= cmpBefore + 2);
    await clickSel(p, '.cmp-stools.side-a .btn'); await sleep(2500);
    const cmpPos = await p.evaluate(() => { const li = [...document.querySelectorAll('.sheet li[data-pos]')].find((x) => x.querySelector('.plan-cells button.split')); return li ? +li.dataset.pos : 0; });
    ok('C A 팀 편집 창에 이태호 줄(대각선 칸)', cmpPos > 0, `자리 ${cmpPos}`);
    await clickSel(p, `.sheet [data-fk="util:${cmpPos}:fillDef"]`); await sleep(2000);
    const cmpGrid = await p.evaluate(() => ({ split: document.querySelectorAll('.sheet .pg-c.dsplit').length, old: document.querySelectorAll('.sheet .pg-segs').length }));
    ok('C ④ 여러 행동 칸 = 대각선', cmpGrid.split > 0 && cmpGrid.old === 0, JSON.stringify(cmpGrid));
    intent = await readStrip(p, '.sheet', cmpPos);
    await p.keyboard.press('Escape'); await sleep(1500);
    const before2 = sims.length;
    await clickSel(p, '.cmp-bar .btn-run');
    for (let k = 0; k < 80 && sims.length < before2 + 2; k++) await sleep(250);
    await sleep(500);
    const cmpSim = sims.slice(before2)[0];   // 비교하기는 A → B 순서로 보낸다(두 기록 모두 이태호 편성)
    ok('C A 팀 다시 실행', !!cmpSim && (cmpSim.req.team || []).some((m) => m.id === TAEHO));
    if (cmpSim) {
      const good = comparePlan('C 비교하기 A 팀 모두 방어 → 실행', intent, turnActs(cmpSim.res.log), TAEHO, 2);
      const m = (cmpSim.req.team || []).find((x) => x.id === TAEHO) || {};
      if (!good) console.log('       요청:', JSON.stringify({ rotation: String(m.rotation || '').slice(0, 40), fed: m.fedActions, ult: m.ult, turnPlans: Object.keys(cmpSim.req.turnPlans || {}).length, turnOrders: Object.keys(cmpSim.req.turnOrders || {}).length, sync: cmpSim.req.sync }).slice(0, 400));
    }
    await p.keyboard.press('Escape'); await sleep(500);
    }

    // ════ U. 욱영 팀 — 받은 추가 행동(④ 칸 메뉴 → 턴 잠금) + 미리보기 = 실행 ════
    console.log('[욱영 팀 · 턴 잠금]');
    const simsU = [];
    const q = await boot(browser, simsU);
    await setTeam(q, UK_TEAM);
    await q.evaluate(() => window.__woofia.store.cond.set({ forceProc: true }));
    await clickSel(q, '#app-plan .deep-enter'); await sleep(1500);
    await q.evaluate(() => { const i = document.querySelector('[data-fk="advUse"]'); if (i && !i.checked) i.click(); });
    await sleep(3000);
    const uk = await q.evaluate(() => { const c = document.querySelector('.sheet .pg-c.dsplit[data-pos="4"]') || document.querySelector('.sheet .pg-c.dsplit'); return c ? { pos: +c.dataset.pos, t: +c.dataset.t } : null; });
    let lockedSeq = null;
    if (uk) {
      await clickSel(q, `.sheet .pg-c[data-pos="${uk.pos}"][data-t="${uk.t}"]`); await sleep(600);
      console.log('       칸 메뉴 줄:', JSON.stringify(await menuRows(q)));
      await pickRow(q, 1, /방어/); await sleep(2000);
      lockedSeq = await q.evaluate((tt) => (window.__woofia.store.get().locked || {})[tt] || null, uk.t);
    }
    ok('U1 추가 행동 → 방어 = 이 턴 잠금', !!lockedSeq && lockedSeq.some((x) => x.p === uk.pos && x.a === '방'), uk ? `${uk.pos}번 ${uk.t}턴 ${JSON.stringify(lockedSeq)}` : '여러 행동 칸 없음');
    await q.keyboard.press('Escape'); await sleep(1200);
    ({ acts } = await previewVsSim(q, simsU, 'U2 실행 미리보기 = 실제 실행(욱영 팀)'));
    const teamU = await q.evaluate(() => window.__woofia.store.get().team.map((s) => s && s.id));
    if (lockedSeq) {
      const got = (acts.get(uk.t) || []).map((x) => `${teamU.indexOf(x.id) + 1}${x.a}`).join(' ');
      const want = lockedSeq.map((x) => `${x.p}${x.a}`).join(' ');
      ok('U1 잠긴 턴 실행 순서 = 잠금', got === want, `${uk.t}턴 잠금 ${want} / 실행 ${got}`);
    }
    ok('U 페이지 오류 없음', q.errors.length === 0, q.errors.slice(0, 3).join(' | '));

    // ════ G. 가이드 상태(기본 편성 · 고급 설정 + 기본 설정 가져오기 + 필살기 연동 1그룹) — ④ 격자 = 실제 실행(확률 100%) ════
    console.log('[④ 격자 = 실행 · 가이드 상태]');
    const simsG = [];
    const g = await boot(browser, simsG);
    await g.evaluate(() => window.__woofia.store.cond.set({ forceProc: true }));
    await clickSel(g, '#app-plan .deep-enter'); await sleep(1500);
    await g.evaluate(() => { const i = document.querySelector('[data-fk="advUse"]'); if (i && !i.checked) i.click(); }); await sleep(1500);
    await clickSel(g, '#app-sheets [data-fk="stImport"]'); await sleep(1000);
    await clickSel(g, '#app-sheets [data-fk="syncAdd"]'); await sleep(700);
    await g.evaluate(() => { const s = document.querySelector('#app-sheets [data-fk="sadd:0"]'); if (s) { s.value = s.options[1].value; s.dispatchEvent(new Event('change', { bubbles: true })); } });
    await sleep(3500);
    const gridG = await readGrid(g);
    const syncG = await g.evaluate(() => JSON.stringify(window.__woofia.store.get().sync || []));
    await g.keyboard.press('Escape'); await sleep(1200);
    const simG = await runMain(g, simsG);
    const teamG = await g.evaluate(() => window.__woofia.store.get().team.map((s) => s && s.id));
    const badG = tableVsRun(gridG, turnActs(simG.res.log), teamG);
    ok('G ④ 격자 = 실제 실행(기본 편성 · 연동 1그룹)', Object.keys(gridG).length === 5 && badG.length === 0, badG.length ? badG.slice(0, 6).join(' · ') : `연동 ${syncG.slice(0, 80)}`);
    ok('G 페이지 오류 없음', g.errors.length === 0, g.errors.slice(0, 3).join(' | '));

    // ════ W. 무명 — 불굴 ≧1 20% · ≧3 40% 추가 효과 = 평타 판정(실행 로그) ════
    console.log('[무명 불굴 판정]');
    const simsW = [];
    const w = await boot(browser, simsW);
    await setTeam(w, MUMEI_TEAM);
    sim = await runMain(w, simsW);
    const addon = (sim.res.log || []).filter((l) => l.actorId === MUMEI && l.detail && [20, 40].includes(+l.detail.skillPct) && +l.amount > 0);
    const sample = addon[0] ? JSON.stringify({ text: addon[0].text, kind: addon[0].kind, src: addon[0].detail.src || addon[0].detail.act }).slice(0, 160) : '';
    const judged = addon.map((l) => String(l.text || '').split(' ')[0]);
    ok('W 무명 불굴 20% · 40% 타격이 실행 로그에 있음', addon.length > 0, `${addon.length}건 ${sample}`);
    ok('W 전부 평타 판정', addon.length > 0 && judged.every((x) => x === '평타'), [...new Set(judged)].join(','));
  } catch (err) {
    fail++; fails.push('예외'); console.log('  FAIL 예외 —', err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err);
  } finally {
    await browser.close();
  }
  console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} — ${pass} 통과 · ${fail} 실패${fails.length ? ` (${fails.join(', ')})` : ''}`);
  process.exit(fail ? 1 : 0);
})();
