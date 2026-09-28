/**
 * lounge/i18n.js — 라운지 다국어. 메인 v2의 core/i18n.js 를 그대로 쓰되 사전만 라운지 전용(i18n/lounge/{kr,en,ja,zh}.json).
 *
 * - 언어 설정은 메인과 같은 localStorage 'woofia_lang' — 시뮬에서 바꾸면 라운지도 같은 언어.
 * - 번역하는 것은 화면의 정해진 문구뿐. 유저가 쓴 글·제목·행 이름·태그 값(저장값)은 그대로 둔다.
 * - 속성·포지션 용어(element.*, role.*)는 생성기가 메인 사전에서 복사해 온다(표기 일치).
 * - 사전 원본: tools/redesign/lounge_i18n_src.py → python tools/redesign/gen_lounge_i18n.py
 */
import { createI18n, LANGS } from '../core/i18n.js';

export { LANGS };
// 라운지는 시뮬 엔진 로그를 번역하지 않는다 → 빈 엔진 사전을 넣어 engine_src.json 을 받지 않게 한다.
export const i18n = createI18n({ baseUrl: 'i18n/lounge/', dicts: { engine: { fragments: {}, regex: {}, exact: {} } } });

/** t('key', {vars}) — 없는 키·미번역은 한국어로 폴백(core/i18n.js 규칙). */
export const t = (key, vars) => i18n.t(key, vars);
export const lang = () => i18n.lang;
/** 날짜·시각 표기용 BCP-47 코드 */
export const locale = () => ({ kr: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-TW' }[i18n.lang] || 'ko-KR');

/** 태그는 한국어 값으로 저장된다(서버·필터 공용). 화면에는 번역해서 보인다. */
const TAG_KEY = { '육성': 'growth', '보스전': 'boss', '방탈출': 'escape', '팀 구성': 'comp', '스킬 해석': 'skill' };
export const tagLabel = (tag) => (TAG_KEY[tag] ? t(`tag.${TAG_KEY[tag]}`) : tag);

/** 포지션(동료 데이터의 한국어 값) → 메인 용어 키 */
const ROLE_KEY = { '보조': 'support', '방해': 'disrupt', '치유': 'healer', '치료': 'healer', '수호': 'guard', '전사': 'warrior' };
export const roleLabel = (role) => (ROLE_KEY[role] ? t(`role.${ROLE_KEY[role]}`) : role);

/** 남은 초 → 현재 언어 대기 시간("15초", "3 min", "2時間"…) */
export function waitText(sec) {
  if (sec >= 3600) return t('wait.hour', { n: Math.ceil(sec / 3600) });
  if (sec >= 60) return t('wait.min', { n: Math.ceil(sec / 60) });
  return t('wait.sec', { n: sec });
}
/** 서버 오류: 코드가 있으면 현재 언어로(변수 sec→{wait}, field→{field} 채움), 없으면 서버가 보낸 문구. */
export function errorText(data, fallback) {
  if (data && data.code && i18n.has(`err.${data.code}`)) {
    const v = { ...(data.vars || {}) };
    if (v.sec != null) v.wait = waitText(v.sec);
    if (v.field) v.field = t(`field.name.${v.field}`);
    return t(`err.${data.code}`, v);
  }
  return (data && data.error) || fallback || t('err.generic');
}
/** 도배 판정 코드(shared.spamReason) → 현재 언어 문구 */
export const spamText = (code) => errorText({ code, vars: { n: code === 'spamLinks' ? 2 : 20 } });
