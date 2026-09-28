/**
 * v1 app.js 를 Node `vm` 에 올려 최상위 함수·상태를 테스트 통로로 연다(JSDOM 없이).
 *
 * tools/uitest.js L62-92 와 같은 발상: app.js 의 최상위 선언은 const/let 이라 스크립트 전역 렉시컬 스코프에 갇히는데,
 * 같은 vm 컨텍스트에서 이어 실행하는 스크립트는 그 스코프를 공유한다 → `v1.eval('team = …')` 로 상태를 넣고
 * `v1.call('snapshot')` 으로 결과를 받는다. DOM 은 최소 가짜(아이디 셀렉터마다 영속 요소, 클래스 셀렉터는 null)로 막는다.
 * init() 는 돌리지 않는다(부트·네트워크 없음). 값은 JSON 으로 오가므로 결과는 이 realm 의 평범한 객체다.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEGACY = path.join(HERE, '..', '..', 'legacy');
export const CHARS_LIST = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'fixtures', 'chars.json'), 'utf8'));
export const CHARS = Object.fromEntries(CHARS_LIST.map((c) => [c.id, c]));

// 실제 <input type=range> 처럼 값을 문자열로 두고 범위로 자른다(snapshot 이 +value 로 읽는다).
const RANGES = { '#turns': [1, 30, '30'], '#runs': [1, 200, '50'], '#incoming': [1, 99, '30'] };
const SEGS = { '#dummies': '1', '#enemyHits': '5', '#dummyElement': '0' };

function makeEl(sel) {
  const dataset = new Proxy({}, { set(t, k, v) { t[k] = String(v); return true; } });
  const classes = new Set();
  const range = RANGES[sel];
  let value = range ? range[2] : '';
  const el = {
    sel, dataset, style: { setProperty() {}, removeProperty() {} }, children: [],
    innerHTML: '', textContent: '', hidden: false, disabled: false, title: '', checked: false,
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      toggle: (c, on) => { const v = on === undefined ? !classes.has(c) : !!on; if (v) classes.add(c); else classes.delete(c); return v; },
    },
    get value() { return value; },
    set value(v) {
      if (range) { let n = Math.round(+v); if (!Number.isFinite(n)) n = +range[2]; value = String(Math.max(range[0], Math.min(range[1], n))); }
      else value = String(v);
    },
    querySelector: () => makeEl('child'), querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    setAttribute() {}, removeAttribute() {}, appendChild() {}, remove() {}, closest: () => null,
    scrollIntoView() {}, focus() {}, select() {}, getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
  };
  if (SEGS[sel]) el.dataset.val = SEGS[sel];
  return el;
}

export function loadV1() {
  const els = new Map();
  const byId = (sel) => { if (!els.has(sel)) els.set(sel, makeEl(sel)); return els.get(sel); };
  const document = {
    querySelector: (s) => (/^#[\w-]+$/.test(s) ? byId(s) : null),
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: (t) => makeEl(t),
    addEventListener() {}, removeEventListener() {},
    body: { appendChild() {}, children: [], addEventListener() {} },
    hidden: false,
  };
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
  const toasts = [];
  class Event { constructor(type) { this.type = type; } }
  const ctx = {
    document, localStorage, console, Event, CustomEvent: Event,
    location: { port: '8777', href: 'http://localhost:8777/' },
    navigator: { clipboard: { writeText: async () => {} } },
    window: { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {}, innerWidth: 1280, innerHeight: 800 },
    fetch: () => Promise.resolve({ ok: false, json: async () => null }),
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, requestAnimationFrame: () => 0,
    alert: (m) => toasts.push('alert:' + m), confirm: () => true, prompt: () => null,
    CompressionStream, DecompressionStream, Response, TextEncoder, TextDecoder,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    __toasts: toasts,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(LEGACY, 'spec.v1.js'), 'utf8'), ctx, { filename: 'spec.v1.js' });
  let code = fs.readFileSync(path.join(LEGACY, 'app.v1.js'), 'utf8');
  const INIT = '(async function init() {';
  if (!code.includes(INIT)) throw new Error('app.v1.js init() 표식을 찾지 못함');
  code = code.replace(INIT, INIT + ' return;');
  vm.runInContext(code, ctx, { filename: 'app.v1.js' });
  // 토스트 가로채기(문구 확인용) — toast 는 function 선언이라 재할당 가능
  vm.runInContext('toast = function (m) { __toasts.push(String(m)); }', ctx);
  vm.runInContext(`CHARS = ${JSON.stringify(CHARS)};`, ctx);

  const run = (src) => vm.runInContext(src, ctx, { filename: 'v1-eval' });
  const VSet = run('Set');
  const toJSON = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v, (k, x) => (x instanceof VSet || x instanceof Set ? [...x] : x))));
  return {
    ctx, toasts, storage: store,
    /** 식을 평가해 JSON 으로 돌려받는다. */
    eval: (src) => toJSON(run(src)),
    /** 문장 실행(반환 무시). */
    exec: (src) => { run(src); },
    /** 비동기 문장 실행(Promise 대기). */
    async execAsync(src) { await run(src); },
    /** 함수 호출 — 인자는 JSON 으로 넘긴다. */
    call(fn, ...args) {
      const a = JSON.stringify(args);
      return toJSON(run(`${fn}(...${a})`));
    },
    /** 비동기 함수 호출. */
    async callAsync(fn, ...args) {
      const a = JSON.stringify(args);
      return toJSON(await run(`${fn}(...${a})`));
    },
    /** 메인 상태 한 번에 넣기(DOM 값 포함). */
    setState(st) {
      run(`(function (s) {
        team = s.team.map(x => x ? JSON.parse(JSON.stringify(x)) : null);
        turnOverrides = s.overrides || {}; advOn = !!s.advOn; turnPlans = s.turnPlans || {};
        advTouched = new Set(s.touched || Object.keys(turnPlans).map(Number)); advPrevBudget = {};
        syncGroups = normalizeSyncGroups(s.sync || []);
        altarOn = !!(s.altar && s.altar.on);
        altarCfg = { floors: (s.altar && s.altar.floors) ? JSON.parse(JSON.stringify(s.altar.floors)) : { 1: { on: true, off: {} }, 2: { on: true, off: {} }, 3: { on: true, off: {} } } };
        tdmgOn = !!(s.tdmg && s.tdmg.on);
        tdmgCfg = s.tdmg ? { pct: s.tdmg.pct ?? 10, adv: !!s.tdmg.adv, per: s.tdmg.per || {}, hits: s.tdmg.hits ?? 5 } : { pct: 10, adv: false, per: {}, hits: 5 };
        forceProc = !!s.cond.forceProc; hp10 = !!s.cond.hp10; incomingOn = !!s.cond.incomingOn;
        $('#turns').value = s.cond.turns; $('#runs').value = s.cond.runs; $('#incoming').value = s.cond.incomingPct;
        $('#dummies').dataset.val = s.cond.dummies; $('#enemyHits').dataset.val = s.cond.enemyHits; $('#dummyElement').dataset.val = s.cond.dummyElement;
      })(${JSON.stringify(st)})`);
    },
  };
}
