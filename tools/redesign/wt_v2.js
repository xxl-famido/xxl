// v1 사용자 인지 워크스루 — v2(8778)에서 T1~T10 을 실제 마우스 클릭으로 수행하고 스크린샷·클릭 수를 남긴다.
// NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/wt_v2.js [T1,T2,...]
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'shots', 'walkthrough');
fs.mkdirSync(OUT, { recursive: true });
const only = (process.argv[2] || '').split(',').filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = {};

async function boot(browser) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto('http://localhost:8778/', { waitUntil: 'networkidle0', timeout: 90000 });
  await p.waitForFunction(() => window.__woofia && window.__woofia.store && document.querySelector('#app-plan details'), { timeout: 60000 });
  await sleep(1500);
  return { p, ctx };
}

// 텍스트로 요소 찾기(보이는 것만). scope 는 CSS 선택자.
async function find(p, sel, re, scope = 'body') {
  const h = await p.evaluateHandle((sel, src, flags, scope) => {
    const rx = new RegExp(src, flags);
    const root = document.querySelector(scope) || document.body;
    return [...root.querySelectorAll(sel)].find((e) => rx.test(e.textContent.replace(/\s+/g, ' ')) && e.getClientRects().length) || null;
  }, sel, re.source, re.flags, scope);
  const el = h.asElement();
  if (!el) throw new Error(`not found: ${sel} ${re} in ${scope}`);
  return el;
}
function counter(name) {
  const c = { name, clicks: 0, notes: [] };
  c.click = async (el) => { await el.evaluate((e) => e.scrollIntoView({ block: 'center' })); await sleep(120); await el.click(); c.clicks++; await sleep(350); };
  c.select = async (el, value) => { await el.evaluate((e) => e.scrollIntoView({ block: 'center' })); await el.select(String(value)); c.clicks += 2; await sleep(450); };
  c.note = (s) => c.notes.push(s);
  return c;
}
const shot = (p, name, full = false) => p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
const sheetShot = async (p, name) => { const el = await p.$('.sheet'); if (el) await el.screenshot({ path: path.join(OUT, `${name}.png`) }); else await shot(p, name); };
const st = (p, fn, ...a) => p.evaluate(fn, ...a);

async function setTeam(p, ids) {
  await p.evaluate(async (ids) => {
    const s = window.__woofia.store;
    const cur = s.get().team;
    for (let i = cur.length - 1; i >= 0; i--) if (cur[i]) s.team.remove(i);
    ids.forEach((id, i) => s.team.add(id, i));
  }, ids);
  await sleep(1200);
}
async function probeActs(p, turns) {
  return p.evaluate(async (turns) => {
    const w = window.__woofia;
    const r = await w.api.probe(w.store.buildCfg({ mode: 'probe' }));
    const team = w.store.get().team;
    const out = {};
    for (const t of turns) out[t] = ((r.plan[String(t)] || {}).seq || []).map((e) => `${(w.i18n.nameOf(team[e.p - 1].id)).slice(0, 4)}:${e.a}`).join(' ');
    return out;
  }, turns);
}

