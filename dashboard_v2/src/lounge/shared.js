/**
 * lounge/shared.js — 라운지 화면과 서버(lounge_api Worker)가 **같이** 쓰는 규칙. 한쪽만 바꾸면 검증이 어긋나므로 여기서만 고친다.
 * 이 파일은 브라우저·Workers 양쪽에서 돌아야 하므로 DOM·Node API 를 쓰지 않는다.
 */
import { BUILD_DATA } from './builds.js';

export const LIMITS = Object.freeze({ post: 1000, title: 40, tierDesc: 1000, teamDesc: 3000, code: 4000, tierRows: 8, tierLabel: 12, tags: 2 });
export const POST_TAGS = Object.freeze(['육성', '보스전', '방탈출', '팀 구성', '스킬 해석']);
export const TIER_BASIS = Object.freeze([
  { key: 'all', label: '종합' }, { key: 'boss', label: '보스전' }, { key: 'escape', label: '방탈출' }, { key: 'free', label: '자유' },
]);
export const TEAM_BASIS = Object.freeze([
  { key: 'boss', label: '보스전' }, { key: 'escape', label: '방탈출' }, { key: 'free', label: '자유' },
]);
/** 커뮤니티 평균 티어에서 이 개수 미만의 티어표에만 나온 동료는 '표본 부족'. */
export const AGG_MIN_SAMPLES = 3;
export const AGG_LABELS = Object.freeze(['S', 'A', 'B', 'C', 'D']);
/**
 * 평균 티어 범위: current = 이번 버전(CURRENT_BUILD 로 찍힌 티어표)만, all = 모든 버전.
 * auto = 이번 버전 티어표가 AGG_VERSION_MIN 개 이상이면 current, 아니면 all(아직 표본이 안 쌓였을 때). 범위를 안 주면 서버는 all.
 */
export const AGG_SCOPES = Object.freeze(['auto', 'current', 'all']);
/** 동료별 최소 표본과 같은 값 — 이보다 적으면 이번 버전에서는 모든 동료가 표본 부족이다. */
export const AGG_VERSION_MIN = AGG_MIN_SAMPLES;
export const aggScope = (want, currentCount) => (want === 'auto' ? (currentCount >= AGG_VERSION_MIN ? 'current' : 'all') : want);
export const isPin = (pin) => /^\d{4}$/.test(String(pin ?? ''));

/** 목록 추천순 점수: 새 글이 묻히지 않게 시간 감쇠. score = (좋아요 − 싫어요). */
export const hotScore = (score, ageMs) => score / Math.pow(ageMs / 3.6e6 + 2, 0.8);

/**
 * 평균 티어 집계: pos(동료별 0~1 정규화 위치 배열) → 5구간.
 * 화면 목 어댑터와 서버가 같은 결과를 내도록 공용으로 둔다.
 */
export function aggregateRows(posByChar, sampleCount) {
  const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const rows = AGG_LABELS.map((label) => ({ label, items: [] }));
  const thin = [];
  for (const [cid, a] of Object.entries(posByChar)) {
    if (a.length < AGG_MIN_SAMPLES) { thin.push(+cid); continue; }
    const m = med(a);
    rows[Math.min(AGG_LABELS.length - 1, Math.floor(m * AGG_LABELS.length))].items.push({ id: +cid, m, n: a.length });
  }
  rows.forEach((r) => r.items.sort((x, y) => x.m - y.m));
  return { rows, thin, sampleCount };
}
/**
 * 행 위치(0~1) = 그 행이 차지하는 구간의 가운데. 행이 몇 개든 평균 티어 5칸(S~D)에 고르게 나뉜다:
 * 2행 → A·C, 3행 → S·B·D, 4행 → S·A·C·D, 5행 → S~D 그대로, 8행 → S·S·A·B·B·C·D·D. (예전 i/(n-1)은 양 끝이 S·D로 쏠렸다)
 * 서버 migrations/0006 이 저장된 값을 이 식으로 다시 계산했다 — 바꾸면 거기도 맞출 것.
 */
export const rowPos = (i, n) => (n > 0 ? (i + 0.5) / n : 0.5);
/**
 * 같은 행 안의 순서(왼쪽 = 더 높음)를 담는 미세 보정 폭. 행 가운데 ± IN_ROW_SPAN/2 안에서 왼쪽→오른쪽으로 퍼진다.
 * 행(1~8행) 가운데와 5칸 경계의 최소 거리가 0.0125 라 ±0.005 로는 칸이 바뀌지 않고, 같은 칸 안의 순서만 정한다.
 * 서버 migrations/0007 이 저장된 값을 이 식으로 다시 계산했다 — 바꾸면 거기도 맞출 것.
 */
