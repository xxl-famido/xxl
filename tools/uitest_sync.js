/**
 * 행동 고급 설정 3탭(턴별 타임라인 · 궁극기 사용 방식 · 연동) UI 런타임 검사 — jsdom 으로 app.js 를 띄워 실제로 조작한다.
 *
 * uitest_altar.js 와 같은 방식(로컬 서버 8777 + jsdom). 보는 것:
 *   · 탭 전환 · '사용' 스위치는 타임라인 탭에서만
 *   · 궁극기 사용 방식: 제단 OFF 에서도 편집 · 확률 CD 감소 제단 안내 + 원클릭 전환
 *   · 연동: 앵커/멤버 · '방어/평타 → 받은 추가 행동에서 궁' · 순서 고정 · 흐름 문장 · 욱영 프리셋
 *   · 실행 페이로드(cfg.sync · team[].ult) · 결과 헤더 · 엔진 결과(마타야 방어 → 욱영 궁 → 마타야 궁)
 *   · 기록 스냅샷 · 공유 코드 v2 왕복(신 꼬리) · 구 코드(제단 안 그룹) 마이그레이션
 *   · 충돌 경고(타임라인 ON + 특정 턴 순서/캐릭터별 계획) · 언어 전환 잔존 한글 0
 *
 *   python server.py &  →  node tools/uitest_sync.js     (실패 1 · jsdom 없음 2)
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
const HANGUL = /[가-힣]/;
const MATAYA = 10442, UK = 10439, RICANO = 10428;
async function waitFor(fn, label, timeout = 30000) {
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
  const d = window.document;
  const $ = (s, r = d) => r.querySelector(s);
  const $$ = (s, r = d) => [...r.querySelectorAll(s)];
  window.addEventListener('error', (e) => bad(`window error: ${e.error && e.error.stack || e.message}`));
  window.addEventListener('unhandledrejection', (e) => bad(`unhandled rejection: ${e.reason}`));
  const sent = [];                          // /api/simulate · /api/probe 요청 본문
  window.fetch = (u, o) => {
    const url = String(u);
    if (/\/api\/(simulate|probe)/.test(url) && o && o.body) { try { sent.push({ url, cfg: JSON.parse(o.body) }); } catch { } }
    return fetch(new URL(u, BASE).href, o);
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  window.Worker = function () { throw new Error('worker unused on local'); };
  window.alert = (m) => bad(`alert: ${m}`);

  const probe = `
    ;window.__sy = {
      get CHARS(){return CHARS}, get team(){return team}, setTeam(v){team = v; renderTeam(); renderPrio();},
      get syncGroups(){return syncGroups}, syncPayload(){return syncPayload()}, applySyncSnap(g){return applySyncSnap(g)},
      get advOn(){return advOn}, get advTab(){return advTab}, set advTab(v){advTab = v},
      get turnOverrides(){return turnOverrides}, set turnOverrides(v){turnOverrides = v},
      openAdvPop(){return openAdvPop()}, closeAdv(){ if (advCloseFn) advCloseFn(); },
      snapshot(){return snapshot()}, packSnapV2(s){return packSnapV2(s)}, unpackSnapV2(a){return unpackSnapV2(a)},
      looseEq(a,b){return looseEq(a,b)}, migrateSnapSync(s){return migrateSnapSync(s)},
      ultOf(s){return ultOf(s)}, applyAltarSnap(a){return applyAltarSnap(a)}, get altarOn(){return altarOn},
      run(save){return run(save)}, get lastResult(){return lastResult}, get altarNames(){return altarNames},
    };`;
  window.eval(fs.readFileSync(path.join(DASH, 'spec.js'), 'utf8'));
  try { window.eval(fs.readFileSync(path.join(DASH, 'app.js'), 'utf8') + probe); }
  catch (e) { bad(`app.js 로드 실패: ${e.stack}`); return finish(); }
  const app = window.__sy;
  const click = (el) => el && el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const change = (el, v) => { if (typeof v === 'boolean') el.checked = v; else el.value = v; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
  const slot = (id) => ({ id, skill: 10, rune: true, rotation: '' });
  const name = (id) => (app.CHARS[id] || {}).name || String(id);
  const kinds = (log, cid, turn) => {          // 그 턴에 cid 가 한 행동 종류(액션 id 로 묶음)
    const seen = new Set(), out = [];
    for (const ev of log) {
      if (ev.turn !== turn || ev.actorId !== cid || seen.has(ev.act) || !['보통공격', '필살기', '방어'].includes(ev.kind)) continue;
      seen.add(ev.act); out.push(ev.kind);
    }
    return out;
  };

  try {
    await waitFor(() => Object.keys(app.CHARS).length > 0 && $('#teamSlots').children.length, '초기화');
    app.setTeam([slot(MATAYA), slot(UK), slot(RICANO), null, null]);
    app.applyAltarSnap(null);
    app.applySyncSnap(null);
    app.team.forEach(s => { if (s) { delete s.ult; delete s.usePlan; } });
    app.turnOverrides = {};
    $('#turns').value = '7'; $('#turns').dispatchEvent(new window.Event('input'));
    $('#runs').value = '1'; $('#runs').dispatchEvent(new window.Event('input'));
    ok(`편성: ${name(MATAYA)} · ${name(UK)} · ${name(RICANO)} (제단 OFF · 연동 없음)`);

    // ── 탭 ──
    click($('#advOpen'));
    const card = await waitFor(() => $('.adv-card'), '고급 설정 팝업');
    await waitFor(() => $('.adv-track', card).children.length, '타임라인 프로브');
    const tabs = $$('[data-advtab]', card);
    if (tabs.length !== 3) bad(`탭 3개 기대, ${tabs.length}`);
    if ($('.adv-pane-time', card).hidden || !$('.adv-pane-ult', card).hidden || !$('.adv-pane-sync', card).hidden) bad('처음엔 타임라인 탭만 보여야 함');
    if ($('#advSwitchWrap', card).closest('[hidden]')) bad("타임라인 탭에선 '사용' 스위치가 보여야 함");
    if (!$('#advSwitchWrap', card).closest('.adv-pane-time')) bad("'사용' 스위치는 타임라인 탭 안에 있어야 함");
    if ($('#advSwitchWrap', card).closest('.off')) bad("스위치가 흐린(.off) 영역 안에 있으면 켤 수 없음");
    click($('[data-advtab="ult"]', card)); await sleep(20);
    if ($('.adv-pane-ult', card).hidden || !$('.adv-pane-time', card).hidden) bad('궁극기 사용 방식 탭 전환 실패');
    if (!$('#advSwitchWrap', card).closest('[hidden]')) bad("다른 탭에선 '사용' 스위치가 보이면 안 됨(항상 적용)");
    if ($$('.adv-pane-ult .adv-order li', card).length !== 4) bad('궁극기 사용 방식 탭에 우선순위 설명(4항목)이 없음');
    if (!$('[data-advtab="ult"]', card).classList.contains('on')) bad('선택된 탭에 .on 이 없음');
    ok('탭 3개 · 전환 · 스위치는 타임라인 탭에서만');

    // ── 궁극기 사용 방식 탭 (제단 OFF) ──
    const rows = $$('.adv-pane-ult .au-row', card);
    if (rows.length !== 3) bad(`캐릭터 행 3개 기대, ${rows.length}`);
    if ($$('[data-ultmode]', rows[0]).length !== 3) bad('행마다 방식 버튼 3개');
    if (!$('[data-ultmode="fixed"]', rows[0]).classList.contains('on')) bad('기본 방식은 정해진 턴');
    click($('[data-ultmode="asap"][data-pos="1"]', card)); await sleep(150);
    let u = app.ultOf(app.team[0]);
    if (u.mode !== 'asap' || u.keepDef !== true) bad(`asap 선택 반영 실패: ${JSON.stringify(u)}`);
    await waitFor(() => $('[data-ultkeep="1"]', $('.adv-card')), '재렌더');
    change($('[data-ultkeep="1"]', $('.adv-card')), false); await sleep(150);
    if (app.ultOf(app.team[0]).keepDef !== false) bad('방어 유지 해제 반영 실패');
    else ok('궁극기 사용 방식: 제단 OFF 에서도 편집(asap · 방어 유지 해제)');
    if (!$('.adv-pane-ult .adv-note.warn', $('.adv-card')) === false) { /* no-op */ }
    if ($('.adv-pane-ult [data-ultall]', $('.adv-card'))) bad('제단 OFF 인데 확률 CD 감소 안내가 보임');
    await waitFor(() => $('[data-ultmode="fixed"][data-pos="1"]', $('.adv-card')), '재렌더');
    click($('[data-ultmode="fixed"][data-pos="1"]', $('.adv-card'))); await sleep(150);
    await waitFor(() => $('[data-ultkeep="1"]', $('.adv-card')), '재렌더');
    change($('[data-ultkeep="1"]', $('.adv-card')), true); await sleep(150);
    if ('ult' in app.team[0]) bad('기본으로 되돌리면 slot.ult 키가 없어야 함');
    else ok('기본(정해진 턴 · 유지)으로 되돌리면 키 제거');

    // ── 확률 CD 감소 제단(1012·1013) 안내 + 원클릭 전환 ──
    // 팝업이 열려 있는 동안 배경은 inert 라 제단을 바꿀 수 없다 — 실제 흐름대로 닫고 바꾼 뒤 다시 연다
    app.closeAdv(); await sleep(30);
    app.applyAltarSnap({ on: true, floors: { 1: { on: true, off: [] }, 2: { on: true, off: [] }, 3: { on: true, off: [] } } });
    app.advTab = 'ult'; app.openAdvPop();
    const allBtn = await waitFor(() => $('.adv-pane-ult [data-ultall]', $('.adv-card')), '확률 CD 안내');
    click(allBtn); await sleep(200);
    if (!app.team.every(s => !s || app.ultOf(s).mode === 'asap')) bad("원클릭 전환 후 전원 '준비되면 바로' 여야 함");
    else ok("확률 CD 감소 제단 안내 → 모두 '준비되면 바로'");
    app.closeAdv(); await sleep(30);
    app.applyAltarSnap({ on: true, floors: { 1: { on: true, off: [1012, 1013] }, 2: { on: true, off: [] }, 3: { on: true, off: [] } } });
    app.openAdvPop();
    await waitFor(() => $('.adv-card .adv-pane-ult .au-row'), '재렌더');
    if ($('.adv-pane-ult [data-ultall]', $('.adv-card'))) bad('1012·1013 을 끄면 안내가 사라져야 함');
    else ok('1012·1013 해제 → 안내 없음');
    app.closeAdv(); await sleep(30);
    app.applyAltarSnap(null);
    app.team.forEach(s => { if (s) delete s.ult; });
    app.advTab = 'sync'; app.openAdvPop();
    await waitFor(() => $('.adv-card .adv-pane-sync .as-group'), '연동 탭');

    // ── 연동 탭 ──
    let c = $('.adv-card');
    if ($('.adv-pane-sync', c).hidden) bad('연동 탭 전환 실패');
    if ($$('.adv-pane-sync .as-group', c).length !== 1) bad(`처음엔 그룹 1개만, ${$$('.adv-pane-sync .as-group', c).length}`);
    if (!$('.adv-pane-sync [data-spreset="uk"]', c)) bad('욱영이 편성에 있으면 프리셋 버튼이 보여야 함');
    change($('.adv-pane-sync [data-anchor="0"]', c), '2'); await sleep(200);
    c = $('.adv-card');
    if (!app.syncGroups[0] || app.syncGroups[0].anchor !== 2) bad(`앵커 P2 지정 실패: ${JSON.stringify(app.syncGroups)}`);
    if ($$('.adv-pane-sync .as-group', c).length !== 2) bad('앵커 지정 후 그룹2가 나타나야 함');
    const chip = $('.adv-pane-sync .as-group[data-g="0"] .as-m[data-p="1"]', c);
    if (!chip || chip.disabled) bad('멤버 버튼(P1)이 활성이어야 함');
    click(chip); await sleep(200);
    c = $('.adv-card');
    let g = app.syncGroups[0];
    if (!g || g.members.length !== 1 || g.members[0].p !== 1 || g.members[0].order !== 'before' || g.members[0].base) bad(`멤버 P1 추가 이상: ${JSON.stringify(g)}`);
    else ok('연동: 앵커 P2 · 멤버 P1(같이 궁 · 앞)');
    const smRow = $('.adv-pane-sync .sm-row', c);
    if (!smRow || $$('[data-sbase]', smRow).length !== 3) bad('멤버 행에 행동 선택 3개(같이 궁/방어→/평타→) 기대');
    if (!$('[data-sord]', smRow)) bad("'같이 궁' 이면 앞/뒤 선택이 보여야 함");
    click($('[data-sord="after"]', smRow)); await sleep(200);
    if (app.syncGroups[0].members[0].order !== 'after') bad('앵커 뒤 전환 실패');
    c = $('.adv-card');
    click($('.adv-pane-sync .sm-row [data-sbase="defend"]', c)); await sleep(200);
    c = $('.adv-card');
    g = app.syncGroups[0];
    if (g.members[0].base !== 'defend' || g.members[0].order !== 'before') bad(`방어→추가 행동에서 궁 선택 시 base=defend·order=before 기대: ${JSON.stringify(g.members[0])}`);
    else ok("'방어 → 받은 추가 행동에서 궁' 선택 → 순서는 앵커 앞으로 고정");
    const row2 = $('.adv-pane-sync .sm-row', c);
    if ($('[data-sord]', row2)) bad('보류 멤버에겐 앞/뒤 선택이 없어야 함(고정)');
    if (!$('.sm-fixed', row2)) bad('순서 고정 안내가 없음');
    if ($('.sm-note', row2)) bad('욱영은 추가 행동을 주므로 "안 줌" 안내가 없어야 함');
    const flow = $('.adv-pane-sync .sg-flow', c);
    if (!flow) bad('흐름 문장(.sg-flow)이 없음');
    else {
      const t = flow.textContent;
      const i1 = t.indexOf('방어'), i2 = t.indexOf(name(UK) + ' 궁'), i3 = t.lastIndexOf('궁 (받은 추가 행동)');
      if (!(i1 >= 0 && i2 > i1 && i3 > i2)) bad(`흐름 문장 순서 이상: ${t}`);
      else ok(`흐름 문장: ${t.replace(/\s+/g, ' ').trim()}`);
    }
    click($('.adv-pane-sync .as-group[data-g="0"] [data-miss="asap"]', c)); await sleep(200);
    if (app.syncGroups[0].miss !== 'asap') bad('미준비 처리 전환 실패');
    else ok('미준비 처리: 준비되면 바로');

    // ── 실행 페이로드 · 결과 헤더 · 엔진 결과 ──
    const pl = app.syncPayload();
    if (!pl || pl.length !== 1 || pl[0].anchor !== 2 || pl[0].members[0].base !== 'defend') bad(`syncPayload 이상: ${JSON.stringify(pl)}`);
    const probeCfg = sent.filter(x => x.url.includes('probe')).pop();
    if (!probeCfg || !probeCfg.cfg.sync || probeCfg.cfg.sync[0].anchor !== 2) bad('플래너 프로브 cfg 에 sync 가 실리지 않음');
    else ok('플래너 프로브 cfg.sync 반영');
    app.team[2].ult = { mode: 'asap', keepDef: true };            // 제단 OFF 에서 team[].ult 가 실리는지
    app.closeAdv(); await sleep(30);
    await app.run(false); await sleep(200);
    const simCfg = sent.filter(x => x.url.includes('simulate')).pop();
    if (!simCfg || !simCfg.cfg.sync || simCfg.cfg.sync[0].members[0].base !== 'defend') bad('실행 cfg.sync 누락');
    else if (simCfg.cfg.altar !== null) bad('제단 OFF 인데 cfg.altar 가 null 이 아님');
    else if (!simCfg.cfg.team[2].ult || simCfg.cfg.team[2].ult.mode !== 'asap') bad('제단 OFF 인데 team[].ult 가 실리지 않음');
    else ok('실행 cfg: sync · team[].ult (제단 OFF)');
    const res = app.lastResult;
    if (!res || res.meta.sync !== 1) bad(`meta.sync=1 기대: ${res && res.meta.sync}`);
    if (!/연동 1그룹/.test($('#topMeta').textContent)) bad(`결과 헤더에 연동 그룹 수가 없음: ${$('#topMeta').textContent}`);
    else ok('결과 헤더: 연동 1그룹');
    const k4 = res ? kinds(res.log, MATAYA, 4) : [];
    if (k4.join(',') !== '방어,필살기') bad(`4턴 마타야 행동 기대 [방어, 필살기], ${JSON.stringify(k4)}`);
    else ok(`엔진: 4턴 ${name(MATAYA)} 방어 → ${name(UK)} 궁 → ${name(MATAYA)} 궁(추가 행동)`);
    delete app.team[2].ult;

    // ── 기록 스냅샷 · 공유 코드 v2 왕복 · 구 코드 마이그레이션 ──
    const snap = app.snapshot();
    if (!snap.sync || snap.sync[0].members[0].base !== 'defend') bad('snapshot().sync 누락');
    const packed = app.packSnapV2(snap);
    const tail = packed[packed.length - 1];
    if (tail !== '21bd*') bad(`공유 코드 꼬리 '21bd*' 기대, ${JSON.stringify(tail)}`);
    const back = app.unpackSnapV2(JSON.parse(JSON.stringify(packed)));
    if (!app.looseEq(snap, back)) bad(`공유 코드 v2 왕복 불일치: ${JSON.stringify(back.sync)}`);
    else ok(`공유 코드 v2 왕복 (꼬리 ${tail})`);
    // 구 코드: 그룹이 제단 꼬리 안('3://|12a*')에 실려 있던 형식 → sync 로 옮겨지고 altar.groups 는 사라진다
    const legacy = JSON.parse(JSON.stringify(packed));
    legacy[legacy.length - 1] = '';
    while (legacy.length < 11) legacy.push('');
    legacy[10] = '3://|12a*'; legacy.length = 11;
    const lb = app.unpackSnapV2(legacy);
    if (!lb.sync || lb.sync[0].anchor !== 1 || lb.sync[0].members[0].p !== 2 || lb.sync[0].members[0].order !== 'after' || lb.sync[0].miss !== 'asap') bad(`구 코드 그룹 복원 실패: ${JSON.stringify(lb.sync)}`);
    else if (lb.altar && lb.altar.groups) bad('구 코드 복원 후 altar.groups 가 남아 있음');
    else ok('구 공유 코드(제단 안 그룹) → sync 로 마이그레이션');
    const oldSnap = { altar: { on: false, groups: [{ anchor: 1, members: [{ p: 2 }] }] } };
    app.migrateSnapSync(oldSnap);
    if (!oldSnap.sync || oldSnap.altar.groups) bad('migrateSnapSync 실패');
    else ok('옛 기록 스냅샷 마이그레이션');

    // ── 프리셋(욱영): 인접 아군 평타 → 욱영 궁 → 추가 행동에서 궁 ──
    app.advTab = 'sync'; app.openAdvPop();
    await waitFor(() => $('.adv-card .adv-pane-sync [data-spreset="uk"]'), '연동 탭');
    click($('.adv-card .adv-pane-sync [data-spreset="uk"]')); await sleep(200);
    g = app.syncGroups[0];
    const mem = (g && g.members || []).map(m => `${m.p}${m.base || ''}`).sort().join(',');
    if (!g || g.anchor !== 2 || mem !== '1basic,3basic') bad(`프리셋 결과 이상: ${JSON.stringify(app.syncGroups)}`);
    else ok('프리셋: 앵커 욱영 · 인접 P1·P3 평타→추가 행동에서 궁');

    // ── 충돌 경고: 타임라인 ON + 특정 턴 순서 · 캐릭터별 계획 ──
    app.turnOverrides = { 4: [2, 1, 3] };
    app.team[0].usePlan = true;
    click($('.adv-card [data-advtab="time"]')); await sleep(20);
    change($('#advSwitch'), true);
    await waitFor(() => app.advOn && !$('.adv-card .adv-conflict').hidden, '충돌 경고');
    const ct = $('.adv-card .adv-conflict').textContent;
    if (!(ct.includes('4') && ct.includes(name(MATAYA)))) bad(`충돌 경고 내용 이상: ${ct}`);
    else ok(`충돌 경고: ${ct.slice(0, 60)}…`);
    if (!$('.adv-card .adv-pane-ult .adv-note.lock')) bad('타임라인 ON 이면 사용 방식 탭에 안내가 있어야 함');
    change($('#advSwitch'), false); await sleep(300);
    if (!$('.adv-card .adv-conflict').hidden) bad('타임라인 OFF 면 충돌 경고가 숨어야 함');
    else ok('타임라인 OFF → 충돌 경고 숨김');
    delete app.team[0].usePlan; app.turnOverrides = {};

    // ── 언어 전환: 두 탭 본문에 한글 0 (캐릭터 이름은 다국어 메타가 로드되면 번역, 아니면 P번호만) ──
    await waitFor(() => app.altarNames && Object.keys(app.altarNames).length, 'chars.json 이름');
    window.localStorage.setItem('woofia_lang', 'en');
    d.dispatchEvent(new window.Event('woofia:lang'));
    app.closeAdv(); await sleep(30);
    app.openAdvPop();
    await waitFor(() => $('.adv-card .adv-pane-sync .as-group'), '재렌더');
    const txt = $('.adv-card .adv-pane-ult').textContent + $('.adv-card .adv-pane-sync').textContent + $('.adv-card .adv-tabs').textContent;
    if (HANGUL.test(txt)) bad(`영어 전환 후 한글 잔존: ${txt.match(/[^\n]*[가-힣][^\n]*/)[0].slice(0, 80)}`);
    else ok('언어 전환(en): 사용 방식·연동 탭 잔존 한글 0');
    window.localStorage.setItem('woofia_lang', 'kr');
    d.dispatchEvent(new window.Event('woofia:lang'));
    app.closeAdv(); await sleep(30);
    app.applySyncSnap(null);
  } catch (e) {
    bad(`예외: ${e.stack}`);
  }
  finish();
}
function finish() {
  console.log(steps.join('\n'));
  console.log(errors.length ? `\n실패 ${errors.length}건` : '\n행동 고급 설정 탭 UI 검사 통과');
  process.exit(errors.length ? 1 : 0);
}
main();
