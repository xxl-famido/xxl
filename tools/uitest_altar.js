/**
 * 길드 제단 설정 UI 런타임 검사 — jsdom으로 app.js를 띄워 실제로 열고 조작한다.
 *
 * uitest.js 와 같은 방식(로컬 서버 8777 + jsdom). 데스크탑(사이드 패널)·모바일(팝업) 두 경로,
 * 마스터/층/제단 토글, 확률 100% 상호배제, 언어 전환 재렌더, 저장(localStorage) 을 본다.
 *
 *   python server.py &  →  node tools/uitest_altar.js     (실패 1 · jsdom 없음 2)
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
  let mobile = false;                       // matchMedia 스텁: 900px 경계만 제어
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
    ;window.__alt = {
      get altarOn(){return altarOn}, get altarOpened(){return altarOpened}, get forceProc(){return forceProc},
      get altarCfg(){return altarCfg}, get altarData(){return altarData},
      openAltar(){return openAltar()}, closeAltar(){return closeAltar()}, get CHARS(){return CHARS},
      altarPayload(){return altarPayload()}, snapshot(){return snapshot()}, applyAltarSnap(a){return applyAltarSnap(a)},
      packSnapV2(s){return packSnapV2(s)}, unpackSnapV2(a){return unpackSnapV2(a)}, usesNew(r){return _usesNewFeatures(r)},
      looseEq(a,b){return looseEq(a,b)}, get team(){return team}, openModal(i){return openModal(i)}, closeCharModal(){return closeCharModal()},
      cdPlus(){return cdPlus()}, fcd(m){return fcd(m)}, ffat(m){return ffat(m)}, defaultPlan(m,n){return defaultPlan(m,n)},
      packSlot(s){return packSlot(s)}, unpackSlot(a){return unpackSlot(a)}, ultOf(s){return ultOf(s)},
      addTeam(id){ const i = team.findIndex(x => !x); if (i < 0) return false; team[i] = { id, skill: 10, rune: true, rotation: '' }; renderTeam(); return true; },
    };`;
  window.eval(fs.readFileSync(path.join(DASH, 'spec.js'), 'utf8'));
  try { window.eval(fs.readFileSync(path.join(DASH, 'app.js'), 'utf8') + probe); }
  catch (e) { bad(`app.js 로드 실패: ${e.stack}`); return finish(); }
  const app = window.__alt;
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const change = (el, v) => { el.checked = v; el.dispatchEvent(new window.Event('change', { bubbles: true })); };

  try {
    await waitFor(() => Object.keys(app.CHARS).length > 0 && $('#teamSlots').children.length, '초기화');
    await waitFor(() => app.altarData !== null, 'altars.json 로드');
    ok('초기화 · altars.json 로드');
    if (app.altarData === false) bad('altars.json 로드 실패');

    // ── 데스크탑: 사이드 패널 ──
    const btn = $('#altarOpen');
    if (!btn) { bad('#altarOpen 없음'); return finish(); }
    if (!$('#altarSide').hidden) bad('초기엔 사이드 패널이 숨겨져야 함');
    click(btn);
    await sleep(30);
    if ($('#altarSide').hidden || !$('.wrap').classList.contains('altar-open')) bad('열기: 사이드 패널/그리드 열림 상태 아님');
    const floors = $$('#altarSide .altar-floor');
    const rows = $$('#altarSide .altar-row');
    if (floors.length !== 3) bad(`층 3개 기대, ${floors.length}`); else ok('층 3개 렌더');
    if (rows.length !== 24) bad(`제단 24개 기대, ${rows.length}`); else ok('제단 24개 렌더 (3+3·4+4·5+5)');
    const per = floors.map(f => $$('.altar-row', f).length).join('/');
    if (per !== '6/8/10') bad(`층별 제단 수 6/8/10 기대, ${per}`);
    const badIcon = rows.filter(r => !/icons\/altar_(star|moon)\.webp$/.test($('.ai', r).getAttribute('src')));
    if (badIcon.length) bad(`아이콘 경로 이상 ${badIcon.length}건`); else ok('제단 아이콘 star/moon 경로');
    const starRows = $$('#altarSide .af-group.star .altar-row').length, moonRows = $$('#altarSide .af-group.moon .altar-row').length;
    if (starRows !== 12 || moonRows !== 12) bad(`별 12·달 12 기대, ${starRows}/${moonRows}`); else ok('별 12 · 달 12');
    if (!$('#altarSide .altar-body').classList.contains('off')) bad('마스터 OFF 상태면 본문이 흐려져야(.off) 함');
    if (btn.getAttribute('aria-expanded') !== 'true') bad('aria-expanded 미갱신');

    // ── 마스터 토글 ⇄ 확률 100% ──
    change($('[data-altarsw]'), true);
    if (!app.altarOn) bad('마스터 ON 반영 안 됨');
    if (!$('#forceProc').disabled) bad('제단 ON이면 확률 100% 버튼이 disabled 여야 함');
    if ($('#altarSide .altar-body').classList.contains('off')) bad('마스터 ON인데 본문이 .off');
    if (!btn.classList.contains('on')) bad('버튼 .on 상태 미반영');
    ok('마스터 ON → 확률 100% 잠김 · 본문 활성');
    change($('[data-altarsw]'), false);
    if ($('#forceProc').disabled) bad('마스터 OFF면 확률 100% 잠금 해제돼야 함');
    click($('#forceProc'));
    if (!app.forceProc) bad('확률 100% 켜기 실패(잠금 해제 상태)');
    change($('[data-altarsw]'), true);
    if (app.forceProc) bad('제단 ON 시 이미 켜진 확률 100%를 꺼야 함');
    if ($('#forceProc').classList.contains('on')) bad('확률 100% 버튼 .on 잔존');
    ok('확률 100% 켜진 채 제단 ON → 확률 100% 해제+잠금');

    // ── 층 토글(누적 규칙) · 제단 토글 · 저장 ──
    const fOn = (n) => app.altarCfg.floors[n] && app.altarCfg.floors[n].on;
    const fSw = (n) => $(`#altarSide .altar-floor[data-floor="${n}"] [data-floorsw]`);
    const fOff = (n) => $(`#altarSide .altar-floor[data-floor="${n}"]`).classList.contains('off');
    if (!/1층부터|in order from the first|依序啟用|依序启用|順にのみ/.test($('#altarSide .altar-hint').textContent)) bad('누적 규칙 안내 문구 없음');
    change(fSw(2), false);
    if (fOn(2)) bad('2층 OFF 반영 안 됨');
    if (!fOff(2)) bad('2층 .off 클래스 미적용');
    // 역관계 금지: 2층을 끄면 3층도 함께 꺼지고, 1층은 그대로
    if (fOn(3)) bad('2층 OFF 인데 3층이 켜져 있음(역관계)');
    if (fSw(3).checked) bad('3층 체크박스가 화면에 반영 안 됨');
    if (!fOff(3)) bad('3층 .off 클래스 미적용');
    if (!fOn(1)) bad('2층만 껐는데 1층까지 꺼짐');
    ok('층 OFF 캐스케이드: 2층 끄면 3층도 꺼짐 · 1층 유지');
    // 위층을 켜면 아래층이 함께 켜진다
    change(fSw(3), true);
    if (!(fOn(1) && fOn(2) && fOn(3))) bad('3층 켰는데 아래층이 함께 안 켜짐');
    if (!(fSw(1).checked && fSw(2).checked)) bad('아래층 체크박스 화면 미반영');
    if (fOff(1) || fOff(2) || fOff(3)) bad('켠 층에 .off 잔존');
    ok('층 ON 캐스케이드: 3층 켜면 1·2층도 켜짐');
    // 1층을 끄면 전부 꺼진다
    change(fSw(1), false);
    if (fOn(1) || fOn(2) || fOn(3)) bad('1층 껐는데 위층이 남아 있음');
    ok('1층 OFF → 전 층 OFF');
    change(fSw(3), true);                       // 전부 켠 상태로 복귀
    if (!(fOn(1) && fOn(2) && fOn(3))) bad('전 층 복귀 실패');
    change(fSw(2), false);                      // 아래 저장 검사를 위해 다시 2층 OFF
    const first = rows[0], aid = +first.dataset.aid;
    click(first);
    if (first.classList.contains('on') || first.getAttribute('aria-checked') !== 'false') bad('제단 클릭 해제 미반영');
    if (!app.altarCfg.floors[1].off[aid]) bad('제단 해제가 cfg.off 에 없음');
    click(first);
    if (!first.classList.contains('on') || app.altarCfg.floors[1].off[aid]) bad('제단 재클릭 복원 실패');
    const saved = JSON.parse(window.localStorage.getItem('woofia_altar') || 'null');
    if (!saved || saved.on !== true || saved.floors[2].on !== false) bad('localStorage 저장값 불일치');
    else ok('층 OFF · 제단 토글 · localStorage 저장');
    change(fSw(3), true);                       // 전부 켠 상태로 원복

    // ── 언어 전환 재렌더 (본문은 i18n-skip → 모듈이 직접 렌더) ──
    window.localStorage.setItem('woofia_lang', 'en');
    window.document.dispatchEvent(new window.CustomEvent('woofia:lang', { detail: 'en' }));
    await sleep(10);
    const h3 = $('#altarSide .altar-head h3');
    if (!h3 || !h3.textContent.startsWith('Guild Altar Settings')) bad(`영어 재렌더 실패: ${h3 && h3.textContent}`);
    if (!/EX Skill|Boss|Buddies/.test($('#altarSide .altar-row .at').textContent)) bad('제단 효과 영어 텍스트 아님');
    if (!/100% Proc/.test($('#forceProc').title)) bad('잠금 툴팁 영어 아님: ' + $('#forceProc').title);
    if (/[가-힣]/.test($('#altarSide').textContent)) bad('영어 모드 패널에 한글 잔존');
    else ok('언어 전환(en) 재렌더 · 잔존 한글 0');
    window.localStorage.setItem('woofia_lang', 'kr');
    window.document.dispatchEvent(new window.CustomEvent('woofia:lang', { detail: 'kr' }));
    await sleep(10);
    if (!/[가-힣]/.test($('#altarSide .altar-head h3').textContent)) bad('한국어 복귀 실패');

    // ── 닫기 (트랜지션 후 hidden) ──
    click($('[data-altarclose]'));
    if (app.altarOpened) bad('닫기 후 altarOpened 가 true');
    await sleep(450);
    if (!$('#altarSide').hidden || $('.wrap').classList.contains('altar-open')) bad('닫기 후 사이드 패널이 안 접힘');
    else ok('닫기 → 패널 접힘 · 그리드 복원');
    if (btn.getAttribute('aria-expanded') !== 'false') bad('닫은 뒤 aria-expanded 미복원');
    // 버튼 재클릭 = 토글(열림 → 닫힘)
    click(btn); await sleep(30); click(btn); await sleep(450);
    if (!$('#altarSide').hidden) bad('버튼 재클릭으로 닫히지 않음');

    // ── 모바일: 팝업 경로 · Esc 닫기 ──
    mobile = true;
    click(btn); await sleep(30);
    const modal = $('.altar-modal .altar-card');
    if (!modal) bad('모바일에서 팝업이 열리지 않음');
    else {
      if (!$('#altarSide').hidden) bad('모바일에서 사이드 패널이 열림');
      if ($$('.altar-row', modal).length !== 24) bad('모바일 팝업 제단 수 이상');
      if (!modal.classList.contains('altar-card')) bad('팝업 카드 클래스 이상');
      ok('모바일 팝업 렌더 (24 제단)');
      window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(10);
      if ($('.altar-modal')) bad('Esc 로 팝업이 닫히지 않음'); else ok('Esc 닫기');
    }
    // 폭 경계 이동 시 컨테이너 교체 (열린 채 모바일→데스크탑)
    click(btn); await sleep(30);
    mobile = false; mqListeners.forEach(fn => fn({ matches: false }));
    await sleep(30);
    if ($('.altar-modal') || $('#altarSide').hidden) bad('경계 이동 시 팝업→사이드 전환 실패');
    else ok('폭 경계 이동 시 사이드 패널로 전환');
    app.closeAltar(); await sleep(450);

    // ── 잠금이 기록 복원을 이기는지: altarOn 상태에서 forceProc 를 억지로 켠 뒤 syncAltarLock ──
    if (!app.altarOn) bad('마지막 상태는 마스터 ON 이어야 함');
    if (!$('#forceProc').disabled) bad('패널을 닫아도 마스터 ON이면 확률 100% 는 계속 잠겨야 함');
    else ok('패널 닫은 뒤에도 잠금 유지');

    // ── 엔진 계약: payload · 기록 스냅샷 · 공유 코드 왕복 · 복원 ──
    app.openAltar(); await sleep(30);
    const r1 = $$('#altarSide .altar-row');
    click(r1[1]);                                    // 1층 2번째 제단(402) 해제
    const pay = app.altarPayload();
    if (!pay || pay.on !== true) bad('altarPayload: ON인데 null/on!=true');
    else if (JSON.stringify(pay.floors[1].off) !== '[402]') bad(`altarPayload 1층 off 기대 [402], ${JSON.stringify(pay.floors[1].off)}`);
    else if (!(pay.floors[2].on && pay.floors[3].on)) bad('altarPayload 2·3층 on 아님');
    else ok('altarPayload: {on, floors:{f:{on, off:[id]}}}');
    const snap = app.snapshot();
    if (!snap.altar || JSON.stringify(snap.altar) !== JSON.stringify(pay)) bad('snapshot().altar 가 payload 와 다름');
    else ok('기록 스냅샷에 altar 포함');
    const rec = { id: 1, snap, total: 0 };
    if (!app.usesNew(rec)) bad('제단 ON 기록은 새 기능(v2 코드)으로 분류돼야 함');
    const packed = app.packSnapV2(snap);
    const tail = packed[packed.length - 1];
    if (tail !== '3:402//') bad(`공유 코드 꼬리 기대 '3:402//', ${JSON.stringify(tail)}`);
    const back = app.unpackSnapV2(JSON.parse(JSON.stringify(packed)));
    if (!app.looseEq(snap, back)) bad('공유 코드 v2 왕복 불일치(altar)');
    else ok(`공유 코드 v2 왕복 (꼬리 ${tail})`);
    // OFF 기록: 꼬리가 비어 trim 되고, 복원하면 제단이 꺼진다
    change($('[data-altarsw]'), false);
    const snapOff = app.snapshot();
    if (snapOff.altar !== null) bad('OFF면 snapshot().altar 는 null');
    const packedOff = app.packSnapV2(snapOff);
    if (typeof packedOff[packedOff.length - 1] === 'string' && /^\d:/.test(packedOff[packedOff.length - 1])) bad('OFF인데 공유 코드에 제단 꼬리가 실림');
    if (!app.looseEq(snapOff, app.unpackSnapV2(JSON.parse(JSON.stringify(packedOff))))) bad('OFF 기록 v2 왕복 불일치');
    else ok('OFF 기록: 꼬리 생략 · 왕복 일치');
    app.applyAltarSnap(back.altar);                  // 복원 → ON · 402 해제 · 층 전부 ON
    if (!app.altarOn || !app.altarCfg.floors[1].off[402] || !app.altarCfg.floors[3].on) bad('applyAltarSnap 복원 실패');
    if (!$('#forceProc').disabled) bad('복원으로 제단 ON이면 확률 100% 잠겨야 함');
    const row402 = $('#altarSide .altar-row[data-aid="402"]');
    if (!row402 || row402.classList.contains('on')) bad('복원 후 402 행이 해제 상태로 렌더되지 않음');
    else ok('applyAltarSnap: 설정·화면·잠금 복원');
    // ── 궁극기 사용 방식(캐릭터 창) · 402 CD+1 플래너 · 맞추기 그룹 · 공유 코드 ──
    if (!app.team[0]) app.addTeam(10402);
    if (!app.team[1]) app.addTeam(10404);
    app.applyAltarSnap({ on: true, floors: { 1: { on: true, off: [402] }, 2: { on: true, off: [] }, 3: { on: true, off: [] } } });
    const m0 = app.CHARS[app.team[0].id];
    if (app.cdPlus() !== 1 || app.fcd(m0) !== m0.fatalCd + 1 || app.ffat(m0) !== m0.firstFatal + 1) bad(`402 해제 시 cdPlus=1·CD+1 기대: ${app.cdPlus()} ${app.fcd(m0)}/${m0.fatalCd}`);
    else ok('402(최대 CD+1) 해제 → 플래너 CD 모델 +1');
    const dp = app.defaultPlan(m0, 12);
    if (dp.indexOf('궁') !== m0.firstFatal) bad(`기본 계획 첫 궁 턴이 +1 밀려야 함: ${dp.indexOf('궁') + 1} vs ${m0.firstFatal + 1}`);
    else ok('기본 계획의 궁 주기가 402 를 반영');
    await app.openModal(0); await sleep(30);
    const ub = $('#modalCard .mc-ult');
    if (!ub) bad('제단 ON인데 캐릭터 창에 궁극기 사용 방식 섹션이 없음');
    else {
      if ($$('[data-ultmode]', ub).length !== 3) bad('방식 버튼 3개 기대');
      if (!$('[data-ultmode="fixed"]', ub).classList.contains('on')) bad('기본 방식은 정해진 턴(fixed)');
      click($('[data-ultmode="asap"]', ub));
      const u = app.ultOf(app.team[0]);
      if (u.mode !== 'asap' || u.keepDef !== true) bad(`asap 선택 반영 실패: ${JSON.stringify(u)}`);
      change($('[data-ultkeep]', ub), false);
      if (app.ultOf(app.team[0]).keepDef !== false) bad('방어 유지 해제 반영 실패');
      else ok('캐릭터 창: 방식 선택 · 방어 유지 토글');
      const ps = app.packSlot(JSON.parse(JSON.stringify(app.team[0])));
      if (ps[ps.length - 1] !== 'a!') bad(`슬롯 공유 코드 꼬리 'a!' 기대, ${JSON.stringify(ps[ps.length - 1])}`);
      const us = app.unpackSlot(JSON.parse(JSON.stringify(ps)));
      if (!us.ult || us.ult.mode !== 'asap' || us.ult.keepDef !== false) bad('슬롯 공유 코드 ult 왕복 실패');
      else ok('슬롯 공유 코드: ult 꼬리 왕복');
      click($('[data-ultmode="fixed"]', ub)); change($('[data-ultkeep]', ub), true);   // 기본으로 되돌리면 키가 지워져야 한다
      if ('ult' in app.team[0]) bad('기본 방식으로 되돌리면 slot.ult 키가 없어야 함(공유 코드 왕복)');
      const ps0 = app.packSlot(JSON.parse(JSON.stringify(app.team[0])));
      if (typeof ps0[ps0.length - 1] === 'string' && /^[fsa]!?$/.test(ps0[ps0.length - 1])) bad('기본 방식이면 슬롯 꼬리가 생략돼야 함');
    }
    app.closeCharModal();
    app.closeAltar(); await sleep(450); app.openAltar(); await sleep(30);
    const gsel = $('#altarSide [data-anchor="0"]');
    if (!gsel) bad('맞추기 그룹 앵커 선택이 없음');
    else if ($$('#altarSide .as-group').length !== 1) bad(`처음엔 그룹 1개만 보여야 함, ${$$('#altarSide .as-group').length}`);
    else {
      gsel.value = '1'; gsel.dispatchEvent(new window.Event('change', { bubbles: true }));
      await sleep(10);
      if ($$('#altarSide .as-group').length !== 2) bad(`그룹1 앵커 지정 후 그룹2가 나타나야 함, ${$$('#altarSide .as-group').length}`);
      else ok('그룹은 앞 그룹을 정해야 다음이 나타남(1→2)');
      const mem = $('#altarSide .as-group[data-g="0"] .as-m[data-p="2"]');
      if (!mem || mem.disabled) bad('앵커 지정 후 멤버 버튼이 활성이어야 함(팀 2번 자리 필요)');
      else {
        click(mem); await sleep(10);
        const pay = app.altarPayload();
        if (!pay.groups || pay.groups.length !== 1 || pay.groups[0].anchor !== 1 || pay.groups[0].members[0].p !== 2 || pay.groups[0].members[0].order !== 'before') bad(`그룹 payload 이상: ${JSON.stringify(pay.groups)}`);
        else ok('맞추기 그룹: 앵커 P1 · 멤버 P2(앞)');
        click($('#altarSide .as-group[data-g="0"] .as-ord[data-p="2"]')); await sleep(10);
        if (app.altarPayload().groups[0].members[0].order !== 'after') bad('앞/뒤 전환 실패');
        click($('#altarSide .as-group[data-g="0"] [data-miss="asap"]')); await sleep(10);
        if (app.altarPayload().groups[0].miss !== 'asap') bad('미준비 처리 전환 실패');
        const a1 = $('#altarSide [data-anchor="1"] option[value="1"]'), a2 = $('#altarSide [data-anchor="1"] option[value="2"]');
        if (!a1 || !a1.disabled || !a2 || !a2.disabled) bad('다른 그룹에서 이미 쓰인 포지션은 비활성이어야 함');
        else ok('앞/뒤 · 미준비 처리 전환 · 포지션 중복 차단');
        const snapG = app.snapshot();
        const packedG = app.packSnapV2(snapG);
        const tailG = packedG[packedG.length - 1];
        if (tailG !== '3:402//|12a*') bad(`그룹 포함 공유 코드 꼬리 기대 '3:402//|12a*', ${JSON.stringify(tailG)}`);
        const backG = app.unpackSnapV2(JSON.parse(JSON.stringify(packedG)));
        if (!app.looseEq(snapG, backG)) bad('그룹 포함 공유 코드 왕복 불일치');
        else ok(`공유 코드 v2 왕복 (그룹 꼬리 ${tailG})`);
        await app.openModal(1); await sleep(30);
        const info = $('#modalCard .mc-ult .ult-sync');
        if (!info || $('#modalCard .mc-ult [data-ultmode]')) bad('멤버 캐릭터 창엔 방식 버튼 대신 맞추기 안내가 떠야 함');
        else ok('멤버 캐릭터 창: 맞추기 안내 표시');
        app.closeCharModal();
      }
    }
    app.applyAltarSnap(null);
    if (app.altarOn) bad('applyAltarSnap(null) 이면 제단 OFF 여야 함');
    if (app.cdPlus() !== 0) bad('제단 OFF면 cdPlus 0');
    await app.openModal(0); await sleep(30);
    if ($('#modalCard .mc-ult')) bad('제단 OFF면 캐릭터 창에 궁극기 사용 방식이 보이면 안 됨');
    else ok('제단 OFF → 방식 섹션 숨김');
    app.closeCharModal();
    app.openAltar(); await sleep(30);
    if (!/피격 데미지 모드|Incoming Damage|被擊傷害|被击伤害|被ダメージ/.test($('#altarSide .altar-note').textContent)) bad('패널 하단 안내(피격 모드) 문구 없음');
    else ok('하단 안내: 피격 모드 조건 · 중복 합산');
    app.closeAltar(); await sleep(450);
  } catch (e) {
    bad(`예외: ${e.stack}`);
  }
  finish();
}
function finish() {
  console.log(steps.join('\n'));
  console.log(errors.length ? `\n실패 ${errors.length}건` : '\n제단 설정 UI 검사 통과');
  process.exit(errors.length ? 1 : 0);
}
main();
