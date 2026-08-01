/**
 * 경합·되돌리기 회귀 검사 — Opus 5 감사(2026-08-01)가 재현한 4개 결함이 다시 살아나는지 본다.
 *   F1 연속 클릭 시 갱신 드롭 · F2 순서 이동 되돌리기 누락
 *   F4 닫는 중 붙여넣기가 메인 오염 · F9 중첩 오픈 시 메인 타임라인 유실
 *
 *   python server.py &  →  node tools/uitest_race.js   (실패 시 종료코드 1)
 */
// 감사가 재현한 4개 시나리오가 수정 후 막히는지 확인
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('jsdom 필요: npm install --no-save jsdom'); process.exit(2); }
const fs = require('fs'), path = require('path');
const BASE = process.env.UITEST_BASE || 'http://localhost:8777';
const DASH = path.join(__dirname, '..', 'dashboard');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => { fails++; console.log('  ✗ ' + m); };

async function boot() {
  const dom = new JSDOM(fs.readFileSync(path.join(DASH, 'index.html'), 'utf8'),
    { url: BASE + '/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  w.addEventListener('unhandledrejection', (e) => bad('unhandled rejection: ' + e.reason));
  w.fetch = (u, o) => fetch(new URL(u, BASE).href, o);
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
  w.Worker = function () {};
  const pr = `;window.__a={get team(){return team},get turnPlans(){return turnPlans},
    get advTouched(){return advTouched},get advProbe(){return advProbe},get CHARS(){return CHARS},
    get advUndo(){return advUndo},get advBusy(){return advBusy},get advSel(){return advSel},
    set advSel(v){advSel=v},get cmpTeam(){return cmpTeam},get cmpAdv(){return cmpAdv},
    get cmpCommon(){return cmpCommon},openAdvFor(x){return openAdvFor(x)},
    get advScope(){return advScope},advPasteInto(t){return advPasteInto(t)},
    get cmpAdvOn(){return cmpAdvOn},
    advCopyTurn(t){return advCopyTurn(t)}};`;
  w.eval(fs.readFileSync(path.join(DASH, 'spec.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(DASH, 'app.js'), 'utf8') + pr);
  const A = w.__a, $ = (x) => w.document.querySelector(x);
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  while (!Object.keys(A.CHARS || {}).length) await sleep(80);
  [10423, 10410, 10421, 10439, 10428].forEach((id, i) => {
    A.team[i] = { id, skill: 10, rune: true, rotation: '' };
  });
  return { w, A, $, click };
}
async function openMain(env) {
  env.$('#advOpen').dispatchEvent(new env.w.MouseEvent('click', { bubbles: true }));
  await sleep(300);
  env.$('#advSwitch').checked = true;
  env.$('#advSwitch').dispatchEvent(new env.w.Event('change'));
  while (Object.keys(env.A.turnPlans).length < 5) await sleep(120);
  await sleep(1500);
}

(async () => {
  // ── F1: 빠른 연속 클릭에도 프로브가 최종 상태를 반영해야 한다
  {
    const env = await boot(); await openMain(env);
    const { A, $, click } = env;
    A.advSel = 4; A.turnPlans && click($('.adv-rail button[data-advt="4"]')); await sleep(600);
    const btns = [...env.w.document.querySelectorAll('.adv-track .acts button:not(.on):not([disabled])')];
    if (btns.length < 2) { bad('F1: 클릭할 버튼 부족'); }
    else {
      click(btns[0]); click(btns[1]);            // 연속 두 번, 대기 없음
      while (A.advBusy) await sleep(60);
      await sleep(900);
      const live = await (async () => {          // 진짜 상태를 별도로 조회
        const r = await env.w.fetch('/api/probe', { method: 'POST',
          body: JSON.stringify({ ...JSON.parse(JSON.stringify(await probeCfg(A))), turnPlans: A.turnPlans }) });
        return r.json();
      })().catch(() => null);
      const uiExec = ((A.advProbe.plan || {})['4'] || {}).exec;
      const trueExec = live && ((live.plan || {})['4'] || {}).exec;
      JSON.stringify(uiExec) === JSON.stringify(trueExec)
        ? ok('F1 연속 클릭 후 프로브가 최종 상태와 일치')
        : bad(`F1 여전히 낡음\n      UI  ${JSON.stringify(uiExec)}\n      실제 ${JSON.stringify(trueExec)}`);
    }
  }

  // ── F2: 순서 이동(▲▼)도 되돌리기에 쌓여야 한다
  {
    const env = await boot(); await openMain(env);
    const { A, $, click } = env;
    const d0 = A.advUndo.length;
    const mv = $('.adv-track .mv button:not([disabled])');
    if (!mv) bad('F2: 이동 버튼 없음');
    else {
      const before = JSON.stringify(A.turnPlans[A.advSel]);
      click(mv); await sleep(1500);
      const moved = JSON.stringify(A.turnPlans[A.advSel]) !== before;
      const pushed = A.advUndo.length - d0;
      moved && pushed === 1 ? ok('F2 순서 이동이 되돌리기에 기록됨')
        : bad(`F2 이동=${moved} 되돌리기 증가=${pushed}`);
      if (moved) {
        click($('#advUndoBtn')); await sleep(1500);
        JSON.stringify(A.turnPlans[A.advSel]) === before
          ? ok('F2 한 번 되돌리기로 이동만 취소') : bad('F2 되돌리기가 원상복구 못 함');
      }
    }
  }

  // ── F4: 붙여넣기 도중 닫으면 메인이 오염되면 안 된다
  {
    const env = await boot(); await openMain(env);
    const { w, A, $, click } = env;
    const mainBefore = JSON.stringify(A.turnPlans);
    click($('[data-advclose]')); await sleep(400);
    A.cmpTeam.a = [10402, 10428, 10421].map((id) => ({ id, skill: 10, rune: true, rotation: '' }));
    A.cmpCommon.turns = 6;
    A.openAdvFor('a'); await sleep(400);
    $('#advSwitch').checked = true; $('#advSwitch').dispatchEvent(new w.Event('change'));
    while (Object.keys(A.turnPlans).length < 6) await sleep(120);
    await sleep(1200);
    A.advCopyTurn(1); await sleep(200);
    const p = A.advPasteInto([3]);              // 기다리지 않고
    click($('[data-advclose]'));                // 즉시 닫기
    await p.catch(() => {}); await sleep(1200);
    JSON.stringify(A.turnPlans) === mainBefore
      ? ok('F4 닫는 중 붙여넣기가 메인을 오염시키지 않음')
      : bad('F4 메인 타임라인이 오염됨');
    A.advScope === null ? ok('F4 스코프 정상 해제') : bad('F4 스코프 잔존');
  }

  // ── F9: 닫지 않고 다시 열어도 메인이 보존되어야 한다
  {
    const env = await boot(); await openMain(env);
    const { w, A, $ } = env;
    const mainBefore = JSON.stringify(A.turnPlans);
    A.cmpTeam.a = [10402, 10428].map((id) => ({ id, skill: 10, rune: true, rotation: '' }));
    A.cmpTeam.b = [10421, 10439].map((id) => ({ id, skill: 10, rune: true, rotation: '' }));
    A.cmpCommon.turns = 5;
    A.openAdvFor('a'); await sleep(800);
    A.openAdvFor('b'); await sleep(800);        // 닫지 않고 바로 다른 스코프
    $('[data-advclose]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(1200);
    JSON.stringify(A.turnPlans) === mainBefore
      ? ok('F9 중첩 오픈 후에도 메인 타임라인 보존') : bad('F9 메인 타임라인 유실');
    const pops = w.document.querySelectorAll('.advpop').length;
    pops === 0 ? ok('F9 편집기 잔여 없음') : bad(`F9 팝업 ${pops}개 잔존`);
  }

  // ── 스코프 감사 F1: 편집 직후 즉시 닫아도 반대편이 오염되면 안 된다
  {
    const env = await boot(); await openMain(env);
    const { w, A, $, click } = env;
    const mainBefore = JSON.stringify(A.turnPlans);
    click($('[data-advclose]')); await sleep(400);
    A.cmpTeam.a = [10402, 10428, 10421].map((id) => ({ id, skill: 10, rune: true, rotation: '' }));
    A.cmpCommon.turns = 6;
    A.openAdvFor('a'); await sleep(400);
    $('#advSwitch').checked = true; $('#advSwitch').dispatchEvent(new w.Event('change'));
    while (Object.keys(A.turnPlans).length < 6) await sleep(120);
    await sleep(1200);
    const btn = $('.adv-track .acts button:not(.on):not([disabled])');
    if (btn) { click(btn); click($('[data-advclose]')); }   // 편집 직후 즉시 닫기
    await sleep(2500);
    JSON.stringify(A.turnPlans) === mainBefore
      ? ok('스코프F1 편집 직후 닫아도 메인 보존') : bad('스코프F1 메인 오염');
    const maxPos = Math.max(0, ...Object.values(A.cmpAdv.a || {}).flat().map((e) => e.p));
    maxPos <= 3 ? ok(`스코프F1 비교군에 메인 포지션 유입 없음 (최대 ${maxPos})`)
                : bad(`스코프F1 비교군에 없는 포지션 ${maxPos} 유입`);
  }

  // ── 스코프 감사 F4: 껐다 닫아도 타임라인은 보관되어야 한다
  {
    const env = await boot();
    const { w, A, $, click } = env;
    A.cmpTeam.a = [10402, 10428].map((id) => ({ id, skill: 10, rune: true, rotation: '' }));
    A.cmpCommon.turns = 5;
    A.openAdvFor('a'); await sleep(400);
    $('#advSwitch').checked = true; $('#advSwitch').dispatchEvent(new w.Event('change'));
    while (Object.keys(A.turnPlans).length < 5) await sleep(120);
    await sleep(1200);
    $('#advSwitch').checked = false; $('#advSwitch').dispatchEvent(new w.Event('change'));
    await sleep(1200);
    click($('[data-advclose]')); await sleep(800);
    A.cmpAdv.a && Object.keys(A.cmpAdv.a).length
      ? ok(`스코프F4 끄고 닫아도 타임라인 보관 (${Object.keys(A.cmpAdv.a).length}턴)`)
      : bad('스코프F4 타임라인이 폐기됨');
    A.cmpAdvOn.a === false ? ok('스코프F4 적용은 꺼진 상태') : bad('스코프F4 적용 플래그가 남음');
  }

  // ── 포커스 트랩: 편집기가 열린 동안 배경이 실제로 비활성화되는가
  {
    const env = await boot(); await openMain(env);
    const { w, $, click } = env;
    const bg = [...w.document.body.children].filter((el) => !el.classList.contains('advpop'));
    const inert = bg.filter((el) => el.hasAttribute('inert')).length;
    inert === bg.length && bg.length > 0
      ? ok(`포커스트랩 열린 동안 배경 ${bg.length}개 전부 inert`)
      : bad(`포커스트랩 배경 ${inert}/${bg.length}만 inert`);
    // 기록 복원 컨트롤이 Tab으로 닿으면 편집 중 상태가 통째로 뒤집힌다
    const hist = w.document.querySelector('#histModal, #histBtn');
    !hist || hist.closest('[inert]')
      ? ok('포커스트랩 기록 컨트롤이 비활성 영역 안') : bad('포커스트랩 기록 컨트롤이 노출됨');
    click($('[data-advclose]')); await sleep(800);
    const left = [...w.document.body.children].filter((el) => el.hasAttribute('inert')).length;
    left === 0 ? ok('포커스트랩 닫으면 inert 전부 해제') : bad(`포커스트랩 inert ${left}개 잔존`);
  }

  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL', e.stack); process.exit(1); });

async function probeCfg(A) {
  return { team: A.team.filter(Boolean).map((s, i) => ({ id: s.id, position: i + 1, skill: 10, rune: true })),
    turns: 30, dummies: 1, enemyHits: 'all', dummyElement: 0, turnOrders: {}, forceProc: true, runs: 1 };
}
