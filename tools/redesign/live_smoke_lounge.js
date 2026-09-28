// 라운지 라이브 점검(읽기 전용 — 글·반응·신고를 절대 만들지 않는다).
// 실행: NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/live_smoke_lounge.js
//   LOUNGE_LIVE=https://xxl-famido.github.io/xxl/lounge.html (기본값)
const puppeteer = require('puppeteer-core');
const PAGE = process.env.LOUNGE_LIVE || 'https://xxl-famido.github.io/xxl/lounge.html';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ORIGIN = new URL(PAGE).origin;

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };

(async () => {
  const html = await (await fetch(PAGE, { cache: 'no-store' })).text();
  const api = (/<meta name="lounge-api" content="([^"]*)">/.exec(html) || [])[1];
  ok(/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(api || ''), `라이브 lounge.html 이 서버를 가리킴 (${api || '없음'})`);
  if (!api) { console.log(`${fails} FAILED`); process.exit(1); }

  const h = await fetch(api + '/v1/health', { headers: { Origin: ORIGIN } });
  ok(h.ok && (await h.json()).ok, 'API health');
  ok(h.headers.get('access-control-allow-origin') === ORIGIN, `CORS 허용 출처 = ${ORIGIN}`);
  ok((await fetch(api + '/v1/health', { headers: { Origin: 'https://evil.example' } })).status === 403, '다른 출처 차단');
  ok((await fetch(api + '/v1/health', { headers: { Origin: 'http://localhost:8779' } })).status === 403, '라이브는 localhost 출처도 차단');
  const sum = await fetch(api + '/v1/chars/summary', { headers: { Origin: ORIGIN } });
  ok(sum.ok, '동료별 의견 수 조회');
  const th = await (await fetch(api + '/v1/threads/char%3A10441', { headers: { Origin: ORIGIN } })).text();
  ok(!/dislike|pin_hash|pin_salt|ip_hash/.test(th), '응답에 싫어요 수·비밀 필드 없음');

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  try {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(PAGE + '#/', { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('.lg-char', { timeout: 30000 });
    ok((await page.$$('.lg-char')).length >= 40, '동료 목록 표시');
    ok(await page.evaluate(() => !document.querySelector('.lg-mock-note')), '목업 안내가 없음(서버 모드)');
    await page.goto(PAGE + '#/c/10441', { waitUntil: 'networkidle0' });
    await page.waitForSelector('.lg-composer', { timeout: 30000 });
    ok(true, '동료 페이지·작성 칸 표시');
    ok(errs.length === 0, `페이지 오류 없음 ${errs.join(' | ')}`);
  } finally { await browser.close(); }
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
