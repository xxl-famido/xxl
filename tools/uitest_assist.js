/**
 * 확률 쿨 감소 성공 가정(궁극기 사용 방식 옵션) UI · 엔진 검사 — jsdom 으로 app.js 를 띄워 실제로 조작한다.
 *
 * 보는 것:
 *   · 궁극기 사용 방식 탭: 가정 토글(확률 쿨 감소가 걸릴 때만) · '모두 성공 가정 켜기' · '준비되면 바로'는 흐리게
 *   · 캐릭터 플래너: 가정 끔 → 앞당긴 궁 칸 잠김 + 켜는 곳 안내(.luck-off) / '첫 궁 당기기' → 가정 켜짐 + 3·6·9·12(3쿨)·2·4·6(2쿨)
 *   · 실행: 페이로드(team[].ult.assist) · 엔진 궁 턴이 계획과 일치 · 결과 머리말(가정 횟수 · 그대로 나올 확률)
 *   · 공유 코드 v2 왕복 · 가정 끄기(엔진은 원래 쿨로 폴백)
 *   · 계획 모델(JS) ↔ 엔진 일치: 무작위 계획 수백 개에서 플래너가 그린 궁 턴 = 엔진이 실제 쓴 궁 턴
 *
 *   python server.py &  →  node tools/uitest_assist.js     (실패 1 · jsdom 없음 2)
 */
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('jsdom이 없습니다 — `npm install --no-save jsdom` 후 다시 실행하세요.'); process.exit(2); }
const fs = require('fs');
const path = require('path');