export const IN_ROW_SPAN = 0.01;
export const inRowPos = (i, n, j, k) => rowPos(i, n) + (k > 0 ? ((j + 0.5) / k - 0.5) * IN_ROW_SPAN : 0);
/** 티어표 한 장 → 동료별 정규화 위치(맨 위·왼쪽에 가까울수록 0). */
export function tierPositions(rows) {
  const n = rows.length;
  const out = [];
  rows.forEach((r, i) => r.ids.forEach((cid, j) => out.push([cid, inRowPos(i, n, j, r.ids.length)])));
  return out;
}
/** 게임 빌드 순서(오래된 → 최신, builds.js). 마지막 = 현재 라이브 빌드 — 글에 도장으로 찍힌다. 새 동료를 넣을 때 생성기가 같이 늘린다. */
export const BUILDS = Object.freeze([...BUILD_DATA.builds]);
export const CURRENT_BUILD = BUILDS[BUILDS.length - 1];
/** 라운지 첫 빌드 뒤에 들어온 동료 → 처음 들어온 빌드. 여기 없는 동료는 첫 빌드부터 있던 동료. */
export const CHAR_SINCE = Object.freeze(Object.fromEntries(Object.entries(BUILD_DATA.since).map(([id, b]) => [+id, b])));
/** 빌드 순위(목록에 없는 옛 빌드 = -1). MMDD 는 해가 바뀌면 글자 순서가 어긋나므로 목록 순서로 비교한다. */
export const buildRank = (build) => BUILDS.indexOf(build);
/**
 * 티어표 빌드: 들어 있는 동료 중 지금 빌드보다 늦게 들어온 동료가 있으면 그중 가장 늦은 빌드, 없으면 그대로.
 * 수정으로 새 동료를 넣으면 빌드가 올라가고 목록 위로 끌어올린다(서버 editTier · 목 어댑터 공용).
 */
export function tierBuildFor(build, rows) {
  let out = build;
  for (const r of rows) {
    for (const id of r.ids) {
      const since = CHAR_SINCE[id];
      if (since && buildRank(since) > buildRank(out)) out = since;
    }
  }
  return out;
}

/** 공유 코드에서 읽은 스냅샷 → 팀 요약(화면 미리보기와 서버 저장이 같은 값을 쓰도록). */
export function summarizeSnap(snap) {
  const team = Array.isArray(snap && snap.team) ? snap.team : [];
  const nonEmpty = (o) => !!o && typeof o === 'object' && Object.keys(o).length > 0;
  return {
    turns: Number.isFinite(+snap.turns) ? +snap.turns : 30,
    dummies: Number.isFinite(+snap.dummies) ? +snap.dummies : 1,
    altar: nonEmpty(snap.altar),
    plan: nonEmpty(snap.pins) || nonEmpty(snap.turnPlans) || team.some((s) => s && s.usePlan),
    spec: team.filter((s) => s && s.spec && s.spec.on).length,
  };
}
/** 스냅샷 → 편성된 동료 ID 목록(빈 칸 제외, 최대 5). */
export const teamIdsOf = (snap) => (Array.isArray(snap && snap.team) ? snap.team : []).filter(Boolean).map((s) => +s.id).filter(Number.isFinite).slice(0, 5);

/** 도배 방지(서버가 강제, 화면은 안내용으로 같은 값을 쓴다). */
export const ANTISPAM = Object.freeze({
  gapSec: 15,            // 같은 사람의 연속 작성 최소 간격
  threadBurst: 5,        // 한 게시판에 10분 동안 한 사람이 쓸 수 있는 글
  dupHours: 24,          // 같은 내용 재작성 금지 시간
  maxRun: 20,            // 같은 글자 연속 허용 한도(ㅋㅋㅋ…)
  maxLinks: 2,           // 글 하나의 링크 수
  maxLines: 40,          // 글 하나의 줄 수
  dailyTiers: 5, dailyTeams: 5,
});

/**
 * 의미 없는 반복·링크 도배 판정. 문제가 있으면 오류 코드(사전 err.<코드>, 변수 {n}), 없으면 null.
 * 서버·화면 공용 — 화면은 보내기 전에 미리 알려 주고(i18n spamText), 서버는 같은 코드로 거절한다.
 */
const RE_RUN = new RegExp('(.)\\1{' + (ANTISPAM.maxRun - 1) + ',}', 'u');   // 같은 글자 maxRun 번 이상 연속
export function spamReason(text) {
  const s = String(text || '');
  if (!s) return null;
  if (RE_RUN.test(s)) return 'spamRun';
  const compact = s.replace(/\s+/g, '');
  // 2~12자 단위가 8번 이상 연속(도배도배…). 단위가 한 글자 반복(ㅋㅋ)이면 위 글자 연속 규칙에 맡긴다.
  for (const m of compact.matchAll(/(.{2,12}?)\1{7,}/gsu)) if (new Set([...m[1]]).size > 1) return 'spamPhrase';
  if (compact.length >= 40 && new Set([...compact]).size <= 4) return 'spamLow';
  if ((s.match(/https?:\/\/|www\./gi) || []).length > ANTISPAM.maxLinks) return 'spamLinks';
  if (s.split('\n').length > ANTISPAM.maxLines) return 'spamLines';
  return null;
}
/** 중복 판정용 정규화: 유니코드 정규화 + 소문자 + 공백·문장부호 제거. */
export const normalizeForDup = (text) => String(text || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

/**
 * 운영자 표시. 관리자 토큰으로 쓴 글만 이 이름(익명 접두어 없음)으로 나온다 — 서버가 토큰을 확인해 op=1 로 저장.
 * anon 동료는 익명 이름 뽑기에서 빼서 '익명의 파미도'도 생기지 않게 한다(사칭·혼동 방지).
 */
export const OPERATOR = Object.freeze({ anon: 10421, name: '파미도' });
