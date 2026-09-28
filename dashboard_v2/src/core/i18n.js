/**
 * core/i18n.js — ID 키 다국어 사전 (ARCHITECTURE §5)
 *
 *   const i18n = createI18n({ lang: 'kr' });
 *   await i18n.ready;
 *   i18n.t('team.title');                         // "팀 편성"
 *   i18n.t('team.slot.aria', { n: 1, name });     // 이름 있는 자리표시자 {name}
 *   i18n.t('adv.fmt.exSkillNotReady', [3]);       // 순번 자리표시자 {0}
 *   i18n.tHtml('guide.section.altar.item');       // 인라인 태그가 든 키(guide.*, *.html) — 변수는 이스케이프
 *   await i18n.setLang('en');  i18n.onChange((lang, prev) => rerender());
 *   i18n.nameOf(10401)  ·  i18n.skillName(10401, 'ultimate')  ·  i18n.skillDesc(10401, 'ultimate', 9)
 *   i18n.translateEngine(logLine)                 // 엔진(파이썬)이 만든 한국어 조각 → 현재 언어
 *
 * 사전: dashboard_v2/i18n/{kr,en,ja,zh}.json (kr 원본, tools/redesign/i18n_migrate.py 생성).
 * 누락·미번역('[미번역] ' 접두) 키는 kr로 폴백하고, 개발 모드면 키마다 한 번 콘솔 경고.
 * 숫자·복수 포맷(만/억, K/M)은 core/format.js 담당 — 여기서는 문자열만 다룬다.
 */

export const LANGS = Object.freeze([
  { code: 'kr', label: '한국어', html: 'ko' },
  { code: 'en', label: 'English', html: 'en' },
  { code: 'ja', label: '日本語', html: 'ja' },
  { code: 'zh', label: '中文（繁體）', html: 'zh-Hant' },
]);
export const UNTRANSLATED = '[미번역] ';
export const LS_KEY = 'woofia_lang';

const CODES = LANGS.map((l) => l.code);
/** v1 저장값·브라우저 코드 → v2 코드. v1의 zhs(간체)는 v2 범위 밖이라 번체로 보낸다. */
const ALIAS = { ko: 'kr', 'ko-kr': 'kr', zhs: 'zh', 'zh-cn': 'zh', 'zh-tw': 'zh', 'zh-hant': 'zh', 'zh-hans': 'zh', jp: 'ja' };
/** chars.json / skills.json 언어별 필드 접미사 (v1 i18n.js nameField 와 동일, zh = 번체 name_cn) */
const FIELD = { kr: 'kr', en: 'en', ja: 'ja', zh: 'cn' };

export function normalizeLang(code) {
  if (!code) return 'kr';
  const c = String(code).trim().toLowerCase();
  if (CODES.includes(c)) return c;
  if (ALIAS[c]) return ALIAS[c];
  const head = c.split('-')[0];
  return CODES.includes(head) ? head : (ALIAS[head] || 'kr');
}

const escHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function fill(str, vars, esc) {
  if (vars == null) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => {
    const v = Array.isArray(vars) ? vars[+k] : vars[k];
    if (v === undefined || v === null) return m;       // 모르는 자리표시자는 그대로 둔다(누락이 눈에 띄게)
    return esc ? escHtml(v) : String(v);
  });
}

/** ${argN} → 값 (woofia_sim/effects.py resolve_placeholders 와 동일) */
export function resolveDesc(desc, params) {
  return String(desc || '').replace(/\$\{(\w+)\}/g, (m, k) => {
    const v = params ? params[k] : undefined;
    return v === undefined || v === null ? m : String(v);
  });
}

function defaultDev() {
  try {
    const loc = globalThis.location;
    if (!loc) return false;
    return ['localhost', '127.0.0.1', ''].includes(loc.hostname) || /[?&]dev\b/.test(loc.search || '');
  } catch { return false; }
}

function safeStorage(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
}

/**
 * @param {object} [opts]
 * @param {string} [opts.lang]      시작 언어. 없으면 localStorage 'woofia_lang' → 'kr'
 * @param {object} [opts.dicts]     { kr:{...}, en:{...}, engine:{...} } 미리 주입(테스트·오프라인). 없는 언어는 fetch
 * @param {string} [opts.baseUrl]   사전 위치. 기본 'i18n/' (index.html 기준 상대경로)
 * @param {Function} [opts.fetch]   fetch 대체(테스트)
 * @param {boolean} [opts.dev]      누락 키 경고. 기본: localhost 또는 ?dev
 * @param {Storage|null} [opts.storage]  언어 저장소. null이면 저장 안 함
 * @param {{chars?:object, skills?:object}} [opts.data]  동료·스킬 데이터(이름·설명 조회용)
 */
