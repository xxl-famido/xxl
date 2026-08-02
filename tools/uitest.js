/**
 * 대시보드 UI 런타임 검사 — jsdom으로 실제 app.js를 띄워 조작해 본다.
 *
 * `node --check`는 문법만 본다. 마크업이 조용히 안 들어가 `$('#x').textContent`가
 * null 참조로 죽는 류의 오류는 실행해 봐야만 잡힌다(실제로 두 번 겪음). 이 도구는
 * 로컬 서버(server.py, 8777)에 붙어 진짜 API로 초기화한 뒤 고급 설정을 조작한다.
 *
 *   npm install --no-save jsdom   # 최초 1회 (저장소에 남기지 않는 개발 의존성)
 *   python server.py &            # 로컬 서버를 띄우고
 *   node tools/uitest.js          # 실행 (실패 1 · jsdom 없음 2)
 *
 * 새 UI 기능을 넣으면 여기 시나리오도 같이 늘릴 것.
 */
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch {
  console.log('jsdom이 없습니다 — `npm install --no-save jsdom` 후 다시 실행하세요.');
  process.exit(2);
}
const fs = require('fs');
const path = require('path');

const BASE = process.env.UITEST_BASE || 'http://localhost:8777';
const DASH = path.join(__dirname, '..', 'dashboard');

const errors = [];
const steps = [];
const ok = (m) => steps.push('  ✓ ' + m);
const bad = (m) => { errors.push(m); steps.push('  ✗ ' + m); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, timeout = 20000) {
  const t0 = Date.now();
  for (;;) {
    let v;
    try { v = fn(); } catch { v = null; }
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`시간 초과: ${label}`);
    await sleep(50);
  }
}

