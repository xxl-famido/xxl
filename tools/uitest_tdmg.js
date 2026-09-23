/**
 * 턴 피해 설정 UI 런타임 검사 — jsdom으로 app.js를 띄워 실제로 열고 조작한다 (uitest_altar.js 와 같은 방식).
 *
 * 본다: 사이드 패널 열기/닫기, 마스터·고급 토글, 턴별 입력·비우기, localStorage 저장, 엔진 페이로드(tdmgPayload),
 *       기록 스냅샷 왕복(snapshot/applyTdmgSnap), 길드 제단 패널과의 탭 교체(양방향), 모바일 팝업, Esc.
 *
 *   python server.py &  →  node tools/uitest_tdmg.js     (실패 1 · jsdom 없음 2)
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
async function waitFor(fn, label, timeout = 20000) {
  const t0 = Date.now();
  for (;;) {
    let v; try { v = fn(); } catch { v = null; }
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`시간 초과: ${label}`);
    await sleep(50);
  }
}

async function main() {
  const html = fs.readFileSync(path.join(DASH, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: BASE + '/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const $ = (s, r = window.document) => r.querySelector(s);
  const $$ = (s, r = window.document) => [...r.querySelectorAll(s)];
  window.addEventListener('error', (e) => bad(`window error: ${e.error && e.error.stack || e.message}`));
  window.addEventListener('unhandledrejection', (e) => bad(`unhandled rejection: ${e.reason}`));
  window.fetch = (u, o) => fetch(new URL(u, BASE).href, o);
  let mobile = false;
  const mqListeners = [];
  window.matchMedia = (q) => ({
    get matches() { return q.includes('900px') ? mobile : false; },
    media: q, addEventListener: (_t, fn) => mqListeners.push(fn), removeEventListener() {}, addListener: (fn) => mqListeners.push(fn),
  });
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  window.Worker = function () { throw new Error('worker unused on local'); };

  const probe = `
    ;window.__td = {
      get tdmgOn(){return tdmgOn}, get tdmgOpened(){return tdmgOpened}, get tdmgCfg(){return tdmgCfg},
      get altarOpened(){return altarOpened}, get altarOn(){return altarOn}, get CHARS(){return CHARS},
      openTdmg(){return openTdmg()}, closeTdmg(){return closeTdmg()}, openAltar(){return openAltar()}, closeAltar(){return closeAltar()},
      tdmgPayload(){return tdmgPayload()}, snapshot(){return snapshot()}, applyTdmgSnap(t){return applyTdmgSnap(t)},
      packSnapV2(s){return packSnapV2(s)}, unpackSnapV2(a){return unpackSnapV2(a)}, usesNew(r){return _usesNewFeatures(r)},
      looseEq(a,b){return looseEq(a,b)}, encTdmg(t){return _encTdmg(t)}, decTdmg(s){return _decTdmg(s)},
    };`;
  window.eval(fs.readFileSync(path.join(DASH, 'spec.js'), 'utf8'));
  try { window.eval(fs.readFileSync(path.join(DASH, 'app.js'), 'utf8') + probe); }
  catch (e) { bad(`app.js 로드 실패: ${e.stack}`); return finish(); }
  const app = window.__td;
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const change = (el, v) => { el.checked = v; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
  const setVal = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('change', { bubbles: true })); };

  try {
    await waitFor(() => Object.keys(app.CHARS).length > 0 && $('#teamSlots').children.length, '초기화');
    ok('초기화');
    window.localStorage.removeItem('woofia_tdmg');

    // ── 데스크탑: 사이드 패널 열기 ──
    const btn = $('#tdmgOpen'), side = $('#tdmgSide');
    if (!btn || !side) { bad('#tdmgOpen / #tdmgSide 없음'); return finish(); }
    if (!side.hidden) bad('초기엔 턴 피해 사이드 패널이 숨겨져야 함');
    click(btn);
    await sleep(40);
    if (side.hidden || !$('.wrap').classList.contains('altar-open')) bad('열기: 사이드 패널/그리드 열림 상태 아님');
    if (!app.tdmgOpened) bad('tdmgOpened 미반영');
    if (btn.getAttribute('aria-expanded') !== 'true' || !btn.classList.contains('open')) bad('버튼 open/aria 미반영');
    const turns = +$('#turns').value;
    const cells = $$('#tdmgSide .tdmg-row');
    if (cells.length !== turns) bad(`턴별 칸 ${turns}개 기대, ${cells.length}`); else ok(`사이드 패널 열림 · 턴별 칸 ${turns}개`);
    if (!$('#tdmgSide .tdmg-body').classList.contains('off')) bad('마스터 OFF면 본문이 .off 여야 함');
    if ($$('#tdmgSide [data-tdturn]').some(i => !i.disabled)) bad('고급 OFF면 턴별 입력은 disabled 여야 함');
    if (app.tdmgPayload() !== null) bad('OFF 페이로드는 null 이어야 함');

    // ── 마스터 ON · 슬라이더 · 페이로드 ──
    change($('#tdmgSide [data-tdmgsw]'), true);
    if (!app.tdmgOn || !btn.classList.contains('on')) bad('마스터 ON 반영 안 됨');
    if ($('#tdmgSide .tdmg-body').classList.contains('off')) bad('마스터 ON인데 본문이 .off');
    let p = app.tdmgPayload();
    if (!p || p.on !== true || p.pct !== 10 || p.per) bad(`기본 페이로드 이상: ${JSON.stringify(p)}`); else ok('마스터 ON → {on, pct:10}');
    const range = $('#tdmgSide [data-tdpct]');
    range.value = 25; range.dispatchEvent(new window.Event('input', { bubbles: true })); range.dispatchEvent(new window.Event('change', { bubbles: true }));
    if (app.tdmgCfg.pct !== 25) bad('슬라이더 값 미반영');
    if ($('#tdmgSide [data-tdpctval]').textContent !== '25%') bad('슬라이더 라벨 미갱신');
    if ($('#tdmgSide [data-tdturn="1"]').placeholder !== '25') bad('턴별 칸 자리표시자가 슬라이더 값으로 안 바뀜');
    ok('슬라이더 25% → cfg·라벨·자리표시자');

    // ── 고급(턴별) ──
    change($('#tdmgSide [data-tdadv]'), true);
    if (!app.tdmgCfg.adv) bad('고급 ON 미반영');
    if ($('#tdmgSide .tdmg-adv').classList.contains('off')) bad('고급 ON인데 .off 잔존');
    if ($$('#tdmgSide [data-tdturn]').some(i => i.disabled)) bad('고급 ON이면 턴별 입력이 활성이어야 함');
    setVal($('#tdmgSide [data-tdturn="2"]'), '30');
    setVal($('#tdmgSide [data-tdturn="3"]'), '150');          // 상한 99 클램프
    p = app.tdmgPayload();
    if (!p.per || p.per[2] !== 30 || p.per[3] !== 99) bad(`턴별 페이로드 이상: ${JSON.stringify(p)}`);
    if (!$('#tdmgSide [data-tdturn="2"]').closest('.tdmg-row').classList.contains('set')) bad('설정된 칸 .set 미표시');
    setVal($('#tdmgSide [data-tdturn="3"]'), '');
    if (app.tdmgPayload().per[3] !== undefined) bad('빈 칸은 per 에서 제거돼야 함');
    ok('고급 ON → 턴별 입력(2턴 30 · 150→99 클램프 · 비우면 제거)');
    const saved = JSON.parse(window.localStorage.getItem('woofia_tdmg') || 'null');
    if (!saved || saved.on !== true || saved.pct !== 25 || !saved.adv || saved.per[2] !== 30) bad(`localStorage 저장값 불일치: ${JSON.stringify(saved)}`);
    else ok('localStorage 저장');
    click($('#tdmgSide [data-tdreset]'));
    await sleep(10);
    if (Object.keys(app.tdmgCfg.per).length) bad('턴별 값 비우기 실패');
    if ($$('#tdmgSide .tdmg-row.set').length) bad('비운 뒤 .set 잔존');
    ok('턴별 값 비우기');
    change($('#tdmgSide [data-tdadv]'), false);
    if (app.tdmgPayload().per) bad('고급 OFF면 per 를 보내지 않아야 함');

    // ── 기록 스냅샷 왕복 ──
    const snap = app.snapshot();
    if (!snap.turnDamage || snap.turnDamage.pct !== 25) bad('snapshot.turnDamage 누락');
    app.applyTdmgSnap(null);
    if (app.tdmgOn) bad('옛 기록(turnDamage 없음) 복원 시 OFF 여야 함');
    app.applyTdmgSnap({ on: true, pct: 40, per: { 3: 5 } });
    if (!app.tdmgOn || app.tdmgCfg.pct !== 40 || !app.tdmgCfg.adv || app.tdmgCfg.per[3] !== 5) bad('기록 복원(ON·pct·per) 실패');
    if (+$('#tdmgSide [data-tdpct]').value !== 40) bad('복원 후 패널 재렌더 안 됨');
    ok('기록 스냅샷 저장/복원');

    // ── 공유 코드(v2 꼬리 필드) 왕복 — OFF면 코드 길이 불변, ON이면 축약형 유지 ──
    if (app.encTdmg(null) !== '' || app.encTdmg({ on: false, pct: 10 }) !== '') bad('OFF 인코딩은 빈 문자열이어야 함');
    if (app.encTdmg({ on: true, pct: 25 }) !== '25') bad('균일 인코딩 "25" 기대');
    if (app.encTdmg({ on: true, pct: 25, per: { 3: 5, 2: 30 } }) !== '25;2:30,3:5') bad('턴별 인코딩 "25;2:30,3:5" 기대');
    const dec = app.decTdmg('25;2:30,3:5');
    if (!dec || dec.pct !== 25 || dec.per[2] !== 30 || dec.per[3] !== 5) bad('디코딩 실패');
    if (app.decTdmg('') !== null || app.decTdmg('x') !== null || app.decTdmg('0') !== null) bad('잘못된 코드는 null 이어야 함');
    const snapOn = app.snapshot();                                 // 현재 ON(40%, 3턴 5)
    const packed = app.packSnapV2(snapOn);
    if (!packed) bad('v2 패킹 실패(turnDamage 포함)');
    else {
      const back = app.unpackSnapV2(packed);
      if (!app.looseEq(snapOn, back)) bad(`v2 왕복 불일치: ${JSON.stringify(back.turnDamage)}`);
      if (packed[packed.length - 1] !== '40;3:5') bad(`꼬리 필드 기대 "40;3:5", 실제 ${JSON.stringify(packed[packed.length - 1])}`);
      if (!app.usesNew({ snap: snapOn })) bad('turnDamage ON 기록은 새 기능(v2 강제)으로 판정돼야 함');
    }
    app.applyTdmgSnap(null);
    const packedOff = app.packSnapV2(app.snapshot());
    if (packedOff && packedOff.length > 11) bad(`OFF면 꼬리가 트림돼야 함(길이 ${packedOff.length})`);
    if (!app.looseEq(app.snapshot(), app.unpackSnapV2(packedOff))) bad('OFF 왕복 불일치(null≈누락)');
    app.applyTdmgSnap({ on: true, pct: 40, per: { 3: 5 } });   // 이후 탭 교체 검사를 위해 ON 복귀
    ok('공유 코드 v2 꼬리 왕복(ON 축약형 · OFF 트림)');

    // ── 피해 대상 수(hits) ──
    if ($('#tdmgSide [data-tdhits="5"]').classList.contains('on') !== true) bad('기본 대상 수는 전체(5)여야 함');
    click($('#tdmgSide [data-tdhits="2"]'));
    if (app.tdmgCfg.hits !== 2) bad('대상 수 클릭 미반영');
    if (!$('#tdmgSide [data-tdhits="2"]').classList.contains('on')) bad('선택 버튼 하이라이트 안 됨');
    if ($('#tdmgSide [data-tdhits="5"]').classList.contains('on')) bad('이전 버튼 하이라이트 미해제');
    if (app.tdmgPayload().hits !== 2) bad('payload.hits 미반영');
    if (app.encTdmg({ on: true, pct: 30, hits: 2 }) !== '30h2') bad('hits 인코딩 "30h2" 기대');
    if (app.encTdmg({ on: true, pct: 30, hits: 5 }) !== '30') bad('전체(5)는 hits 생략해야 함');
    if (app.encTdmg({ on: true, pct: 25, per: { 3: 5 }, hits: 3 }) !== '25;3:5h3') bad('per+hits 인코딩 기대');
    const dh = app.decTdmg('30h2'); if (!dh || dh.pct !== 30 || dh.hits !== 2) bad('hits 디코딩 실패');
    if (app.decTdmg('30').hits !== undefined) bad('hits 없는 코드는 hits 미포함이어야 함');
    // 전체(5)로 되돌리면 payload에서 hits 생략
    click($('#tdmgSide [data-tdhits="5"]'));
    if (app.tdmgPayload().hits !== undefined) bad('전체면 payload.hits 생략해야 함');
    ok('피해 대상 수(hits) 선택·인코딩·트림');

    // ── 탭 교체: 턴 피해 → 제단 → 턴 피해 ──
    click($('#altarOpen'));
    await sleep(450);
    if (app.tdmgOpened || !app.altarOpened) bad('제단 버튼: 턴 피해 탭이 닫히고 제단 탭이 열려야 함');
    if (!$('#tdmgSide').hidden || $('#altarSide').hidden) bad('탭 교체 후 사이드 가시성 불일치(턴피해 숨김·제단 표시)');
    if (!$('.wrap').classList.contains('altar-open')) bad('탭 교체 중 그리드 열이 접힘');
    if (!app.tdmgOn) bad('탭 교체가 턴 피해 ON 상태를 바꾸면 안 됨');
    ok('턴 피해 → 제단 탭 교체(설정 유지·열 유지)');
    click(btn);
    await sleep(450);
    if (!app.tdmgOpened || app.altarOpened) bad('턴 피해 버튼: 제단 탭이 닫히고 턴 피해 탭이 열려야 함');
    if ($('#tdmgSide').hidden || !$('#altarSide').hidden) bad('역방향 교체 후 사이드 가시성 불일치');
    if (!$$('#tdmgSide .tdmg-row').length) bad('역방향 교체 후 본문 미렌더');
    ok('제단 → 턴 피해 탭 교체');

    // ── Esc · 닫기 ──
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(420);
    if (app.tdmgOpened || !$('#tdmgSide').hidden) bad('Esc 로 닫히지 않음');
    if ($('.wrap').classList.contains('altar-open')) bad('둘 다 닫혔는데 그리드 열이 남음');
    ok('Esc 닫기 · 그리드 열 접힘');

    // ── 모바일 팝업 ──
    mobile = true;
    click(btn);
    await sleep(40);
    if (!$('.tdmg-modal .altar-card') || !$('.tdmg-modal .tdmg-row')) bad('모바일: 팝업 미생성/본문 미렌더');
    click($('.tdmg-modal [data-tdmgclose]'));
    if ($('.tdmg-modal') || app.tdmgOpened) bad('모바일: 닫기 버튼 실패');
    ok('모바일 팝업 열기/닫기');
    mobile = false;
  } catch (e) {
    bad(`예외: ${e.stack || e}`);
  }
  finish();
}
function finish() {
  console.log(steps.join('\n'));
  if (errors.length) { console.log(`\n실패 ${errors.length}건`); process.exit(1); }
  console.log('\n턴 피해 설정 UI 검사 통과');
  process.exit(0);   // jsdom 타이머(rAF 스텁·앱 setTimeout)가 이벤트 루프를 붙들지 않게 명시 종료
}
main();