export function createI18n(opts = {}) {
  const storage = safeStorage(opts.storage);
  const baseUrl = opts.baseUrl ?? 'i18n/';
  const doFetch = opts.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  const dev = opts.dev ?? defaultDev();
  const dicts = { ...(opts.dicts || {}) };
  const warned = new Set();
  const listeners = new Set();
  let engine = dicts.engine || null;                  // engine_src.json
  let engineCache = new Map();                        // lang → { re:[[RegExp, tpl]], frags:[[src, dst]], exact }
  let data = { chars: null, skills: null };
  let lang = normalizeLang(opts.lang || (storage && storage.getItem(LS_KEY)) || 'kr');

  const warn = (msg) => { if (dev && !warned.has(msg)) { warned.add(msg); console.warn(`[i18n] ${msg}`); } };

  async function loadJson(name) {
    if (!doFetch) throw new Error('fetch 없음 — opts.dicts 로 사전 주입 필요');
    const res = await doFetch(`${baseUrl}${name}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${name}.json ${res.status}`);
    return res.json();
  }

  async function ensure(code) {
    if (dicts[code]) return;
    try { dicts[code] = await loadJson(code); }
    catch (e) {
      if (code === 'kr') throw e;                     // 원본이 없으면 진행 불가
      warn(`${code}.json 로드 실패 — kr로 표시 (${e.message})`);
      dicts[code] = {};
    }
  }

  async function ensureEngine() {
    if (engine) return;
    try { engine = await loadJson('engine_src'); }
    catch (e) { warn(`engine_src.json 로드 실패 — 엔진 문구 번역 생략 (${e.message})`); engine = { fragments: {}, regex: {}, exact: {} }; }
  }

  function lookup(key) {
    const kr = dicts.kr || {};
    if (lang !== 'kr') {
      const v = (dicts[lang] || {})[key];
      if (typeof v === 'string' && !v.startsWith(UNTRANSLATED)) return v;
      if (v === undefined && kr[key] === undefined) warn(`없는 키: ${key}`);
      else warn(`미번역(${lang}): ${key}`);
    }
    const base = kr[key];
    if (typeof base === 'string') return base;
    if (lang === 'kr') warn(`없는 키: ${key}`);
    return key;                                        // 키 자체를 보여 누락을 드러낸다
  }

  /** 문자열 키 → 현재 언어 문자열. vars: 객체({name}) 또는 배열({0}). */
  function t(key, vars) { return fill(lookup(key), vars, false); }

  /** innerHTML 용: 사전 값의 인라인 태그는 유지하고, 끼워 넣는 변수만 이스케이프. */
  function tHtml(key, vars) { return fill(lookup(key), vars, true); }

  /** 키 존재 여부(kr 기준). translated=true면 현재 언어에 실제 번역이 있는지. */
  function has(key, { translated = false } = {}) {
    const inKr = !!dicts.kr && Object.prototype.hasOwnProperty.call(dicts.kr, key);
    if (!translated || lang === 'kr') return inKr;
    const v = (dicts[lang] || {})[key];
    return typeof v === 'string' && !v.startsWith(UNTRANSLATED);
  }

  function syncHtmlLang() {
    try {
      const html = globalThis.document && globalThis.document.documentElement;
      if (html) html.lang = (LANGS.find((l) => l.code === lang) || LANGS[0]).html;
    } catch { /* 문서 없음(node) */ }
  }

  async function setLang(next) {
    const code = normalizeLang(next);
    if (code === lang && dicts[code]) return lang;
    await ensure('kr');
    await ensure(code);
    const prev = lang;
    lang = code;
    try { if (storage) storage.setItem(LS_KEY, lang); } catch { /* 저장 실패는 무시(사파리 사생활 모드 등) */ }
    syncHtmlLang();
    if (prev !== lang) {
      for (const fn of [...listeners]) {
        try { fn(lang, prev); } catch (e) { console.error('[i18n] onChange 콜백 오류', e); }
      }
    }
    return lang;
  }

  /** 언어 변경 구독. 반환값을 호출하면 해제. */
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  // ── 동료 이름·스킬 (data/chars.json · skills.json 의 언어별 필드, v1과 동일) ──
  function setData({ chars, skills } = {}) {
    if (chars !== undefined) data.chars = chars;
    if (skills !== undefined) data.skills = skills;
    engineCache = new Map();                           // 이름 치환표가 바뀜
  }
  const charOf = (id) => {
    const c = data.chars;
    if (!c) return null;
    if (Array.isArray(c)) return c.find((x) => x && String(x.id) === String(id)) || null;
    return c[id] || c[String(id)] || null;
  };
  function nameOf(id, code = lang) {
    const c = charOf(id);
    if (!c) return String(id);
    const f = FIELD[normalizeLang(code)];
    return (c[`name_${f}`] || c.name_kr || c.name || String(id)).trim();
  }
  function skillName(id, slot, code = lang) {
    const sd = data.skills && data.skills[id] && data.skills[id][slot];
    if (!sd) return '';
    return sd[`name_${FIELD[normalizeLang(code)]}`] || sd.name_kr || '';
  }
  /** level: 스킬 레벨 인덱스(skills.json levels 키, 0~9). 자리표시자 ${argN}은 params로 해석. */
  function skillDesc(id, slot, level, code = lang) {
    const sd = data.skills && data.skills[id] && data.skills[id][slot];
    const lv = sd && sd.levels && (sd.levels[level] || sd.levels[String(level)]);
    if (!lv) return '';
    const f = FIELD[normalizeLang(code)];
    return resolveDesc(lv[`desc_${f}`] || lv.desc_kr || '', lv.params).replace(/\r\n?/g, '\n');
  }

  // ── 엔진 문구 (sim_api.py 로그·라벨의 한국어 조각 → 키, 백엔드 미변경) ──
  function engineTable(code) {
    if (engineCache.has(code)) return engineCache.get(code);
    const eg = engine || { fragments: {}, regex: {}, exact: {} };
    const dst = (key) => {
      const v = (dicts[code] || {})[key];
      if (typeof v === 'string' && !v.startsWith(UNTRANSLATED)) return v;
      return (dicts.kr || {})[key];
    };
    const re = Object.entries(eg.regex || {}).map(([key, src]) => [new RegExp(src, 'g'), dst(key)]).filter(([, d]) => d);
    const frags = Object.entries(eg.fragments || {})
      .map(([key, src]) => [src, dst(key)])
      .filter(([s, d]) => d && s !== d && (code !== 'kr' || s.length >= 2));   // kr은 용어 교체만 — 1자 조각은 단어 훼손 위험
    if (code !== 'kr' && data.chars) {                 // 로그에 박힌 한국어 이름 → 현재 언어 이름
      const list = Array.isArray(data.chars) ? data.chars : Object.values(data.chars);
      for (const c of list) {
        const kr = c && c.name_kr && c.name_kr.trim();
        const to = c && c[`name_${FIELD[code]}`];
        if (kr && to) frags.push([kr, to]);
      }
    }
    const exact = {};
    for (const [src, key] of Object.entries(eg.exact || {})) {
      const d = dst(key);
      if (!d) continue;
      exact[src] = d;
      if (src.length >= 2 && src !== d) frags.push([src, d]);   // '치유' 등 2자 이상은 문장 속에서도 교체(1자는 훼손 위험)
    }
    frags.sort((a, b) => b[0].length - a[0].length);
    const table = {
      re, exact, frags,
      fragRe: frags.length ? new RegExp(frags.map(([s]) => escRe(s)).join('|'), 'g') : null,
      fragMap: new Map(frags),
    };
    if (engine && dicts.kr && dicts[code]) engineCache.set(code, table);   // 로드 전 표는 캐시하지 않음
    return table;
  }

  /** 엔진이 만든 한국어 문자열 → 현재 언어(kr이어도 용어집 교체: 치유→치료, 베리어→배리어 등). */
  function translateEngine(text) {
    if (text == null) return '';
    const s = String(text);
    if (!/[가-힣]/.test(s)) return s;
    const tb = engineTable(lang);
    const whole = s.trim();
    if (tb.exact[whole] != null) return s.replace(whole, tb.exact[whole]);
    let out = s;
    for (const [rx, tpl] of tb.re) {
      out = out.replace(rx, (...m) => fill(tpl, m.slice(1, -2), false));
    }
    if (tb.fragRe) out = out.replace(tb.fragRe, (m) => tb.fragMap.get(m) ?? m);   // 한 번에 치환(연쇄 치환 방지)
    return out;
  }

  const ready = (async () => {
    await ensure('kr');
    await ensure(lang);
    await ensureEngine();
    syncHtmlLang();
    return lang;
  })();
  ready.catch((e) => console.error('[i18n] 사전 로드 실패', e));
  if (opts.data) setData(opts.data);

  return {
    t, tHtml, has, setLang, onChange, setData,
    nameOf, skillName, skillDesc, translateEngine,
    ready,
    get lang() { return lang; },
    get langs() { return LANGS; },
  };
}