const BASE = process.env.UITEST_BASE || 'http://localhost:8777';
const DASH = path.join(__dirname, '..', 'dashboard');
const errors = [], steps = [];
const ok = (m) => steps.push('  ✓ ' + m);
const bad = (m) => { errors.push(m); steps.push('  ✗ ' + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CD3 = 10303, CD2 = 10413, RICANO = 10428;          // 3쿨(첫 4턴) · 2쿨(첫 3턴) · 기타
const ALTAR_ALL = { on: true, floors: { 1: { on: true, off: [] }, 2: { on: true, off: [] }, 3: { on: true, off: [] } } };
async function waitFor(fn, label, timeout = 30000) {
  const t0 = Date.now();
  for (;;) {
    let v; try { v = fn(); } catch { v = null; }
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`시간 초과: ${label}`);
    await sleep(50);
  }
}
const ultTurns = (log, cid) => {             // 엔진 로그에서 cid 가 궁을 쓴 턴
  const seen = new Set(), out = [];
  for (const ev of log) if (ev.actorId === cid && ev.kind === '필살기' && !seen.has(ev.act)) { seen.add(ev.act); out.push(ev.turn); }
  return out;
};
const planUlts = (plan) => plan.map((a, i) => (a === '궁' ? i + 1 : 0)).filter(Boolean);

async function main() {
  const html = fs.readFileSync(path.join(DASH, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: BASE + '/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const d = window.document;
  const $ = (s, r = d) => r.querySelector(s);
  const $$ = (s, r = d) => [...r.querySelectorAll(s)];
  window.addEventListener('error', (e) => bad(`window error: ${e.error && e.error.stack || e.message}`));
  window.addEventListener('unhandledrejection', (e) => bad(`unhandled rejection: ${e.reason}`));
  const sent = [];
  window.fetch = (u, o) => {
    const url = String(u);
    if (/\/api\/simulate/.test(url) && o && o.body) { try { sent.push(JSON.parse(o.body)); } catch { } }
    return fetch(new URL(u, BASE).href, o);
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  window.Worker = function () { throw new Error('worker unused on local'); };
  window.alert = (m) => bad(`alert: ${m}`);

  const probe = `
    ;window.__as = {
      get CHARS(){return CHARS}, get team(){return team}, setTeam(v){team = v; renderTeam(); renderPrio();},
      set advTab(v){advTab = v}, openAdvPop(){return openAdvPop()}, closeAdv(){ if (advCloseFn) advCloseFn(); },
      openModal(i){return openModal(i)}, closeCharModal(){return closeCharModal()},
      ultOf(s){return ultOf(s)}, applyAltarSnap(a){return applyAltarSnap(a)}, applySyncSnap(g){return applySyncSnap(g)},
      snapshot(){return snapshot()}, packSnapV2(s){return packSnapV2(s)}, unpackSnapV2(a){return unpackSnapV2(a)},
      looseEq(a,b){return looseEq(a,b)}, run(save){return run(save)}, get lastResult(){return lastResult},
      normalizePlan(p,m,ab,src){return normalizePlan(p,m,ab,src)}, ultAvail(p,m,ab,src){return ultAvail(p,m,ab,src)},
      cdProcSources(m){return cdProcSources(m)},
    };`;
  window.eval(fs.readFileSync(path.join(DASH, 'spec.js'), 'utf8'));
  try { window.eval(fs.readFileSync(path.join(DASH, 'app.js'), 'utf8') + probe); }
  catch (e) { bad(`app.js 로드 실패: ${e.stack}`); return finish(); }
  const app = window.__as;
  const click = (el) => el && el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const change = (el, v) => { if (typeof v === 'boolean') el.checked = v; else el.value = v; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
  const slot = (id) => ({ id, skill: 10, rune: true, rotation: '' });

  try {
    await waitFor(() => Object.keys(app.CHARS).length > 0 && $('#teamSlots').children.length, '초기화');
    app.setTeam([slot(CD3), slot(CD2), slot(RICANO), null, null]);
    app.applySyncSnap(null);
    app.applyAltarSnap(null);
    $('#turns').value = '13'; $('#turns').dispatchEvent(new window.Event('input'));
    $('#runs').value = '20'; $('#runs').dispatchEvent(new window.Event('input'));

    // ── 제단 OFF: 가정 토글은 숨김(걸릴 확률 감소가 없음) ──
    app.advTab = 'ult'; app.openAdvPop();
    await waitFor(() => $('.adv-card .adv-pane-ult .au-row'), '궁극기 사용 방식 탭');
    if ($('.adv-card [data-ultassist]')) bad('확률 쿨 감소가 없는데 가정 토글이 보임');
    else ok('제단 OFF → 가정 토글 없음');
    app.closeAdv(); await sleep(30);

    // ── 제단 ON(1012·1013): 토글 · 모두 켜기 · asap 흐림 ──
    app.applyAltarSnap(ALTAR_ALL);
    app.advTab = 'ult'; app.openAdvPop();
    await waitFor(() => $('.adv-card [data-ultassist="1"]'), '가정 토글');
    if ($$('.adv-card [data-ultassist]').length !== 3) bad(`가정 토글 3개 기대, ${$$('.adv-card [data-ultassist]').length}`);
    click($('.adv-card [data-ultall="assist"]')); await sleep(200);
    if (!app.team.filter(Boolean).every(s => app.ultOf(s).assist)) bad("'모두 성공 가정 켜기' 후 전원 assist 여야 함");
    else ok("'모두 성공 가정 켜기' → 전원 켜짐");
    await waitFor(() => $('.adv-card [data-ultassist="3"]'), '재렌더');
    change($('.adv-card [data-ultassist="3"]'), false); await sleep(150);
    if (app.ultOf(app.team[2]).assist) bad('개별 토글 끄기 반영 실패');
    click(await waitFor(() => $('.adv-card [data-ultmode="asap"][data-pos="3"]'), '재렌더')); await sleep(150);
    const dimRow = await waitFor(() => $('.adv-card [data-ultassist="3"]'), '재렌더');
    if (!dimRow.closest('.ult-assist').classList.contains('dim')) bad("'준비되면 바로'에선 가정 토글이 흐려야 함");
    else ok("개별 끄기 · '준비되면 바로'는 흐림");
    app.closeAdv(); await sleep(30);
    app.team[2].ult = undefined; delete app.team[2].ult;
    app.team[0].ult = { mode: 'fixed', keepDef: true };        // P1 은 가정 끔 상태로 시작(잠김 안내 확인)
    delete app.team[0].ult;

    // ── 캐릭터 플래너(P1 3쿨): 가정 끔 → 3턴 잠김 + 안내 ──
    await app.openModal(0);
    const usePlan = await waitFor(() => $('#usePlan'), '캐릭터 모달');
    change(usePlan, true); await sleep(50);
    let b3 = await waitFor(() => $('#planner button[data-idx="2"][data-a="궁"]'), '플래너');
    if (!b3.disabled) bad('가정 꺼짐: 3쿨 캐릭 3턴 궁은 잠겨 있어야 함');
    if (!b3.classList.contains('luck-off') || !/확률 쿨 감소 성공 가정/.test(b3.title)) bad('잠긴 3턴 궁에 켜는 곳 안내(.luck-off + title)가 없음');
    else ok('가정 꺼짐: 3턴 궁 잠김 + 켜는 곳 안내');
    const early = $('.plan-fill [data-early]');
    if (!early) { bad("'첫 궁 당기기' 버튼이 없음"); return finish(); }
    click(early); await sleep(100);
    if (!app.ultOf(app.team[0]).assist) bad("'첫 궁 당기기'가 가정을 켜지 않음");
    const p0 = planUlts(app.team[0].plan).filter(t => t <= 13);
    if (p0.join(',') !== '3,6,9,12') bad(`3쿨 첫 궁 당기기 = 3,6,9,12 기대, ${p0}`);
    else ok("'첫 궁 당기기'(3쿨) → 가정 켜짐 · 3,6,9,12");
    b3 = $('#planner button[data-idx="2"][data-a="궁"]');
    if (!b3 || b3.disabled || !b3.classList.contains('luck')) bad('3턴 궁은 활성 + 확률 감소 표식(.luck)이어야 함');
    else ok('3턴 궁 활성 · .luck 표식');
    if (!early.classList.contains('on')) bad("'첫 궁 당기기' 버튼이 켜짐 표시가 아님");
    if (!/확률 쿨 감소 성공 가정/.test($('.mc-ult em').textContent)) bad('모달 요약에 가정 표시 없음');
    app.closeCharModal(); await sleep(30);

    // P2(2쿨)
    await app.openModal(1);
    change(await waitFor(() => $('#usePlan'), '캐릭터 모달'), true); await sleep(50);
    click(await waitFor(() => $('.plan-fill [data-early]'), '첫 궁 당기기')); await sleep(100);
    const p1 = planUlts(app.team[1].plan).filter(t => t <= 13);
    if (p1.join(',') !== '2,4,6,8,10,12') bad(`2쿨 첫 궁 당기기 = 2,4,6,8,10,12 기대, ${p1}`);
    else ok("'첫 궁 당기기'(2쿨) → 2,4,6,8,10,12");
    app.closeCharModal(); await sleep(30);

    // ── 실행: 페이로드 · 엔진 궁 턴 · 머리말 ──
    sent.length = 0;
    await app.run(false);
    await waitFor(() => app.lastResult, '실행');
    const cfg = sent[sent.length - 1];
    if (!cfg || !cfg.team[0].ult || cfg.team[0].ult.assist !== true) bad(`페이로드 team[0].ult.assist 누락: ${JSON.stringify(cfg && cfg.team[0].ult)}`);
    const r = app.lastResult;
    const e0 = ultTurns(r.log, CD3), e1 = ultTurns(r.log, CD2);
    if (e0.join(',') !== '3,6,9,12') bad(`엔진 3쿨 궁 턴 3,6,9,12 기대, ${e0}`);
    if (e1.join(',') !== '2,4,6,8,10,12') bad(`엔진 2쿨 궁 턴 기대, ${e1}`);
    const ca = r.meta.cdAssist;
    if (!ca || ca.uses !== 2 || Math.abs(ca.prob - 0.153) > 1e-3) bad(`meta.cdAssist 이상: ${JSON.stringify(ca)}`);
    if (!/확률 쿨 감소 가정 2회 \(그대로 나올 확률 15\.3%\)/.test($('#topMeta').textContent)) bad(`머리말 표시 없음: ${$('#topMeta').textContent}`);
    else ok('실행: 엔진 궁 턴 = 계획(3·6·9·12 / 2·4·6…) · 머리말 “가정 2회 · 15.3%”');

    // ── 공유 코드 왕복 ──
    const snap = app.snapshot();
    const back = app.unpackSnapV2(JSON.parse(JSON.stringify(app.packSnapV2(snap))));
    if (!app.looseEq(snap.team, back.team)) bad('공유 코드 v2 왕복 불일치(team)');
    else if (!back.team[0].ult || back.team[0].ult.assist !== true) bad('왕복 후 assist 유실');
    else ok('공유 코드 v2 왕복(assist 보존)');

    // ── 가정 끄기: 저장된 계획은 그대로, 엔진은 원래 쿨로 폴백(첫 궁 4턴) ──
    const before = app.team[0].plan.join('');
    app.advTab = 'ult'; app.openAdvPop();
    change(await waitFor(() => $('.adv-card [data-ultassist="1"]'), '가정 토글'), false); await sleep(150);
    app.closeAdv(); await sleep(30);
    if (app.team[0].plan.join('') !== before) bad('가정 토글만으로 저장된 계획이 바뀌면 안 됨');
    await app.run(false);
    const f0 = ultTurns(app.lastResult.log, CD3);
    if (f0[0] !== 3 && f0[0] !== 4) bad(`가정 끔: 첫 궁은 확률대로 3 또는 4턴, ${f0}`);
    else ok(`가정 끔: 계획 보존 · 엔진 확률대로(첫 궁 ${f0[0]}턴 표본)`);

    // ── 계획 모델(JS) ↔ 엔진 일치 ──
    const turns = 16, N = 60;
    const cases = [[CD3, 'fixed'], [CD2, 'fixed'], [CD3, 'strict'], [10433, 'fixed'], [10436, 'fixed']];
    let checked = 0, mism = [];
    let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (const [cid, mode] of cases) {
      const meta = app.CHARS[cid];
      if (!meta) { bad(`캐릭터 ${cid} 없음`); continue; }
      const src = app.cdProcSources(meta);
      for (let k = 0; k < N; k++) {
        const plan = Array.from({ length: turns }, () => { const x = rnd(); return x < 0.35 ? '궁' : x < 0.8 ? '평' : '방'; });
        const norm = plan.slice();
        app.normalizePlan(norm, meta, Array(turns).fill(0), src);   // 단독 편성 = 아군 평타 0 (UI 의 allyBasicCounts 와 같음)
        const res = await (await fetch(BASE + '/api/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ team: [{ id: cid, position: 1, rotation: plan.join(''), ult: { mode, assist: true } }], turns, runs: 1, dummies: 1,
            altar: ALTAR_ALL, noBand: true }) })).json();
        const eng = ultTurns(res.log, cid), js = planUlts(norm);
        checked++;
        // strict 는 미준비 궁을 건너뛰고(폴백 없음) — JS 모델은 fixed 폴백 규칙이라 '엔진 궁 ⊆ 계획 궁'만 본다
        const same = mode === 'strict' ? eng.every(t => plan[t - 1] === '궁') : eng.join(',') === js.join(',');
        if (!same) mism.push(`${meta.name}/${mode} plan=${plan.join('')} js=${js} eng=${eng}`);
      }
    }
    if (mism.length) { bad(`계획 모델 ↔ 엔진 불일치 ${mism.length}/${checked}`); mism.slice(0, 5).forEach(m => steps.push('      ' + m)); }
    else ok(`계획 모델 ↔ 엔진 일치 ${checked}건 (일반 3쿨·2쿨 · strict · 히토하 · 모이루)`);
  } catch (e) {
    bad(`예외: ${e.stack || e}`);
  }
  finish();
}
function finish() {
  console.log(steps.join('\n'));
  console.log(errors.length ? `\n실패 ${errors.length}건` : '\n확률 쿨 감소 성공 가정 검사 통과');
  process.exit(errors.length ? 1 : 0);
}
main();
