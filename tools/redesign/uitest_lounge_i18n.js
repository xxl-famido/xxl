// 라운지 다국어 점검: en/ja/zh 에서 화면의 "정해진 문구"에 한국어가 남아 있지 않은지 + 서버 오류가 그 언어로 나오는지.
// 유저가 쓴 내용(의견 본문·제목·행 이름·설명·공유 코드)은 번역 대상이 아니므로 제외한다.
// 실행(로컬 서버에만): node lounge_api/scripts/seed_local.mjs →
//   LOUNGE_BASE="http://localhost:8779/lounge.html?api=http://127.0.0.1:8787" NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/uitest_lounge_i18n.js
const puppeteer = require('puppeteer-core');
const path = require('path');
const BASE = process.env.LOUNGE_BASE || 'http://localhost:8779/lounge.html?api=http://127.0.0.1:8787';
if (!BASE.includes('?api=')) throw new Error('로컬 서버(?api=)로만 실행 — 라이브에 쓰지 않게');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'shots', 'lounge');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 유저 내용이 들어가는 곳
const USER = ['.lg-body', '.lg-feed-body', '.lg-row-title', '.lg-row-desc', '.lg-mini-title', '.lg-tlabel', '.lg-tprev-row b', '.lg-descr', '.lg-codebox',
  '.lg-note a', '.lg-page-head.is-stack .lg-h1', 'textarea', 'input', '.lg-mention', '.toast'];

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };

