/**
 * v2 회귀 하네스 — 실제 Chrome(headless)에서 http://localhost:8778 을 띄워 흐름을 검사한다.
 *
 *   python server_v2.py &  →  NODE_PATH=/c/Users/ZRUN/node_modules node tools/uitest_v2.js [--base http://localhost:8778]
 *
 * 검사: 부팅·자동 실행 / 편성 / 행동 계획 / 조건 / 실행·기록 / 기록 복원·되돌리기 / 공유 코드 왕복 / 초안 복원 /
 *       팀 비교 / 언어·테마 / 모바일 넘침·터치 타깃 / 접근성(포커스·라벨) / 콘솔 에러 0.
 * 상태는 window.__woofia(ctx) 로 읽는다 — DOM 조작은 실제 클릭으로.
 */
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = (process.argv.indexOf('--base') > 0 ? process.argv[process.argv.indexOf('--base') + 1] : null) || process.env.UITEST_BASE || 'http://localhost:8778';

let pass = 0, fail = 0; const fails = [];
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function newPage(browser, mobile = false) {
  const p = await browser.newPage();
  await p.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
  const errors = [];
  p.on('console', m => { if (m.type() === 'error' && !/404|favicon/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  p.on('pageerror', e => errors.push('PAGEERR ' + e.message));
  p.errors = errors;
  return p;
}
const boot = async p => {
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.__woofia && window.__woofia.store.get().ui && window.__woofia.store.get().ui.booted, { timeout: 90000 });
  await p.waitForFunction(() => !!window.__woofia.store.get().result, { timeout: 90000 });
  await sleep(300);
};
const S = p => p.evaluate(() => window.__woofia.store.get());
const snap = p => p.evaluate(() => window.__woofia.store.snapshot());
const click = async (p, sel) => { await p.waitForSelector(sel, { timeout: 10000 }); await p.click(sel); await sleep(250); };

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  try {
    // ── 1. 부팅 ──
    console.log('[부팅]');
    let p = await newPage(browser);
    await p.evaluate(() => localStorage.clear()).catch(() => {});
    await boot(p);
    let s = await S(p);
    ok('동료 42+ 로드', Object.keys(s.chars).length >= 42);
    ok('기본 편성 5', s.team.filter(Boolean).length === 5);
    ok('부팅 자동 실행 결과', !!s.result && s.result.meta && s.result.meta.totalMid > 0);
    ok('로딩 오버레이 제거', await p.evaluate(() => !document.getElementById('app-boot')));
    ok('결과 섹션 표시', await p.evaluate(() => !document.getElementById('app-result').hidden));
    ok('기록 0건(자동 실행은 저장 안 함)', s.records.length === 0);
    ok('적 공격 대상 수 기본 = 전체(2026-09-28)', s.cond.enemyHits === 'all', String(s.cond.enemyHits));

    // ── 2. 편성 ──
    console.log('[편성]');
    const anyFree = await p.evaluate(() => [...document.querySelectorAll('#app-team .tile:not(.in)')][0].dataset.id);
    await click(p, '#app-team .tile.in');                       // 편성된 첫 타일 → 해제
    s = await S(p); ok('타일 재클릭으로 해제', s.team.filter(Boolean).length === 4);
    await click(p, `#app-team .tile[data-id="${anyFree}"]`);   // 빈 자리에 추가
    await sleep(500);
    s = await S(p); ok('타일 클릭으로 추가', s.team.filter(Boolean).length === 5 && s.team.some(x => x && String(x.id) === String(anyFree)));
    await p.type('#app-team input[type="search"]', '리카노'); await sleep(200);
    ok('이름 검색 필터', await p.evaluate(() => [...document.querySelectorAll('#app-team .tile')].filter(t => t.offsetParent !== null).length === 1));
    await p.evaluate(() => { const i = document.querySelector('#app-team input[type="search"]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(200);
    ok('편성 인원 표시', await p.evaluate(() => /5/.test(document.querySelector('#app-team .count')?.textContent || '')));

    // ── 3. 행동 계획(메인 = 라이트) ──
    console.log('[행동 계획]');
    const rows = await p.$$('#app-plan .prio > li');
    ok('순서 행 5개', rows.length === 5);
    ok('미리보기 150칸(읽기 전용) · 딥 요소 없음', await p.evaluate(() => document.querySelectorAll('#app-plan .pv-cells i').length === 150
      && !document.querySelector('#app-plan .pg, #app-plan .switch, #app-plan .sync-list, #app-plan .pl-legend')));
    ok('하단 진입 버튼(전체 폭) · 머리 버튼 없음 · 배너 숨김', await p.evaluate(() => { const b = document.querySelector('#app-plan .adv-enter');
      return !!b && b.getBoundingClientRect().width > document.querySelector('#app-plan').getBoundingClientRect().width * 0.8 && /세부 행동/.test(b.textContent)
        && !document.querySelector('#app-plan .panel-head .pl-adv-btn') && document.querySelector('#app-plan .adv-banner').hidden; }));
    ok('방식 select = 자동/직접 지정 둘', await p.evaluate(() => [...document.querySelectorAll('#app-plan .ult-mode select')].every(x => x.options.length === 2)));
    await click(p, '#app-plan .prio > li:nth-child(2) .mv button:first-child');
    s = await S(p); ok('▲ 이동 반영', s.team.some(x => x && x.priority != null));
    const pinPos = await p.evaluate(() => +document.querySelector('#app-plan .prio > li:nth-child(3)').dataset.pos);
    await p.select('#app-plan .prio > li:nth-child(3) .ult-mode select', 'direct'); await sleep(300);
    ok('직접 지정 → 행 아래 30칸 줄', await p.evaluate(pos => document.querySelectorAll(`#app-plan .prio > li[data-pos="${pos}"] .plan-strip .plan-cells > button`).length === 30, pinPos));
    ok('메인 프리셋에 모두 필살기·첫 필살기 당기기 없음', await p.evaluate(() => !document.querySelector('#app-plan [data-preset="allUlt"], #app-plan [data-preset="early"]')));
    await p.click(`#app-plan .prio > li[data-pos="${pinPos}"] .plan-cells button[data-t="2"]`); await sleep(250);
    ok('칸 클릭 → 선택 팝오버(필살기 비활성 + 이유 · 패턴 반복)', await p.evaluate(() => { const m = document.querySelector('.menu.pl-pop'); if (!m) return false;
      const b = [...m.querySelectorAll('button')]; return b.length === 4 && b[1].disabled && !!b[1].querySelector('.pl-pop-why') && /패턴으로 반복/.test(b[3].textContent); }));
    await p.evaluate(() => [...document.querySelectorAll('.menu.pl-pop button')][2].click()); await sleep(300);
    s = await S(p); ok('팝오버에서 방어 → 핀', (s.pins[2] || {})[pinPos] === '방', JSON.stringify(s.pins));
    // 키보드: Enter 로 열고 화살표로 이동, Esc 로 닫고 칸으로 복귀
    await p.evaluate(pos => document.querySelector(`#app-plan .prio > li[data-pos="${pos}"] .plan-cells button[data-t="5"]`).focus(), pinPos);
    await p.keyboard.press('Enter'); await sleep(250);
    const kb1 = await p.evaluate(() => { const m = document.querySelector('.menu.pl-pop'); return !!m && m.contains(document.activeElement) ? document.activeElement.textContent : null; });
    await p.keyboard.press('ArrowDown'); await sleep(100);
    const kb2 = await p.evaluate(() => document.activeElement.textContent);
    await p.keyboard.press('Escape'); await sleep(200);
    const kb3 = await p.evaluate(pos => !document.querySelector('.menu.pl-pop') && document.activeElement.dataset.t === '5' && !!document.activeElement.closest(`li[data-pos="${pos}"]`), pinPos);
    ok('팝오버 키보드(Enter 열기 · 화살표 이동 · Esc 닫고 복귀)', !!kb1 && kb1 !== kb2 && kb3, `${kb1} → ${kb2} · ${kb3}`);
    await p.keyboard.press('Enter'); await sleep(250);
    await p.keyboard.press('End'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('Enter'); await sleep(300);   // 맨 끝 = 패턴 반복 → 한 칸 위 = 방어
    s = await S(p); ok('키보드로 선택(방어)', (s.pins[5] || {})[pinPos] === '방');
    const before = JSON.stringify(s.pins);
    await p.evaluate(pos => document.querySelector(`#app-plan .prio > li[data-pos="${pos}"] .plan-presets .btn`).click(), pinPos); await sleep(400);
    s = await S(p); ok('프리셋 → 핀 줄 교체', JSON.stringify(s.pins) !== before);
    await p.select(`#app-plan .prio > li[data-pos="${pinPos}"] .ult-mode select`, 'rule'); await sleep(300);
    s = await S(p); ok('자동으로 → 그 동료 핀 전부 해제 + 되돌리기 토스트', !Object.keys(s.pins).some(t => (s.pins[t] || {})[pinPos])
      && await p.evaluate(() => [...document.querySelectorAll('#app-toast .toast button')].length > 0));
    // 예외 턴 시트
    await p.evaluate(() => { const d = document.querySelectorAll('#app-plan .steps details')[1]; if (!d.open) d.open = true; }); await sleep(200);
    await p.evaluate(() => document.querySelector('#app-plan [data-fk="excAdd"]').click()); await sleep(500);
    ok('턴 추가 시트(턴 칩 30 · 순서 5)', await p.evaluate(() => document.querySelectorAll('#app-sheets .turn-chips button').length === 30 && document.querySelectorAll('#app-sheets .exc-order-list > li').length === 5));
    await p.evaluate(() => { document.querySelector('#app-sheets .turn-chips button:nth-child(3)').click(); document.querySelector('#app-sheets .turn-chips button:nth-child(6)').click();
      document.querySelector('#app-sheets .exc-order-list > li:nth-child(2) .mv button:first-child').click(); });
    await sleep(300);
    await p.evaluate(() => document.querySelector('#app-sheets .sheet-foot .btn-primary').click()); await sleep(500);
    s = await S(p); ok('예외 턴 저장(3·6턴) · 목록 1행', Array.isArray(s.overrides[3]) && Array.isArray(s.overrides[6]) && await p.evaluate(() => document.querySelectorAll('#app-plan .exc-row').length === 1));
    await p.waitForFunction(() => !document.querySelector('#app-plan .pv-grid.loading'), { timeout: 10000 }).catch(() => {});
    ok('미리보기 다시 150칸', await p.evaluate(() => document.querySelectorAll('#app-plan .pv-cells i').length === 150));

    // ── 3-1. 고급 설정 창(켜지면 메인은 요약 카드, 편집은 전부 창 안) ──
    console.log('[고급 설정]');
    await click(p, '#app-plan .adv-enter');
    await p.waitForFunction(() => document.querySelectorAll('#app-sheets .adv-plan .prio > li').length === 5, { timeout: 10000 }).catch(() => {});
    ok('창 열면 바로 작업 공간(①②③④) · 맨 위 사용 스위치 · 꺼짐 = 흐리게 + inert · 게이트 없음', await p.evaluate(() => {
      const w = document.querySelector('#app-sheets .adv-work');
      return !!document.querySelector('#app-sheets .adv-switch .adv-use') && !document.querySelector('#app-sheets .adv-use input').checked
        && w.classList.contains('is-dimmed') && w.inert && document.querySelectorAll('#app-sheets .adv-plan .prio > li').length === 5
        && !!document.querySelector('#app-sheets .adv-plan .pg') && document.querySelector('#app-sheets .adv-start').hidden; }));
    ok('창에 읽기 미리보기 없음(④ 표가 대신)', await p.evaluate(() => !document.querySelector('#app-sheets .preview')));
    await p.evaluate(() => document.querySelector('#app-sheets .adv-use').click()); await sleep(600);
    ok('처음 켜기 → 흐림 해제 + 인라인 선택지(가져오기 · 기본 설정)', await p.evaluate(() => { const w = document.querySelector('#app-sheets .adv-work');
      return JSON.parse(localStorage.getItem('woofia_adv')).on === true && !w.classList.contains('is-dimmed') && !w.inert
        && !document.querySelector('#app-sheets .adv-start').hidden && document.querySelectorAll('#app-sheets .adv-start .adv-choice').length === 2; }));
    await p.evaluate(() => document.querySelector('#app-sheets [data-fk="stImport"]').click()); await sleep(400);
    ok('선택하면 선택지 사라짐', await p.evaluate(() => document.querySelector('#app-sheets .adv-start').hidden));
    ok('메인 패널 → 흐리게 + inert + 배너 · 진입 버튼 "사용 중"', await p.evaluate(() => { const m = document.querySelector('#app-plan .pl-main');
      return m.classList.contains('is-dimmed') && m.inert && !document.querySelector('#app-plan .adv-banner').hidden && !document.querySelector('#app-plan .steps').hidden
        && /사용 중/.test(document.querySelector('#app-plan .adv-enter').textContent) && !document.querySelector('#app-plan .adv-banner button'); }));
    const aPos = await p.evaluate(() => +document.querySelector('#app-sheets .adv-plan .prio > li:nth-child(1)').dataset.pos);
    await p.select(`#app-sheets [data-fk="amode:${aPos}"]`, 'strict'); await sleep(300);
    // ADV_AUDIT 모순 4 → ADV_REVIEW #4(2026-09-28): 제단(확률 CD 감소)이 없으면 성공 가정은 효과가 없어 체크를 숨긴다
    //   (전에는 흐리게 비활성 + 이유 툴팁. 켜진 채 효과가 없을 때만 흐림 + 이유로 남는다 — 기본값에서 바뀐 것만 표식)
    const assistDead = await p.evaluate(pos => !document.querySelector(`#app-sheets [data-fk="aassist:${pos}"]`), aPos);
    s = await S(p); ok('창 ①: 방식 정해진 턴만 + 성공 가정(제단 없음 → 체크 숨김)', ((s.team[aPos - 1].ult || {}).mode === 'strict') && assistDead && !(s.team[aPos - 1].ult || {}).assist);
    await p.evaluate(() => document.querySelector('#app-sheets .adv-plan .prio > li:nth-child(2) .mv button:first-child').click()); await sleep(400);
    s = await S(p); ok('창 ①: 순서 ▲', s.team.filter(x => x && x.priority != null).length >= 2);
    // [ADV_REVIEW D1 2026-09-28] 창 ①의 직접 지정 칸 줄 삭제 → 칸 고정은 ④ 격자, 프리셋은 ④ 동료 행 머리 메뉴
    ok('창 ①: 직접 지정 버튼·칸 줄·욱영 체크 없음', await p.evaluate(() => !document.querySelector('#app-sheets .adv-plan [data-fk^="adir:"], #app-sheets .adv-plan .plan-strip, #app-sheets .adv-plan .row-toggle')));
    await p.waitForFunction(() => document.querySelectorAll('#app-sheets .adv .pg .pg-c').length === 150 && !document.querySelector('#app-sheets .adv .pg.loading'), { timeout: 15000 }).catch(() => {});
    await p.evaluate(pos => document.querySelector(`#app-sheets .adv .pg-nm[data-row="${pos}"]`).click(), pinPos); await sleep(250);
    ok('④ 행 머리 메뉴(프리셋 + 이 줄 고정 해제, 첫 필살기 당기기 없음)', await p.evaluate(() => { const b = [...document.querySelectorAll('.menu.pl-pop button')].map(x => x.textContent);
      return b.length >= 3 && b.some(x => /고정 전부 해제/.test(x)) && !b.some(x => /첫 필살기 당기기/.test(x)); }));
    await p.keyboard.press('Escape'); await sleep(200);
    await p.evaluate(pos => document.querySelector(`#app-sheets .adv .pg-c[data-pos="${pos}"][data-t="7"]`).click(), pinPos); await sleep(250);
    await p.evaluate(() => [...document.querySelectorAll('.menu.pl-pop button')][2].click()); await sleep(300);
    s = await S(p); ok('④ 격자 칸 → 방어 고정', (s.pins[7] || {})[pinPos] === '방');
    await p.evaluate(() => document.querySelector('#app-sheets [data-fk="syncAdd"]').click()); await sleep(300);
    const memPos = await p.evaluate(() => { const sel = document.querySelector('#app-sheets [data-fk="sadd:0"]'); const v = sel.options[1].value; sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); return +v; });
    await sleep(300);
    await p.select(`#app-sheets [data-fk="sx:0:${memPos}"]`, 'defend'); await sleep(300);
    s = await S(p); ok('창 ③ 필살기 연동(방어 → 받은 추가 행동에서 필살기)', s.sync.length === 1 && s.sync[0].members.some(m => m.p === memPos && m.base === 'defend'), JSON.stringify(s.sync));
    await p.waitForFunction(() => document.querySelectorAll('#app-sheets .adv .pg .pg-c').length === 150 && !document.querySelector('#app-sheets .adv .pg.loading'), { timeout: 15000 }).catch(() => {});
    ok('창 ④ 고정 격자 150칸', await p.evaluate(() => document.querySelectorAll('#app-sheets .adv .pg .pg-c').length === 150));
    await p.evaluate(pos => document.querySelector(`#app-sheets .adv .pg-c[data-pos="${pos}"][data-t="8"]`).click(), pinPos); await sleep(250);
    ok('격자 칸 팝오버(행동 3 · 고정 해제 · 패턴 반복 · 턴 편집 · 턴 잠금)', await p.evaluate(() => document.querySelectorAll('.menu.pl-pop button').length === 7));
    await p.evaluate(() => [...document.querySelectorAll('.menu.pl-pop button')][2].click()); await sleep(300);
    s = await S(p); ok('격자 팝오버 → 방어 고정', (s.pins[8] || {})[pinPos] === '방');
    await p.evaluate(pos => document.querySelector(`#app-sheets .adv .pg-c[data-pos="${pos}"][data-t="9"]`).click(), pinPos); await sleep(250);
    await p.evaluate(() => [...document.querySelectorAll('.menu.pl-pop button')].find((b) => /이 턴 잠금/.test(b.textContent)).click()); await sleep(400);
    s = await S(p); ok('격자 팝오버 → 이 턴 잠금', Array.isArray(s.locked[9]));
    await p.click('#app-sheets .adv .pg-th[data-th="5"]'); await sleep(800);
    ok('턴 번호 → 턴 편집 시트', await p.evaluate(() => !!document.querySelector('#app-sheets .sheet.te-sheet')));
    await p.evaluate(() => { const b = [...document.querySelectorAll('#app-sheets .te-track > li:first-child .mn-acts button')].find(x => x.getAttribute('aria-pressed') !== 'true' && !x.disabled); b && b.click(); });
    await sleep(400);
    await p.evaluate(() => document.querySelector('#app-sheets .sheet-foot .btn-primary').click()); await sleep(1200);
    s = await S(p); ok('행동 바꾸면 잠긴 턴 · 고급 설정 창으로 복귀', Array.isArray(s.locked[5]) && await p.evaluate(() => !!document.querySelector('#app-sheets .adv-sheet')
      && document.querySelector('#app-sheets .adv .pg-th[data-th="5"]').classList.contains('lock')));
    // 성공 가정은 제단이 없어 효과가 없으므로 배지에 세지 않는다(ADV_AUDIT 모순 4)
    ok('머리 배지(필살기 연동 · 고정 · 효과 없는 성공 가정 제외)', await p.evaluate(() => { const b = document.querySelector('#app-sheets .adv-badges').textContent; return /필살기 연동 1/.test(b) && /고정/.test(b) && !/성공 가정/.test(b); }));
    // 끄기(창 스위치) → 기본 설정(켜기 전 메인 값)이 그대로 돌아옴 — 고급 설정에서 찍은 고정 칸·방식·연동·잠긴 턴은 없음 · ①~④ 흐림
    await p.evaluate(() => document.querySelector('#app-sheets .adv-use').click()); await sleep(700);
    s = await S(p); ok('끄기 → 기본 설정 복원(고급의 방식·연동·잠긴 턴·고정 칸 없음, 기본 예외 턴 유지) · 창 흐림', !s.sync.length && !Object.keys(s.locked).length && !(s.team[aPos - 1].ult)
      && !(s.pins[8] || {})[pinPos] && !(s.pins[7] || {})[pinPos] && Array.isArray(s.overrides[3]) && await p.evaluate(() => document.querySelector('#app-sheets .adv-work').classList.contains('is-dimmed')));
    // 꺼진 동안 기본 설정을 바꿔도 고급 설정에는 영향 없음
    await p.evaluate(() => window.__woofia.store.plan.clearException([3, 6])); await sleep(300);
    await p.evaluate(() => document.querySelector('#app-sheets .adv-use').click()); await sleep(700);
    s = await S(p); ok('다시 켜기 → 고급 값 복원(고정 칸 포함, 선택지 없음)', s.sync.length === 1 && Array.isArray(s.locked[5]) && (s.team[aPos - 1].ult || {}).mode === 'strict'
      && (s.pins[8] || {})[pinPos] === '방' && Array.isArray(s.overrides[3]) && await p.evaluate(() => document.querySelector('#app-sheets .adv-start').hidden));
    // 창 ① 직접 지정 — 메인처럼 턴 칸 줄
    const dPos = await p.evaluate(() => { const li = [...document.querySelectorAll('#app-sheets .adv-plan .prio > li')].find(x => !x.querySelector('.plan-strip')); return li ? +li.dataset.pos : 0; });
    await p.select(`#app-sheets [data-fk="amode:${dPos}"]`, 'direct'); await sleep(500);
    ok('창 ① 방식에 직접 지정 → 턴 칸 줄', await p.evaluate(pos => !!document.querySelector(`#app-sheets .adv-plan .prio > li[data-pos="${pos}"] .plan-strip .plan-cells button`), dPos));
    await p.evaluate(pos => document.querySelector(`#app-sheets .adv-plan .prio > li[data-pos="${pos}"] .plan-cells button[data-t="4"]`).click(), dPos); await sleep(250);
    await p.evaluate(() => [...document.querySelectorAll('.menu.pl-pop button')][2].click()); await sleep(400);
    s = await S(p); ok('창 ① 칸 → 방어 고정', (s.pins[4] || {})[dPos] === '방', JSON.stringify(s.pins[4]));
    // 기본 설정 가져오기(버튼은 켜져 있을 때 항상) → 고급 값이 기본 설정 복사본으로(되돌리기 가능), 기본 설정 자체는 그대로
    ok('기본 설정 가져오기 버튼', await p.evaluate(() => { const b = document.querySelector('#app-sheets [data-fk="advImport"]'); return !!b && !b.hidden; }));
    await p.evaluate(() => document.querySelector('#app-sheets [data-fk="advImport"]').click()); await sleep(600);
    s = await S(p); ok('가져오기 → 기본 설정 값(예외 턴 없음 · 고정 칸 없음 · 방식 자동)', !Object.keys(s.overrides).length && !Object.keys(s.pins).length && !(s.team[aPos - 1].ult));
    await p.evaluate(() => [...document.querySelectorAll('.toast button')].pop().click()); await sleep(500);
    s = await S(p); ok('가져오기 되돌리기 → 고급 값 복귀', (s.pins[8] || {})[pinPos] === '방' && (s.pins[4] || {})[dPos] === '방' && (s.team[aPos - 1].ult || {}).mode === 'strict');
    await p.evaluate(() => document.querySelector('#app-sheets .adv-use').click()); await sleep(500);
    await p.keyboard.press('Escape'); await sleep(400);
    ok('꺼진 뒤 메인: 기본 패널 활성 · 배너 숨김', await p.evaluate(() => !document.querySelector('#app-plan .pl-main').inert && document.querySelector('#app-plan .adv-banner').hidden
      && /세부 행동/.test(document.querySelector('#app-plan .adv-enter').textContent)));
    await p.evaluate(() => { const st = window.__woofia.store; st.plan.resetAll(); st.set({ pins: {}, locked: {}, overrides: {} }); st.sync.set([]); st.plan.assistAll(false);
      st.get().team.forEach((x, i) => { if (x) st.plan.setUltMode(i, 'auto'); }); localStorage.removeItem('woofia_adv'); });
    await sleep(400);

    // ── 3-2. 욱영 프리셋 필살기 연동(메인 체크 = 라이트) ──
    console.log('[욱영 프리셋]');
    const LIGHT_CODE = '$eJx10MEKAjEMBNB_yXmQSZrY1l8JPbjnPexd_HepK4IFIZd5kAkkU2tnNLp30woRRA217u2iVxCZ6aVDoYQPpHs5QwFhheREU8REm0iSENL071DeW-2s0hmoZ4hv70AhFHLfdwERBPEQl1s6CmxeHJC6ZOUKZYXrCn0BsxVihfYDT3C-7jMa22HbIWOMFw_CSUY';
    await p.evaluate(async (code) => { const m = await import('./src/core/codec.js'); const st = window.__woofia.store; const d = await m.decodeShare(code, st.get().chars); st.applySnap(d[0].snap); }, LIGHT_CODE);
    await sleep(1500);
    const uk = await p.evaluate(() => {
      const li = [...document.querySelectorAll('#app-plan .prio > li')].find(x => x.querySelector('.row-toggle'));
      const a = localStorage.getItem('woofia_adv');
      return { checked: !!li && li.querySelector('.row-toggle input').checked, chips: document.querySelectorAll('#app-plan .link-chip').length,
        card: !document.querySelector('#app-plan .adv-banner').hidden || document.querySelector('#app-plan .pl-main').inert, btn: !!document.querySelector('#app-plan .adv-enter'), adv: a ? JSON.parse(a).on : false,
        sync: window.__woofia.store.get().sync.length };
    });
    ok('라이트 코드 → 메인 기본 패널 · 욱영 체크 ON · 칩 0 · 고급 설정 OFF', uk.checked && uk.chips === 0 && !uk.card && uk.btn && !uk.adv && uk.sync === 1, JSON.stringify(uk));
    const ukTotal = await p.evaluate(async () => { const st = window.__woofia.store; st.cond.set({ forceProc: true }); const { cfg } = await st.prepareRun(); const r = await window.__woofia.api.simulate(cfg); st.cond.set({ forceProc: false }); return r.meta.total; });
    ok('라이트 코드 결과(확률 100%) = v1 62,600,918', Math.round(ukTotal) === 62600918, String(ukTotal));
    await p.evaluate(() => [...document.querySelectorAll('#app-plan .row-toggle input')][0].click()); await sleep(400);
    s = await S(p); ok('욱영 체크 끄기 → 그 그룹만 제거', s.sync.length === 0 && Object.keys(s.overrides).length === 9);
    await p.evaluate(() => [...document.querySelectorAll('#app-plan .row-toggle input')][0].click()); await sleep(400);
    s = await S(p); ok('욱영 체크 켜기 → 프리셋 그룹(기준 욱영 · 인접 before/basic · wait)', s.sync.length === 1 && s.team[s.sync[0].anchor - 1].id === 10439
      && s.sync[0].members.length === 2 && s.sync[0].members.every(m => m.order === 'before' && m.base === 'basic') && s.sync[0].miss === 'wait', JSON.stringify(s.sync));

    // ── 3-3. 방탈출 제단 → 고급 설정 강제 ──
    console.log('[제단 → 고급 설정 강제]');
    await p.evaluate(() => window.__woofia.store.altar.setOn(true)); await sleep(800);
    ok('제단 켜기 → 고급 설정 켜짐 · 메인 흐림 + 배너(제단 사유)', await p.evaluate(() => JSON.parse(localStorage.getItem('woofia_adv')).on === true
      && document.querySelector('#app-plan .pl-main').inert && !document.querySelector('#app-plan .adv-banner').hidden && !document.querySelector('#app-plan .adv-banner-why').hidden));
    ok('전투 조건 제단 행 안내 한 줄', await p.evaluate(() => [...document.querySelectorAll('#app-cond .cond-sub')].some(x => !x.hidden && /고급 설정/.test(x.textContent))));
    await click(p, '#app-plan .adv-enter');
    await p.waitForFunction(() => document.querySelectorAll('#app-sheets .adv-plan .prio > li').length === 5, { timeout: 10000 }).catch(() => {});
    ok('창: 사용 스위치 잠김 + 이유', await p.evaluate(() => document.querySelector('#app-sheets .adv-use input').disabled && !document.querySelector('#app-sheets .adv-forced').hidden));
    const ukPos = await p.evaluate(() => window.__woofia.store.get().team.findIndex(x => x && x.id === 10439) + 1);
    await p.evaluate(() => document.querySelector('#app-sheets .adv-plan .prio > li:nth-child(3) .mv button:first-child').click()); await sleep(400);
    const ord1 = await p.evaluate(() => [...document.querySelectorAll('#app-sheets .adv-plan .prio > li')].map(li => li.dataset.pos).join(''));
    ok('창 안 순서 편집', !!ord1 && ord1 !== '');
    // [ADV_REVIEW D2 2026-09-28] 창 ①의 욱영 체크 삭제 → ③ 필살기 연동의 욱영 프리셋(지우기 · 다시 적용)
    void ukPos;
    await p.evaluate(() => document.querySelector('#app-sheets .sync-ro .s-del').click()); await sleep(400);
    s = await S(p); ok('창 ③ 욱영 프리셋 지우기', s.sync.length === 0);
    await p.evaluate(() => [...document.querySelectorAll('#app-sheets .sync-tools .btn')].find(b => /인접 동료 연동/.test(b.textContent)).click()); await sleep(400);
    s = await S(p); ok('창 ③ 욱영 프리셋 다시 적용 · 목록에 읽기 전용', s.sync.length === 1 && await p.evaluate(() => !!document.querySelector('#app-sheets .sync-ro') && !document.querySelector('#app-sheets .sync-ro select')));
    await p.evaluate(() => document.querySelector('#app-sheets .adv-plan [data-fk="excAdd"]').click()); await sleep(500);
    await p.evaluate(() => { document.querySelector('#app-sheets .turn-chips button:nth-child(2)').click(); document.querySelector('#app-sheets .sheet-foot .btn-primary').click(); });
    await sleep(1000);
    s = await S(p); ok('창 안 예외 턴 추가 → 창 복귀', Array.isArray(s.overrides[2]) && await p.evaluate(() => !!document.querySelector('#app-sheets .adv-sheet')));
    await p.keyboard.press('Escape'); await sleep(300);
    await p.evaluate(() => window.__woofia.store.altar.setOn(false)); await sleep(600);
    ok('제단 끄기 → 강제 해제(고급 설정은 켜진 채 · 사유 숨김)', await p.evaluate(() => JSON.parse(localStorage.getItem('woofia_adv')).on === true
      && document.querySelector('#app-plan .adv-banner-why').hidden && document.querySelector('#app-plan .pl-main').inert));
    await click(p, '#app-plan .adv-enter');
    ok('창 스위치 다시 끌 수 있음', await p.evaluate(() => !document.querySelector('#app-sheets .adv-use input').disabled && document.querySelector('#app-sheets .adv-forced').hidden));
    await p.evaluate(() => document.querySelector('#app-sheets .adv-use').click()); await sleep(500);
    await p.keyboard.press('Escape'); await sleep(300);
    await p.evaluate(() => { const st = window.__woofia.store; st.team.setDefault(); st.plan.resetAll(); st.set({ pins: {}, locked: {}, overrides: {} }); st.sync.set([]); localStorage.removeItem('woofia_adv'); });
    await sleep(600);

    // ── 4. 조건 ──
    console.log('[조건]');
    await p.evaluate(() => { const i = document.getElementById('cond-runs'); i.value = 20; i.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(200);
    s = await S(p); ok('반복 횟수 20', s.cond.runs === 20);
    ok('요약 헤더에 20회', await p.evaluate(() => /20/.test(document.querySelector('#app-cond .acc details:first-child summary')?.textContent || '')));
    await p.evaluate(() => { const d = document.querySelectorAll('#app-cond .acc details')[1]; if (d && !d.open) d.open = true; });
    await sleep(200);
    await p.evaluate(() => { const b = [...document.querySelectorAll('#app-cond .seg button')].find(b => b.textContent.trim() === '불'); b && b.click(); });
    await sleep(300);
    s = await S(p); ok('적 속성 불', String(s.cond.dummyElement) === '1');

    // ── 5. 실행·기록 ──
    console.log('[실행]');
    await click(p, '#app-cond .btn-run');
    await p.waitForFunction(() => !window.__woofia.store.get().ui.busy, { timeout: 90000 });
    await sleep(1500);
    s = await S(p);
    ok('실행 후 기록 1건', s.records.length === 1);
    ok('기록 select 옵션', await p.evaluate(() => document.querySelectorAll('#histSelect option').length >= 1));
    const total1 = s.result.meta.totalMid;
    ok('결과 헤드라인 숫자', await p.evaluate(() => /\d{1,3}(,\d{3})+/.test(document.querySelector('#app-result .hero-num')?.textContent || '')));
    ok('턴별 스트립 30', await p.evaluate(() => document.querySelectorAll('#app-result .turn-strip i').length === 30));
    ok('동료별 5행', await p.evaluate(() => document.querySelectorAll('#app-result .contrib li').length === 5));

    // ── 5-1. 전투 로그(턴 목록 + 상세 · 계산 내역 · 출처 · 스킬 설명) ──
    console.log('[전투 로그]');
    ok('로그 턴 목록 30행', await p.evaluate(() => document.querySelectorAll('.bl .bl-t').length === 30));
    await p.evaluate(() => document.querySelector('.bl .bl-t[data-turn="4"]').click());
    await sleep(200);
    ok('턴 선택 → 상세 제목', await p.evaluate(() => /4/.test(document.querySelector('.bl-insp h4')?.textContent || '')
      && document.querySelector('.bl-t[data-turn="4"]').getAttribute('aria-selected') === 'true'));
    const rc = await p.evaluate(() => {
      // 카드는 처음엔 전부 닫혀 있고 내용은 열 때 만든다 → 데미지가 있는 동료 카드를 열고 타격을 찾는다
      const opened = [...document.querySelectorAll('.bl-insp .bl-acts > .bl-act:not(.bl-enemy)')].filter((c) => !c.classList.contains('open'));
      const allClosed = document.querySelectorAll('.bl-insp .bl-act.open').length === 0;
      const card = opened.find((c) => /\d/.test(c.querySelector('.bl-act-v')?.textContent || '') && !c.querySelector('.bl-act-v i'));
      if (!card) return { allClosed };
      card.querySelector('.bl-act-h').click();
      const hit = card.querySelector('.bl-hit');
      if (hit.getAttribute('aria-expanded') !== 'true') hit.click();
      const cv = hit.parentElement.querySelector('.cv');
      const final = cv && cv.querySelector('.cv-final .cv-run')?.textContent;
      const amt = hit.querySelector('.bl-amt')?.textContent;
      const tog = cv && cv.querySelector('button.cv-row');
      tog?.click();
      const srcShown = !!cv && [...cv.querySelectorAll('.cv-panel')].some((r) => !r.hidden);
      const chips = cv ? cv.querySelectorAll('.cv-eq .cv-chip').length : 0;
      return { allClosed, rows: cv ? cv.querySelectorAll('.cv-step').length : 0, chips, final, amt, srcShown, diff: !!card.querySelector('.rc-warn') };
    });
    ok('로그 카드 처음엔 전부 닫힘', rc && rc.allClosed);
    ok('계산 그래픽(단계 3+ · 수식 칩 · 최종 = 타격 값)', rc && rc.rows >= 3 && rc.chips >= 3 && rc.final === rc.amt, JSON.stringify(rc));
    ok('출처 펼치기', rc && rc.srcShown);
    ok('설명되지 않은 차이 없음', rc && !rc.diff);
    await p.evaluate(() => document.querySelector('.bl-insp .bl-sk')?.click());
    const sheetOk = await p.waitForFunction(() => document.querySelector('.sheet .bl-skill-name, .sheet .bl-skill .hint:not(:first-child)'), { timeout: 10000 }).then(() => true).catch(() => false);
    ok('스킬 링크 → 스킬 설명 시트', sheetOk);
    await p.keyboard.press('Escape');
    await sleep(300);
    await p.evaluate(() => document.querySelector('#app-result .turn-strip .tb[data-turn="7"]').click());
    await sleep(300);
    ok('턴 막대 클릭 → 로그 해당 턴', await p.evaluate(() => document.querySelector('.bl-t[data-turn="7"]').getAttribute('aria-selected') === 'true'));
    ok('콘솔 에러 0 (여기까지)', p.errors.length === 0, p.errors.join(' | '));

    // ── 6. 공유 코드 왕복 ──
    console.log('[공유 코드]');
    const snapA = await snap(p);
    const code = await p.evaluate(async () => { const m = await import('./src/core/codec.js'); return m.encodeShare(window.__woofia.store.snapshot(), window.__woofia.store.get().chars); });
    ok('공유 코드 생성', typeof code === 'string' && code.length > 10);
    const back = await p.evaluate(async c => { const m = await import('./src/core/codec.js'); return m.decodeShare(c, window.__woofia.store.get().chars); }, code);
    ok('공유 코드 복호 = 스냅샷', JSON.stringify(back && (back.snap || back)) === JSON.stringify(snapA) || JSON.stringify(back).includes(JSON.stringify(snapA.team)));

    // ── 7. 초안 복원 ──
    console.log('[초안]');
    await p.evaluate(() => window.__woofia.store.saveDraft());
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.__woofia && window.__woofia.store.get().ui.booted, { timeout: 90000 });
    await sleep(500);
    const snapB = await snap(p);
    ok('새로고침 후 스냅샷 동일', JSON.stringify(snapB) === JSON.stringify(snapA), 'diff');
    s = await S(p); ok('새로고침 후 기록 유지', s.records.length === 1);

    // ── 8. 기록 복원 + 되돌리기 ──
    console.log('[기록]');
    await p.evaluate(() => { window.__woofia.store.team.remove(0); });
    await sleep(200);
    await p.select('#histSelect', String((await S(p)).records[0].id)).catch(() => {});
    await sleep(1500);
    s = await S(p); ok('기록 복원으로 편성 5', s.team.filter(Boolean).length === 5);
    const undo = await p.$('#app-toast .toast button');
    ok('되돌리기 토스트', !!undo);
    if (undo) { await undo.click(); await sleep(800); s = await S(p); ok('되돌리기 → 편성 4', s.team.filter(Boolean).length === 4); }

    // ── 9. 팀 비교 ──
    console.log('[팀 비교]');
    const hasCmp = await p.evaluate(() => typeof window.__woofia.openCompare === 'function');
    ok('팀 비교 설치', hasCmp);
    if (hasCmp) { await p.evaluate(() => window.__woofia.openCompare()); await sleep(600); ok('비교 시트 열림', await p.evaluate(() => !!document.querySelector('#app-sheets .sheet'))); await p.keyboard.press('Escape'); await sleep(300); }

    // ── 9-2. 상단바 재구성 · 라운지 연결(2026-09-28: 가이드 → ≡ 메뉴, 그 자리에 라운지) ──
    console.log('[상단바·라운지]');
    await p.waitForFunction(() => { const a = document.querySelector('#app-topbar .tb-lounge'); return a && !a.hidden; }, { timeout: 5000 }).catch(() => {});
    const tb = await p.evaluate(() => {
      const nav = document.querySelector('#app-topbar .topnav'); const btns = [...nav.querySelectorAll('.btn')]; const lg = nav.querySelector('.tb-lounge');
      return { guide: btns.some(b => /가이드/.test(b.textContent)), order: btns.map(b => b.className),
        lounge: !!lg && !lg.hidden && lg.tagName === 'A' && lg.getAttribute('href') === 'lounge.html' && lg.classList.contains('btn-secondary'),
        loungeTxt: lg ? lg.querySelector('.tb-full').textContent : '', cmp: btns[0].classList.contains('btn-secondary') && !btns[0].classList.contains('btn-ghost') };
    });
    ok('상단바: 가이드 버튼 없음', !tb.guide, JSON.stringify(tb.order));
    ok('상단바: 라운지 링크(lounge.html · secondary · 같은 탭)', tb.lounge && tb.loungeTxt === '라운지', JSON.stringify(tb));
    ok('상단바: 팀 비교 secondary', tb.cmp);
    await p.click('#app-topbar .topnav [aria-haspopup]'); await sleep(250);
    const menuTxt = await p.$$eval('.menu button', a => a.map(b => b.textContent.trim()));
    ok('≡ 메뉴에 가이드', menuTxt.some(x => x.includes('가이드')), JSON.stringify(menuTxt));
    await p.evaluate(() => [...document.querySelectorAll('.menu button')].find(b => b.textContent.includes('가이드')).click()); await sleep(800);
    ok('메뉴 → 가이드 시트', await p.evaluate(() => !!document.querySelector('#app-sheets .g-toc')));
    await p.keyboard.press('Escape'); await sleep(400);
    const shareBtn = await p.evaluate(() => { const b = document.querySelector('#app-result .result-head [data-lounge-share]');
      const first = document.querySelector('#app-result .result-head .btn'); return { on: !!b && !b.hidden, afterExport: !!b && first !== b && /내보내기/.test(first.textContent) }; });
    ok('결과 머리: 팀 공유에 올리기(내보내기 뒤)', shareBtn.on && shareBtn.afterExport, JSON.stringify(shareBtn));
    const growAt = await p.evaluate(async () => { const i = window.__woofia.store.get().team.findIndex(Boolean); const m = await import('./src/ui/grow.js'); m.openGrow(window.__woofia, i); return i; }); await sleep(700);
    const growLink = await p.evaluate((i) => { const a = document.querySelector('#app-sheets [data-lounge-char]'); const id = window.__woofia.store.get().team[i].id;
      return { href: a && a.getAttribute('href'), want: `lounge.html#/c/${id}`, on: !!a && !a.hidden }; }, growAt);
    ok('육성 창: 의견 보기 → lounge.html#/c/<동료ID>', growLink.on && growLink.href === growLink.want, JSON.stringify(growLink));
    await p.keyboard.press('Escape'); await sleep(400);

    // ── 10. 언어·테마 ──
    console.log('[언어·테마]');
    await p.evaluate(() => window.__woofia.i18n.setLang('en')); await sleep(800);
    ok('영어 전환: 실행 버튼 문구', await p.evaluate(() => /run|simulat/i.test(document.querySelector('#app-cond .btn-run')?.textContent || '')));
    ok('영어 전환 시 가로 넘침 없음', await p.evaluate(() => document.documentElement.scrollWidth <= 1440));
    await p.evaluate(() => window.__woofia.i18n.setLang('kr')); await sleep(500);
    await p.evaluate(() => window.__woofia.theme.set('dark')); await sleep(400);
    ok('다크 테마 적용', await p.evaluate(() => document.documentElement.dataset.theme === 'dark' && localStorage.getItem('woofia_theme') === 'dark'));
    await p.evaluate(() => window.__woofia.theme.set('light'));
    ok('가이드·패치·피드백 설치', await p.evaluate(() => ['openGuide', 'openPatch', 'openFeedback'].every(k => typeof window.__woofia[k] === 'function')));
    ok('콘솔 에러 0 (데스크톱)', p.errors.length === 0, p.errors.join(' | '));
    await p.close();

    // ── 10-2. 결과 → 라운지 팀 공유 / 라운지 딥링크(인계서 §2-1·§2-3) ──
    console.log('[라운지 연결]');
    {
      // 결과 「팀 공유에 올리기」: 같은 탭 이동, 주소 = lounge.html#/team/new?code=<encodeURIComponent(공유 코드)>, 코드 = 지금 편성
      const q = await newPage(browser); await boot(q);
      await q.waitForFunction(() => { const b = document.querySelector('#app-result [data-lounge-share]'); return b && !b.hidden; }, { timeout: 5000 }).catch(() => {});
      const teamIds = await q.evaluate(() => window.__woofia.store.get().team.map(x => x && x.id));
      await Promise.all([q.waitForNavigation({ timeout: 15000 }).catch(() => {}), q.evaluate(() => document.querySelector('#app-result [data-lounge-share]').click())]);
      const url = q.url();
      const m = /\/lounge\.html#\/team\/new\?code=([^&]+)$/.exec(url);
      ok('팀 공유 → lounge.html#/team/new?code=…', !!m, url.slice(0, 120));
      if (m) {
        await q.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
        await q.waitForFunction(() => window.__woofia && window.__woofia.store.get().chars && Object.keys(window.__woofia.store.get().chars).length, { timeout: 90000 });
        const ids = await q.evaluate(async (c) => { const mm = await import('./src/core/codec.js'); const d = await mm.decodeShare(c, window.__woofia.store.get().chars); return d[0].snap.team.map(x => x && x.id); }, decodeURIComponent(m[1]));
        ok('팀 공유 코드 = 지금 편성', JSON.stringify(ids) === JSON.stringify(teamIds), JSON.stringify([ids, teamIds]));
      }
      await q.close();

      // 딥링크 #code=…&run=1: 편성 적용 · 되돌리기 토스트 · 실행 1회(부팅 자동 실행과 중복 없음) · 주소 정리
      const countRuns = pg => pg.evaluateOnNewDocument(() => {
        window.__runCount = 0; let c0;
        Object.defineProperty(window, '__woofia', { configurable: true, get: () => c0, set: (c) => { c0 = c; let fn;
          Object.defineProperty(c, 'run', { configurable: true, get: () => fn && (async (...a) => { window.__runCount++; return fn(...a); }), set: (f) => { fn = f; } }); } });
      });
      const d1 = await newPage(browser); await countRuns(d1);
      await d1.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await d1.evaluate(() => localStorage.clear());
      await d1.goto(BASE + '/#code=' + encodeURIComponent(LIGHT_CODE) + '&run=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await d1.waitForFunction(() => window.__woofia && window.__woofia.store.get().ui && window.__woofia.store.get().ui.booted && !!window.__woofia.store.get().result, { timeout: 90000 });
      await sleep(800);
      const dl = await d1.evaluate(async (code) => { const mm = await import('./src/core/codec.js'); const st = window.__woofia.store; const d = await mm.decodeShare(code, st.get().chars);
        return { want: d[0].snap.team.map(x => x && x.id), got: st.get().team.map(x => x && x.id), runs: window.__runCount, hash: location.hash, recs: st.get().records.length,
          toast: [...document.querySelectorAll('.toast')].some(t => /라운지/.test(t.textContent) && t.querySelector('button')) }; }, LIGHT_CODE);
      ok('딥링크 #code&run=1 → 편성 적용', JSON.stringify(dl.want) === JSON.stringify(dl.got), JSON.stringify(dl));
      ok('딥링크 → 되돌리기 토스트', dl.toast);
      ok('딥링크 → 실행 1회(부팅 자동 실행 건너뜀, 기록 1건)', dl.runs === 1 && dl.recs === 1, JSON.stringify({ runs: dl.runs, recs: dl.recs }));
      ok('딥링크 → 주소 정리', dl.hash === '');
      await d1.evaluate(() => [...document.querySelectorAll('.toast')].find(t => /라운지/.test(t.textContent)).querySelector('button').click()); await sleep(400);
      ok('딥링크 되돌리기 → 이전 편성 복원', await d1.evaluate((w) => JSON.stringify(window.__woofia.store.get().team.map(x => x && x.id)) !== JSON.stringify(w), dl.want));
      ok('콘솔 에러 0 (딥링크)', d1.errors.length === 0, d1.errors.join(' | '));
      await d1.close();

      // 딥링크 #add=10441: 빈 자리에 추가(실행 없음 → 부팅 자동 실행만)
      const d2 = await newPage(browser); await countRuns(d2); await boot(d2);
      await d2.evaluate(() => { const st = window.__woofia.store; const t = st.get().team; const k = t.findIndex(x => x && x.id === 10441); st.team.pick(t[k >= 0 ? k : 0].id); st.saveDraft(); });
      await d2.goto('about:blank');                     // 같은 문서 해시 이동이 아니라 새로 읽기(라운지에서 넘어오는 경로)
      await d2.goto(BASE + '/#add=10441', { waitUntil: 'domcontentloaded' });
      await d2.waitForFunction(() => window.__woofia && window.__woofia.store.get().ui && window.__woofia.store.get().ui.booted && !!window.__woofia.store.get().result, { timeout: 90000 });
      await sleep(500);
      const ad = await d2.evaluate(() => ({ team: window.__woofia.store.get().team.map(x => x && x.id), runs: window.__runCount, hash: location.hash }));
      ok('딥링크 #add=10441 → 빈 자리에 추가', ad.team.filter(Boolean).length === 5 && ad.team.includes(10441) && ad.hash === '', JSON.stringify(ad));
      ok('딥링크 #add → 실행 1회(부팅 자동)', ad.runs === 1, String(ad.runs));
      // 이미 열린 화면에서 해시만 바뀌는 경우(hashchange): 코드 적용 + 실행 1회 추가
      await d2.evaluate((c) => { location.hash = 'code=' + encodeURIComponent(c) + '&run=1'; }, LIGHT_CODE);
      await d2.waitForFunction(() => location.hash === '' && window.__runCount >= 2, { timeout: 60000 }).catch(() => {});
      await sleep(1500);
      const hc = await d2.evaluate(async (code) => { const mm = await import('./src/core/codec.js'); const st = window.__woofia.store; const d = await mm.decodeShare(code, st.get().chars);
        return { ok: JSON.stringify(d[0].snap.team.map(x => x && x.id)) === JSON.stringify(st.get().team.map(x => x && x.id)), runs: window.__runCount, hash: location.hash }; }, LIGHT_CODE);
      ok('딥링크 hashchange → 적용 + 실행 1회', hc.ok && hc.runs === 2 && hc.hash === '', JSON.stringify(hc));
      ok('콘솔 에러 0 (딥링크 add)', d2.errors.length === 0, d2.errors.join(' | '));
      await d2.close();
    }

    // ── 11. 모바일 ──
    console.log('[모바일]');
    p = await newPage(browser, true);
    await boot(p);
    await p.waitForFunction(() => { const a = document.querySelector('#app-topbar .tb-lounge'); return a && !a.hidden; }, { timeout: 5000 }).catch(() => {});
    ok('모바일 상단바: 비교·라운지 아이콘+짧은 라벨', await p.evaluate(() => [...document.querySelectorAll('#app-topbar .topnav .tb-nav')].map(b => { const sp = b.querySelector('.tb-short'); return !!sp && getComputedStyle(sp).display !== 'none' && sp.getBoundingClientRect().width > 0 && !!b.querySelector('svg'); }).filter(Boolean).length === 2));
    ok('모바일 가로 넘침 없음', await p.evaluate(() => document.documentElement.scrollWidth <= 390), String(await p.evaluate(() => document.documentElement.scrollWidth)));
    ok('하단 실행 바 표시', await p.evaluate(() => { const r = document.querySelector('#app-runbar'); return r && getComputedStyle(r).display !== 'none'; }));
    ok('섹션 점프 칩', await p.evaluate(() => document.querySelectorAll('#app-topbar .jump a').length >= 3));
    await p.select('#app-plan .prio > li:nth-child(1) .ult-mode select', 'direct'); await sleep(400);
    await p.evaluate(() => document.querySelector('#app-plan .prio > li:nth-child(1) .plan-cells button[data-t="3"]').click()); await sleep(500);
    ok('모바일 칸 → 바텀시트(같은 항목 — 행동 3 · 패턴 반복)', await p.evaluate(() => document.querySelectorAll('#app-sheets .pl-cellsheet .pl-opt').length === 4));
    await p.evaluate(() => document.querySelectorAll('#app-sheets .pl-cellsheet .pl-opt')[2].click()); await sleep(400);
    s = await S(p); ok('모바일 바텀시트 선택 → 핀', Object.keys(s.pins).length > 0);
    await p.evaluate(() => { window.__woofia.store.set({ pins: {} }); }); await sleep(300);
    const small = await p.evaluate(() => [...document.querySelectorAll('#app-cond button, #app-plan .mv button, #app-team .seg button, #app-runbar button')]
      .filter(b => b.offsetParent !== null).map(b => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b, '::before'); const pad = cs.position === 'absolute' && parseFloat(cs.top) < 0 ? -2 * parseFloat(cs.top) : 0; return { c: b.className, t: b.textContent.trim().slice(0, 10), w: r.width + pad, h: r.height + pad }; }).filter(r => r.h < 36 || r.w < 36));
    ok('터치 타깃 36px 미만 0', small.length === 0, JSON.stringify(small));
    { const n0 = (await S(p)).team.filter(Boolean).length; const tile = await p.$('#app-team .tile.in'); const bb = await tile.boundingBox(); await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(600);
      s = await S(p); ok('모바일 타일 탭 해제', s.team.filter(Boolean).length === n0 - 1, `${n0} → ${s.team.filter(Boolean).length}`); }
    ok('콘솔 에러 0 (모바일)', p.errors.length === 0, p.errors.join(' | '));
    await p.close();

    // ── 12. 접근성 ──
    console.log('[접근성]');
    p = await newPage(browser); await boot(p);
    const a11y = await p.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null);
      const unlabeled = btns.filter(b => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.title).length;
      const divClick = [...document.querySelectorAll('[onclick]')].filter(e => !/^(BUTTON|A|INPUT|SELECT|SUMMARY)$/.test(e.tagName)).length;
      const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(document.body.innerText);
      return { unlabeled, divClick, emoji };
    });
    ok('아이콘 버튼 aria-label', a11y.unlabeled === 0, `${a11y.unlabeled}개`);
    ok('div onclick 없음', a11y.divClick === 0);
    ok('화면에 이모지 없음', !a11y.emoji);
    await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
    ok('Tab 포커스 이동', await p.evaluate(() => document.activeElement && document.activeElement !== document.body));
    await p.close();
  } catch (e) {
    fail++; fails.push('예외: ' + e.message); console.error(e);
  } finally { await browser.close(); }
  console.log(`\n${pass} 통과 · ${fail} 실패${fail ? '\n - ' + fails.join('\n - ') : ''}`);
  process.exit(fail ? 1 : 0);
})();
