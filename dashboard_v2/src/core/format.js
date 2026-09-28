/**
 * core/format.js — 숫자·이름 표기와 동료 분류 상수 (v1 app.js L4·L48-62·L109-135 이식).
 *
 * 순수 함수만 둔다(DOM·전역 없음). 한국어 표기(만/억)는 v1과 같은 규칙이다.
 * 파이썬 엔진이 돌려주는 한국어 역할·속성 문자열은 ROLE_KEY/EL_KEY로 i18n 키에 매핑한다.
 */

/** 정수 반올림 + 천 단위 구분(ko-KR). v1 `fmt`. */
export const fmt = (n) => Math.round(+n || 0).toLocaleString('ko-KR');

/** 1만 이상은 '만', 1억 이상은 '억'(소수 둘째 자리, 끝 0 제거). v1 `fmtShort`. */
export function fmtShort(n) {
  n = +n || 0;
  if (n >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, '') + '억';
  if (n >= 1e4) return Math.round(n / 1e4).toLocaleString('ko-KR') + '만';
  return fmt(n);
}

/** HTML 이스케이프(v1 `esc`) — 문자열 조립용. DOM에 닿지 않는다. */
export const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

/** 기록 라벨 재생성: "이름·이름 · 30턴 · 1.2억" (v1 `makeLabel`). chars = id→meta. */
export function makeLabel(team, turns, total, chars = {}) {
  const names = (team || []).filter(Boolean)
    .map((t) => (chars[t.id] || t || {}).name || (t && t.id) || '?').join('·');
  return `${names} · ${turns}턴 · ${fmtShort(total || 0)}`;
}

// ── 동료 분류 상수 (백엔드 SPECIAL_ROLE_RANK 와 동기화) ─────────────────────
export const ROLE_RANK = Object.freeze({ '보조': 1, '방해': 2, '치유': 3, '수호': 4, '전사': 5 });
/** 모이루·욱영·임부언 등은 아군 뒤에 행동한다(우선순위 특수값). */
export const SPECIAL = Object.freeze({ 10421: 4.5, 10401: 5.5, 10436: 5.6, 10439: 5.7, 10410: 6.0 });
export const PASSIVE_DEF_ID = 10421;   // 파미도 — '필살기 직전 방어' 프리셋
export const ULT3_IDS = new Set([10437, 10442]);   // 3턴 주기 프리셋(투명인간·마타야)
export const HOLD_ULT_IDS = new Set([10442]);      // 쿨이 짧아도 필살기를 아끼는 동료(마타야)
export const TAEHO_ID = 10423;         // 이태호 — 1번 자리 + 임부언 동반 시 fed 추가 행동
export const UK_ID = 10439;            // 욱영 — 인접 아군 필살기를 뒤로 미루는 토글·연동 프리셋
export const IMBUEON_ID = 10410;       // 임부언 — 1번 자리 배치 금지
export const EL_ORDER = Object.freeze(['fire', 'water', 'wood', 'light', 'dark']);
export const EL_KR = Object.freeze({ fire: '불', water: '물', wood: '나무', light: '빛', dark: '어둠', none: '무' });

/** 파이썬 한국어 역할 → i18n 키 조각(`role.<key>`). 알 수 없으면 null. */
export const ROLE_KEY = Object.freeze({ '보조': 'support', '방해': 'disrupt', '치유': 'healer', '수호': 'guard', '전사': 'warrior' });
export const role = (kr) => ROLE_KEY[kr] || null;
/** 더미 속성 번호(0~5) ↔ elementKey. 0 = 무속성. */
export const DUMMY_EL = Object.freeze(['none', 'fire', 'water', 'wood', 'light', 'dark']);

/** 우선순위 기본값: 특수값 → 역할 순위 → 9, 동률은 자리 순(pos*0.01). v1 `basePriority`. */
export function basePriority(slot, pos, chars = {}) {
  const meta = chars[slot.id] || {};
  return (SPECIAL[slot.id] ?? ROLE_RANK[meta.role] ?? 9) + pos * 0.01;
}

/** 좁은 칸용 이름: 수식어가 붙은 긴 이름("명계 경비견 아누비로스")은 마지막 단어만. 슬롯·행동 계획·결과가 같은 규칙을 쓴다. */
export function shortName(full) {
  const s = String(full || '').trim();
  const parts = s.split(/\s+/);
  if (parts.length < 2 || s.length <= 6) return s;
  const last = parts[parts.length - 1];
  return last.length >= 2 ? last : s;
}
