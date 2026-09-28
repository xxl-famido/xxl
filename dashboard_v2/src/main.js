// 부트: 스토어·API·i18n 준비 → 로딩 연출 → UI 모듈 마운트 → 초기 복원 → 진입 모션.
// UI 모듈은 `mount(host, ctx)` 하나만 export 한다. 없는 모듈은 건너뛴다(개발 중 부분 실행).
import { createApi } from './core/api.js';
import { createStore } from './core/store.js';
import { createI18n } from './core/i18n.js';
import * as motion from './motion/index.js';
import * as components from './ui/components.js';
import { parseDeepLink, applyDeepLink, clearDeepLink } from './core/deeplink.js';

const MODULES = ['topbar', 'team', 'plan', 'cond', 'results', 'runbar'];   // 마운트 순서 = 화면 순서
const INSTALLS = ['patch', 'feedback', 'compare', 'guide', 'update'];                 // ctx.open* 를 등록하는 모듈(마운트 없음)
const THEME_KEY = 'woofia_theme';

const boot = {
  el: document.getElementById('app-boot'),
  msg: document.getElementById('bootMsg'),
  bar: document.getElementById('bootBar'),
  set(ratio, text) {
    if (text != null) this.msg.textContent = text;
    this.bar.style.setProperty('--p', `${Math.round(ratio * 100)}%`);   // 진행은 로고 아래 진행 바로만(로고는 CSS 페이드인)
  },
  fail(text) { this.el.querySelector('.boot-box').append(components.h('div', { class: 'boot-err' }, text)); },
  async done() {
    this.set(1);
    await new Promise(r => setTimeout(r, 200));
    this.el.classList.add('done');
    await new Promise(r => setTimeout(r, motion.dur('slow')));
    this.el.remove();
  },
};

