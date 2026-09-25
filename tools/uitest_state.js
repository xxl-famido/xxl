/**
 * 설정 보존·자동 변경 검수(편의 기능 전체 최적화) — jsdom 으로 app.js 를 띄워 실제로 조작한다.
 * 단계별로 검사를 누적한다.
 *
 *   1단계(결과가 틀리던 버그)
 *     · 메인 실행에 턴 피해가 실린다
 *     · 실행 계획은 편집 원본(s.plan)에서 만든다 — 저장된 rotation 과 어긋나도, 턴 수보다 짧아도
 *     · 이태호 '임부언 추가 행동' 선택은 직접 계획이 켜져 있고 지금 보이는 fed 턴만 보낸다
 *     · 욱영 「아군 필살 나중」은 직접 계획을 꺼도 보이고 켤 수 있다
 *     · 타임라인을 켜도 제토 체이닝(엔진 자동 추가 행동)은 굳지 않는다
 *     · 타임라인 예산 기준선은 매 프로브마다 모든 턴을 갱신한다
 *
 *   python server.py &  →  node tools/uitest_state.js     (실패 1 · jsdom 없음 2)
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
const TAEHO = 10423, IMBU = 10410, ZETO = 10441, UK = 10439, RICANO = 10428, FIGHTER = 10402;
async function waitFor(fn, label, timeout = 30000) {
  const t0 = Date.now();
  for (;;) {
    let v; try { v = fn(); } catch { v = null; }
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`시간 초과: ${label}`);
    await sleep(50);
  }
}

async function boot(storage) {
  const html = fs.readFileSync(path.join(DASH, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: BASE + '/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  if (storage) Object.entries(storage).forEach(([k, v]) => window.localStorage.setItem(k, v));   // 새로고침 흉내: 이전 페이지의 저장소
  const d = window.document;
  const $ = (s, r = d) => r.querySelector(s);
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
    ;window.__st = {
      get CHARS(){return CHARS}, get team(){return team}, setTeam(v){team = v; renderTeam(); renderPrio();},
      openModal(i){return openModal(i)}, closeCharModal(){return closeCharModal()},
      applyAltarSnap(a){return applyAltarSnap(a)}, applySyncSnap(g){return applySyncSnap(g)}, applyTdmgSnap(t){return applyTdmgSnap(t)},
      run(save){return run(save)}, get lastResult(){return lastResult},
      get advOn(){return advOn}, get turnPlans(){return turnPlans}, get advProbe(){return advProbe}, get advPrevBudget(){return advPrevBudget},
      openAdvPop(){return openAdvPop()}, closeAdv(){ if (advCloseFn) advCloseFn(); }, advRefresh(){return advRefresh()},
      set advTab(v){advTab = v}, saveDraft(){return saveDraft()}, get simHistory(){return simHistory},
      get altarOn(){return altarOn}, get altarCfg(){return altarCfg}, get syncGroups(){return syncGroups}, get tdmgOn(){return tdmgOn},
      get activeRecId(){return activeRecId}, restoreRecord(r,u){return restoreRecord(r,u)},
      pick(id){return pick(id)}, removeFromTeam(i){ removeFromTeam(i); renderRoster(); renderTeam(); renderPrio(); }, get turnOverrides(){return turnOverrides}, set turnOverrides(v){turnOverrides = v},
      get advTabNow(){return advTab}, ultOf(x){return ultOf(x)},
      get cmpTeam(){return cmpTeam}, get cmpSync(){return cmpSync}, get cmpAdv(){return cmpAdv}, get cmpTurnOv(){return cmpTurnOv}, get cmpPending(){return cmpPending},
      set cmpPending(v){cmpPending = v}, loadCmpTeam(sd, r){ cmpLoaded[sd] = null; return loadCmpTeam(sd, r); }, cfgFromTeam(sd, snap){return cfgFromTeam(sd, snap)},
      cmpSwapSlots(sd, k, t){return cmpSwapSlots(sd, k, t)}, openAdvFor(sd){return openAdvFor(sd)}, openSealPop(c){return openSealPop(c)},
      openPlanPopup(c){return openPlanPopup(c)}, set cmpCommonTurns(v){ cmpCommon.turns = v; }, get cmpCommon(){return cmpCommon},
      get advTouched(){return advTouched}, resetAdv(){ turnPlans = {}; advTouched = new Set(); advPrevBudget = {}; }, advCommitAt(t, seq){ advTouched.add(t); turnPlans[t] = seq; },
    };`;
  window.eval(fs.readFileSync(path.join(DASH, 'spec.js'), 'utf8'));
  window.eval(fs.readFileSync(path.join(DASH, 'app.js'), 'utf8') + probe);
  const app = window.__st;
  await waitFor(() => Object.keys(app.CHARS).length > 0 && $('#teamSlots').children.length, '초기화');
  const storageOut = () => { const o = {}; for (let i = 0; i < window.localStorage.length; i++) { const k = window.localStorage.key(i); o[k] = window.localStorage.getItem(k); } return o; };
  return { window, d, $, app, sent, storageOut };
}

async function main() {
  let env;
  try { env = await boot(); } catch (e) { bad(`app.js 로드 실패: ${e.stack}`); return finish(); }
  let { window, d, $, app, sent } = env;
  const click = (el) => el && el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const change = (el, v) => { if (typeof v === 'boolean') el.checked = v; else el.value = v; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
  const slot = (id) => ({ id, skill: 10, rune: true, rotation: '' });
  const setTurns = (n) => { $('#turns').value = String(n); $('#turns').dispatchEvent(new window.Event('input')); };
  const lastCfg = () => sent[sent.length - 1];
  const reload = async () => {                     // 새로고침: 같은 저장소로 새 페이지
    app.saveDraft();
    const store = env.storageOut();
    env = await boot(store);
    ({ window, d, $, app, sent } = env);
  };
  try {
    app.applySyncSnap(null); app.applyAltarSnap(null); app.applyTdmgSnap(null);
    $('#runs').value = '1'; $('#runs').dispatchEvent(new window.Event('input'));

    // ── 1-1 턴 피해가 메인 실행에 실린다 ──
    app.setTeam([slot(FIGHTER), slot(RICANO), null, null, null]);
    setTurns(10);
    app.applyTdmgSnap({ on: true, pct: 20 });
    sent.length = 0; await app.run(false);
    if (!lastCfg() || !lastCfg().turnDamage || lastCfg().turnDamage.pct !== 20) bad(`메인 실행 cfg.turnDamage 누락: ${JSON.stringify(lastCfg() && lastCfg().turnDamage)}`);
    else if (!app.lastResult.meta.turnDamage) bad('결과 meta.turnDamage 없음(엔진에 안 들어감)');
    else ok('메인 실행에 턴 피해가 실린다(결과 머리말 포함)');
    app.applyTdmgSnap(null);

    // ── 1-2 실행 계획 = 편집 원본(s.plan), 턴 수만큼 이어 붙임 ──
    const s0 = app.team[0];
    s0.usePlan = true; s0.plan = '평평평궁평평궁'.split(''); s0.rotation = '방방방방';   // 일부러 어긋난 rotation
    setTurns(12);
    sent.length = 0; await app.run(false);
    const rot = lastCfg().team[0].rotation || '';
    if (!rot.startsWith('평평평궁평평궁') || rot.length !== 12) bad(`실행 계획이 원본에서 안 만들어짐: ${rot}`);
    else if (s0.plan.length !== 7) bad('실행용 이어 붙이기가 저장된 계획을 바꾸면 안 됨');
    else ok(`실행 계획 = 편집 원본 + 턴 수만큼 기본 주기(${rot})`);
    s0.usePlan = false;
    sent.length = 0; await app.run(false);
    if (lastCfg().team[0].rotation != null) bad('직접 계획을 끄면 rotation 을 보내면 안 됨');

    // ── 1-3 이태호 fed 선택: 계획 ON + 보이는 fed 턴만 ──
    app.setTeam([slot(TAEHO), slot(IMBU), null, null, null]);
    setTurns(12);
    const tae = app.team[0];
    tae.fedActions = { 4: '궁', 5: '방' };          // 임부언 궁 턴(자동 4·7·10) 중 4는 유효, 5는 옛 선택(숨김)
    sent.length = 0; await app.run(false);
    if (lastCfg().team[0].fedActions) bad(`직접 계획 OFF 인데 fedActions 가 실림: ${JSON.stringify(lastCfg().team[0].fedActions)}`);
    tae.usePlan = true; tae.plan = Array(24).fill('평');
    sent.length = 0; await app.run(false);
    const fa = lastCfg().team[0].fedActions || {};
    if (fa[4] !== '궁' || '5' in fa) bad(`fed 턴(4)만 실려야 함: ${JSON.stringify(fa)}`);
    else ok('이태호 fed 선택: 계획 OFF 면 안 보냄 · 숨은 옛 턴(5) 제외');

    // ── 1-4 욱영 「아군 필살 나중」은 직접 계획을 꺼도 보인다 ──
    app.setTeam([slot(RICANO), slot(UK), slot(FIGHTER), null, null]);
    await app.openModal(1);
    await waitFor(() => $('#usePlan'), '캐릭터 모달');
    const ukb = $('[data-ukafter]');
    if (!ukb || ukb.closest('[hidden]')) bad('직접 계획 OFF 에서 욱영 「아군 필살 나중」이 숨겨져 있음');
    else { click(ukb); if (!app.team[1].allyUltAfter) bad('욱영 토글 클릭 반영 실패'); else ok('욱영 「아군 필살 나중」: 계획 OFF 에서도 보이고 켜진다'); }
    app.closeCharModal(); await sleep(20);

    // ── 1-5 타임라인 ON: 제토 체이닝(x)은 굳지 않는다 ──
    app.setTeam([slot(ZETO), slot(RICANO), null, null, null]);
    setTurns(8);
    app.advTab = 'time'; app.openAdvPop();
    const card = await waitFor(() => $('.adv-card'), '고급 설정');
    await waitFor(() => app.advProbe && app.advProbe.plan, '프로브');
    const sw = $('#advSwitch', card) || $('#advSwitchWrap input', card);
    if (!sw) { bad('타임라인 사용 스위치를 못 찾음'); }
    else {
      change(sw, true); await sleep(50);
      await waitFor(() => app.advOn && Object.keys(app.turnPlans).length >= 8, '타임라인 채움', 30000);
      await app.advRefresh();
      const xs = Object.values(app.advProbe.plan).reduce((n, p) => n + p.seq.filter(e => e.x).length, 0);
      const planned = Object.values(app.turnPlans).reduce((n, seq) => n + seq.length, 0);
      const natural = Object.values(app.advProbe.plan).reduce((n, p) => n + p.seq.filter(e => !e.x).length, 0);
      if (planned !== natural) bad(`타임라인 항목 ${planned} ≠ 체이닝 제외 진행 ${natural} (x ${xs})`);
      else ok(`타임라인 ON: 체이닝 자동 행동 ${xs}개는 굳히지 않음(항목 ${planned})`);
      // ── 1-6 기준선: 모든 턴 ──
      const base = Object.keys(app.advPrevBudget).length;
      if (base < 8) bad(`예산 기준선이 모든 턴에 없어야 함: ${base}/8`);
      else ok('타임라인 예산 기준선 = 매 프로브 모든 턴');
      change(sw, false); await sleep(50);
    }
    app.closeAdv(); await sleep(30);

    // ════ 2단계: 설정 보존 ════
    const ALT = { on: true, floors: { 1: { on: true, off: [1012] }, 2: { on: true, off: [] }, 3: { on: false, off: [] } } };
    // 2-1 제단 OFF(null)는 층 구성을 지우지 않는다
    app.applyAltarSnap(ALT);
    app.applyAltarSnap(null);
    if (app.altarOn) bad('null 적용 후 제단은 꺼져야 함');
    else if (!app.altarCfg.floors[1].off[1012] || app.altarCfg.floors[3].on !== false) bad(`제단 OFF 가 층 구성을 지움: ${JSON.stringify(app.altarCfg.floors)}`);
    else ok('제단 OFF(옛 기록 불러오기 포함) → 층·제단 구성 보존');

    // 2-2 새로고침 = 작업 중 상태 그대로(기록 저장 후 바꾼 것까지)
    app.setTeam([slot(FIGHTER), slot(RICANO), null, null, null]);
    setTurns(9);
    app.applyAltarSnap(ALT);
    app.applySyncSnap([{ anchor: 1, members: [{ p: 2 }], miss: 'wait' }]);
    await app.run(true);                                   // 기록 1건
    app.setTeam([slot(FIGHTER), slot(RICANO), slot(UK), null, null]);   // 기록 뒤 편집
    app.team[0].usePlan = true; app.team[0].plan = '평평평궁평평궁평평궁'.split('');
    setTurns(11);
    await reload();
    await sleep(100);
    const ids = app.team.map(t => t && t.id);
    if (ids[2] !== UK || +$('#turns').value !== 11 || !app.team[0].usePlan || app.team[0].plan.join('') !== '평평평궁평평궁평평궁') bad(`새로고침 후 작업 상태 유실: ${JSON.stringify(ids)} 턴=${$('#turns').value}`);
    else if (!app.altarOn || !app.altarCfg.floors[1].off[1012] || !app.syncGroups.length) bad('새로고침 후 제단·연동이 기록 값으로 덮어써짐');
    else ok('새로고침 → 마지막 작업 상태 그대로(편성·턴·계획·제단·연동)');

    // 2-3 기록 불러오기 → 되돌리기
    const rec = { id: 1, label: 'old', snap: { team: [slot(RICANO), null, null, null, null], turns: 5, dummies: 1, enemyHits: 'all', dummyElement: 0, runs: 1, forceProc: false, hp10: false, turnOverrides: {}, incomingOn: false, incomingPct: 0, advOn: false, turnPlans: {} } };
    app.restoreRecord(rec, true);
    await sleep(100);
    if (app.syncGroups.length || app.altarOn || app.team[0].id !== RICANO) bad('옛 기록 조건(연동 없음·제단 OFF·편성)이 적용돼야 함');
    const undoBtn = $('#toast .toast-act');
    if (!undoBtn) bad('기록 불러오기 후 되돌리기 버튼이 없음');
    else {
      click(undoBtn); await sleep(100);
      if (app.team[2] && app.team[2].id === UK && app.altarOn && app.syncGroups.length && +$('#turns').value === 11) ok('기록 불러오기 → 되돌리기로 직전 상태(편성·제단·연동·턴) 복구');
      else bad(`되돌리기 실패: ${JSON.stringify(app.team.map(t => t && t.id))} altar=${app.altarOn} sync=${app.syncGroups.length}`);
    }

    // 2-4 캐릭터 창을 여는 것만으로 계획이 바뀌지 않는다(402 켜고 열고 끄기)
    app.applySyncSnap(null);
    const orig = app.team[0].plan.join('');
    const ALT402 = { on: true, floors: { 1: { on: true, off: [402] }, 2: { on: false, off: [] }, 3: { on: false, off: [] } } };
    app.applyAltarSnap(ALT402);
    await app.openModal(0); await waitFor(() => $('#planner .pcell'), '플래너');
    const shown = [...d.querySelectorAll('#planner .pcell')].map(c => (c.querySelector('button.on') || {}).textContent).join('');
    app.closeCharModal(); await sleep(20);
    if (app.team[0].plan.join('') !== orig) bad(`402 상태로 창을 열었더니 저장된 계획이 바뀜: ${app.team[0].plan.join('')}`);
    else if (shown.startsWith(orig)) bad('402(쿨+1) 상태 화면은 실제대로(밀린 궁) 보여야 함');
    else ok(`402 켜고 창 열기 → 화면만 실제대로(${shown.slice(0, 9)}…), 저장 계획 보존`);
    app.applyAltarSnap(null);
    await app.openModal(0); await waitFor(() => $('#planner .pcell'), '플래너');
    const shown2 = [...d.querySelectorAll('#planner .pcell')].map(c => (c.querySelector('button.on') || {}).textContent).join('');
    if (!shown2.startsWith(orig)) bad(`402 해제 후 원래 계획이 돌아와야 함: ${shown2}`);
    else ok('402 해제 → 원래 계획(4·7·10) 그대로 표시');
    click(d.querySelector('#planner button[data-idx="0"][data-a="방"]')); await sleep(30);
    if (app.team[0].plan[0] !== '방' || app.team[0].plan.slice(1, 10).join('') !== orig.slice(1)) bad(`칸 편집 저장 이상: ${app.team[0].plan.join('')}`);
    else ok('칸을 누르면 그 편집이 저장된다');
    app.closeCharModal(); await sleep(20);

    // ════ 3단계: 편성 변경 추종 ════
    app.applyAltarSnap(null); app.applySyncSnap(null);
    app.setTeam([slot(FIGHTER), slot(RICANO), slot(UK), null, null]);
    app.team[1].ult = { mode: 'asap', keepDef: true };
    app.team[1].usePlan = true; app.team[1].plan = Array(10).fill('방');
    app.applySyncSnap([{ anchor: 2, members: [{ p: 1 }, { p: 3, order: 'after' }], miss: 'wait' }]);
    // 3-1 앵커 빼기 → 그룹 해제 + 알림 / 같은 캐릭터를 다른 자리로 다시 넣기 → 설정·그룹 복원
    app.removeFromTeam(1);
    if (app.syncGroups.length) bad('앵커가 빠졌는데 연동 그룹이 남음(빈 자리에 묶임)');
    else if (!/앵커가 빠져/.test($('#toast').textContent)) bad('앵커 해제 알림 없음');
    else ok('앵커를 빼면 그 그룹 해제 + 알림');
    click($('#teamSlots .slot[data-i="4"]'));              // 빈 P5 를 누르고
    app.pick(RICANO);                                        // 리카노를 다시 넣으면 P5 로
    if (!app.team[4] || app.team[4].id !== RICANO) bad(`빈 슬롯(P5)을 누른 뒤 고른 캐릭터가 P5 로 가야 함: ${JSON.stringify(app.team.map(t => t && t.id))}`);
    else if (!app.team[4].ult || app.team[4].ult.mode !== 'asap' || !app.team[4].usePlan) bad('다시 넣은 캐릭터의 설정(궁 방식·계획)이 복원되지 않음');
    else if (!app.syncGroups.length || app.syncGroups[0].anchor !== 5 || app.syncGroups[0].members.length !== 2) bad(`연동 그룹 복원 실패: ${JSON.stringify(app.syncGroups)}`);
    else ok('누른 빈 슬롯(P5)에 배치 · 같은 캐릭터 재투입 → 궁 방식·계획·연동(앵커 P5) 복원');
    // 3-2 멤버 빼기/넣기
    app.removeFromTeam(2);                                   // 욱영(멤버, after)
    if (app.syncGroups[0].members.some(m => m.p === 3)) bad('뺀 멤버가 그룹에 남음');
    app.pick(UK);
    const um = app.syncGroups[0].members.find(m => m.p === app.team.findIndex(t => t && t.id === UK) + 1);
    if (!um || um.order !== 'after') bad(`멤버 복원 실패: ${JSON.stringify(app.syncGroups)}`);
    else ok('멤버를 빼면 그룹에서만 빠지고, 다시 넣으면 옵션(뒤에)까지 복원');
    // 3-3 우선순위를 정해 둔 팀: 새 캐릭터는 맨 뒤
    app.team.forEach((t, i) => { if (t) t.priority = i + 1; });
    const bardIdx = app.team.findIndex(t => !t);
    app.pick(10413);
    const nb = app.team.find(t => t && t.id === 10413);
    const maxOther = Math.max(...app.team.filter(t => t && t.id !== 10413).map(t => t.priority));
    if (!nb || !(nb.priority > maxOther)) bad(`사용자 순서가 있는 팀에서 새 캐릭터는 맨 뒤여야 함: ${nb && nb.priority} vs ${maxOther}`);
    else ok('행동 우선순위를 정해 둔 팀 → 새 캐릭터는 맨 뒤');
    // 3-4 특정 턴 순서: 새 캐릭터 자리가 붙는다 / 뺀 자리는 빠진다
    app.turnOverrides = { 3: [1, 5, 3] };
    app.removeFromTeam(bardIdx);
    const ov = app.turnOverrides[3];
    if (ov.includes(bardIdx + 1)) bad('뺀 자리가 특정 턴 순서에 남음');
    app.pick(10413);
    const posB = app.team.findIndex(t => t && t.id === 10413) + 1;
    if (!app.turnOverrides[3].includes(posB)) bad(`새 캐릭터 자리가 특정 턴 순서에 없음: ${JSON.stringify(app.turnOverrides)}`);
    else ok('특정 턴 순서: 뺀 자리 제거 · 새 자리 맨 뒤에 추가');
    app.turnOverrides = {};
    app.team.forEach(t => { if (t) delete t.priority; });
    app.applySyncSnap(null);

    // 3-5 타임라인 ON 에서 편성 교체 → 자동 턴은 새 편성으로, 편집 턴은 빠진 자리만 걷고 알림
    app.setTeam([slot(FIGHTER), slot(RICANO), null, null, null]);
    app.team.forEach(t => { if (t) { delete t.usePlan; delete t.ult; } });
    setTurns(6);
    app.resetAdv();                                                // 앞 검사에서 남은 타임라인 보관분 정리
    app.advTab = 'time'; app.openAdvPop();
    const card2 = await waitFor(() => $('.adv-card'), '고급 설정');
    await waitFor(() => app.advProbe && app.advProbe.plan, '프로브');
    change($('#advSwitch', card2), true);
    await waitFor(() => app.advOn && Object.keys(app.turnPlans).length >= 6, '타임라인 채움');
    app.closeAdv(); await sleep(30);
    app.advCommitAt(2, [{ p: 2, a: '평' }, { p: 1, a: '방' }]);   // 2턴 직접 편집
    app.removeFromTeam(1);                                         // 리카노 빼고
    app.pick(UK);                                                  // 욱영을 P2 로
    if (app.turnPlans[2].some(e => e.p === 2)) bad('편집 턴에 뺀 자리(P2) 행동이 남음 — 새 캐릭터가 물려받게 됨');
    if (app.turnPlans[4]) bad('자동으로 채운 턴은 편성 교체 시 비워져야 함(새 편성으로 다시 채움)');
    setTurns(8);                                                    // 턴도 늘림
    sent.length = 0; await app.run(false);
    const tp = lastCfg().turnPlans;
    const auto4 = (tp[4] || []).map(e => e.p), all8 = [1, 2, 3, 4, 5, 6, 7, 8].every(t => tp[t]);
    if (!auto4.includes(2) || !all8) bad(`실행 전 빈 턴 채움 실패: 4턴=${JSON.stringify(tp[4])} 전 턴=${all8}`);
    else if (!/직접 편집한 턴에 .*의 행동이 없어요/.test($('#toast').textContent)) bad(`편집 턴 누락 알림 없음: ${$('#toast').textContent}`);
    else ok('타임라인: 자동 턴은 새 편성으로 · 편집 턴은 빠진 자리만 제거 + 실행 시 알림 · 늘린 턴도 채움');
    app.advTab = 'time'; app.openAdvPop();
    const card3 = await waitFor(() => $('.adv-card'), '고급 설정');
    change($('#advSwitch', card3), false); await sleep(50);
    app.closeAdv(); await sleep(30);

    // ════ 4단계: 자동 변경 억제 · 되돌리기 ════
    const MATAYA = 10442;
    app.setTeam([slot(MATAYA), slot(RICANO), null, null, null]);
    setTurns(12);
    const ultsOf = (plan) => plan.map((a, i) => (a === '궁' ? i + 1 : 0)).filter(t => t && t <= 12);
    await app.openModal(0);
    change(await waitFor(() => $('#usePlan'), '모달'), true); await sleep(30);
    click($('#planner button[data-idx="0"][data-a="방"]')); await sleep(20);      // 수동 편집 1칸(1턴 방어)
    const manual = app.team[0].plan.join('');
    const u3 = $('.plan-fill [data-u3]');
    click(u3); await sleep(30);                                                    // 3턴궁 켜기
    if (ultsOf(app.team[0].plan).join(',') !== '4,7,10') bad(`3턴궁 적용 이상: ${ultsOf(app.team[0].plan)}`);
    // 4-1 편집된 계획에서 궁 클릭 → 그 칸만
    click($('#planner button[data-idx="4"][data-a="궁"]')); await sleep(30);
    if (ultsOf(app.team[0].plan).join(',') !== '4,5,7,10') bad(`궁 클릭이 다른 궁을 옮김: ${ultsOf(app.team[0].plan)}`);
    else ok('편집된 계획에서 궁 클릭 → 누른 칸만 바뀜(4·5·7·10)');
    // 4-2 같은 값 재클릭 = 변화 없음
    const pBefore = app.team[0].plan.join('');
    click($('#planner button[data-idx="3"][data-a="궁"]')); await sleep(30);
    if (app.team[0].plan.join('') !== pBefore) bad('이미 궁인 칸을 다시 누르면 아무것도 바뀌지 않아야 함');
    else ok('이미 궁인 칸 재클릭 → 변화 없음');
    // 4-3 칸 편집 뒤 3턴궁 표시 해제 → 다시 누르면 재적용이 아니라 해제가 아니어야… : 표시는 실제 계획을 따른다
    if ($('.plan-fill [data-u3]').classList.contains('on')) bad('칸을 고친 뒤에도 3턴궁 켜짐 표시가 남음');
    else ok('칸 편집 → 3턴궁 켜짐 표시가 실제 계획대로 꺼짐');
    // 3턴궁을 다시 켰다 끄면 켜기 직전 계획(수동 편집 포함)으로
    const beforePreset = app.team[0].plan.join('');
    click($('.plan-fill [data-u3]')); await sleep(30);
    click($('.plan-fill [data-u3]')); await sleep(30);
    if (app.team[0].plan.join('') !== beforePreset) bad(`프리셋 끄기 → 직전 계획 복원 실패: ${app.team[0].plan.join('')}`);
    else ok('프리셋 켰다 끄기 → 켜기 직전 계획 그대로(수동 편집 보존)');
    // 4-4 궁 간격 맞추기
    app.team[0].plan = '평평평궁평평평평평궁평평'.split('').concat(Array(18).fill('평'));
    app.closeCharModal(); await sleep(20);
    app.setTeam([slot(FIGHTER), slot(RICANO), null, null, null]);
    app.team[0].usePlan = true; app.team[0].plan = '평평평궁평평평평평궁평평'.split('').concat(Array(18).fill('평'));
    await app.openModal(0); await waitFor(() => $('#planner .pcell'), '플래너');
    click($('.plan-fill [data-reflow]')); await sleep(30);
    if (ultsOf(app.team[0].plan).join(',') !== '4,7') bad(`궁 간격 맞추기: 4,7 기대, ${ultsOf(app.team[0].plan)}`);
    else ok('궁 간격 맞추기 → 첫 궁 유지 · 이후 쿨 주기(4·7), 개수 유지');
    app.closeCharModal(); await sleep(20);
    // 4-5 첫 궁 당기기: 켤 때 켠 가정은 끌 때 함께 꺼진다
    app.applyAltarSnap({ on: true, floors: { 1: { on: true, off: [] }, 2: { on: false, off: [] }, 3: { on: false, off: [] } } });
    await app.openModal(0); await waitFor(() => $('.plan-fill [data-early]'), '첫 궁 당기기');
    click($('.plan-fill [data-early]')); await sleep(30);
    const onA = app.ultOf(app.team[0]).assist;
    click($('.plan-fill [data-early]')); await sleep(30);
    if (!onA || app.ultOf(app.team[0]).assist) bad(`첫 궁 당기기 켜기/끄기에 가정이 따라가야 함: ${onA} → ${app.ultOf(app.team[0]).assist}`);
    else ok('첫 궁 당기기 끄기 → 함께 켰던 확률 쿨 감소 가정도 꺼짐');
    app.closeCharModal(); await sleep(20);
    app.applyAltarSnap(null);

    // 4-6 연동: 앵커 없음 → 되돌리기 / 행동 종류 바꿔도 '그 밖의 턴' 유지 / 프리셋 되돌리기
    app.setTeam([slot(RICANO), slot(UK), slot(FIGHTER), null, null]);
    app.applySyncSnap([{ anchor: 2, members: [{ p: 1, base: 'basic', other: 'hold' }], miss: 'wait' }]);   // 직접 고른 '궁 아끼기'
    app.advTab = 'sync'; app.openAdvPop();
    await waitFor(() => $('.adv-card .adv-pane-sync .as-group'), '연동 탭');
    click($('.adv-card [data-sbase="defend"][data-p="1"]')); await sleep(80);
    const m1 = app.syncGroups[0].members[0];
    if ((m1.other || 'own') !== 'hold') bad(`행동 종류 변경으로 직접 고른 '그 밖의 턴'이 바뀜: ${JSON.stringify(m1)}`);
    else ok("연동 멤버 행동 종류를 바꿔도 직접 고른 '그 밖의 턴'(궁 아끼기) 유지");
    change($('.adv-card [data-anchor="0"]'), '0'); await sleep(80);
    if (app.syncGroups.length) bad('앵커 없음 → 그룹 해제돼야 함');
    const ub = $('#toast .toast-act');
    if (!ub) bad('그룹 해제 되돌리기 버튼 없음');
    else { click(ub); await sleep(80); if (app.syncGroups.length !== 1 || app.syncGroups[0].anchor !== 2) bad('그룹 해제 되돌리기 실패'); else ok('앵커 없음(그룹 해제) → 되돌리기로 복구'); }
    app.closeAdv(); await sleep(30);

    // 4-7 일괄 버튼 되돌리기
    app.applyAltarSnap({ on: true, floors: { 1: { on: true, off: [] }, 2: { on: false, off: [] }, 3: { on: false, off: [] } } });
    app.applySyncSnap(null);
    app.team[0].ult = { mode: 'strict', keepDef: true };
    app.advTab = 'ult'; app.openAdvPop();
    click(await waitFor(() => $('.adv-card [data-ultall="asap"]'), '일괄 버튼')); await sleep(80);
    if (app.ultOf(app.team[0]).mode !== 'asap') bad('일괄 asap 적용 실패');
    click(await waitFor(() => $('#toast .toast-act'), '되돌리기')); await sleep(80);
    if (app.ultOf(app.team[0]).mode !== 'strict' || app.ultOf(app.team[1]).mode !== 'fixed') bad(`일괄 되돌리기 실패: ${app.ultOf(app.team[0]).mode}`);
    else ok("궁극기 사용 방식 일괄 버튼 → 되돌리기로 캐릭터별 선택 복구");
    app.closeAdv(); await sleep(30);
    app.applyAltarSnap(null); delete app.team[0].ult;

    // 4-8 탭 기억: 캐릭터 창 바로가기(궁극기 탭)는 다음 메인 버튼에 남지 않는다
    app.advTab = 'time';
    click($('[data-advtab]') || d.body);
    await app.openModal(0);
    click(await waitFor(() => $('[data-advopen="ult"]'), '바로가기')); await sleep(50);
    if (app.advTabNow !== 'ult') bad('바로가기는 궁극기 탭으로 열어야 함');
    app.closeAdv(); await sleep(30);
    click($('#advOpen')); await sleep(50);
    if (app.advTabNow !== 'time') bad(`메인 버튼이 바로가기 탭(ult)에 묶임: ${app.advTabNow}`);
    else ok('바로가기로 연 탭은 기억하지 않음 → 메인 버튼은 사용자가 고른 탭(타임라인)');
    app.closeAdv(); await sleep(30);

    // ════ 5단계: 비교하기 격리 ════
    app.applySyncSnap([{ anchor: 1, members: [{ p: 2 }], miss: 'wait' }]);   // 메인 연동
    const mainSync = JSON.stringify(app.syncGroups), mainStore = window.localStorage.getItem('woofia_sync');
    const recA = { id: 7001, label: 'A', snap: { team: [slot(RICANO), slot(UK), slot(FIGHTER), null, null], turns: 13, turnOverrides: { 2: [3, 2, 1] },
      sync: [{ anchor: 2, members: [{ p: 3, base: 'defend' }], miss: 'wait' }], turnPlans: {}, advOn: false } };
    app.loadCmpTeam('a', recA);
    // 5-1 비교군 연동 = 그 기록의 연동, 비교 화면에서 고쳐도 메인 연동은 그대로
    const cA = app.cfgFromTeam('a', { turns: 13, runs: 1 });
    if (!cA.sync || cA.sync[0].anchor !== 2) bad(`비교군 A 연동이 기록 값이 아님: ${JSON.stringify(cA.sync)}`);
    app.openAdvFor('a'); app.advTab = 'sync';
    await waitFor(() => $('.adv-card .adv-pane-sync .as-group'), '비교군 연동 탭');
    change($('.adv-card [data-anchor="0"]'), '0'); await sleep(100);
    app.closeAdv(); await sleep(50);
    if (JSON.stringify(app.syncGroups) !== mainSync || window.localStorage.getItem('woofia_sync') !== mainStore) bad('비교 화면 연동 편집이 메인 연동/저장값을 바꿈');
    else if (app.cmpSync.a.length) bad(`비교군 A 연동 편집(해제)이 반영되지 않음: ${JSON.stringify(app.cmpSync.a)}`);
    else ok('비교군 연동 = 기록 값 · 비교 화면 편집은 그 비교군에만(메인 연동·저장값 불변)');
    // 5-2 자리 교체: 특정 턴 순서·연동·타임라인이 캐릭터를 따라간다 · 임부언 1번 금지
    app.loadCmpTeam('a', recA);
    app.cmpAdv.a = { 1: [{ p: 2, a: '궁' }, { p: 3, a: '평' }] };
    app.cmpSwapSlots('a', 1, 2);                       // P2 욱영 ↔ P3 파이터
    const sA = app.cmpSync.a[0], adv1 = app.cmpAdv.a[1];
    if (app.cmpTeam.a[1].id !== FIGHTER || sA.anchor !== 3 || sA.members[0].p !== 2 || adv1[0].p !== 3 || app.cmpTurnOv.a[2].join(',') !== '2,3,1')
      bad(`자리 교체 추종 실패: team=${app.cmpTeam.a.map(t => t && t.id)} sync=${JSON.stringify(sA)} adv=${JSON.stringify(adv1)} ov=${app.cmpTurnOv.a[2]}`);
    else ok('비교군 자리 교체 → 특정 턴 순서·연동·타임라인이 캐릭터를 따라감');
    app.cmpTeam.a[1] = slot(IMBU);
    if (app.cmpSwapSlots('a', 0, 1) || app.cmpTeam.a[0].id === IMBU) bad('임부언을 1번 자리로 옮길 수 있음');
    else ok('비교군 자리 교체도 임부언 1번 자리 금지');
    // 5-3 도장 강화 팝업: 열기만 해서는 값·변경됨 표시가 바뀌지 않는다
    app.cmpPending = false;
    const cfgF = app.cmpTeam.a[2]; delete cfgF.sealAtk; delete cfgF.sealHp;
    app.openSealPop({ id: cfgF.id, name: 'x', cfg: cfgF, side: 'a', slotIdx: 2 });
    await sleep(30);
    if (app.cmpPending || 'sealAtk' in cfgF) bad(`도장 팝업을 열기만 했는데 값/변경됨이 바뀜: pending=${app.cmpPending} seal=${cfgF.sealAtk}`);
    else ok('비교 도장 강화 팝업: 열기만 하면 값·변경됨 표시 그대로');
    d.querySelector('.sealpop')?.remove();
    // 5-4 비교 팝업 플래너: 프리셋은 기록 계획 길이(30) 유지 · 끄면 직전 계획
    app.cmpCommonTurns = 13;
    const cf2 = app.cmpTeam.a[2];
    cf2.usePlan = true; cf2.plan = Array(30).fill('평'); cf2.plan[0] = '방'; cf2.plan[20] = '방';
    app.openPlanPopup({ id: cf2.id, name: 'x', cfg: cf2, side: 'a', slotIdx: 2, position: 3 });
    await waitFor(() => $('#ppGrid .pp-cell'), '비교 플래너');
    click($('#ppRules [data-fill="방"]')); await sleep(30);
    if (cf2.plan.length < 30) bad(`비교 플래너 채우기가 계획을 ${cf2.plan.length}턴으로 자름`);
    else ok(`비교 플래너 채우기 → 계획 길이 유지(${cf2.plan.length})`);
    d.querySelector('.planpop')?.remove();
    // 5-5 제단 켜짐 → 비교하기도 100% 모드 불가
    $('#cmpForce').classList.add('on'); app.cmpCommon.forceProc = true;
    app.applyAltarSnap({ on: true, floors: { 1: { on: true, off: [] }, 2: { on: false, off: [] }, 3: { on: false, off: [] } } });
    const cF = app.cfgFromTeam('a', { turns: 13, runs: 5 });
    if (cF.forceProc || !$('#cmpForce').disabled) bad(`제단 ON 인데 비교하기 100% 모드: ${cF.forceProc} disabled=${$('#cmpForce').disabled}`);
    else ok('제단 ON → 비교하기도 100% 모드 잠금(메인과 같은 규칙)');
    app.applyAltarSnap(null); app.applySyncSnap(null);
  } catch (e) {
    bad(`예외: ${e.stack || e}`);
  }
  finish();
}
function finish() {
  console.log(steps.join('\n'));
  console.log(errors.length ? `\n실패 ${errors.length}건` : '\n설정 보존·자동 변경 검수 통과');
  process.exit(errors.length ? 1 : 0);
}
main();
