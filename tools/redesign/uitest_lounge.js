// XXL 라운지 목업 상호작용 검사 (로컬 서버). 실패하면 exit 1.
// 실행: LOUNGE_BASE=http://localhost:8779/lounge.html NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/uitest_lounge.js
const puppeteer = require('puppeteer-core');
const path = require('path');
const BASE = process.env.LOUNGE_BASE || 'http://localhost:8778/lounge.html';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'shots', 'lounge');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 서버 모드(?api=)에서는 봇 확인·네트워크 때문에 고정 대기가 모자라다 → 화면 상태를 기다린다.
const until = (page, fn, arg) => page.waitForFunction(fn, { timeout: 20000, polling: 100 }, arg);
const REMOTE = BASE.includes('?api=');
const CODE = '#eJyLjjbUUVLSMdAx0ImOjjYxMYrViTYxtgSRhgYg0sgQLGIYCwIAA-ALrA';   // 마타야·욱영·임부언·파미도·세숭(시드 mt4 와 같은 코드)
const NEW_CODE_IDS = [10441, 10410, 10421, 10439, 10425];

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) fails++; };

async function dialogPin(page, pin) {
  await page.waitForSelector('dialog.lg-dialog[open] .lg-pin');
  await page.type('dialog.lg-dialog[open] .lg-pin', pin);
  await page.click('dialog.lg-dialog[open] button[type=submit]');
  await until(page, () => !document.querySelector('dialog.lg-dialog[open]') || document.querySelector('dialog.lg-dialog[open] .lg-err')?.textContent);
  await sleep(200);
}
const menuPick = async (page, blockSel, label) => {
  await page.click(`${blockSel} .lg-more`);
  await sleep(150);
  await page.evaluate((l) => [...document.querySelectorAll('.lg-menu button')].find((b) => b.textContent.includes(l)).click(), label);
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  // 비밀번호 틀림(403)·잠금(423)·중복(409)은 검사가 일부러 일으키는 서버 거절이라 제외
  page.on('console', (m) => { if (m.type() === 'error' && !/status of (404|403|423|409)/.test(m.text())) errs.push(m.text()); });
  await page.setViewport({ width: 1280, height: 900 });
  // LOUNGE_MOTION=1 이면 모션 경로(FLIP·비행·화면 전환)까지 태운다. 기본은 움직임 줄이기(판정 안정).
  if (!process.env.LOUNGE_MOTION) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  try {
    // 1) 의견 작성 → 익명 이름·맨 위(최신순) 확인
    await page.goto(`${BASE}#/c/10421`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.lg-composer textarea');
    await page.type('.lg-composer textarea', '테스트 의견입니다.');
    await page.type('.lg-composer .lg-pin', '1234');
    await page.click('.lg-composer button[type=submit]');
    await until(page, () => document.body.textContent.includes('테스트 의견입니다.'));
    await sleep(300);
    const mine = await page.evaluate(() => [...document.querySelectorAll('.lg-post')].find((p) => p.textContent.includes('테스트 의견입니다.'))?.querySelector('.lg-post-name b')?.textContent);
    ok(mine && /^익명의 \S+/.test(mine), `작성 → 익명 이름 부여 (${mine})`);
    const whoLine = await page.$eval('.lg-composer .lg-who', (e) => e.textContent);
    ok(whoLine.includes(mine), `같은 스레드 다음 글은 같은 이름으로 작성 (${whoLine.trim()})`);

    // 2) 좋아요 → 수 증가, 싫어요 수는 DOM 에 없음
    // 내가 쓴 의견 블록(목의 예시 글 ID 는 s…, 서버 예시 글도 p… 라서 ID 접두사로는 못 가른다 → 본문으로 찾는다)
    const myId = await page.evaluate(() => [...document.querySelectorAll('.lg-post-block')].find((b) => b.querySelector(':scope > .lg-post .lg-body')?.textContent.includes('테스트 의견입니다.'))?.dataset.key);
    const blockSel = `.lg-post-block[data-key="${myId}"]`;
    const before = await page.$eval(`${blockSel} .lg-vote .lg-num`, (e) => +e.textContent);
    await page.click(`${blockSel} .lg-vote[aria-label="좋아요"]`); await sleep(250);
    const after = await page.$eval(`${blockSel} .lg-vote .lg-num`, (e) => +e.textContent);
    ok(after === before + 1, `좋아요 ${before} → ${after}`);
    const downHasNum = await page.$eval(`${blockSel} .lg-vote[aria-label="싫어요"]`, (e) => /\d/.test(e.textContent));
    ok(!downHasNum, '싫어요 수는 표시하지 않음');

    // 3) 싫어요가 많은 글은 추천순에서 아래 (제토 s5: 3좋아요/14싫어요 → 좋아요 6 짜리보다 아래)
    await page.goto(`${BASE}#/c/10441`, { waitUntil: 'networkidle0' }); await sleep(600);
    const order = await page.$$eval('.lg-posts > .lg-post-block > .lg-post .lg-body', (els) => els.map((e) => e.textContent.slice(0, 12)));
    ok(order[order.length - 1].startsWith('솔직히'), `점수 낮은 글이 맨 아래 (${order[order.length - 1]})`);

    // 4) 수정: 틀린 비밀번호 → 오류, 맞는 비밀번호 → 저장
    await page.goto(`${BASE}#/c/10421`, { waitUntil: 'networkidle0' }); await sleep(600);
    await menuPick(page, blockSel, '수정');
    await dialogPin(page, '9999');
    const err = await page.$eval('dialog.lg-dialog[open] .lg-err', (e) => e.textContent);
    ok(err.includes('맞지 않습니다'), `틀린 비밀번호 거부 (${err})`);
    await page.$eval('dialog.lg-dialog[open] .lg-pin', (e) => { e.value = ''; });
    await dialogPin(page, '1234');
    await page.waitForSelector('.lg-edit textarea');
    await page.$eval('.lg-edit textarea', (e) => { e.value = '수정된 의견입니다.'; });
    await page.evaluate(() => [...document.querySelectorAll('.lg-edit button')].find((b) => b.textContent === '저장').click());
    await until(page, () => document.body.textContent.includes('수정된 의견입니다.') && document.body.textContent.includes('수정됨'));
    ok(await page.evaluate(() => document.body.textContent.includes('수정된 의견입니다.') && document.body.textContent.includes('수정됨')), '비밀번호로 수정 + 수정됨 표시');

    // 5) 다른 기기 흉내: 세션 이어 쓰기 상태 지우고 → '이 이름으로 이어 쓰기' → 답글이 같은 이름
    await page.evaluate(() => sessionStorage.clear());
    await page.reload({ waitUntil: 'networkidle0' }); await sleep(600);
    await menuPick(page, blockSel, '이어 쓰기');
    await dialogPin(page, '1234');
    await page.evaluate(() => [...document.querySelectorAll('.lg-post-block')].find((b) => b.textContent.includes('수정된 의견')).querySelector('.lg-act').click());
    await sleep(200);
    await page.type('.lg-replies .lg-composer textarea', '이어서 답글');
    await page.click('.lg-replies .lg-composer button[type=submit]');
    await until(page, () => document.body.textContent.includes('이어서 답글'));
    await sleep(300);
    const names = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.lg-post-block')].find((x) => x.textContent.includes('수정된 의견'));
      return [...b.querySelectorAll('.lg-post-name b')].map((x) => x.textContent);
    });
    ok(names.length === 2 && names[0] === names[1], `이어 쓰기 답글 = 같은 이름 (${names.join(' / ')})`);

    // 6) 삭제(답글이 있으므로 자리만 남음)
    await menuPick(page, blockSel, '삭제');
    await dialogPin(page, '1234');
    await until(page, () => document.body.textContent.includes('삭제된 의견입니다.')).catch(() => {});
    ok(await page.evaluate(() => document.body.textContent.includes('삭제된 의견입니다.')), '답글 있는 의견 삭제 → 자리만 남음');

    // 7) 팀 올리기: 코드 판독 → 5인 프로필, 중복 안내
    await page.goto(`${BASE}#/team/new`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.lg-code');
    await page.$eval('.lg-code', (e, c) => { e.value = c; e.dispatchEvent(new Event('input')); }, CODE);
    await sleep(900);
    const names5 = await page.$$eval('.lg-preview .lg-slot-name', (els) => els.map((e) => e.textContent));
    ok(names5.length === 5, `코드 → 5인 프로필 (${names5.join(',')})`);
    ok(await page.evaluate(() => !!document.querySelector('.lg-note')), '이미 공유된 코드 안내');
    await page.$eval('.lg-code', (e) => { e.value = '#잘못된코드'; e.dispatchEvent(new Event('input')); });
    await sleep(700);
    ok((await page.$eval('.lg-err', (e) => e.textContent)).includes('읽을 수 없습니다'), '잘못된 코드 오류 표시');

    // 8) 새 팀 올리기(시드 mt2 코드는 중복이므로 코덱으로 새 코드 생성)
    const fresh = await page.evaluate(async (ids) => {
      const { encodeShare } = await import('./src/core/codec.js');
      const snap = { team: ids.map((id) => ({ id, skill: 10, rune: true, rotation: '' })), turns: 20, dummies: 2, enemyHits: 'all', dummyElement: 0, runs: 50 };
      return encodeShare([{ id: 1, snap, total: 0 }]);
    }, [10443, 10401, 10421, 10428, 10425]);
    await page.$eval('.lg-code', (e, c) => { e.value = c; e.dispatchEvent(new Event('input')); }, fresh);
    await sleep(900);
    await page.type('.lg-input', '테스트 팀');
    await page.type('.lg-form-foot .lg-pin', '4321');
    await page.click('.lg-form-foot button[type=submit]');
    await until(page, () => /#\/team\/m/.test(location.hash) && document.querySelector('.lg-go')).catch(() => {});
    const url = page.url();
    ok(/#\/team\/m/.test(url), `올리기 → 상세로 이동 (${url.split('#')[1]})`);
    const go = await page.$eval('.lg-go', (e) => e.getAttribute('href'));
    ok(go.startsWith('index.html#code=') && go.endsWith('&run=1'), `시뮬하러 가기 링크 (${go.slice(0, 40)}…)`);
    ok((await page.$eval('.lg-go-bar', (e) => e.textContent)).includes('20턴'), '코드 설정 요약(20턴)');

    // 9) 팀 목록 '이 동료 포함' 필터
    await page.goto(`${BASE}#/team?with=10443`, { waitUntil: 'networkidle0' }); await sleep(600);
    const titles = await page.$$eval('.lg-row-title', (els) => els.map((e) => e.textContent));
    ok(titles.length === 2 && titles.includes('테스트 팀'), `무명 포함 팀 필터 (${titles.join(', ')})`);

    // 10) 티어표: 드래그로 배치 → 공개 → 평균 반영
    await page.goto(`${BASE}#/tier/new`, { waitUntil: 'networkidle0' }); await sleep(600);
    const drag = async (id, row) => {
      const s = await page.$eval(`.lg-pool .lg-tchip[data-id="${id}"]`, (e) => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
      const t = await page.$eval(`.lg-tzone[data-row="${row}"]`, (e) => { e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.x + r.width - 30, r.y + r.height / 2]; });
      const s2 = await page.$eval(`.lg-pool .lg-tchip[data-id="${id}"]`, (e) => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
      await page.mouse.move(s2[0], s2[1]); await page.mouse.down();
      await page.mouse.move(s2[0] + 10, s2[1] + 10, { steps: 3 });
      const t2 = await page.$eval(`.lg-tzone[data-row="${row}"]`, (e) => { const r = e.getBoundingClientRect(); return [r.x + r.width - 30, r.y + r.height / 2]; });
      await page.mouse.move(t2[0], t2[1], { steps: 8 }); await page.mouse.up(); await sleep(300);
      return s && t;
    };
    await drag(10443, 0);
    await drag(10441, 0);
    // 탭 방식: 칩 선택 → 행 클릭
    await page.click('.lg-pool .lg-tchip[data-id="10401"]'); await sleep(100);
    await page.$eval('.lg-tzone[data-row="1"]', (e) => e.click()); await sleep(300);
    // 키보드: 선택 후 숫자키
    await page.focus('.lg-pool .lg-tchip[data-id="10417"]'); await page.keyboard.press('5'); await sleep(300);
    const rows = await page.$$eval('.lg-tboard .lg-tzone', (zs) => zs.map((z) => [...z.querySelectorAll('.lg-tchip')].map((c) => +c.dataset.id)));
    ok(JSON.stringify(rows[0]) === '[10443,10441]' && rows[1][0] === 10401 && rows[4][0] === 10417, `드래그·탭·숫자키 배치 ${JSON.stringify(rows)}`);
    await page.screenshot({ path: path.join(OUT, 'ui_tier_editor.png') });
    await page.type('.lg-title-in', '테스트 티어표');
    await page.type('#tier-pin', '1111');
    await page.evaluate(() => [...document.querySelectorAll('.lg-publish button')].find((b) => b.textContent === '공개하기').click());
    await until(page, () => /#\/tier\/t/.test(location.hash) && document.querySelector('.lg-tboard.is-read .lg-tchip')).catch(() => {});
    ok(/#\/tier\/t/.test(page.url()), '티어표 공개 → 보기로 이동');
    ok((await page.$$('.lg-tboard.is-read .lg-tchip')).length === 4, '보기 화면에 4명 배치');

    await page.goto(`${BASE}#/me`, { waitUntil: 'networkidle0' }); await sleep(500);
    ok((await page.$$('.lg-rows > li')).length >= 3, '내 활동 목록');
  } catch (e) {
    fails++; console.log('FAIL exception', e.message);
    await page.screenshot({ path: path.join(OUT, 'ui_fail.png'), fullPage: true });
  } finally {
    ok(errs.length === 0, `페이지 오류 없음 ${errs.join(' | ')}`);
    await browser.close();
    console.log(fails ? `${fails} FAILED` : 'ALL PASS');
    process.exit(fails ? 1 : 0);
  }
})();