async function main() {
  const html = fs.readFileSync(path.join(DASH, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: BASE + '/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;

  // 런타임 오류를 전부 수집 — 이게 이 도구의 존재 이유다
  window.addEventListener('error', (e) => bad(`window error: ${e.error && e.error.stack || e.message}`));
  window.addEventListener('unhandledrejection', (e) => bad(`unhandled rejection: ${e.reason}`));

  // 상대 URL fetch를 로컬 서버로 넘긴다 (jsdom은 fetch를 구현하지 않는다)
  window.fetch = (u, o) => fetch(new URL(u, BASE).href, o);
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  // Worker는 정적 배포 경로 전용 — 로컬(8777)에서는 fetch 경로를 타므로 스텁으로 충분
  window.Worker = function () { throw new Error('worker unused on local'); };

  // app.js의 최상위 선언은 const/let이라 eval 스코프에 갇힌다 → 같은 스코프에서 통로를 연다.
  const probe = `
    ;window.__app = {
      get CHARS(){return CHARS}, get team(){return team},
      get turnPlans(){return turnPlans}, get advSel(){return advSel}, set advSel(v){advSel=v},
      get advClip(){return advClip}, get advSelSet(){return advSelSet},
      get advTouched(){return advTouched}, get advUndo(){return advUndo},
      get advOn(){return advOn}, renderAdv(){ return renderAdv(); },
      get advTeamSig(){return advTeamSig}, get advScope(){return advScope},
      get cmpAdv(){return cmpAdv}, set cmpTeam(v){cmpTeam=v}, get cmpTeam(){return cmpTeam},
      get cmpCommon(){return cmpCommon}, openAdvFor(x){return openAdvFor(x)},
      openPrioPop(x){return openPrioPop(x)},
      openModal(i){return openModal(i)}, specOn(s){return specOn(s)},
      openSpecPanel(i){return openSpecPanel(i)}, run(x){return run(x)},
      get lastResult(){return lastResult},
      specAtkHp(s){return specAtkHp(s)}, specPayload(s){return specPayload(s)},
      packSlot(s){return packSlot(s)}, unpackSlot(a){return unpackSlot(a)},
      promoteLegacySpec(s){return promoteLegacySpec(s)},
      openCmpInfo(c){return openCmpInfo(c)}, cfgFromTeam(s,n){return cfgFromTeam(s,n)},
      get cmpAdvOn(){return cmpAdvOn}
    };`;
  // spec.js 가 먼저 올라와야 app.js 의 스펙 계산이 SPEC 을 찾는다 (index.html 과 같은 순서)
  window.eval(fs.readFileSync(path.join(DASH, 'spec.js'), 'utf8'));
  const code = fs.readFileSync(path.join(DASH, 'app.js'), 'utf8');
  try {
    window.eval(code + probe);
  } catch (e) {
    bad(`app.js 로드 실패: ${e.stack}`);
    return finish();
  }
  ok('app.js 로드');
  const A = window.__app;

  const $ = (s) => window.document.querySelector(s);
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  await waitFor(() => Object.keys(A.CHARS || {}).length, '캐릭터 메타 로드');
  ok(`캐릭터 메타 ${Object.keys(A.CHARS).length}종 로드`);
  await waitFor(() => A.team && A.team.filter(Boolean).length >= 3, '기본 팀 구성');
  ok(`기본 팀 ${A.team.filter(Boolean).length}명`);

  // ── 고급 설정 열기
  const openBtn = await waitFor(() => $('#advOpen'), '고급 설정 버튼');
  click(openBtn);
  const card = await waitFor(() => $('.adv-card'), '고급 설정 팝업');
  ok('팝업 열림');

  for (const id of ['#advSwitch', '#advCopy', '#advPaste', '#advPasteAll', '#advUndoBtn',
                    '#advGridBtn', '#advResetSel', '#advResetAll', '#advResetTurn']) {
    if (!$(id)) bad(`컨트롤 없음: ${id}`);
  }
  if (!errors.length) ok('컨트롤 9종 존재');

  // ── 스위치 ON → 전 턴 채움
  $('#advSwitch').checked = true;
  $('#advSwitch').dispatchEvent(new window.Event('change'));
  await waitFor(() => Object.keys(A.turnPlans || {}).length > 0, '전 턴 채움');
  const nTurns = +$('#turns').value;
  const filled = Object.keys(A.turnPlans).length;
  filled === nTurns ? ok(`전 턴 채움 ${filled}/${nTurns}`) : bad(`전 턴 채움 불완전 ${filled}/${nTurns}`);

  await waitFor(() => $('.adv-track').children.length, '타임라인 렌더');
  ok(`타임라인 ${$('.adv-track').children.length}행 렌더`);
  $('.adv-rail').children.length === nTurns
    ? ok(`레일 ${nTurns}턴`) : bad(`레일 개수 ${$('.adv-rail').children.length} ≠ ${nTurns}`);
  $('.adv-add').children.length ? ok('행동 추가 버튼 렌더') : bad('행동 추가 영역이 비어 있음');
  $('.adv-turnhead b').textContent ? ok(`턴 헤더 "${$('.adv-turnhead b').textContent}"`) : bad('턴 헤더 비어 있음');

  // ── 행동 변경
  const before = JSON.stringify(A.turnPlans[A.advSel]);
  const actBtn = $('.adv-track .acts button:not(.on):not([disabled])');
  if (!actBtn) bad('바꿀 수 있는 행동 버튼이 없음');
  else {
    click(actBtn);
    await sleep(400);
    JSON.stringify(A.turnPlans[A.advSel]) !== before
      ? ok('행동 변경 반영') : bad('행동 변경이 반영되지 않음');
  }

  // ── 되돌리기
  if (!$('#advUndoBtn').disabled) {
    click($('#advUndoBtn'));
    await sleep(400);
    JSON.stringify(A.turnPlans[A.advSel]) === before
      ? ok('되돌리기 복원') : bad('되돌리기가 원상복구하지 못함');
  } else bad('편집 후에도 되돌리기 버튼이 비활성');

  // ── 복사 → 클립보드 표시
  const ultTurn = Object.keys(A.turnPlans).map(Number)
    .find((t) => (A.turnPlans[t] || []).some((e) => e.a === '궁')) || 1;
  A.advSel = ultTurn; A.renderAdv();
  click($('#advCopy'));
  await sleep(200);
  A.advClip ? ok(`복사 (${ultTurn}턴 ${A.advClip.seq.length}행동)`) : bad('복사되지 않음');
  !$('.adv-clip').hidden ? ok('클립보드 표시줄 노출') : bad('클립보드 표시줄이 숨겨짐');

  // ── 인접 턴 붙여넣기: 궁 쿨이 안 차므로 '거부되고 계획이 그대로'여야 한다
  const nextT = ultTurn + 1 <= nTurns ? ultTurn + 1 : 1;
  A.advSel = nextT; A.renderAdv();
  const nextBefore = JSON.stringify(A.turnPlans[nextT]);
  click($('#advPaste'));
  await sleep(1200);
  const clipStr = JSON.stringify(A.advClip.seq);
  if (JSON.stringify(A.turnPlans[nextT]) === clipStr) bad(`${nextT}턴 붙여넣기가 거부되지 않음(쿨 미충족인데 적용됨)`);
  else if (JSON.stringify(A.turnPlans[nextT]) === nextBefore) ok(`${nextT}턴 붙여넣기 거부 + 계획 보존`);
  else bad(`${nextT}턴 거부됐지만 계획이 변형됨`);

  // ── 호환 턴 전부 체크: 붙여넣지 않고 '선택'만 되어야 한다
  const planBeforeCheck = JSON.stringify(A.turnPlans);
  click($('#advPasteAll'));
  await waitFor(() => !$('#advPasteAll').disabled, '호환 턴 탐색 완료', 120000);
  await sleep(600);
  JSON.stringify(A.turnPlans) === planBeforeCheck
    ? ok('호환 턴 체크 — 타임라인은 아직 그대로') : bad('체크만 눌렀는데 붙여넣기가 실행됨');
  A.advSelSet && A.advSelSet.size
    ? ok(`호환 턴 ${A.advSelSet.size}개 선택됨 (${[...A.advSelSet].sort((a,b)=>a-b).join('·')})`)
    : bad('호환 턴이 선택되지 않음');
  !$('.adv-selbar').hidden ? ok('선택 표시줄 노출') : bad('선택 표시줄이 숨겨짐');

  // 이제 붙여넣기를 눌러야 실제로 적용된다
  click($('#advPaste'));
  await sleep(2000);
  const hit = Object.keys(A.turnPlans).map(Number)
    .filter((t) => JSON.stringify(A.turnPlans[t]) === clipStr).sort((a, b) => a - b);
  if (hit.length < 2) bad(`호환 턴 전부에: 적용된 턴 ${hit.length}개 (2개 미만)`);
  else {
    const gaps = [...new Set(hit.slice(1).map((t, i) => t - hit[i]))];
    ok(`호환 턴 전부에 → ${hit.join('·')}턴 (간격 ${gaps.join('/')})`);
    gaps.length === 1 ? ok(`주기 일정 (${gaps[0]}턴)`) : steps.push(`  · 간격이 균일하지 않음 ${gaps.join('/')} (쿨 변동 캐릭이면 정상)`);
  }

  // ── 전체 보기 격자
  click($('#advGridBtn'));
  await sleep(300);
  const grid = $('.adv-grid');
  if (!grid || $('.adv-gridwrap').hidden) bad('전체 보기 격자가 렌더되지 않음');
  else {
    const rows = grid.querySelectorAll('.g-row').length;
    const ults = grid.querySelectorAll('i.g-ult').length;
    const cols = grid.querySelectorAll('.g-head b').length;
    rows === A.team.filter(Boolean).length && cols === nTurns && ults > 0
      ? ok(`전체 보기 격자 ${rows}행 × ${cols}턴 · 필살 표시 ${ults}개`)
      : bad(`격자 구성 이상 (행 ${rows} / 열 ${cols} / 필살 ${ults})`);
  }
  // ── 격자 칸 편집기: 칸을 눌러 그 캐릭터의 그 턴 행동을 바꾼다
  const cellEl = $('.adv-grid .g-row u[data-gp]');
  if (!cellEl) bad('격자 칸(data-gp)이 없음');
  else {
    click(cellEl);
    await sleep(500);
    const cp = $('.adv-cellpop');
    if (!cp) bad('칸 편집기가 열리지 않음');
    else {
      ok(`칸 편집기 열림 (${cp.querySelector('.cp-head b').textContent} ${cp.querySelectorAll('.cp-row').length}행동)`);
      cp.querySelector('.cp-bud') ? ok(`행동 횟수 표시 "${cp.querySelector('.cp-bud').textContent.trim()}"`)
                                  : bad('행동 횟수 표시 없음');
      const pos = +cellEl.dataset.gp, turn = +cellEl.dataset.gt;
      const was = JSON.stringify((A.turnPlans[turn] || []).filter(e => e.p === pos));
      const swap = cp.querySelector('.cp-row button[data-cpa]:not(.on):not([disabled])');
      if (!swap) bad('칸 편집기에서 바꿀 수 있는 행동이 없음');
      else {
        click(swap);
        await sleep(1200);
        JSON.stringify((A.turnPlans[turn] || []).filter(e => e.p === pos)) !== was
          ? ok('칸 편집기에서 행동 변경 반영') : bad('칸 편집기 변경이 반영되지 않음');
        $('.adv-cellpop') ? ok('변경 후에도 편집기 유지') : bad('변경 후 편집기가 사라짐');
      }
      // 예산 초과 방지: 남은 행동이 없으면 추가 버튼이 잠겨야 한다
      const add = $('.adv-cellpop .cp-add');
      const budTxt = $('.adv-cellpop .cp-bud').textContent;
      const [used, cap] = budTxt.replace(/[^0-9/]/g, '').split('/').map(Number);
      (used >= cap) === add.disabled
        ? ok(`행동 추가 잠금 정합 (${used}/${cap}, disabled=${add.disabled})`)
        : bad(`행동 추가 잠금 불일치 (${used}/${cap}, disabled=${add.disabled})`);
      // 닫기
      click($('.adv-cellpop [data-cpclose]'));
      await sleep(300);
      !$('.adv-cellpop') ? ok('칸 편집기 닫힘') : bad('칸 편집기가 닫히지 않음');
    }
  }

  click($('#advGridBtn'));
  await sleep(200);
  $('.adv-gridwrap').hidden ? ok('전체 보기 토글 off') : bad('전체 보기가 꺼지지 않음');

  // ── 구간 선택 (shift+클릭)
  const rail = $('.adv-rail').children;
  click(rail[0]);
  await sleep(200);
  rail[Math.min(4, rail.length - 1)].dispatchEvent(
    new window.MouseEvent('click', { bubbles: true, shiftKey: true }));
  await sleep(300);
  A.advSelSet && A.advSelSet.size >= 5 ? ok(`구간 선택 ${A.advSelSet.size}턴`) : bad('구간 선택되지 않음');
  $('#advResetSel').textContent.includes('턴') ? ok(`선택 버튼 라벨 "${$('#advResetSel').textContent.trim()}"`)
                                               : bad('선택 버튼 라벨이 갱신되지 않음');

  // ── 키보드
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await sleep(200);
  ok(`키보드 →  현재 ${A.advSel}턴`);

  // ── 전체 턴 기본값으로
  click($('#advResetAll'));
  await sleep(1200);
  A.advTouched && A.advTouched.size === 0
    ? ok('전체 턴 기본값으로 복귀') : bad(`기본값 복귀 후에도 손댄 턴 ${A.advTouched.size}개 남음`);

  // ── 팀 편성 변경 감지: 캐릭터를 갈아끼우면 경고가 떠야 한다 (교체는 조용히 틀린다)
  {
    const sigBefore = A.advTeamSig;
    A.team[2] = { id: 10425, skill: 10, rune: true, rotation: '' };   // P3 → 하니엘
    A.renderAdv();
    await sleep(400);
    const tw = $('.adv-teamwarn');
    tw && !tw.hidden ? ok('편성 변경 경고 표시') : bad('편성이 바뀌었는데 경고가 없음');
    if (tw && !tw.hidden && $('#advSigKeep')) {
      click($('#advSigKeep'));
      await sleep(400);
      $('.adv-teamwarn').hidden && A.advTeamSig !== sigBefore
        ? ok('경고 해제(그대로 두기)') : bad('경고가 해제되지 않음');
    }
    A.team[2] = { id: 10421, skill: 10, rune: true, rotation: '' };   // 이후 시나리오를 위해 원복
    click($('#advResetAll'));
    await sleep(1500);
  }

  // ── 기존 설정 불러오기: 사용자화를 걸어두면 기본값과 다른 타임라인이 들어와야 한다
  {
    const pl = ('평평방궁' + '평방궁'.repeat(9)).slice(0, 30).split('');
    Object.assign(A.team[2], { usePlan: true, plan: pl, rotation: pl.join('') });
    click($('#advResetAll'));                       // 먼저 순수 기본값으로
    await sleep(1500);
    const plain = JSON.stringify(A.turnPlans);
    click($('#advImport'));
    await waitFor(() => !$('#advImport').disabled, '기존 설정 불러오기', 60000);
    await sleep(1200);
    const loaded = JSON.stringify(A.turnPlans);
    loaded !== plain ? ok('기존 설정 불러오기 → 기본값과 다른 타임라인 적용')
                     : bad('기존 설정 불러오기가 아무것도 바꾸지 않음');
    const hasDef = Object.values(A.turnPlans).some(v => v.some(e => e.p === 3 && e.a === '방'));
    hasDef ? ok('불러온 계획에 파미도 방어 포함 (기존 계획 반영)')
           : bad('불러왔는데 기존 계획(방어)이 반영되지 않음');
    click($('#advUndoBtn'));                        // 되돌리기로 취소되는지
    await sleep(1200);
    JSON.stringify(A.turnPlans) === plain ? ok('불러오기 되돌리기') : bad('불러오기를 되돌리지 못함');
    delete A.team[2].usePlan; delete A.team[2].plan; A.team[2].rotation = '';
  }

  // ── 껐다 켜도 작업물이 보존되어야 한다 (매번 초기화되면 편집이 날아간다)
  const beforeToggle = JSON.stringify(A.turnPlans);
  const touchedBefore = A.advTouched.size;
  $('#advSwitch').checked = false;
  $('#advSwitch').dispatchEvent(new window.Event('change'));
  await sleep(900);
  $('#advSwitch').checked = true;
  $('#advSwitch').dispatchEvent(new window.Event('change'));
  await sleep(2500);
  JSON.stringify(A.turnPlans) === beforeToggle && A.advTouched.size === touchedBefore
    ? ok('껐다 켜기 → 타임라인 보존')
    : bad('껐다 켜니 타임라인이 달라짐(초기화되면 안 됨)');

  await compareScopeCheck(window, A, $, click);
  await independenceCheck();
  await specPanelCheck(window, A, $, click);
  finish();
}

// 캐릭터 스펙 설정 — 켜야 적용되고, 성급이 스킬 줄을 잠그는지, 값이 왕복되는지.
async function specPanelCheck(window, A, $, click) {
  const doc = window.document;
  $('#modal').hidden = true;
  await A.openModal(0);
  await sleep(500);
  const slot = A.team[0];

  $('#csOpen') ? ok('스펙: 모달에 진입 버튼 존재') : bad('스펙: 진입 버튼 없음');
  doc.querySelector('#skl') ? bad('스펙: 옛 스킬 레벨 바가 남아 있음') : ok('스펙: 옛 스킬 레벨 바 제거됨');
  doc.querySelector('#rune') ? bad('스펙: 옛 도장 토글이 남아 있음') : ok('스펙: 옛 도장 토글 제거됨');

  click($('#csOpen'));
  await sleep(400);
  const pan = $('#specPanel');
  !pan.hidden ? ok('스펙: 패널 열림') : bad('스펙: 패널이 열리지 않음');
  $('#modalWrap').classList.contains('with-spec') ? ok('스펙: 카드가 비켜남') : bad('스펙: 래퍼 클래스 미적용');
  $('#csBody').classList.contains('off') ? ok('스펙: 기본은 꺼짐(풀육성)') : bad('스펙: 기본이 켜져 있음');

  const fullAtk = A.specAtkHp(slot)[0];
  $('#csUse').checked = true;
  $('#csUse').dispatchEvent(new window.Event('change'));
  await sleep(300);
  A.specOn(slot) ? ok('스펙: 사용 켜짐') : bad('스펙: 스위치가 상태에 반영 안 됨');
  A.specAtkHp(slot)[0] === fullAtk ? ok('스펙: 켠 직후 값은 풀육성 그대로') : bad('스펙: 켜자마자 값이 변함');

  // 스타는 이제 슬라이더 — 끌면 아이콘이 켜지고 스킬 줄 잠금이 따라간다
  const setEvo = (n) => {
    const r = doc.querySelector('#csEvo');
    r.value = String(n);
    r.dispatchEvent(new window.Event('input'));
    r.dispatchEvent(new window.Event('change'));
  };
  const lit = (sel) => doc.querySelectorAll(`${sel} .pip.lit`).length;
  setEvo(0);
  await sleep(300);
  const st = k => (doc.querySelector(`.cs-row[data-slot="${k}"]`) || {}).className || '';
  st('passive4').includes('locked') ? ok('스펙: 스타0에서 패시브5 잠김') : bad('스펙: 패시브5가 잠기지 않음');
  st('passive2').includes('locked') ? ok('스펙: 스타0에서 패시브3 잠김') : bad('스펙: 패시브3이 잠기지 않음');
  st('passive1').includes('pinned') ? ok('스펙: 스타0에서 패시브2는 1레벨 고정') : bad(`스펙: 패시브2 상태 이상 (${st('passive1')})`);
  st('passive0').includes('open') ? ok('스펙: 스타0에서도 패시브1은 조절 가능') : bad('스펙: 패시브1이 잠김');
  lit('#csStarPips') === 0 ? ok('스펙: 스타0 → 별 0개 점등') : bad(`스펙: 별 점등 ${lit('#csStarPips')}개`);
  doc.querySelector('#csRune') && doc.querySelector('#csRune').disabled
    ? ok('스펙: 스타0에서 도장 해제 잠김') : bad('스펙: 스타0인데 도장 스위치가 열림');
  A.specAtkHp(slot)[0] < fullAtk ? ok(`스펙: 스타0 스탯 하락 ${fullAtk}→${A.specAtkHp(slot)[0]}`) : bad('스펙: 스타를 내려도 스탯이 그대로');

  // 필살기는 한 줄로 합쳐졌고 잠기지 않는다
  st('fatal').includes('open') ? ok('스펙: 필살기 줄은 항상 조절 가능') : bad(`스펙: 필살기 줄 상태 이상 (${st('fatal')})`);
  !doc.querySelector('.cs-row[data-slot="sigil"]') && !doc.querySelector('.cs-row[data-slot="ultimate"]')
    ? ok('스펙: 필살기/도장 필살기가 한 줄로 합쳐짐') : bad('스펙: 필살기 줄이 아직 둘로 갈림');
  // 슬롯 번호가 아니라 실제 스킬 이름이 보여야 한다
  const p0name = (doc.querySelector('.cs-row[data-slot="passive0"] .sr-n') || {}).textContent || '';
  p0name && !/^패시브\s*\d/.test(p0name.trim()) ? ok(`스펙: 패시브에 실제 이름 표시 "${p0name.trim()}"`)
    : bad(`스펙: 패시브 이름이 슬롯 번호 (${p0name})`);
  doc.querySelector('.cs-row[data-slot="basicAtk"] img.sr-ic') ? ok('스펙: 스킬 아이콘 표시') : bad('스펙: 스킬 아이콘 없음');

  // 스타0에서는 패시브2가 1레벨 고정 — 엔진에도 1로 나가야 한다
  const pl0 = A.specPayload(slot);
  pl0.specOn === true && pl0.evo === 0 ? ok('스펙: 페이로드에 스타0 반영') : bad(`스펙: 페이로드 이상 ${JSON.stringify(pl0).slice(0, 90)}`);
  pl0.skillLevels && pl0.skillLevels.passive1 === 1
    ? ok('스펙: 고정된 패시브 레벨이 1로 나감') : bad(`스펙: 고정 패시브 레벨이 ${pl0.skillLevels && pl0.skillLevels.passive1}`);

  setEvo(3);
  await sleep(300);
  st('passive3').includes('locked') ? ok('스펙: 스타3에서 패시브4는 아직 잠김') : bad('스펙: 패시브4가 일찍 열림');
  st('passive1').includes('open') ? ok('스펙: 스타3에서 패시브2 고정 해제') : bad('스펙: 스타3인데 패시브2가 고정');
  lit('#csStarPips') === 3 ? ok('스펙: 스타3 → 별 3개 점등') : bad(`스펙: 별 점등 ${lit('#csStarPips')}개`);
  const pl3 = A.specPayload(slot);
  pl3.evo === 3 && pl3.skillLevels.passive1 === 10
    ? ok('스펙: 해제된 패시브는 지정 레벨로 나감') : bad(`스펙: 스타3 페이로드 이상 ${JSON.stringify(pl3.skillLevels)}`);

  // 유대 슬라이더 → 하트 점등
  const rb = doc.querySelector('#csBond');
  rb.value = '2'; rb.dispatchEvent(new window.Event('input'));
  await sleep(120);
  lit('#csBondPips') === 2 ? ok('스펙: 유대2 → 하트 2개 점등') : bad(`스펙: 하트 점등 ${lit('#csBondPips')}개`);
  rb.dispatchEvent(new window.Event('change'));
  await sleep(250);

  // 도장 해제 스위치 — 스타3부터 조작 가능, 끄면 일반 필살기가 나간다
  const rsw = doc.querySelector('#csRune');
  rsw && !rsw.disabled ? ok('스펙: 스타3에서 도장 스위치 조작 가능') : bad('스펙: 도장 스위치가 비활성');
  if (rsw) {
    rsw.checked = false;
    rsw.dispatchEvent(new window.Event('change'));
    await sleep(300);
    (doc.querySelector('.cs-rune em').textContent || '').includes('일반 필살기')
      ? ok('스펙: 도장을 끄면 일반 필살기 안내') : bad('스펙: 도장 끔 안내가 갱신되지 않음');
    slot.rune === false ? ok('스펙: 도장 상태가 슬롯에 반영') : bad('스펙: 슬롯에 도장 상태 미반영');
    doc.querySelector('#csRune').checked = true;
    doc.querySelector('#csRune').dispatchEvent(new window.Event('change'));
    await sleep(300);
  }
  // 필살기 레벨은 한 컨트롤이 일반/도장 양쪽에 함께 적용된다
  const fr = doc.querySelector('.cs-row[data-slot="fatal"] .sr-range');
  fr.value = '4'; fr.dispatchEvent(new window.Event('input'));
  fr.dispatchEvent(new window.Event('change'));
  await sleep(250);
  const plf = A.specPayload(slot);
  plf.skillLevels.ultimate === 4 && plf.skillLevels.sigil === 4
    ? ok('스펙: 필살기 레벨이 일반·도장 양쪽에 적용')
    : bad(`스펙: 필살기 레벨 불일치 ult=${plf.skillLevels.ultimate} sigil=${plf.skillLevels.sigil}`);
  fr.value = '10'; fr.dispatchEvent(new window.Event('input')); fr.dispatchEvent(new window.Event('change'));
  await sleep(200);

  setEvo(1);
  await sleep(300);
  const rsw1 = doc.querySelector('#csRune');
  rsw1 && rsw1.disabled ? ok('스펙: 스타1에서는 도장 스위치 잠김') : bad('스펙: 스타1인데 도장 스위치가 열림');
  setEvo(3);
  await sleep(300);

  // 공유코드 왕복
  const packed = A.packSlot(slot);
  const back = A.unpackSlot(packed);
  back.spec && back.spec.on && back.spec.evo === 3
    ? ok('스펙: 공유코드 왕복 보존') : bad(`스펙: 왕복 실패 ${JSON.stringify(back.spec)}`);

  // 구기록 승격 — 옛 skill/rune 만 있는 슬롯
  const legacy = A.promoteLegacySpec({ id: slot.id, skill: 7, rune: false });
  legacy.spec && legacy.spec.on && legacy.spec.lv.ultimate === 7
    ? ok('스펙: 구기록(스킬7) 승격') : bad('스펙: 구기록이 풀육성으로 흘러감');
  const fresh = A.promoteLegacySpec({ id: slot.id, skill: 10, rune: true });
  !fresh.spec ? ok('스펙: 기본값 기록은 승격하지 않음') : bad('스펙: 기본값인데 스펙이 켜짐');

  $('#csClose').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(400);
  $('#modalWrap').classList.contains('with-spec') ? bad('스펙: 닫아도 카드가 안 돌아옴') : ok('스펙: 닫으면 카드 복귀');

  await cmpSpecCheck(window, A, $, click);
  await runPayloadCheck(window, A, $);
}

// 메인 '시뮬레이션 실행' 경로 — 화면에서 정한 스펙이 실제 실행 payload 까지 가는가.
// 팀 payload 를 만드는 곳이 네 군데(프로브 · 비교군 · 기록 · run)라 하나만 빠져도
// 화면 표시만 바뀌고 결과는 풀육성으로 돌아간다. 실제로 그 사고가 났었다.
async function runPayloadCheck(window, A, $) {
  const d = window.document;
  const sent = [];
  const realFetch = window.fetch;
  window.fetch = (u, o) => {
    const url = String(u);
    if (url.includes('/api/simulate') && o && o.body) { try { sent.push(JSON.parse(o.body)); } catch {} }
    return realFetch(u, o);
  };
  A.team.forEach((s) => { if (s) s.spec = null; });   // 앞 시나리오가 켜 둔 스펙을 지우고 시작
  d.querySelector('#turns').value = '8';
  d.querySelector('#turns').dispatchEvent(new window.Event('input'));
  d.querySelector('#runs').value = '1';
  d.querySelector('#runs').dispatchEvent(new window.Event('input'));

  await A.run(false);
  await sleep(150);
  const base = A.lastResult && A.lastResult.meta.total;
  (sent.length && sent[sent.length - 1].team[0].specOn === false)
    ? ok('실행: 스펙 끔이면 payload specOn=false') : bad('실행: payload 에 specOn 이 없음');

  await A.openModal(0); await sleep(450);
  A.openSpecPanel(0); await sleep(350);
  d.querySelector('#csUse').checked = true;
  d.querySelector('#csUse').dispatchEvent(new window.Event('change'));
  await sleep(250);
  for (const [id, v] of [['#csEvo', '0'], ['#csLevel', '30']]) {
    const r = d.querySelector(id);
    r.value = v; r.dispatchEvent(new window.Event('input')); r.dispatchEvent(new window.Event('change'));
    await sleep(250);
  }
  d.querySelector('#csClose').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(350);
  d.querySelector('#modal').hidden = true;

  await A.run(false);
  await sleep(150);
  const p = sent[sent.length - 1].team[0];
  const after = A.lastResult && A.lastResult.meta.total;
  (p.specOn === true && p.evo === 0 && p.level === 30)
    ? ok('실행: 화면에서 정한 스펙이 payload 에 반영') : bad(`실행: payload 스펙 누락 ${JSON.stringify(p).slice(0, 90)}`);
  (base && after && after < base)
    ? ok(`실행: 결과가 실제로 달라짐 (${Math.round(after / base * 100)}%)`)
    : bad(`실행: 스펙을 내렸는데 결과가 그대로 (${base} → ${after})`);
  window.fetch = realFetch;
}

// 비교 모달 — 같은 패널이 뜨는지, 값이 그 비교군 슬롯에 붙는지,
// 고급 설정이 켜진 쪽은 행동 선택이 잠기는지.
async function cmpSpecCheck(window, A, $, click) {
  const doc = window.document;
  $('#modal').hidden = true;
  A.cmpTeam = { a: [{ id: 10409, skill: 10, rune: true, rotation: '' }], b: [] };
  const cell = { id: 10409, name: '카 라트', elementKey: 'water', position: 1,
                 damage: null, cfg: A.cmpTeam.a[0], slotIdx: 0, side: 'a' };

  A.cmpAdvOn.a = false;
  A.openCmpInfo(cell);
  await sleep(250);
  let pop = doc.querySelector('.cmpinfo');
  pop && pop.querySelector('[data-cspec]') ? ok('비교: 교체 옆에 스펙 버튼') : bad('비교: 스펙 버튼 없음');
  pop.querySelector('[data-plan]') ? ok('비교: 고급 설정 꺼짐 → 행동 선택 가능') : bad('비교: 행동 선택이 잠김');

  click(pop.querySelector('[data-cspec]'));
  await sleep(300);
  const pan = pop.querySelector('.ci-spanel');
  pan && !pan.hidden ? ok('비교: 스펙 패널 열림') : bad('비교: 패널이 열리지 않음');
  pop.querySelector('.ci-wrap').classList.contains('with-spec')
    ? ok('비교: 카드가 비켜남') : bad('비교: 래퍼 클래스 미적용');

  doc.querySelector('#csUse').checked = true;
  doc.querySelector('#csUse').dispatchEvent(new window.Event('change'));
  await sleep(250);
  const rEvo = doc.querySelector('#csEvo');
  rEvo.value = '2';
  rEvo.dispatchEvent(new window.Event('input'));
  rEvo.dispatchEvent(new window.Event('change'));
  await sleep(300);
  const slot = A.cmpTeam.a[0];
  slot.spec && slot.spec.on && slot.spec.evo === 2
    ? ok('비교: 값이 그 비교군 슬롯에 저장') : bad(`비교: 슬롯 미반영 ${JSON.stringify(slot.spec)}`);
  A.team[0] && A.team[0].spec && A.team[0].spec.evo === 2
    ? bad('비교: 메인 슬롯까지 오염됨') : ok('비교: 메인 슬롯은 그대로');
  const cf = A.cfgFromTeam('a', { turns: 10 });
  cf.team[0].specOn === true && cf.team[0].evo === 2
    ? ok('비교: 실행 페이로드에 스펙 반영') : bad(`비교: 페이로드 미반영 ${JSON.stringify(cf.team[0]).slice(0, 90)}`);
  pop.querySelector('[data-cspec]').classList.contains('on')
    ? ok('비교: 버튼이 사용 중 표시') : bad('비교: 버튼 상태 미갱신');

  // 스펙 없는 비교군은 풀육성 그대로
  A.cmpTeam.b = [{ id: 10409, skill: 10, rune: true, rotation: '' }];
  const cfb = A.cfgFromTeam('b', { turns: 10 });
  cfb.team[0].specOn === false && cfb.team[0].evo === undefined
    ? ok('비교: 스펙 없는 쪽은 풀육성으로 나감') : bad(`비교: 빈 슬롯 페이로드 이상 ${JSON.stringify(cfb.team[0]).slice(0, 90)}`);

  doc.querySelector('#csClose').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(350);
  pop.remove();

  // 고급 설정이 켜진 비교군은 행동 선택이 잠겨야 한다
  A.cmpAdvOn.a = true;
  A.openCmpInfo(cell);
  await sleep(250);
  pop = doc.querySelector('.cmpinfo');
  !pop.querySelector('[data-plan]') ? ok('비교: 고급 설정 ON → 행동 선택 잠김') : bad('비교: 고급 설정인데 행동 선택이 열림');
  pop.querySelector('.ci-r.locked') ? ok('비교: 잠금 표시 적용') : bad('비교: 잠금 표시 없음');
  pop.querySelector('[data-cspec]') ? ok('비교: 고급 설정 중에도 스펙은 조작 가능') : bad('비교: 스펙 버튼이 사라짐');
  A.cmpAdvOn.a = false;
  pop.remove();
}

// 고급 설정의 '처음 기본값'은 기존 설정(캐릭 계획·우선순위·특정 턴 순서)의 영향을
// 받으면 안 된다. 사용자화를 잔뜩 걸어둔 팀과 깨끗한 팀을 각각 띄워 결과를 비교한다.
async function independenceCheck() {
  const first = async (dirty) => {
    const dom = new JSDOM(fs.readFileSync(path.join(DASH, 'index.html'), 'utf8'),
      { url: BASE + '/', pretendToBeVisual: true, runScripts: 'outside-only' });
    const w = dom.window;
    w.fetch = (u, o) => fetch(new URL(u, BASE).href, o);
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
    w.Worker = function () {};
    const pr = `;window.__a={get team(){return team},get turnPlans(){return turnPlans},
      set turnOverrides(v){turnOverrides=v},get CHARS(){return CHARS}};`;
    w.eval(fs.readFileSync(path.join(DASH, 'spec.js'), 'utf8'));
    w.eval(fs.readFileSync(path.join(DASH, 'app.js'), 'utf8') + pr);
    const a = w.__a, q = (x) => w.document.querySelector(x);
    await waitFor(() => Object.keys(a.CHARS || {}).length, '메타');
    [10417, 10428, 10421, 10439, 10423].forEach((id, i) => {
      a.team[i] = { id, skill: 10, rune: true, rotation: '' };
    });
    if (dirty) {
      const pl = ('평평방궁' + '평방궁'.repeat(9)).slice(0, 30).split('');
      Object.assign(a.team[2], { usePlan: true, plan: pl, rotation: pl.join('') });
      a.team.forEach((t, i) => { if (t) t.priority = 5 - i; });
      a.turnOverrides = { 4: [5, 4, 3, 2, 1], 7: [5, 4, 3, 2, 1] };
    }
    q('#advOpen').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(300);
    q('#advSwitch').checked = true;
    q('#advSwitch').dispatchEvent(new w.Event('change'));
    await waitFor(() => Object.keys(a.turnPlans).length >= +q('#turns').value, '채움');
    await sleep(1200);
    return JSON.stringify(a.turnPlans);
  };
  const clean = await first(false), dirtyPlan = await first(true);
  clean === dirtyPlan
    ? ok('기존 설정과 독립 — 사용자화 유무에 관계없이 같은 기본값')
    : bad('기본값이 기존 설정(계획·우선순위·턴 순서)의 영향을 받음');
}

// 비교군 스코프: 같은 편집기가 비교군 팀을 대상으로 돌고, 닫으면 그 비교군에만 반영되며
// 메인 상태는 그대로 복원되어야 한다.
async function compareScopeCheck(window, A, $, click) {
  const mainPlansBefore = JSON.stringify(A.turnPlans);
  const mainOnBefore = A.advOn;
  // 비교군 A에 팀을 꽂고 스코프 진입
  A.cmpTeam.a = [10402, 10428, 10421].map((id) => ({ id, skill: 10, rune: true, rotation: '' }));
  A.cmpCommon.turns = 8;
  // 진입 경로 검증: 우선순위 팝업 안의 '행동 고급 설정' 버튼으로 들어간다
  A.openPrioPop('a');
  await waitFor(() => $('.priopop'), '우선순위 팝업');
  const entry = $('.pr-head [data-cadv]');
  entry ? ok('우선순위 팝업 헤더에 고급 설정 버튼') : bad('우선순위 팝업에 고급 설정 버튼이 없음');
  if (!entry) return;
  click(entry);
  await waitFor(() => window.document.querySelector('.adv-card'), '비교군 팝업');
  await sleep(400);
  A.advScope === 'a' ? ok('비교군 스코프 진입') : bad('스코프가 설정되지 않음');
  $('.adv-scope') ? ok(`제목에 비교군 표시 "${$('.adv-scope').textContent}"`) : bad('비교군 표시 없음');

  $('#advSwitch').checked = true;
  $('#advSwitch').dispatchEvent(new window.Event('change'));
  await waitFor(() => Object.keys(A.turnPlans).length >= 8, '비교군 전 턴 채움', 40000);
  await sleep(800);
  const rows = $('.adv-track').children.length;
  rows === 3 ? ok(`비교군 팀(3명) 기준 타임라인 ${rows}행`) : bad(`비교군 팀이 반영 안 됨 (${rows}행)`);
  $('.adv-rail').children.length === 8 ? ok('비교 턴 수(8) 반영') : bad(`턴 수 불일치 ${$('.adv-rail').children.length}`);

  click($('[data-advclose]'));
  await sleep(600);
  A.cmpAdv.a && Object.keys(A.cmpAdv.a).length ? ok(`닫을 때 비교군 A에 저장 (${Object.keys(A.cmpAdv.a).length}턴)`)
                                               : bad('비교군에 저장되지 않음');
  A.cmpAdv.b ? bad('비교군 B가 오염됨') : ok('비교군 B는 그대로');
  A.advScope === null ? ok('스코프 해제') : bad('스코프가 남아 있음');
  // 닫으면 우선순위 팝업이 다시 열리고, 고급 설정이 켜졌으니 기존 설정이 잠겨야 한다
  await sleep(400);
  const pr = $('.priopop');
  if (!pr) bad('닫은 뒤 우선순위 팝업이 복귀하지 않음');
  else {
    $('.pr-body.locked') ? ok('우선순위 팝업의 기존 설정 잠김') : bad('고급 설정이 켜졌는데 기존 설정이 열려 있음');
    !$('.pr-lock').hidden ? ok('잠금 안내 표시') : bad('잠금 안내가 숨겨짐');
    $('.pr-head [data-cadv].on') ? ok('버튼이 사용 중 상태로 표시') : bad('버튼 상태가 갱신되지 않음');
    pr.remove();
  }
  JSON.stringify(A.turnPlans) === mainPlansBefore && A.advOn === mainOnBefore
    ? ok('메인 상태 원복') : bad('메인 타임라인/스위치가 오염됨');
}

function finish() {
  console.log(steps.join('\n'));
  if (errors.length) {
    console.log(`\n실패 ${errors.length}건`);
    process.exit(1);
  }
  console.log(`\n통과 — 검사 ${steps.length}건, 런타임 오류 0`);
  process.exit(0);
}

main().catch((e) => { bad(`하네스 예외: ${e.stack}`); finish(); });
