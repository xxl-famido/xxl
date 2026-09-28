// ≡ 메뉴: 기록 관리 / 가이드 / 패치 히스토리 / 피드백 / 언어 / 테마. 상단바가 openMenu(anchor, ctx) 로 연다.
// 가이드·패치·피드백은 다른 담당이 ctx.openPatch / ctx.openFeedback 을 붙인다 — 없으면 그 항목을 숨긴다(연 시점 기준).
import { open as openRecords } from './records.js';

// 구버전(v1): 배포 빌드(tools/redesign/build_site_v2.sh)가 v1 을 v1/ 에 함께 조립하고 아래 값을 true 로 바꾼다.
// 로컬 개발 서버에는 v1/ 이 없으므로 항목을 숨긴다(탐침 요청을 보내지 않아 콘솔 404 도 없음).
const V1_BUILT = false;
const V1_HREF = 'v1/';

const THEMES = [
  { value: 'light', key: 'top.theme.light' },
  { value: 'dark', key: 'top.theme.dark' },
  { value: 'auto', key: 'top.theme.auto' },
];

export function openMenu(anchor, ctx) {
  const { components, t, i18n, store } = ctx;
  const { h, icon } = components;
  components.ensureStyle('css/topbar.css');
  const items = [{ label: t('records.title'), iconName: 'history', onSelect: () => openRecords(ctx) }];
  // 가이드: 상단바 버튼 자리를 라운지에 내주고 메뉴로 옮겼다(2026-09-28).
  if (typeof ctx.openGuide === 'function') items.push({ label: t('top.guide'), iconName: 'book-open', onSelect: () => ctx.openGuide() });
  if (typeof ctx.openPatch === 'function') items.push({ label: t('top.patch'), iconName: 'layers', onSelect: () => ctx.openPatch() });
  if (typeof ctx.openFeedback === 'function') items.push({ label: t('top.feedback'), iconName: 'message-square', onSelect: () => ctx.openFeedback() });
  if (V1_BUILT) items.push({ label: t('top.oldVersion'), iconName: 'rotate-ccw', onSelect: () => { location.href = V1_HREF; } });
  items.push('sep');
  const langStart = items.length;
  for (const l of i18n.langs) {
    items.push({ label: l.label, onSelect: async () => { await i18n.setLang(l.code); store.setLang?.(i18n.lang); } });
  }
  items.push('sep');
  const themeStart = items.length;
  for (const th of THEMES) items.push({ label: t(th.key), onSelect: () => ctx.theme.set(th.value) });

  const m = components.menu(anchor, items);
  m.el.classList.add('top-menu');
  m.el.setAttribute('aria-label', t('top.menu.aria'));
  anchor.setAttribute('aria-expanded', 'true');
  // 메뉴가 닫히면(요소 제거) 버튼 상태를 되돌린다.
  const mo = new MutationObserver(() => { if (!m.el.isConnected) { anchor.setAttribute('aria-expanded', 'false'); mo.disconnect(); } });
  mo.observe(document.body, { childList: true });

  // 언어·테마 묶음: 머리글 + 라디오 항목(현재 값에 체크).
  const btns = [...m.el.children];     // hr 포함, items 와 1:1
  const radio = (from, count, isOn, headKey, headIcon) => {
    for (let k = 0; k < count; k++) {
      const b = btns[from + k]; if (!b) continue;
      const on = isOn(k);
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', String(on));
      b.classList.add('menu-radio');
      b.append(icon('check', `ic menu-check${on ? '' : ' off'}`));
    }
    btns[from]?.before(h('div', { class: 'menu-h', role: 'presentation' }, icon(headIcon), t(headKey)));
  };
  radio(langStart, i18n.langs.length, (k) => i18n.langs[k].code === i18n.lang, 'top.lang.aria', 'languages');
  const cur = ctx.theme.get();
  radio(themeStart, THEMES.length, (k) => THEMES[k].value === cur, 'top.theme.aria', 'sun');
  // 위치 재계산(머리글이 들어가 폭이 바뀜) — 오른쪽 끝 버튼이라 화면 밖으로 나가지 않게.
  const r = anchor.getBoundingClientRect();
  m.el.style.left = `${Math.max(8, Math.min(r.right - m.el.offsetWidth, innerWidth - m.el.offsetWidth - 8))}px`;
  return m;
}