const TASKS = {
  // T1 — 방탈출 제단 켜고 2층 달의 제단 하나 끄기
  async T1(p) {
    const c = counter('T1');
    await shot(p, 'T1_0_cond_start');
    // v1 사용자는 '전투 조건' 머리에서 '길드 제단 설정' 버튼을 찾는다 → 없음. 아코디언 '방탈출 제단' 요약 '꺼짐'
    await c.click(await find(p, 'summary', /방탈출 제단/, '#app-cond'));
    await shot(p, 'T1_1_altar_acc_open');
    await c.click(await find(p, 'label.switch', /제단 효과 사용/, '#app-cond'));
    await c.click(await find(p, 'button', /층별 점등 설정/, '#app-cond'));
    await sleep(600);
    await sheetShot(p, 'T1_2_altar_sheet_top');
    // 2층 달의 제단 첫 행
    const row = await p.evaluateHandle(() => {
      const sec = [...document.querySelectorAll('.sheet .altar-floor')].find((s) => /2층/.test(s.getAttribute('aria-label')));
      return sec && sec.querySelector('.altar-group.moon .altar-row');
    });
    const below = await row.evaluate((e) => { const r = e.getBoundingClientRect(); return { y: r.y | 0, vh: innerHeight }; });
    c.note(`2층 달 첫 행 초기 y=${below.y} (뷰포트 ${below.vh}) → ${below.y > below.vh ? '스크롤 필요' : '보임'}`);
    await c.click(row.asElement());
    await sheetShot(p, 'T1_3_floor2_moon_off');
    c.state = await st(p, () => { const a = window.__woofia.store.get().altar; return { on: a.on, f2off: Object.keys(a.floors[2].off || {}) }; });
    const lineTxt = await st(p, () => document.querySelector('#app-cond .altar-sheet, #app-cond .hint') && [...document.querySelectorAll('#app-cond p.hint')].map((x) => x.textContent).join(' / '));
    c.note(`조건 패널 안내: ${lineTxt}`);
    return c;
  },

  // T2 — 확률 CD 감소 제단(1012/1013) 켜진 상태에서 전원 '준비되면 바로'
  async T2(p) {
    const c = counter('T2');
    await p.evaluate(() => window.__woofia.store.altar.setOn(true)); await sleep(800);
    const proc = await st(p, () => window.__woofia.store.env().procIds);
    c.note(`procIds=${JSON.stringify(proc)}`);
    // v1 경로 기억: 행동 고급 설정 → 궁극기 사용 방식 탭 → '모두 준비되면 바로'. v2 에서 먼저 제단 시트를 열어 본다(원인 쪽)
    await c.click(await find(p, 'summary', /방탈출 제단/, '#app-cond'));
    await c.click(await find(p, 'button', /층별 점등 설정/, '#app-cond'));
    await sleep(600);
    const sheetBtns = await st(p, () => [...document.querySelectorAll('.sheet button')].map((b) => b.textContent.trim()).filter(Boolean));
    c.note(`제단 시트 버튼: ${sheetBtns.slice(0, 12).join(' | ')}`);
    await sheetShot(p, 'T2_1_altar_sheet_procwarn');
    await c.click(await find(p, 'button', /닫기/, '.sheet .sheet-head').catch(async () => p.$('.sheet-head button')));
    // 행동 계획 미리보기 위 안내
    const note = await find(p, '.pv-note', /쿨타임이 줄어드는 제단/, '#app-plan');
    const ny = await note.evaluate((e) => (e.getBoundingClientRect().y + scrollY) | 0);
    c.note(`미리보기 안내 문서 y=${ny}`);
    await note.evaluate((e) => e.scrollIntoView({ block: 'center' })); await sleep(300);
    await shot(p, 'T2_2_preview_procnote');
    await c.click(await find(p, 'button', /전원 준비되면 바로/, '#app-plan'));
    await sleep(900);
    c.state = await st(p, () => window.__woofia.store.get().team.map((s) => s && (s.ult ? s.ult.mode : 'fixed')));
    const sel = await st(p, () => [...document.querySelectorAll('#app-plan .ult-mode select')].map((s) => s.selectedOptions[0].textContent));
    c.note(`행 선택값: ${sel.join(' / ')}`);
    await shot(p, 'T2_3_after_asap');
    return c;
  },

  // T3 — 확률 쿨 감소 성공 가정 켜기
  async T3(p) {
    const c = counter('T3');
    // (a) 제단 없이: 어디에도 없음
    const noAltar = await st(p, () => [...document.querySelectorAll('#app-plan *')].some((e) => e.children.length === 0 && /성공 가정|항상 성공/.test(e.textContent) && e.getClientRects().length));
    c.note(`제단 꺼짐일 때 행동 계획에 '성공 가정' 문구 노출: ${noAltar}`);
    const opts = await st(p, () => [...document.querySelector('#app-plan .ult-mode select').options].map((o) => o.textContent));
    c.note(`필살기 방식 선택지: ${opts.join(' | ')}`);
    await p.evaluate(() => window.__woofia.store.altar.setOn(true)); await sleep(1200);
    const b = await find(p, 'button', /^성공 가정$/, '#app-plan');
    const tip = await b.evaluate((e) => e.title);
    c.note(`버튼 title: ${tip}`);
    await c.click(b);
    await sleep(700);
    c.state = await st(p, () => window.__woofia.store.get().team.map((s) => s && !!(s.ult && s.ult.assist)));
    const vis = await st(p, () => [...document.querySelectorAll('#app-plan .prio li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()).join(' || '));
    c.note(`켜진 뒤 1단계 행 텍스트(상태 표시 여부): ${vis.slice(0, 300)}`);
    await shot(p, 'T3_1_after_assist');
    // 한 명만 끄는 경로 탐색: 행/셀에 스위치 있는지
    const perChar = await st(p, () => [...document.querySelectorAll('#app-plan .prio label.switch')].map((l) => l.textContent));
    c.note(`행 안 스위치: ${JSON.stringify(perChar)}`);
    // (b) T2 뒤 연속 시나리오: 전원 asap → 성공 가정 누르면?
    await p.evaluate(() => window.__woofia.store.plan.ultAll('asap')); await sleep(600);
    await c.click(await find(p, 'button', /^성공 가정$/, '#app-plan'));
    const after = await st(p, () => window.__woofia.store.get().team.map((s) => s && (s.ult ? `${s.ult.mode}${s.ult.assist ? '+A' : ''}` : 'fixed')));
    const toasts = await st(p, () => [...document.querySelectorAll('.toast')].map((t) => t.textContent));
    c.note(`asap 뒤 '성공 가정' 결과: ${after.join(',')} · 토스트: ${toasts.join(' / ')}`);
    await shot(p, 'T3_2_assist_after_asap');
    return c;
  },

  // T4 — 리카노 4·7·10턴에만 필살기
  async T4(p) {
    const c = counter('T4');
    const pos = await st(p, () => window.__woofia.store.get().team.findIndex((s) => s && s.id === 10428) + 1);
    // v1 습관: 리카노 초상 클릭 → 플래너
    await c.click(await p.$(`#app-team .slot-btn[data-id="10428"]`));
    await sleep(700);
    const growHas = await st(p, () => { const s = document.querySelector('.sheet'); return s ? { title: s.querySelector('h2').textContent, plan: /행동|필살기 방식|턴별/.test(s.textContent) } : null; });
    c.note(`초상 클릭 → 시트: ${JSON.stringify(growHas)}`);
    await sheetShot(p, 'T4_1_portrait_opens_grow');
    await c.click(await p.$('.sheet-head button'));
    const sel = await p.$(`#app-plan li[data-pos="${pos}"] .ult-mode select`);
    const opts = await sel.evaluate((s) => [...s.options].map((o) => `${o.value}=${o.textContent}`));
    c.note(`리카노 방식 선택지: ${opts.join(' | ')}`);
    await sel.evaluate((e) => e.scrollIntoView({ block: 'center' })); await sleep(200);
    await shot(p, 'T4_2_row_select');
    await c.select(sel, 'manual');
    await sleep(600);
    const ults = async () => st(p, (pos) => [...document.querySelectorAll(`#app-plan li[data-pos="${pos}"] .plan-cells button`)].map((b, i) => (b.classList.contains('ult') ? i + 1 : 0)).filter(Boolean), pos);
    const before = await ults();
    c.note(`직접 지정 직후 필살기 칸: ${before.join(',')}`);
    await shot(p, 'T4_3_manual_strip');
    for (const t of before.filter((x) => ![4, 7, 10].includes(x))) {
      for (let k = 0; k < 3; k++) {
        const b = await p.$(`#app-plan li[data-pos="${pos}"] .plan-cells button:nth-child(${t})`);
        const isAtk = await b.evaluate((e) => e.classList.contains('atk'));
        if (isAtk) break;
        await c.click(b);
      }
    }
    c.state = { ultTurns: await ults(), ult: await st(p, (pos) => window.__woofia.store.get().team[pos - 1].ult, pos) };
    await shot(p, 'T4_4_done');
    return c;
  },

  // T5 — 욱영 필살 턴에 마타야 방어 → 받은 추가 행동에서 필살기, 평소 매 턴 필살기
  async T5(p) {
    const c = counter('T5');
    await setTeam(p, [10401, 10442, 10439, 10421, 10425]);   // 마타야(2) · 욱영(3) 인접
    await c.click(await find(p, 'summary', /맞추기/, '#app-plan'));
    await shot(p, 'T5_1_step3_open');
    const presetTxt = await st(p, () => { const b = [...document.querySelectorAll('#app-plan .sync-tools button')].find((x) => !x.hidden); return [...document.querySelectorAll('#app-plan .sync-tools button')].map((x) => `${x.textContent}${x.hidden ? '(숨김)' : ''}`); });
    c.note(`맞추기 도구: ${presetTxt.join(' | ')}`);
    await c.click(await find(p, 'button', /맞추기 추가/, '#app-plan'));
    const anchorSel = await p.$('#app-plan [data-fk="sa:0"]');
    await c.select(anchorSel, 3);
    const addSel = await p.$('#app-plan [data-fk="sadd:0"]');
    await c.select(addSel, 2);
    const act = await p.$('#app-plan [data-fk="sx:0:2"]');
    await c.select(act, 'defend');
    const other = await st(p, () => { const s = document.querySelector('#app-plan [data-fk="so:0:2"]'); return s && s.selectedOptions[0].textContent; });
    c.note(`'평소에는' 기본값: ${other}`);
    await (await p.$('#app-plan .sync-list')).evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await shot(p, 'T5_2_sentence');
    let acts = await probeActs(p, [1, 2, 3, 4, 5]);
    c.note(`마타야 방식 그대로(자동) 1~5턴: ${JSON.stringify(acts)}`);
    const mSel = await p.$('#app-plan li[data-pos="2"] .ult-mode select');
    const mOpt = await mSel.evaluate((s) => s.selectedOptions[0].textContent);
    c.note(`마타야 1단계 방식 현재: ${mOpt}`);
    await c.select(mSel, 'asap');
    await sleep(800);
    acts = await probeActs(p, [1, 2, 3, 4, 5, 6, 7]);
    c.state = acts;
    await shot(p, 'T5_3_after_asap');
    const chip = await st(p, () => [...document.querySelectorAll('#app-plan .link-chip')].map((x) => x.textContent));
    c.note(`1단계 행 연결 칩: ${chip.join(',')}`);
    return c;
  },

  // T6 — 파미도 필살기 직전 턴 방어
  async T6(p) {
    const c = counter('T6');
    const pos = await st(p, () => window.__woofia.store.get().team.findIndex((s) => s && s.id === 10421) + 1);
    const hasPresetBefore = await st(p, () => /필살기 직전 방어|패시브 방어/.test(document.getElementById('app-plan').textContent));
    c.note(`직접 지정 전 '필살기 직전 방어' 노출: ${hasPresetBefore}`);
    const sel = await p.$(`#app-plan li[data-pos="${pos}"] .ult-mode select`);
    await c.select(sel, 'manual');
    await sleep(600);
    const pre = await find(p, 'button', /필살기 직전 방어/, `#app-plan li[data-pos="${pos}"]`);
    await pre.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await shot(p, 'T6_1_presets');
    await c.click(pre);
    c.state = await st(p, (pos) => window.__woofia.store.get().team[pos - 1].plan.slice(0, 12).join(''), pos);
    await shot(p, 'T6_2_done');
    return c;
  },

  // T7 — 4·7·10턴만 행동 순서 다르게
  async T7(p) {
    const c = counter('T7');
    await c.click(await find(p, 'summary', /예외 턴/, '#app-plan'));
    await c.click(await find(p, 'button', /턴 추가/, '#app-plan'));
    await sleep(500);
    for (const t of [4, 7, 10]) await c.click(await find(p, '.sheet .turn-chips button', new RegExp(`^${t}$`)));
    await sheetShot(p, 'T7_1_sheet');
    const last = await p.$$('.sheet .exc-order-list li');
    const up = await last[last.length - 1].$('[data-dir="-1"]');
    for (let k = 0; k < 4; k++) { const b = await (await p.$$('.sheet .exc-order-list li')).find(Boolean); break; }
    await c.click(up);
    await c.click(await find(p, '.sheet-foot button', /적용/));
    c.state = await st(p, () => window.__woofia.store.get().overrides);
    await (await p.$('#app-plan .exc-list')).evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await shot(p, 'T7_2_done');
    return c;
  },

  // T8 — 완전 수동으로 짜다가 규칙 모드로 복귀
  async T8(p) {
    const c = counter('T8');
    const hasUse = await st(p, () => [...document.querySelectorAll('#app-plan label.switch')].map((l) => l.textContent));
    c.note(`행동 계획 패널 스위치: ${JSON.stringify(hasUse)}`);
    const btn = await find(p, 'button', /완전 수동으로 직접 짜기/, '#app-plan');
    const by = await btn.evaluate((e) => (e.getBoundingClientRect().y + scrollY) | 0);
    c.note(`'완전 수동으로 직접 짜기' 문서 y=${by}`);
    await c.click(btn);
    await sleep(600);
    await sheetShot(p, 'T8_1_start_sheet');
    await c.click(await find(p, '.sheet button', /지금 설정 그대로 가져오기/));
    await sleep(2500);
    await sheetShot(p, 'T8_2_editor');
    const foot = await st(p, () => [...document.querySelectorAll('.sheet-foot button')].map((b) => b.textContent));
    c.note(`편집기 하단 버튼: ${foot.join(' | ')}`);
    // 사용자가 '닫기' 로 나오면 → 잠금 막대
    await c.click(await find(p, '.sheet-foot button', /닫기/));
    await sleep(600);
    await (await p.$('#app-plan .plan-lock')).evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await shot(p, 'T8_3_locked_panel');
    await c.click(await find(p, '#app-plan .plan-lock button', /완전 수동 끄기/));
    c.state = await st(p, () => window.__woofia.store.get().manual.on);
    return c;
  },

  // T9 — 제단 없이 필살기 사용 방식·연동 찾기
  async T9(p) {
    const c = counter('T9');
    const altarOn = await st(p, () => window.__woofia.store.get().altar.on);
    c.note(`제단 on=${altarOn}`);
    // v1 멘탈 모델: '행동 고급 설정' 버튼 → 없음. 텍스트 검색
    const terms = await st(p, () => {
      const T = document.body.textContent;
      return ['행동 고급 설정', '궁극기', '사용 방식', '연동', '필살기 방식', '맞추기', '기준 동료'].map((k) => `${k}:${T.includes(k)}`);
    });
    c.note(`본문 용어 존재: ${terms.join(' ')}`);
    await (await p.$('#app-plan')).evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await sleep(300);
    await shot(p, 'T9_1_plan_panel');
    c.state = 'step1 행 select + ③ 맞추기 는 제단과 무관하게 항상 노출';
    return c;
  },

  // T10 — 옛 공유 코드(v1) 열기
  async T10(p) {
    const c = counter('T10');
    const code = fs.readFileSync(path.join(OUT, 'v1_code.txt'), 'utf8').trim();
    // v1: 기록 옆 ⚙ → 기록 관리 → 가져오기. v2: 기록 select 옆엔 버튼 없음 → ≡ 메뉴
    const topBtns = await st(p, () => [...document.querySelectorAll('#app-topbar button')].map((b) => b.textContent.trim() || b.getAttribute('aria-label')));
    c.note(`상단바 버튼: ${topBtns.join(' | ')}`);
    await c.click(await p.$('#app-topbar button[aria-haspopup="menu"]'));
    await shot(p, 'T10_1_menu');
    await c.click(await find(p, '.menu button', /기록 관리/));
    await sleep(500);
    await c.click(await find(p, '.sheet button', /^가져오기$/));
    await p.type('.sheet textarea.rec-code', code, { delay: 0 }); c.clicks++;
    await sheetShot(p, 'T10_2_import_box');
    await c.click(await find(p, '.sheet .rec-import button', /^가져오기$/));
    await sleep(900);
    const toasts = await st(p, () => [...document.querySelectorAll('.toast')].map((t) => t.textContent));
    c.note(`가져오기 토스트: ${toasts.join(' / ')}`);
    await sheetShot(p, 'T10_3_after_import');
    const loadBtn = await find(p, '.sheet button', /불러오기/).catch(() => null);
    if (loadBtn) { await c.click(loadBtn); await sleep(2500); }
    c.state = await st(p, () => {
      const s = window.__woofia.store.get();
      return { team: s.team.map((x) => x && `${x.id}:${x.ult ? JSON.stringify(x.ult) : '-'}:${x.usePlan ? 'plan' : ''}`), altar: s.altar.on, sync: s.sync, ov: Object.keys(s.overrides) };
    });
    const rows = await st(p, () => [...document.querySelectorAll('#app-plan .ult-mode select')].map((s) => s.selectedOptions[0].textContent));
    c.note(`불러온 뒤 1단계 방식 표시: ${rows.join(' / ')}`);
    await (await p.$('#app-plan')).evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await sleep(800);
    await shot(p, 'T10_4_loaded_plan');
    return c;
  },
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  try {
    for (const [k, fn] of Object.entries(TASKS)) {
      if (only.length && !only.includes(k)) continue;
      const { p, ctx } = await boot(browser);
      try {
        const c = await fn(p);
        log[k] = { clicks: c.clicks, notes: c.notes, state: c.state };
      } catch (e) { log[k] = { error: String(e && e.stack || e).slice(0, 600) }; await shot(p, `${k}_error`); }
      console.log(k, JSON.stringify(log[k], null, 1));
      await ctx.close();
    }
  } finally {
    fs.writeFileSync(path.join(OUT, `wt_log${only.length ? '_' + only.join('_') : ''}.json`), JSON.stringify(log, null, 1));
    await browser.close();
  }
})();