(async () => {
  const api = new URL(BASE).searchParams.get('api');
  const tiers = await (await fetch(api + '/v1/tiers')).json();
  const teams = await (await fetch(api + '/v1/teams')).json();
  const routes = ['/', '/c/10441', '/c/10421', '/tier', '/tier/new', `/tier/${tiers[0].id}`, '/team', '/team/new', `/team/${teams[0].id}`, '/me', '/op'];
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  try {
    for (const lang of ['en', 'ja', 'zh']) {
      const p = await b.newPage();
      await p.setViewport({ width: 1280, height: 900 });
      await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      const errs = []; p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(BASE + '#/', { waitUntil: 'networkidle0' });
      await p.evaluate((l) => localStorage.setItem('woofia_lang', l), lang);
      const leftovers = new Set();
      for (const r of routes) {
        await p.goto(`${BASE}#${r}`, { waitUntil: 'networkidle0' });
        await p.reload({ waitUntil: 'networkidle0' });
        await sleep(700);
        const found = await p.evaluate((USER) => {
          const skip = (el) => USER.some((s) => el.closest(s));
          const out = [];
          const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            const tx = n.textContent.trim();
            if (tx && /[가-힣]/.test(tx) && !skip(n.parentElement)) out.push(tx.slice(0, 40));
          }
          for (const el of document.querySelectorAll('[aria-label],[placeholder],[title]')) {
            if (skip(el) && !['INPUT', 'TEXTAREA'].includes(el.tagName)) continue;
            for (const a of ['aria-label', 'placeholder', 'title']) { const v = el.getAttribute(a); if (v && /[가-힣]/.test(v) && !/익명|파미도/.test('')) out.push(`@${a}:${v.slice(0, 40)}`); }
          }
          return out;
        }, USER);
        found.forEach((f) => leftovers.add(`${r} ${f}`));
        const slug = r === '/' ? 'home' : r.slice(1).replace(/[^a-z0-9]+/gi, '_');
        await p.screenshot({ path: path.join(OUT, `i18n_${lang}_${slug}.png`), fullPage: true });
      }
      // 이름: 동료 이름이 그 언어로 나오는지(예: 파미도 → Famido/ファミド/法米多)
      await p.goto(`${BASE}#/c/10421`, { waitUntil: 'networkidle0' }); await sleep(600);
      const hero = await p.$eval('.lg-display', (e) => e.textContent);
      ok({ en: 'Famido', ja: 'ファミド', zh: '法米多' }[lang] === hero, `[${lang}] 동료 이름 현지화 (${hero})`);
      // 서버 오류 번역: 틀린 비밀번호로 수정 시도
      await p.goto(`${BASE}#/c/10441`, { waitUntil: 'networkidle0' }); await sleep(600);
      await p.click('.lg-post-block .lg-more'); await sleep(200);
      await p.evaluate(() => [...document.querySelectorAll('.lg-menu button')][1].click());   // 두 번째 = 수정(이어 쓰기 다음)
      await p.waitForSelector('dialog.lg-dialog[open] .lg-pin');
      await p.type('dialog.lg-dialog[open] .lg-pin', '9999');
      await p.click('dialog.lg-dialog[open] button[type=submit]'); await sleep(700);
      const err = await p.$eval('dialog.lg-dialog[open] .lg-err', (e) => e.textContent);
      ok(err && !/[가-힣]/.test(err), `[${lang}] 서버 오류 번역 (${err})`);
      await p.keyboard.press('Escape'); await sleep(200);
      // 작성 창: 빈 내용으로 등록 → 토스트가 그 언어로
      await p.evaluate(() => { const f = document.querySelector('form.lg-composer'); f.querySelector('textarea').value = ''; f.requestSubmit(); });
      await sleep(400);
      const tx = await p.$$eval('.toast', (els) => els.map((e) => e.textContent).join(' | '));
      ok(tx && !/[가-힣]/.test(tx), `[${lang}] 작성 창 오류 토스트 번역 (${tx})`);
      await p.screenshot({ path: path.join(OUT, `i18n_${lang}_composer_toast.png`) });
      // 언어 메뉴(체크 아이콘) 화면
      await p.click('#langBtn'); await sleep(250);
      ok(await p.$('.lg-langmenu-check svg use') !== null, `[${lang}] 언어 메뉴 체크 = SVG 아이콘`);
      await p.screenshot({ path: path.join(OUT, `i18n_${lang}_langmenu.png`) });
      await p.keyboard.press('Escape');
      ok(leftovers.size === 0, `[${lang}] 정해진 문구에 한국어 없음 ${leftovers.size ? '\n   ' + [...leftovers].slice(0, 25).join('\n   ') : ''}`);
      ok(errs.length === 0, `[${lang}] 페이지 오류 없음 ${errs.join(' | ')}`);
      await p.close();
    }
    // 목업 모드(서버 주소 meta 가 비어 있을 때만 — 라이브 주소가 들어가면 건너뜀): 목업 오류도 그 언어로
    const mockBase = BASE.split('?')[0];
    const html = await (await fetch(mockBase)).text();
    if (/<meta name="lounge-api" content="">/.test(html)) {
      const m = await b.newPage();
      await m.goto(mockBase + '?api=mock#/c/10441', { waitUntil: 'networkidle0' });
      await m.evaluate(() => localStorage.setItem('woofia_lang', 'ja'));
      await m.reload({ waitUntil: 'networkidle0' }); await sleep(700);
      const mode = await m.evaluate(() => document.body.textContent.includes('モックデータ'));
      await m.click('.lg-post-block .lg-more'); await sleep(200);
      await m.evaluate(() => [...document.querySelectorAll('.lg-menu button')][1].click());
      await m.waitForSelector('dialog.lg-dialog[open] .lg-pin');
      await m.type('dialog.lg-dialog[open] .lg-pin', '9999');
      await m.click('dialog.lg-dialog[open] button[type=submit]'); await sleep(700);
      const me = await m.$eval('dialog.lg-dialog[open] .lg-err', (e) => e.textContent);
      ok(mode && me && !/[가-힣]/.test(me), `[ja·목업] 목업 오류 번역 (${me})`);
      await m.screenshot({ path: path.join(OUT, 'i18n_ja_mock_error.png') });
      await m.close();
    } else console.log('SKIP 목업 검사(lounge.html 에 서버 주소가 있음)');
    // 언어 선택 메뉴로 바꾸면 바로 다시 그려지는지(새로고침 없이)
    const p = await b.newPage();
    await p.goto(BASE + '#/tier', { waitUntil: 'networkidle0' });
    await p.evaluate(() => localStorage.setItem('woofia_lang', 'kr')); await p.reload({ waitUntil: 'networkidle0' }); await sleep(500);
    const before = await p.$eval('.lg-h1', (e) => e.textContent);
    await p.click('#langBtn'); await sleep(200);
    await p.evaluate(() => [...document.querySelectorAll('.lg-langmenu button')].find((x) => x.textContent.includes('English')).click());
    await sleep(1200);
    const after = await p.evaluate(() => ({ h1: document.querySelector('.lg-h1').textContent, nav: document.querySelector('.lg-side a span').textContent, html: document.documentElement.lang, saved: localStorage.getItem('woofia_lang') }));
    ok(before === '티어표' && after.h1 === 'Tier Lists' && after.nav === 'Companion Boards' && after.html === 'en' && after.saved === 'en', `언어 메뉴 즉시 전환 ${before} → ${JSON.stringify(after)}`);
  } finally { await b.close(); }
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