// 워커는 비율을 주지 않아(단계만) 단계 안에서 시간에 따라 천천히 차오르게 한다 — 멈춘 것처럼 보이지 않게.
function creep(from, to, seconds) {
  let stop = false; const t0 = performance.now();
  const step = () => { if (stop) return; const p = Math.min(1, (performance.now() - t0) / (seconds * 1000)); boot.set(from + (to - from) * (1 - Math.pow(1 - p, 2))); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
  return () => { stop = true; };
}

// 개발 중(8778)에는 모듈별 문구 조각(i18n/parts/*.kr.json)을 kr 사전에 덧붙여 본다. 병합 전 확인용.
async function loadKrWithParts() {
  try {
    const kr = await (await fetch('i18n/kr.json', { cache: 'no-cache' })).json();
    if (location.port !== '8778') return { kr };
    const list = await (await fetch('i18n/parts/')).json().catch(() => []);
    for (const f of list) { try { Object.assign(kr, await (await fetch(`i18n/parts/${f}`, { cache: 'no-cache' })).json()); } catch {} }
    return { kr };
  } catch { return {}; }
}

/**
 * 주소의 라운지 딥링크를 스토어에 적용하고 주소에서 지운다. 링크가 없으면 null.
 * 코드 적용은 활성 기록 연결을 끊는다(편성이 그 기록과 달라지므로) — 되돌리기가 기록 연결까지 복원한다.
 * → { ...applyDeepLink 결과, link, prevRec }
 */
async function takeDeepLink(store, { silent = false } = {}) {
  let link = null;
  try { link = parseDeepLink(location.hash); } catch { link = null; }
  if (!link) return null;
  const prevRec = store.get().activeRecId ?? null;
  let r;
  try { r = await applyDeepLink(store, link); } catch { r = { applied: null, run: false, reason: 'bad' }; }
  if (r.applied === 'code') { store.set({ activeRecId: null }, { silent }); store.saveDraft(); }
  try { clearDeepLink(); } catch { /* 주소 정리 실패는 무시(새로고침 시 한 번 더 적용될 뿐) */ }
  return { ...r, link, prevRec };
}

/**
 * 딥링크 결과 토스트: 불러옴(+되돌리기) · 추가함 · 거절 사유(bad | empty | unknown | full | dup | imbueonP1).
 * runtime: 부팅 뒤(해시 이동) — imbueonP1 은 스토어 알림이 이미 띄우므로 겹치지 않게 뺀다(부팅 중엔 알림 구독 전이라 여기서 띄움).
 */
function announceDeepLink(ctx, r, { runtime = false } = {}) {
  const { store, i18n, components: { toast } } = ctx;
  if (r.applied === 'code' && r.undo) {
    toast(i18n.t('deeplink.loaded'), { duration: 8000, action: { label: i18n.t('top.undo'), fn: () => {
      store.set({ activeRecId: r.prevRec });
      store.applySnap(r.undo);
      store.saveDraft();
    } } });
  }
  if (r.applied === 'add') toast(i18n.t('deeplink.added', { name: i18n.nameOf ? i18n.nameOf(r.link.add) : String(r.link.add) }));
  if (r.reason && !(runtime && r.reason === 'imbueonP1')) toast(i18n.t(`deeplink.${r.reason}`));
}

export async function start() {
  const api = createApi();
  const i18n = createI18n({ dicts: await loadKrWithParts() });
  const store = createStore({ api });
  const ctx = { store, api, i18n, t: (k, v) => i18n.t(k, v), motion, components,
    theme: {
      get: () => document.documentElement.dataset.theme || 'auto',
      set(v) { motion.themeFade(() => { if (v === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v; }); try { v === 'auto' ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, v); } catch {} },
    },
  };
  window.__woofia = ctx;   // 디버그·테스트 하네스 통로(프로덕션에서도 무해)

  let stopCreep = null;
  const stageText = { runtime: 'boot.stage.runtime', engine: 'boot.stage.engine', ready: 'boot.stage.ready' };
  api.onProgress?.(p => {
    stopCreep?.();
    const label = i18n.has?.(stageText[p.stage]) ? i18n.t(stageText[p.stage]) : (p.msg || '');
    if (p.stage === 'fatal') { boot.fail(p.error || p.msg || 'error'); return; }
    if (p.stage === 'runtime') { boot.set(0.05, label); stopCreep = creep(0.05, 0.55, 8); }
    else if (p.stage === 'engine') { boot.set(0.6, label); stopCreep = creep(0.6, 0.9, 3); }
    else if (p.stage === 'ready') { boot.set(0.92, label); }
  });
  if (api.mode === 'fetch') { boot.set(0.3, ''); stopCreep = creep(0.3, 0.85, 1.2); }

  try { await i18n.ready; } catch (e) { boot.fail(String(e.message || e)); return; }
  document.documentElement.lang = { kr: 'ko', en: 'en', ja: 'ja', zh: 'zh-Hant' }[i18n.lang] || 'ko';

  let chars;
  try { chars = await api.chars(); } catch (e) { stopCreep?.(); boot.fail(i18n.has?.('boot.error') ? i18n.t('boot.error', { error: String(e.message || e) }) : String(e.message || e)); return; }
  stopCreep?.();
  const charMap = Array.isArray(chars) ? Object.fromEntries(chars.map(c => [c.id, c])) : chars;
  store.init?.({ chars: charMap });
  i18n.setData?.({ chars: charMap });

  // 라운지 딥링크(인계서 §2-1): 초안 복원 직후에 적용해 화면이 처음부터 링크 편성으로 그려지게 한다.
  // 토스트·실행은 로딩 연출이 끝난 뒤(아래)에.
  const linked = await takeDeepLink(store, { silent: true });

  for (const name of INSTALLS) {
    try { const mod = await import(`./ui/${name}.js`); mod.install?.(ctx); }
    catch (e) { if (!/Failed to fetch dynamically imported module|404/.test(String(e))) console.error(`[install ${name}]`, e); }
  }

  const mounted = [];
  for (const name of MODULES) {
    const host = document.getElementById(`app-${name === 'results' ? 'result' : name}`);
    if (!host) continue;
    try {
      const mod = await import(`./ui/${name}.js`);
      await mod.mount?.(host, ctx);
      mounted.push(host);
    } catch (e) {
      if (!/Failed to fetch dynamically imported module|Cannot find module|404/.test(String(e))) console.error(`[mount ${name}]`, e);
    }
  }

  await boot.done();
  await motion.stagger(mounted.filter(h => !h.hidden));
  store.set?.({ ui: { ...store.get().ui, booted: true } }, { silent: true });
  if (linked) announceDeepLink(ctx, linked);
  // 이미 열린 화면에서 주소만 바뀐 경우(같은 문서 해시 이동 — 새로 읽지 않음)도 같은 처리.
  addEventListener('hashchange', async () => {
    const r = await takeDeepLink(store);
    if (!r) return;
    announceDeepLink(ctx, r, { runtime: true });
    if (r.run && typeof ctx.run === 'function') { try { await ctx.run(); } catch (e) { console.warn('[deeplink run]', e); } }
  });
  // 라운지 "시뮬하러 가기"(#code=…&run=1): 실행 버튼과 같은 경로로 한 번만 — 아래 부팅 자동 실행은 건너뛴다.
  if (linked && linked.run && typeof ctx.run === 'function') {
    try { await ctx.run(); } catch (e) { console.warn('[deeplink run]', e); }
  }
  // 복원한 편성(초안·최근 기록)에 결과가 없으면 조용히 1회 실행해 화면을 '값 먼저'로 채운다(v1 restoreRecord 와 같은 취지, 기록은 저장하지 않음).
  else if (!store.get().result && store.get().team.some(Boolean) && typeof ctx.run === 'function') {
    try { await ctx.run({ save: false, quiet: true }); } catch (e) { console.warn('[boot run]', e); }
  }
}

start();
