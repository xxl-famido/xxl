/**
 * 실사용 피드백 재현 케이스 — docs/redesign/USER_FEEDBACK_RAW.txt 기준.
 * 1차 판정 = "사용자가 원하는 대로 행동이 작동하는가". 데미지는 참고 열.
 *
 * 케이스 모양
 *   id / fb      피드백 번호(문자열 id, 숫자 fb = --only 필터)
 *   intent       사용자가 원하는 것(한 줄)
 *   flow         피드백 본문의 흐름(사람이 읽는 문장)
 *   expectTimeline  { [turn]: Step[] | { seq: Step[], order: [[i, j], …] } }
 *                Step = S(동료, '평'|'방'|'궁', x) — x: true=추가 행동, false=자기 턴 행동, undefined=무관.
 *                그 턴 실제 행동 중 기대에 등장하는 동료만 골라 순서대로 비교한다(다른 동료·명시 없는 턴 = 와일드카드).
 *                order = 순서가 달라도 되는지 판단할 때 "반드시 지켜야 하는 앞뒤" (기대 index 쌍). 생략 = 전부 순서대로.
 *   core         핵심 턴 목록(생략 = 명시한 턴 전부). 핵심 턴 불일치 = ✗, 비핵심만 불일치 또는 의도 무관 순서 차이 = △.
 *   config       구성 요약 · recipe = 고급 설정 창에서 누를 순서(= setup 이 부르는 스토어 API 순서)
 *   setup        async (ctx) => store  (스토어 API만 — buildCfg 가 UI와 같은 페이로드를 만든다)
 *   runs         { mode: 'det' } 확률 100% 1회 · { mode: 'rand', runs, seed } 확률 그대로(데미지 참고용 평균) — 행동 판정은 항상 1회 로그
 *   checks       메커니즘·기능 판정(fn) 또는 참고(info: true). type: fn · total · band · v1same · pinsIgnored · ultTurns
 *   path         { status: '있음'|'없음'|'부분', how: 설명 } — 원하는 흐름을 고급 설정으로 만들 수 있는가
 *   onMismatch   { cat: '설정 경로 없음'|'엔진 규칙'|'UI 유도', why }
 *   refFb        피드백에 적힌 데미지(참고 열)
 */

// 피드백 원문 공유 코드(USER_FEEDBACK_RAW.txt 에서 그대로 추출 — run.mjs 가 원문과 대조)
export const CODES = {
  A: '$eJyNjUEKw0AIRe_i-hPUceJMryIuQrLMDUrvXiYJpc2qLj68_xQjxFsXbV3dqoMIWnyWVm1SByMizBQVwqhgKDMzSOVr-D6UCCsdMq7KAG0n2GHqCXqYCyQTUiCgZd8JZXxCw5OMHlFhGE4T5DcWvhflp3iBQWsvs04jZVqXkVt3tQ-dZluu7r89ysw3ictGKA',
  B: '$eJyNkE0Kg1AMhO-S9SD5VV-vEt7C6tIblN69REtpXTWEgW8ms0mmTI01QmZrMYIIKho2ugyiYGSmuyIgjABDmZlBKl_D16GOdGuQalmBzif4kcQJeiRvkN4hBgEt-04wyMxgPMjplgEvpxo0XVj4atiP8QSD1majDqUyrEvp1ib1D53Jtry9_-6o3lWrct-o9_4CAHlIhQ',
  C: '$eJyFjUsKw0AMQ-_itRj8mzjTqwxehGaZG5TevUwSaJtNtBA8yUa9SzTWOlm4SAUR1INt9laigdF7d1dUCKOCoczMIJUf8VWU6G4NMr5sgM4H-N7UA3RvTpBMiEFAy7YRbCxBHS9yevQKxyg1QXFh4Wtgf8EbDHo2m7QMl7IuFlLWFurxpd2XMzvp5o4y8wO9IEZd',
  D: '$eJzFizsOAjEMRO_ierQax86Pq0Qu0HILxN1RyBbsFrQ0I72nN2No7UzFq-ZeG0RQvNTWk23MIMYYToVCiRwYbn2BgUgkOaVySZ-Q2gL95HlBioDNSrLA5xMNT3G5DcdsDCkg9cLKq7CTeIGQvlvhduxj7n0vdK16YN8L7Uv-Ks_yD6VExBs32Fq9',
  E: '$eJzFkTEOwkAMBP_iehWt7TuH4yunK0h4QHrE35EJBUlBi2RZmtG4cu86N1pUYwQbRBB0DbeYagXRey9UKJSoA71428FBGEmmVO6yJNhlB33ndQcbA56VVEHJSxAPKXLtBdk4bEDmEyvPwg_iCULa6sHps--5b2uw6KwfbGvQv-Sv8ij_UEo-Icd02XzZZIzxAsOEXiU',
};

const MA = '오야마다 마타야', UK = '욱영', RI = '리카노', AN = '명계 경비견 아누비로스', IM = '임부언';
const LEO = '레오', BARD = '바드', MOI = '모이루', OREM = '오렘', INV = '투명인간', CROC = '크로크라인', FAM = '파미도', HAN = '하니엘';
const MAN = 1e4;
export const S = (actor, a, x) => ({ actor, a, x });
// UI 보조(plan-helpers — 예외 턴 경고 등) — run.mjs 와 같은 모듈
const UIH = await import(new URL('../../dashboard_v2/src/ui/plan-helpers.js', import.meta.url).href);

// ── 동료별 규칙 케이스(CHAR_SPECIALS) 보조 ─────────────────────────────────────
const RAN = '란', HITO = '와타나베 히토하', TAEHO = '오봉산군 이태호', ZETO = '제토';
const RAN_TEAM = [10426, 10425, 10428, 10413, null];
const MOI_TEAM = [10428, 10421, 10425, 10436, null];
const HITO_TEAM = [10433, 10421, 10425, null, null];
const TAEHO_TEAM = [10423, 10410, 10421, 10425, null];
const INV_TEAM = [10437, 10421, 10425, 10428, null];
const MATA_TEAM = [10442, 10421, 10425, 10428, null];
const FAM_TEAM = [10421, 10425, 10428, 10401, null];
const UK_TEAM = [10428, 10439, 10401, 10425, 10421];
const ZETO_TEAM = [10441, 10421, 10425, null, null];
/** 한 동료의 턴별 기본 행동(자기 행동 x 무관). */
function rhythm(actor, ults, defs, n = 13) {
  const tl = {};
  for (let t = 1; t <= n; t++) tl[t] = [S(actor, ults.includes(t) ? '궁' : defs.includes(t) ? '방' : '평')];
  return tl;
}
/** 이태호(턴당 2회) + 임부언 필살기 턴의 받은 추가 행동 필살기. 평소 턴은 1턴 궁평 · 이후 평평. */
function taehoFlow(fedTurns, n = 13) {
  const tl = { 1: [S(TAEHO, '궁'), S(TAEHO, '평')] };
  for (let t = 2; t <= n; t++) {
    tl[t] = fedTurns.includes(t)
      ? { seq: [S(TAEHO, '평'), S(TAEHO, '평'), S(IM, '궁'), S(TAEHO, '궁')], order: [[2, 3]], loose: true }
      : [S(TAEHO, '평'), S(TAEHO, '평')];
  }
  return tl;
}
/** 욱영 필살기 턴: 인접(리카노·아누) 보통 공격 → 욱영 필살기 → 인접 추가 행동 필살기. */
function ukFlow(turns) {
  const tl = {};
  turns.forEach((t) => { tl[t] = { seq: [S(RI, '평', false), S(AN, '평', false), S(UK, '궁'), S(RI, '궁', true), S(AN, '궁', true)], order: [[0, 2], [1, 2], [2, 3], [2, 4]], loose: true }; });
  return tl;
}
/** v1 가상 머신: 편성 + 한 동료 직접 계획(v1 식 planExpr) → snapshot. */
const v1Plan = (ids, pos, planExpr) => (V, set) => {
  set(ids.map((id) => id && { id }));
  V.exec(`(() => { const s = team[${pos - 1}]; s.usePlan = true; s.plan = ${planExpr}; s.rotation = s.plan.join(''); })()`);
  return V.eval('snapshot()');
};
/** v1 가상 머신: 직접 계획 기본값에서 turns 칸을 차례로 '궁' 클릭(renderPlanner onclick — 모이루·히토하 방어 자동 배치, 제토 1회). */
const v1Click = (ids, pos, turns) => (V, set) => {
  set(ids.map((id) => id && { id }));
  V.exec(`(() => { const s = team[${pos - 1}]; s.usePlan = true; s.plan = defaultPlan(CHARS[s.id], 30);
    for (const idx of ${JSON.stringify(turns.map((t) => t - 1))}) { renderPlanner(s, CHARS[s.id]);
      $('#planner').onclick({ target: { closest: () => ({ dataset: { idx: String(idx), a: '궁' }, disabled: false }) } }); }
    s.rotation = s.plan.join(''); })()`);
  return V.eval('snapshot()');
};
/** v1 에서 사용자가 칸으로 찍을 란 계획(v1 에는 프리셋 없음). */
const PLAN_JS = {
  ult3def: "(() => { const p = Array(30).fill('평'); for (let t = 3; t <= 30; t += 3) p[t - 1] = '궁'; for (let t = 6; t <= 30; t += 3) p[t - 2] = '방'; return p; })()",
  ran2: "(() => { const p = Array(30).fill('평'); for (let t = 3; t <= 30; t += 2) p[t - 1] = '궁'; for (let t = 5; t <= 30; t += 2) p[t - 2] = '방'; return p; })()",
};
/** 란 허물 매미 교전 되먹임(4번 동료 공격 → 란 발동 효과 +108%) 발동 턴이 want 와 같은가. */
function ranFeedback(r, want) {
  const turns = [...new Set(r.log.filter((e) => /란 발동 스킬 효과 \+108%/.test(e.text || '')).map((e) => e.turn))].filter((t) => t <= 13).sort((a, b) => a - b);
  const ok = want.every((t) => turns.includes(t));
  return { verdict: ok ? 'pass' : 'fail', actual: `되먹임 턴 ${turns.join('·') || '없음'} (기대 ${want.join('·')})` };
}
/** 구체화된 줄(핀 + 규칙 채움)의 필살기 턴 == 결과 log 의 그 동료 필살기 턴(현재 턴 수 안). */
function lineUltsExec(r, pos, actor) {
  const n = +r.cfg.turns || 13;
  const line = r.st.pins.line(pos) || [];
  const want = line.map((x, k) => (x === '궁' ? k + 1 : 0)).filter((t) => t && t <= n);
  const got = Object.keys(r.parsed).map(Number).filter((t) => t <= n && r.parsed[t].some((s) => s.actor === actor && s.a === '궁')).sort((a, b) => a - b);
  const ok = want.join() === got.join();
  return { verdict: ok ? 'pass' : 'fail', actual: `줄 ${want.join('·')} / 실행 ${got.join('·')}` };
}

// ── 흐름 빌더 ────────────────────────────────────────────────────────────────
/** 1CD 마타야: 평소 턴 = 마타야 궁(자기 행동), 욱영 궁 턴 = 마타야 방 → 욱영 궁 → 마타야 궁(추가 행동). */
function maFlow(axis, normal) {
  const tl = {};
  normal.forEach((t) => { tl[t] = [S(MA, '궁', false)]; });
  axis.forEach((t) => { tl[t] = [S(MA, '방', false), S(UK, '궁'), S(MA, '궁', true)]; });
  return tl;
}
/** #26 욱영 궁 턴: 임부언 평 → 아누 평 → 욱영 궁 → 아누 궁1(추가) → 임부언 궁(추가) → 아누 궁2(추가).
 *  앞 평타 두 개의 순서는 추가 행동 부여 대상(욱영 인접·이미 행동한 동료)에 영향이 없어 자유 — 나머지 앞뒤는 필수. */
function dFlow(turns) {
  const tl = {};
  turns.forEach((t) => { tl[t] = { seq: [S(IM, '평', false), S(AN, '평', false), S(UK, '궁'), S(AN, '궁', true), S(IM, '궁', true), S(AN, '궁', true)], order: [[0, 2], [1, 2], [2, 3], [3, 4], [4, 5]] }; });
  return tl;
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const AXIS13 = [4, 7, 10, 13];
const NORMAL13 = range(2, 13).filter((t) => !AXIS13.includes(t));
const D_AXIS = [4, 7, 10, 13, 16, 19, 22, 25, 28];

// ── 고급 설정 조작 순서(보고서에 그대로 실림) ──────────────────────────────────
const RECIPE_S23 = [
  '행동 계획 → 고급 설정 열기(출발점 "기본")',
  '① 마타야 행 필살기 방식 → 「준비되면 바로」',
  '④ 격자 마타야 1턴 칸 → 방어',
  '③ 필살기 연동 추가 → 기준 동료 「욱영」',
  '③ 동료 추가 마타야 → 행동 「방어 → 받은 추가 행동에서 필살기」(평소 = 「내 방식대로」 기본값 유지)',
  '③ 동료 추가 리카노 → 「앞에서 필살기」',
];
// [2026-09-28 성공 가정 정책] 성공 가정은 제단이 켜져 있으면 방식·고정 칸과 관계없이 켤 수 있고, 자동 방식 + 성공 가정 = 당겨진 리듬
// (CD 3턴 → 3·6·9·12, CD 2턴 → 2턴부터). 예전 순서(고정 칸 먼저 → 성공 가정 → 3턴 필살기 칸)는 한 번의 체크로 줄었다.
const RECIPE_LEO = [
  '조건 패널 → 제단 편집기 → 제단 사용 켬 → 1층 달 제단 1012·1013(확률 쿨 감소) 체크 (또는 조건 패널 「쿨감 제단」 스위치)',
  '① 레오 행 「성공 가정」 체크 → 방식 「자동」 라벨이 「자동 · 3·6·9턴」으로 바뀜(고정 칸 불필요)',
];

const rand200 = { mode: 'rand', runs: 200, seed: 777 };
const det = { mode: 'det' };
const LEO_TEAM = [10406, 10413, 10428, 10425, 10421];

/** S23 스토어(ctx.buildS23 과 같은 조작) — run.mjs 가 ctx 에 넣는다. */

export const CASES = [
  // ── 재현 대상 없는 행 ─────────────────────────────────────────────────────
  { id: '2~8·10~13', fb: 0, na: true, intent: '설치 테스트·인사·언어 테스트 메시지', flow: '—', config: '—', checks: [],
    note: '재현할 요구 없음.' },

  // ── #9 오렘 (메커니즘) ─────────────────────────────────────────────────────
  { id: '9', fb: 9, kind: 'mechanism', intent: '오렘 필살기 쉴드는 발동효과 버프를 받지 않음',
    flow: '하니엘 발동효과 버프가 있어도 오렘 쉴드량 동일(사용자 2회 실측)',
    config: '오렘·하니엘·파미도·리카노·크로크라인, 13턴, 확률 100%',
    setup: (ctx) => ctx.mk([10419, 10425, 10421, 10428, 10435], 13), runs: det,
    path: { status: '있음', how: '설정 불필요(엔진 규칙)' },
    onMismatch: { cat: '엔진 규칙', why: '배리어 효과 채널' },
    checks: [
      { label: '오렘 필살 베리어 채널 = EX효과(발동효과 아님)', basis: '피드백 #9 + engine.py BARRIER 규칙', type: 'fn',
        fn: (r) => {
          const bars = r.log.filter((e) => e.actor === OREM && e.detail && e.detail.kind === 'barrier' && e.kind === '필살기');
          if (!bars.length) return { verdict: 'fail', actual: '오렘 필살 베리어 로그 없음' };
          const bad = bars.filter((e) => e.detail.effLabel === '발동효과');
          return { verdict: bad.length ? 'fail' : 'pass', actual: `베리어 ${bars.length}건, 채널 ${[...new Set(bars.map((e) => e.detail.effLabel))].join('/')}` };
        } },
      { label: '하니엘 ↔ 제트블랙(발동효과 버프 없음) 교체 시 오렘 자기 쉴드 동일', basis: '피드백 #9 "쉴드량 똑같음"', type: 'fn',
        fn: async (r, ctx) => {
          const st2 = ctx.mk([10419, 10418, 10421, 10428, 10435], 13);
          const r2 = await ctx.sim(8778, { ...st2.buildCfg({ mode: 'run' }), forceProc: true, runs: 1 });
          const first = (log) => { const e = log.find((x) => x.actor === OREM && x.kind === '필살기' && x.detail && x.detail.kind === 'barrier' && /→ 오렘 /.test(x.text)); return e ? e.detail.final : null; };
          const a = first(r.log), b = first(r2.log);
          if (a == null || b == null) return { verdict: 'partial', actual: `쉴드 로그 부족(${a}/${b})` };
          return { verdict: Math.abs(a - b) < 1 ? 'pass' : 'partial', actual: `하니엘 ${Math.round(a).toLocaleString()} / 제트블랙 ${Math.round(b).toLocaleString()}` };
        } },
    ] },

  // ── #14 모이루 방·방·궁 ────────────────────────────────────────────────────
  { id: '14', fb: 14, intent: '모이루 방·방·궁 → 3턴 필살기, 앞 3명은 평타',
    flow: '1·2턴: 리카노·파미도·하니엘 평 → 모이루 방 / 3턴: 세 명 평 → 모이루 필살기',
    expectTimeline: {
      1: { seq: [S(RI, '평'), S(FAM, '평'), S(HAN, '평'), S(MOI, '방')], order: [[0, 3], [1, 3], [2, 3]], loose: true },
      2: { seq: [S(RI, '평'), S(FAM, '평'), S(HAN, '평'), S(MOI, '방')], order: [[0, 3], [1, 3], [2, 3]], loose: true },
      3: { seq: [S(RI, '평'), S(FAM, '평'), S(HAN, '평'), S(MOI, '궁')], order: [[0, 3], [1, 3], [2, 3]], loose: true },
    }, core: [3],
    config: '리카노·파미도·하니엘·모이루(P4), 6턴',
    recipe: ['④ 격자 1~3턴 리카노·파미도·하니엘 칸 → 보통 공격', '④ 모이루 1·2턴 칸 → 방어, 3턴 칸 → 필살기(방어로 쿨이 줄어 필살기 칸 열림)'],
    setup: (ctx) => {
      const st = ctx.mk([10428, 10421, 10425, 10436, null], 6);
      [1, 2, 3].forEach((t) => [1, 2, 3].forEach((p) => st.pins.set(t, p, '평')));
      st.pins.set(1, 4, '방'); st.pins.set(2, 4, '방'); st.pins.set(3, 4, '궁');
      return st;
    }, runs: det,
    path: { status: '있음', how: '④ 격자 고정 칸' },
    onMismatch: { cat: '엔진 규칙', why: '모이루 방어 쿨 감소' },
    checks: [{ label: '고정 칸 밀림', basis: '고정 = 실행', type: 'pinsIgnored', info: true }] },

  // ── #15 크로크라인 (메커니즘) ───────────────────────────────────────────────
  { id: '15', fb: 15, kind: 'mechanism', intent: '크로크라인 주는딜 버프가 10턴 이후 20% 고정되지 않음',
    flow: '필살기 때만 쌓이는 스택 + 3턴 버프 → 평타 턴엔 20% 유지 불가',
    config: '크로크라인·하니엘·파미도·리카노·투명인간, 20턴, 확률 100%',
    setup: (ctx) => ctx.mk([10435, 10425, 10421, 10428, 10437], 20), runs: det,
    path: { status: '있음', how: '설정 불필요(엔진 규칙)' }, onMismatch: { cat: '엔진 규칙', why: '스택 버프 갱신' },
    checks: [
      { label: '11턴 이후 크로크라인 주는딜 < 20% 인 턴 존재(파미도 평타 드릴다운)', basis: '피드백 #15 + sim_timed_stack_buffs(replace-oldest)', type: 'fn',
        fn: (r) => {
          const per = {};
          for (const e of r.log) if (e.actor === FAM && e.detail && e.detail.act === '평타' && e.detail.final && per[e.turn] == null)
            per[e.turn] = (e.detail.dealt || []).filter((c) => c.by === 10435).reduce((a, c) => a + c.v, 0);
          const late = Object.entries(per).filter(([t]) => +t > 10);
          if (!late.length) return { verdict: 'fail', actual: '파미도 평타 로그 없음' };
          const vals = late.map(([, v]) => v);
          const ok = vals.some((v) => v < 20) && Math.max(...vals) <= 20;
          return { verdict: ok ? 'pass' : 'fail', actual: `턴:% ${late.map(([t, v]) => `${t}:${v}`).join(' ')}` };
        } },
    ],
    note: '사용자 서술("평타 턴엔 버프 1개")과 엔진(10중첩 개별 3턴 → 평타 턴 14~16%)은 수치가 다를 수 있음 — 보고된 20% 고정만 판정.' },

  // ── #16 · #17 (결과 표시 기능) ─────────────────────────────────────────────
  { id: '16', fb: 16, kind: 'mechanism', intent: '허수아비 딜과 길드전(확률 버프) 구분',
    flow: '길드전 확률 요소를 따로 켜고 편차를 볼 수 있음', config: '코드 A + 쿨감 제단, 200회',
    setup: (ctx) => { const st = ctx.decode('A'); ctx.cdAltar(st); return st; }, runs: rand200,
    path: { status: '있음', how: '조건 패널 제단 + 결과 머리말 최소~최대' }, onMismatch: { cat: 'UI 유도', why: '표시 경로' },
    checks: [
      { label: '제단 적용이 결과 메타에 표시', basis: 'meta.altar', type: 'fn', fn: (r) => ({ verdict: r.stat.meta.altar ? 'pass' : 'fail', actual: `meta.altar=${JSON.stringify(r.stat.meta.altar).slice(0, 70)}` }) },
      { label: '최소~최대 밴드', basis: '#17 경로', type: 'band' },
    ] },
  { id: '17', fb: 17, kind: 'mechanism', intent: '확률 전부 불발(최소)~전부 발동(최대) 범위 표시',
    flow: '결과에 최소~최대 편차', config: '투명인간·하니엘·파미도·리카노·크로크라인, 200회',
    setup: (ctx) => ctx.mk([10437, 10425, 10421, 10428, 10435], 13), runs: rand200,
    path: { status: '있음', how: '결과 머리말 meta.totalFloor~totalCeil' }, onMismatch: { cat: 'UI 유도', why: '표시 경로' },
    checks: [
      { label: '바닥 < 천장, 바닥 ≤ 최소 ≤ 평균 ≤ 최대 ≤ 천장', basis: '피드백 #17 + sim_variance_band', type: 'band' },
      { label: '천장 = 확률 100% 1회(±0.5%)', basis: 'force_proc 정의', type: 'fn',
        fn: (r) => { const c = r.stat.meta.totalCeil, d = r.det && r.det.meta.total; if (!d) return { verdict: 'partial', actual: '확률 100% 실행 없음' }; const dv = Math.abs(c - d) / d; return { verdict: dv <= 0.005 ? 'pass' : 'partial', actual: `천장 ${mm(c)} / 100% ${mm(d)}` }; } },
    ] },

  // ── #18~21 투명인간 (메커니즘) ─────────────────────────────────────────────
  ...[
    { id: '18', intent: '투명인간 추가 효과 = 필살기 효과 배율 + 악어(크로크라인) 필살기 증폭 적용', focus: ['single', 'croc'] },
    { id: '19', intent: '단일·전체 추가 피해 모두 「필살기 효과 증가」 적용', focus: ['single', 'aoe'] },
    { id: '20', intent: '단일·전체 추가 피해 + 악어 필살기 증폭 연동', focus: ['single', 'aoe', 'croc'] },
    { id: '21', intent: '추가 피해에 발동효과가 아니라 필살기 효과 적용', focus: ['single', 'notTrigger'] },
  ].map((c) => ({
    id: c.id, fb: +c.id, kind: 'mechanism', intent: c.intent,
    flow: '투명인간 필살기의 추가 피해(단일 120%·도장 전체 80%)가 필살 판정 → 필살기 효과(크로크라인 EX효과 포함)',
    config: '투명인간·크로크라인·하니엘·파미도·리카노, 13턴, 확률 100% · 투명인간 1~4턴 평·5턴 궁(네온 5중첩 → 전체 추가 피해 조건)',
    setup: (ctx) => { const st = ctx.mk([10437, 10435, 10425, 10421, 10428], 13); [1, 2, 3, 4].forEach((t) => st.pins.set(t, 1, '평')); st.pins.set(5, 1, '궁'); return st; },
    runs: det, path: { status: '있음', how: '설정 불필요(엔진 규칙 EX_JUDGED_ONEX_CHARS)' }, onMismatch: { cat: '엔진 규칙', why: 'on_ex 추가딜 채널' },
    checks: [
      ...(c.focus.includes('single') ? [{ label: '단일 추가 피해(120%) = 필살 · EX효과', basis: `피드백 #${c.id} + engine.py EX_JUDGED_ONEX_CHARS`, type: 'fn', fn: (r) => invExtra(r, (d) => d.skillName === '장난용 연쇄 함정') }] : []),
      ...(c.focus.includes('aoe') ? [{ label: '전체 추가 피해(도장 80%) = 필살 · EX효과', basis: '도장 텍스트(네온 5중첩)', type: 'fn', fn: (r) => invExtra(r, (d) => +d.skillPct === 80 && d.skillId === 10437, true) }] : []),
      ...(c.focus.includes('croc') ? [{ label: '추가 피해에 크로크라인 EX효과 성분이 주 피해와 같은 수', basis: `피드백 #${c.id} "악어의 필살기 증폭"`, type: 'fn', fn: invCroc }] : []),
      ...(c.focus.includes('notTrigger') ? [{ label: '투명인간 자신의 추가 피해 중 발동효과 채널 0건', basis: '피드백 #21', type: 'fn',
        fn: (r) => { const bad = r.log.filter((e) => e.actor === INV && e.detail && e.detail.final && e.detail.skillId === 10437 && e.detail.effLabel === '발동효과'); return { verdict: bad.length ? 'fail' : 'pass', actual: `발동효과 ${bad.length}건` }; } }] : []),
    ],
  })),

  // ── #22 제단 CD 변화 ──────────────────────────────────────────────────────
  { id: '22-a', fb: 22, intent: '제단으로 CD가 바뀌면 궁 턴이 알아서 따라감(자동)',
    flow: '402(쿨 +1) → 리카노 4·7·10·13 → 5·9·13 필살기, 4·7·10은 필살기 아님',
    expectTimeline: { 4: [S(RI, '평')], 5: [S(RI, '궁')], 7: [S(RI, '평')], 9: [S(RI, '궁')], 10: [S(RI, '평')], 13: [S(RI, '궁')] },
    config: '리카노·파미도·하니엘·욱영·크로크라인, 13턴 · 제단 402만(1012·1013 끔) · 리카노 자동',
    recipe: ['조건 패널 → 제단 사용 켬 → 1층 별 제단 402(쿨 +1) 서 있음, 1012·1013 해제', '고급 설정 ① 리카노 필살기 방식 「자동」(기본값, 고정 칸 없음)'],
    setup: (ctx) => { const st = ctx.mk([10428, 10421, 10425, 10439, 10435], 13); ctx.altar402(st); return st; }, runs: det,
    path: { status: '있음', how: '자동(고정 칸 없음)이면 제단 쿨을 따라감' }, onMismatch: { cat: '엔진 규칙', why: '쿨 +1 규칙' },
    checks: [{ label: 'env 쿨 +1', basis: 'cdPlusOf', type: 'fn', fn: (r) => ({ verdict: r.st.env().cdPlus === 1 ? 'pass' : 'fail', actual: `cdPlus=${r.st.env().cdPlus}` }) }] },
  { id: '22-b', fb: 22, intent: '턴 번호로 고정한 궁(4·7·10·13)도 제단 CD 변화에 꼬이지 않음',
    flow: '고정해 둔 리카노 궁이 402 이후에도 새 리듬(5·9·13)으로 나감',
    expectTimeline: { 4: [S(RI, '평')], 5: [S(RI, '궁')], 7: [S(RI, '평')], 9: [S(RI, '궁')], 10: [S(RI, '평')], 13: [S(RI, '궁')] },
    config: '22-a 편성 · ④ 리카노 4·7·10·13 궁 고정 → 402 켬',
    recipe: ['④ 리카노 4·7·10·13 칸 → 필살기', '조건 패널 제단 402 켬'],
    setup: (ctx) => { const st = ctx.mk([10428, 10421, 10425, 10439, 10435], 13); [4, 7, 10, 13].forEach((t) => st.pins.set(t, 1, '궁')); ctx.altar402(st); return st; }, runs: det,
    path: { status: '있음', how: '고정 칸을 둔 채로도 새 리듬(5·9·13)으로 실행됨 — 단 4·7·10 고정 칸은 실행과 달라 ④에 주황 점(참고 검사). 깔끔하게 하려면 고정 칸을 지우고 「자동」(22-a)' },
    onMismatch: { cat: 'UI 유도', why: '턴 번호 고정 칸은 CD 변화를 따라가지 않고, 제단을 켜도 고정 칸을 옮기라는 안내 없이 칸 위 주황 점·실행 전 경고만 뜸' },
    checks: [{ label: '고정 칸 밀림', basis: '고정 = 실행', type: 'pinsIgnored', info: true }] },
  { id: '22-c', fb: 22, intent: 'CD가 바뀌어도 맞추기(연동) 축이 새 리듬에 맞춰 유지',
    flow: '402 → 욱영 궁 5·9·13, 그 턴마다 마타야 방 → 욱영 궁 → 마타야 궁(추가 행동)',
    expectTimeline: maFlow([5, 9, 13], []),
    config: '#23 최적 축(필살기 연동) + 402',
    recipe: [...RECIPE_S23, '조건 패널 제단 402 켬'],
    setup: (ctx) => { const st = ctx.buildS23(ctx); ctx.altar402(st); return st; }, runs: rand200,
    path: { status: '있음', how: '필살기 연동은 턴 번호가 아니라 기준 동료 궁에 붙음' },
    onMismatch: { cat: '엔진 규칙', why: '쿨 +1이면 마타야가 2쿨 — 준비되면 바로 쓰다가 욱영 턴에 궁이 안 찰 수 있음(필살기 연동 "기다림" 처리)' },
    checks: [{ label: '데미지 참고: 잠금 코드 A + 402 대비', basis: 'ADV_AUDIT §2 #22', type: 'fn', info: true,
      fn: async (r, ctx) => { const stA = ctx.decode('A'); ctx.altar402(stA); const a = await ctx.sim(8778, { ...stA.buildCfg({ mode: 'run' }), forceProc: false, runs: 200, seed: 777 }); return { verdict: 'info', actual: `필살기 연동 ${mm(r.stat.meta.total)} vs 잠금 A ${mm(a.meta.total)}` }; } }] },

  // ── #23 · #24 · #25 마타야 ────────────────────────────────────────────────
  { id: '23', fb: 23, intent: '마타야: 평소 매 턴 궁, 욱영 궁 턴엔 방어 → 욱영 궁(추가 행동) → 마타야 궁',
    flow: '2·3·5·6·8·9·11·12턴 마타야 궁 / 4·7·10·13턴 마타야 방 → 욱영 궁 → 마타야 추가 행동 궁',
    expectTimeline: maFlow(AXIS13, NORMAL13), refFb: 2376,
    config: '코드 A 편성(잠금·예외 턴 제거) → 고급 설정 조작으로 처음부터',
    recipe: RECIPE_S23,
    setup: (ctx) => ctx.buildS23(ctx), runs: rand200,
    path: { status: '있음', how: '필살기 연동 + 준비되면 바로 + 1턴 방어 고정' },
    onMismatch: { cat: '엔진 규칙', why: '필살기 연동 before/defend 처리' },
    checks: [{ label: 'v1(8777) 같은 페이로드', basis: '같은 엔진', type: 'v1same', mode: 'cfg', info: true }] },
  { id: '24-A', fb: 24, intent: '1CD 마타야 최적 축(전 턴 타임라인)',
    flow: '#23과 같은 흐름(사용자가 13턴 전부 잠가서 만든 코드)',
    expectTimeline: maFlow(AXIS13, NORMAL13), refFb: 2376,
    config: '피드백 코드 A 그대로', recipe: ['공유 코드 A 가져오기(13턴 전부 잠금)'],
    setup: (ctx) => ctx.decode('A'), runs: rand200,
    path: { status: '있음', how: '전 턴 잠금(턴 번호 기준 — CD가 바뀌면 깨짐, #22)' }, onMismatch: { cat: '엔진 규칙', why: '잠긴 턴 실행' },
    checks: [{ label: 'v1 가상 머신 페이로드(8777)', basis: 'v1 호환', type: 'v1same', mode: 'v1vm', info: true }] },
  { id: '24-B', fb: 24, intent: '"연동(궁 맞추기)"만으로 A와 같은 흐름(당시엔 평소 턴에 궁 없을 때 평타)',
    flow: '#23과 같은 흐름 — 특히 평소 턴 마타야 궁(당시 불만: 평타로 떨어짐)',
    expectTimeline: maFlow(AXIS13, NORMAL13), refFb: 2125,
    config: '피드백 코드 B 그대로(필살기 연동: 마타야 방어 → 추가 행동 궁, 타임라인 끔)', recipe: ['공유 코드 B 가져오기'],
    setup: (ctx) => ctx.decode('B'), runs: rand200,
    path: { status: '있음', how: '1.8.4 이후 연동 멤버 평소 = 「내 방식대로」 기본값' },
    onMismatch: { cat: '엔진 규칙', why: '연동 멤버 평소 행동' },
    checks: [{ label: 'v1 가상 머신 페이로드(8777)', basis: 'v1 호환', type: 'v1same', mode: 'v1vm', info: true }],
    note: '피드백 당시(2125만) 흐름과 달리 지금은 평소 턴에도 궁 — 피드백 당시와 엔진 변경(1.8.4).' },
  { id: '24-C', fb: 24, intent: '쿨감 제단으로 끌어올린 사용자 축(2470만)',
    flow: '욱영 턴 축 유지 + 평소 매 턴 마타야 궁(제단은 다른 동료 궁을 앞당김)',
    expectTimeline: maFlow(AXIS13, NORMAL13), refFb: 2470,
    config: '피드백 코드 C → 조건 패널 쿨감 제단 켬', recipe: ['공유 코드 C 가져오기', '조건 패널 → 제단 사용 → 1012·1013 체크(코드에 제단 정보 없음)'],
    setup: (ctx) => { const st = ctx.decode('C'); ctx.cdAltar(st); return st; }, runs: rand200,
    path: { status: '부분', how: '공유 코드에 제단 설정이 담기지 않아 받는 사람이 제단을 직접 켜야 함' },
    onMismatch: { cat: '엔진 규칙', why: '잠긴 턴 + 확률 쿨 감소 폴백' },
    checks: [{ label: '확률 쿨 감소 재현 정보', basis: 'meta.cdAssist', type: 'fn', info: true, fn: (r) => ({ verdict: 'info', actual: `cdAssist=${JSON.stringify(r.stat.meta.cdAssist)}` }) }] },
  { id: '24-D', fb: 24, intent: '같은 흐름을 기본값 경로(방식 「자동」 그대로)로 만들 때',
    flow: '#23과 같은 흐름',
    expectTimeline: maFlow(AXIS13, NORMAL13), refFb: 2376,
    config: '#23 순서에서 ① 마타야 방식만 기본값 「자동」으로 둠',
    recipe: ['④ 마타야 1턴 칸 → 방어(방식은 기본 「자동」 그대로)', '③ 필살기 연동 기준 욱영 · 마타야 「방어 → 받은 추가 행동에서 필살기」 · 리카노 「앞에서 필살기」'],
    setup: (ctx) => { const st = ctx.buildS23(ctx); st.plan.setUltMode(0, 'auto'); return st; }, runs: rand200,
    path: { status: '있음', how: '#23 순서(① 「준비되면 바로」)로 만들 수 있음' },
    onMismatch: { cat: 'UI 유도', why: '방식 「자동」 + 칸 하나 고정 → 그 줄 나머지가 역할 기본 리듬(필살기를 아끼는 마타야 = 평)으로 채워짐. 화면 안내 "지정하지 않은 턴은 역할 기본 리듬"은 준비되면 궁처럼 읽힘(ADV_AUDIT §4-D1)' },
    checks: [],
    note: '모순 해결(ADV_AUDIT §8-1 pinFillKind) 전에는 이 경로가 ✗였음 — 마타야 줄이 방평평…으로 채워져 평소 턴 궁 0개(2155만). 지금은 기본값 경로로도 같은 흐름.' },
  { id: '24-c1', fb: 24, intent: '턴별 타임라인과 연동(궁 맞추기)을 동시에',
    flow: '1턴은 잠금(마타야 방), 나머지는 필살기 연동으로 #23 흐름',
    expectTimeline: { 1: [S(MA, '방')], ...maFlow(AXIS13, NORMAL13) }, refFb: 2376,
    config: '#23 + ④ 1턴 잠금(코드 A 1턴 순서)',
    recipe: [...RECIPE_S23.filter((s) => !s.includes('1턴 칸')), '④ 1턴 머리 → 턴 편집 → 하니엘 평·크로 평·욱영 평·리카노 평·마타야 방 → 확정(잠금)'],
    setup: (ctx) => { const st = ctx.buildS23(ctx); st.pins.set(1, 1, null); st.pins.lockTurn(1, [{ p: 5, a: '평' }, { p: 4, a: '평' }, { p: 2, a: '평' }, { p: 3, a: '평' }, { p: 1, a: '방' }]); return st; }, runs: rand200,
    path: { status: '있음', how: '다른 턴을 잠그고 필살기 연동 턴은 잠그지 않음(턴 단위 배타)' }, onMismatch: { cat: '엔진 규칙', why: '잠금/필살기 연동 병행' }, checks: [] },
  { id: '24-c2', fb: 24, intent: '잠근 턴 안에서도 필살기 연동(방어 → 추가 행동 궁)가 합쳐짐',
    flow: '4턴을 잠가도 마타야 방 → 욱영 궁 → 마타야 추가 행동 궁',
    expectTimeline: maFlow([4], []),
    config: '#23 + ④ 4턴 잠금 [하니엘 궁, 크로 평, 리카노 궁, 마타야 방, 욱영 궁](추가 행동 칸 비움)',
    recipe: [...RECIPE_S23, '④ 4턴 턴 편집 → 추가 행동 칸 없이 확정'],
    setup: (ctx) => { const st = ctx.buildS23(ctx); st.pins.lockTurn(4, [{ p: 5, a: '궁' }, { p: 4, a: '평' }, { p: 3, a: '궁' }, { p: 1, a: '방' }, { p: 2, a: '궁' }]); return st; }, runs: det,
    path: { status: '있음', how: '4턴을 잠그지 않거나(24-c1), 잠글 때 추가 행동 칸(리카노 평·마타야 궁)까지 적기(코드 A)' },
    onMismatch: { cat: '엔진 규칙', why: '잠긴 턴은 그 턴의 방식·필살기 연동을 무시하고 적힌 행동만 실행 — 추가 행동도 잠금에 적혀 있어야 함(ADV_AUDIT §4-A 1순위)' }, checks: [] },
  { id: '25', fb: 25, intent: '#24와 같은 흐름(“궁 있으면 바로 사용”) + 쿨감 제단',
    flow: '#23 흐름을 쿨감 제단 하에서',
    expectTimeline: maFlow(AXIS13, NORMAL13), refFb: 2490,
    config: '#23 구성 + 쿨감 제단', recipe: [...RECIPE_S23, '조건 패널 제단 1012·1013 켬'],
    setup: (ctx) => { const st = ctx.buildS23(ctx); ctx.cdAltar(st); return st; }, runs: rand200,
    path: { status: '있음', how: '#23 순서 + 제단' },
    onMismatch: { cat: '엔진 규칙', why: '확률 쿨 감소가 욱영 리듬을 당김' },
    checks: [],
    note: '데미지 2470~2490만은 코드 C(3턴에 하니엘·크로·리카노 궁을 미리 적어 확률 쿨 감소를 노림) 기준 — 필살기 연동+자동 축은 제단 효과 ≈ 0(행동 판정과 무관, 참고).' },

  // ── #26 아누·욱영·임부언 (fed carry) ───────────────────────────────────────
  { id: '26-D', fb: 26, intent: '욱영 궁 턴 최적 축(타임라인)',
    flow: '욱영 턴(4·7·…·28): 임부언 평 → 아누 평 → 욱영 궁 → 아누 궁1 → 임부언 궁 → 아누 궁2',
    expectTimeline: dFlow(D_AXIS), refFb: 6468,
    config: '피드백 코드 D 그대로(30턴 전부 잠금)', recipe: ['공유 코드 D 가져오기'],
    setup: (ctx) => ctx.decode('D'), runs: rand200,
    path: { status: '있음', how: '전 턴 잠금' }, onMismatch: { cat: '엔진 규칙', why: '잠긴 턴 실행' },
    checks: [{ label: 'v1 가상 머신 페이로드(8777)', basis: 'v1 호환', type: 'v1same', mode: 'v1vm', info: true }] },
  { id: '26-E', fb: 26, intent: '연동(궁 맞추기)만으로 D의 흐름(당시 6032만)',
    flow: '26-D와 같음', expectTimeline: dFlow(D_AXIS), refFb: 6032,
    config: '피드백 코드 E 그대로(필살기 연동: 아누 평타 → 추가 행동 궁 ×2)', recipe: ['공유 코드 E 가져오기'],
    setup: (ctx) => ctx.decode('E'), runs: rand200,
    path: { status: '있음', how: '1.8.4 fed carry 연동 + 추가 행동 큐 정렬' }, onMismatch: { cat: '엔진 규칙', why: '평타 순서 = 우선순위' },
    checks: [{ label: 'v1 가상 머신 페이로드(8777)', basis: 'v1 호환', type: 'v1same', mode: 'v1vm', info: true }] },
  { id: '26-F', fb: 26, intent: '같은 흐름을 욱영 「아군 필살기 나중」 체크 한 번으로',
    flow: '26-D와 같음', expectTimeline: dFlow(D_AXIS), refFb: 6468,
    config: '코드 D 편성(잠금 해제) → 욱영 프리셋', recipe: ['고급 설정 ③ 「욱영 기준 인접 동료 연동」(또는 메인 욱영 행 「아군 필살기 나중」 체크)'],
    setup: (ctx) => { const st = ctx.decode('D'); st.applySnap({ ...ctx.snap, advOn: false, turnPlans: {} }); st.pins.unlockAll(); st.sync.preset('uk'); return st; }, runs: rand200,
    path: { status: '있음', how: '체크 한 번' }, onMismatch: { cat: '엔진 규칙', why: '평타 순서 = 우선순위' }, checks: [] },

  // ── #27 · #28 · #29 레오전 ────────────────────────────────────────────────
  { id: '27', fb: 27, intent: '자동 계획 모드에서 쿨감 제단 → 3쿨 3턴째·2쿨 2턴째 궁',
    flow: '고정 칸 없이(자동) 레오 3턴 궁, 바드 2턴 궁',
    expectTimeline: { 2: [S(BARD, '궁')], 3: [S(LEO, '궁')] },
    config: '레오·바드·리카노·하니엘·파미도 · 쿨감 제단 · 방식 「자동」, 고정 칸 없음 · ① 레오·바드 성공 가정',
    recipe: ['조건 패널 제단 1012·1013 켬', '① 레오·바드 행 「성공 가정」 체크(자동 그대로)'],
    setup: async (ctx) => { const st = ctx.mk(LEO_TEAM, 13); ctx.cdAltar(st); await ctx.uiAssist(st, 1); await ctx.uiAssist(st, 2); return st; }, runs: det,
    path: { status: '있음', how: '성공 가정 체크 한 번(동료마다) — 자동 + 성공 가정 = 당겨진 리듬' },
    onMismatch: { cat: '엔진 규칙', why: '자동 + 성공 가정 줄(core effectiveTeam)이 엔진에서 가정으로 쓰이지 않음' },
    checks: [
      { label: 'UI 조작 기록', basis: 'plan-helpers.assistEffect(제단만 보면 켤 수 있음)', type: 'fn', info: true, fn: (r, ctx) => ({ verdict: 'info', actual: ctx.notes.join(' · ') || '—' }) },
      { label: '고정 칸 없음(자동 그대로)', basis: '사용자 결정 — 성공 가정만으로', type: 'fn', fn: (r) => { const n = r.st.pins.count(); return { verdict: n === 0 ? 'pass' : 'fail', actual: `pins=${n}` }; } },
      { label: '레오 3턴·바드 2턴 필살기 칸 열림', basis: 'ultAllowed(성공 가정 기준 쿨 게이트)', type: 'fn', fn: (r) => { const a = r.st.pins.ultAllowed(3, 1), b = r.st.pins.ultAllowed(2, 2); return { verdict: a && b ? 'pass' : 'fail', actual: `레오 3=${a} 바드 2=${b}` }; } },
    ] },
  { id: '28', fb: 28, intent: '레오전: 궁을 3·6·9·12턴에',
    flow: '레오 3·6·9·12턴 필살기', expectTimeline: { 3: [S(LEO, '궁')], 6: [S(LEO, '궁')], 9: [S(LEO, '궁')], 12: [S(LEO, '궁')] },
    config: '쿨감 제단 · ① 레오 성공 가정(자동, 고정 칸 없음)', recipe: RECIPE_LEO,
    setup: async (ctx) => { const st = ctx.mk(LEO_TEAM, 13); ctx.cdAltar(st); await ctx.uiAssist(st, 1); return st; }, runs: det,
    path: { status: '있음', how: '성공 가정 체크 한 번' }, onMismatch: { cat: '엔진 규칙', why: '성공 가정 적용' },
    checks: [
      { label: 'UI 조작 기록', basis: 'assistEffect', type: 'fn', info: true, fn: (r, ctx) => ({ verdict: 'info', actual: ctx.notes.join(' · ') || '—' }) },
      { label: '레오 3턴 필살기 칸 열림', basis: 'ultAllowed', type: 'fn', fn: (r) => { const ok = r.st.pins.ultAllowed(3, 1); return { verdict: ok ? 'pass' : 'fail', actual: `ultAllowed(3)=${ok}` }; } },
      { label: '성공 가정 재현 확률', basis: 'meta.cdAssist', type: 'fn', info: true, fn: (r) => ({ verdict: 'info', actual: `cdAssist=${JSON.stringify(r.logRun.meta.cdAssist)}` }) },
    ] },
  { id: '28-pins', fb: 28, intent: '같은 사이클을 칸 고정으로(성공 가정 켠 뒤 ④ 3·6·9·12 필살기)',
    flow: '레오 3·6·9·12턴 필살기', expectTimeline: { 3: [S(LEO, '궁')], 6: [S(LEO, '궁')], 9: [S(LEO, '궁')], 12: [S(LEO, '궁')] },
    config: '쿨감 제단 · ① 레오 성공 가정 · ④ 레오 3·6·9·12 궁', recipe: [...RECIPE_LEO, '④ 레오 3·6·9·12턴 칸 → 필살기(이미 같은 리듬이면 고정만 표시)'],
    setup: async (ctx) => { const st = ctx.mk(LEO_TEAM, 13); ctx.cdAltar(st); await ctx.uiAssist(st, 1); [3, 6, 9, 12].forEach((t) => ctx.uiPinUlt(st, t, 1)); return st; }, runs: det,
    path: { status: '있음', how: '성공 가정 + 칸 고정' }, onMismatch: { cat: '엔진 규칙', why: '성공 가정 적용' }, checks: [] },
  // [ADV_REVIEW D3 2026-09-28] 「첫 필살기 당기기」 프리셋은 삭제 — 옛 기록·코드가 만든 당겨진 계획은 핀으로 그대로 읽힌다(이 케이스로 확인)
  { id: '28-legacy', fb: 28, intent: '옛 「첫 필살기 당기기」 계획(v1 직접 계획 + 성공 가정)이 그대로 읽힘',
    flow: '레오 3·6·9·12턴 필살기', expectTimeline: { 3: [S(LEO, '궁')], 6: [S(LEO, '궁')], 9: [S(LEO, '궁')], 12: [S(LEO, '궁')] },
    config: '쿨감 제단 · v1 모양 레오 usePlan(3·6·9·…) + ult.assist 스냅샷 적용', recipe: ['옛 기록·공유 코드 불러오기(프리셋 없음 — 핀으로 읽힘)'],
    setup: (ctx) => {
      const plan = Array(30).fill('평'); for (let t = 3; t <= 30; t += 3) plan[t - 1] = '궁';
      const st = ctx.mk(LEO_TEAM, 13);
      const team = LEO_TEAM.map((id, i) => (i === 0 ? { id, skill: 10, rune: true, usePlan: true, plan, rotation: plan.join(''), ult: { mode: 'fixed', keepDef: true, assist: true } } : { id, skill: 10, rune: true }));
      st.applySnap({ team, turns: 13, runs: 1, enemyHits: '5' }); ctx.cdAltar(st);
      ctx.notes.push(`레오 핀 ${Object.keys(st.pins.row(1)).length}칸 · 성공 가정 ${!!(st.get().team[0].ult || {}).assist}`);
      return st;
    }, runs: det,
    path: { status: '있음', how: '옛 기록 그대로' }, onMismatch: { cat: '엔진 규칙', why: '읽기 호환(adoptLegacyPlans)' },
    checks: [{ label: '옛 계획 → 핀 + 성공 가정 유지', basis: 'core adoptLegacyPlans', type: 'fn', fn: (r, ctx) => { const ok = Object.keys(r.st.pins.row(1)).length > 0 && !!(r.st.get().team[0].ult || {}).assist; return { verdict: ok ? 'pass' : 'fail', actual: ctx.notes.join(' · ') }; } }] },
  { id: '29-3쿨', fb: 29, intent: '직접 계획에서 3쿨 동료 3·6·9·12턴 필살기',
    flow: '레오 3·6·9·12턴 필살기(방식 「정해진 턴만」)', expectTimeline: { 3: [S(LEO, '궁')], 6: [S(LEO, '궁')], 9: [S(LEO, '궁')], 12: [S(LEO, '궁')] },
    config: '쿨감 제단 · 레오 「정해진 턴만」 + 성공 가정(고정 칸 없음)', recipe: [...RECIPE_LEO, '① 레오 필살기 방식 「정해진 턴만」'],
    setup: async (ctx) => { const st = ctx.mk(LEO_TEAM, 13); ctx.cdAltar(st); st.plan.setUltMode(0, 'strict'); await ctx.uiAssist(st, 1); return st; }, runs: det,
    path: { status: '있음', how: '성공 가정 체크 한 번(방식 무관)' }, onMismatch: { cat: '엔진 규칙', why: '성공 가정 적용' }, checks: [] },
  { id: '29-2쿨', fb: 29, intent: '직접 계획에서 2쿨 동료 2턴째 필살기',
    flow: '바드 2턴 필살기', expectTimeline: { 2: [S(BARD, '궁')] },
    config: '쿨감 제단 · ① 바드 성공 가정(자동, 고정 칸 없음)', recipe: ['조건 패널 제단 1012·1013 켬', '① 바드 「성공 가정」 체크'],
    setup: async (ctx) => { const st = ctx.mk(LEO_TEAM, 13); ctx.cdAltar(st); await ctx.uiAssist(st, 2); return st; }, runs: det,
    path: { status: '있음', how: '성공 가정 체크 한 번' }, onMismatch: { cat: '엔진 규칙', why: '성공 가정 적용' },
    checks: [{ label: '바드 2턴 필살기 칸 열림', basis: 'ultAllowed', type: 'fn', fn: (r) => { const ok = r.st.pins.ultAllowed(2, 2); return { verdict: ok ? 'pass' : 'fail', actual: `ultAllowed(2)=${ok}` }; } }] },

  // ══ 동료별 행동 규칙(docs/redesign/CHAR_SPECIALS.md) — v1 캐릭터 창 버튼·자동 규칙을 v2 로 가져온 뒤 행동 흐름 대조 ══
  // 판정: 기대 타임라인(행동 일치) + v1flow(8777 에서 v1 가상 머신이 만든 같은 설정 → 전 동료·전 턴 행동 == v2) + 고정 칸 = 실행.
  { id: 'cs-ran3', fb: 90, intent: '란: 3턴마다 필살기 + 필살기 직전 방어(허물 매미 교전)',
    flow: '1·2턴 평 → 3턴 필살기 → 4턴 평 → 5턴 방어(란의 기운 소모, 4번 바드 공격 → 란 발동 효과 +108%·송곳니 +5) → 6턴 필살기 … 반복',
    expectTimeline: rhythm(RAN, [3, 6, 9, 12], [5, 8, 11]), core: [3, 5, 6, 8, 9, 11, 12],
    config: '란(P1)·하니엘·리카노·바드(P4), 13턴 · 메인 란 직접 지정 → 「3턴마다 · 직전 방어」',
    recipe: ['메인 ① 란 방식 「직접 지정」', '프리셋 「3턴마다 · 직전 방어」(고급 ④ 란 행 메뉴에도 같은 항목)'],
    setup: (ctx) => { const st = ctx.mk(RAN_TEAM, 13); st.pins.applyPreset(1, 'ult3def'); return st; }, runs: det,
    path: { status: '있음', how: '란 전용 프리셋 한 번' }, onMismatch: { cat: '엔진 규칙', why: '란 방어 → P4 공격 시너지 순서' },
    checks: [
      { label: '허물 매미 교전 되먹임(4번 동료 공격 → 란)이 방어 턴마다 발동', basis: 'engine _ran_p4_feedback · skills.json 란 passive2', type: 'fn', fn: (r) => ranFeedback(r, [5, 8, 11]) },
      { label: 'v1(8777) 같은 계획(직접 계획 평평궁평방궁…)과 턴별 행동 같음', basis: 'v1 가상 머신 스냅샷', type: 'v1flow', v1: v1Plan(RAN_TEAM, 1, PLAN_JS.ult3def) },
      { label: '고정 칸 = 실행', basis: 'store.pinsIgnored', type: 'pinsIgnored' },
    ] },
  { id: 'cs-ran2', fb: 90, intent: '란: 기본 리듬(CD 2턴)에서 필살기 직전 방어',
    flow: '3턴 필살기 → 4턴 방어 → 5턴 필살기 → 6턴 방어 … (첫 필살기 앞은 기운이 없어 방어 없음)',
    expectTimeline: rhythm(RAN, [3, 5, 7, 9, 11, 13], [4, 6, 8, 10, 12]),
    config: '란(P1)·하니엘·리카노·바드(P4), 13턴 · 란 「필살기 직전 방어」', recipe: ['메인 ① 란 직접 지정 → 프리셋 「필살기 직전 방어」'],
    setup: (ctx) => { const st = ctx.mk(RAN_TEAM, 13); st.pins.applyPreset(1, 'pdef'); return st; }, runs: det,
    path: { status: '있음', how: '란 전용 프리셋 한 번' }, onMismatch: { cat: '엔진 규칙', why: '란 시너지' },
    checks: [
      { label: '허물 매미 교전 되먹임이 방어 턴마다 발동', basis: 'engine _ran_p4_feedback', type: 'fn', fn: (r) => ranFeedback(r, [4, 6, 8, 10, 12]) },
      { label: 'v1(8777) 같은 계획과 턴별 행동 같음', basis: 'v1 가상 머신', type: 'v1flow', v1: v1Plan(RAN_TEAM, 1, PLAN_JS.ran2) },
      { label: '고정 칸 = 실행', basis: 'store.pinsIgnored', type: 'pinsIgnored' },
    ] },
  { id: 'cs-ran-order', fb: 90, intent: '[조합] 란 프리셋 + 4번 자리 동료가 란보다 먼저 행동(파미도 P4)',
    flow: '행동은 3턴마다·직전 방어 그대로, 단 4번 동료가 란 방어보다 먼저 공격하면 되먹임이 없다(툴팁 안내 대상)',
    expectTimeline: rhythm(RAN, [3, 6, 9, 12], [5, 8, 11]),
    config: '란(P1)·하니엘·리카노·파미도(P4, 우선순위 특수값 4.5 → 란보다 먼저) · 란 「3턴마다 · 직전 방어」',
    setup: (ctx) => { const st = ctx.mk([10426, 10425, 10428, 10421, null], 13); st.pins.applyPreset(1, 'ult3def'); return st; }, runs: det,
    path: { status: '부분', how: '행동은 만들어짐 · 시너지는 ① 순서에서 4번 동료를 란 뒤로 옮겨야 발동(cs-ran-order2)' }, onMismatch: { cat: '엔진 규칙', why: '시너지는 같은 턴 란 방어 뒤 4번 동료 공격이 필요' },
    checks: [{ label: '되먹임 발동 턴(정보)', basis: 'engine _ran_p4_feedback', type: 'fn', info: true, fn: (r) => ranFeedback(r, [5, 8, 11]) }] },
  { id: 'cs-ran-order2', fb: 90, intent: '[조합] 위 편성에서 ① 순서로 파미도를 란 뒤로 옮기면 시너지 발동',
    flow: '순서만 바꿔 같은 행동 + 방어 턴마다 되먹임',
    expectTimeline: rhythm(RAN, [3, 6, 9, 12], [5, 8, 11]),
    config: 'cs-ran-order + ① 순서 하니엘 → 리카노 → 란 → 파미도',
    setup: (ctx) => { const st = ctx.mk([10426, 10425, 10428, 10421, null], 13); st.pins.applyPreset(1, 'ult3def'); st.plan.setOrder([2, 3, 1, 4]); return st; }, runs: det,
    path: { status: '있음', how: '① 순서 끌기 한 번' }, onMismatch: { cat: '엔진 규칙', why: '란 시너지 순서' },
    checks: [{ label: '되먹임이 방어 턴마다 발동', basis: 'engine _ran_p4_feedback', type: 'fn', fn: (r) => ranFeedback(r, [5, 8, 11]) }] },
  { id: 'cs-ran-402', fb: 90, intent: '[조합] 란 + 제단 402(CD +1): 「3턴마다 · 직전 방어」는 숨고 「필살기 직전 방어」가 같은 리듬',
    flow: '4·7·10·13턴 필살기, 6·9·12턴 방어',
    expectTimeline: rhythm(RAN, [4, 7, 10, 13], [6, 9, 12]),
    config: '란·하니엘·리카노·바드 · 제단 402 · 란 「필살기 직전 방어」',
    setup: (ctx) => { const st = ctx.mk(RAN_TEAM, 13); ctx.altar402(st); ctx.notes.push(`3턴마다·직전 방어 표시=${st.pins.presetAvailable(1, 'ult3def')}`); st.pins.applyPreset(1, 'pdef'); return st; }, runs: det,
    path: { status: '있음', how: '프리셋 한 번' }, onMismatch: { cat: '엔진 규칙', why: '402 CD' },
    checks: [
      { label: '402 에서 「3턴마다 · 직전 방어」 숨김', basis: 'presetAvailable(ult3def): CD < 3', type: 'fn', fn: (r) => { const a = r.st.pins.presetAvailable(1, 'ult3def'); return { verdict: a ? 'fail' : 'pass', actual: `표시=${a}` }; } },
      { label: '고정 칸 = 실행', basis: 'store.pinsIgnored', type: 'pinsIgnored' },
    ] },

  { id: 'cs-moi', fb: 90, intent: '모이루: 방어로 필살기 앞당기기(「3턴마다처럼」 방·방·필살기)',
    flow: '1·2턴 방어 → 3턴 필살기 → 이후 남은 추격으로 평·방·필살기 반복(6·9·12턴 필살기), 앞 3명은 보통 공격',
    expectTimeline: rhythm(MOI, [3, 6, 9, 12], [1, 2, 5, 8, 11]), core: [3, 6, 9, 12],
    config: '리카노·파미도·하니엘·모이루(P4), 13턴 · 모이루 「방어로 필살기 앞당기기」',
    recipe: ['메인 ① 모이루 직접 지정 → 프리셋 「방어로 필살기 앞당기기」(고급 ④ 행 메뉴에도 같은 항목)'],
    setup: (ctx) => { const st = ctx.mk(MOI_TEAM, 13); st.pins.applyPreset(4, 'defRush'); return st; }, runs: det,
    path: { status: '있음', how: '모이루 전용 프리셋 한 번' }, onMismatch: { cat: '엔진 규칙', why: '모이루 추격 CD 감소' },
    checks: [
      { label: 'v1(8777) 3·6·9·12턴 필살기 칸 클릭(앞 턴 방어 자동 배치)과 턴별 행동 같음', basis: 'v1 renderPlanner onclick → enforceCdDefend', type: 'v1flow', v1: v1Click(MOI_TEAM, 4, [3, 6, 9, 12]) },
      { label: '고정 칸 = 실행', basis: 'store.pinsIgnored', type: 'pinsIgnored' },
    ] },
  { id: 'cs-moi-click', fb: 90, intent: '모이루: 필살기 칸을 누르면 앞 턴 방어 자동 배치(v1 규칙)',
    flow: '3·6·9·12턴 칸 → 필살기: 필요한 앞 턴이 방어로 바뀐다(2턴 칸은 불가 안내)',
    expectTimeline: rhythm(MOI, [3, 6, 9, 12], [1, 2, 5, 8, 11]), core: [3, 6, 9, 12],
    config: '리카노·파미도·하니엘·모이루 · ④(또는 메인 직접 지정) 모이루 2·3·6·9·12턴 칸 → 필살기',
    setup: (ctx) => { const st = ctx.mk(MOI_TEAM, 13); [2, 3, 6, 9, 12].forEach((t) => ctx.uiPinUltRules(st, t, 4)); return st; }, runs: det,
    path: { status: '있음', how: '칸 누르기' }, onMismatch: { cat: '엔진 규칙', why: '모이루 추격' },
    checks: [
      { label: 'UI 조작 기록(자동 방어·불가 안내)', basis: 'plan-helpers.pinUltWithRules', type: 'fn', fn: (r, ctx) => ({ verdict: ctx.notes.some((x) => x.includes('2턴 impossible')) && ctx.notes.some((x) => x.includes('3턴 defended')) ? 'pass' : 'fail', actual: ctx.notes.join(' · ') }) },
      { label: 'v1(8777) 같은 클릭과 턴별 행동 같음', basis: 'v1 renderPlanner onclick', type: 'v1flow', v1: v1Click(MOI_TEAM, 4, [2, 3, 6, 9, 12]) },
      { label: '고정 칸 = 실행', basis: 'store.pinsIgnored', type: 'pinsIgnored' },
    ] },
  { id: 'cs-hito', fb: 90, intent: '히토하: 방어로 필살기 앞당기기(입질 보유 방어 = CD -1)',
    flow: '1·2턴 평(입질) → 3턴 방어 → 4턴 필살기 → 평·방·필살기 반복(7·10·13턴)',
    expectTimeline: rhythm(HITO, [4, 7, 10, 13], [3, 6, 9, 12]),
    config: '히토하(P1)·파미도·하니엘, 13턴 · 히토하 「방어로 필살기 앞당기기」',
    setup: (ctx) => { const st = ctx.mk(HITO_TEAM, 13); st.pins.applyPreset(1, 'defRush'); return st; }, runs: det,
    path: { status: '있음', how: '프리셋 한 번' }, onMismatch: { cat: '엔진 규칙', why: '히토하 입질 CD 감소' },
    checks: [
      { label: 'v1(8777) 4·7·10·13턴 필살기 칸 클릭과 턴별 행동 같음', basis: 'v1 enforceCdDefend(입질)', type: 'v1flow', v1: v1Click(HITO_TEAM, 1, [4, 7, 10, 13]) },
      { label: '고정 칸 = 실행', basis: 'store.pinsIgnored', type: 'pinsIgnored' },
    ] },
  { id: 'cs-hito-click', fb: 90, intent: '히토하: 필살기 칸 → 앞 턴 방어 자동 배치',
    flow: '3턴 칸은 불가 안내, 4·7·10·13턴 칸 → 필살기(앞 턴 방어)',
    expectTimeline: rhythm(HITO, [4, 7, 10, 13], [3, 6, 9, 12]),
    config: '히토하·파미도·하니엘 · 히토하 3·4·7·10·13턴 칸 → 필살기',
    setup: (ctx) => { const st = ctx.mk(HITO_TEAM, 13); [3, 4, 7, 10, 13].forEach((t) => ctx.uiPinUltRules(st, t, 1)); return st; }, runs: det,
    path: { status: '있음', how: '칸 누르기' }, onMismatch: { cat: '엔진 규칙', why: '히토하 입질' },
    checks: [
      { label: 'v1(8777) 같은 클릭과 턴별 행동 같음', basis: 'v1 renderPlanner onclick', type: 'v1flow', v1: v1Click(HITO_TEAM, 1, [3, 4, 7, 10, 13]) },
      { label: '고정 칸 = 실행', basis: 'store.pinsIgnored', type: 'pinsIgnored' },
    ] },
  { id: 'cs-moi-402', fb: 90, intent: '[조합] 모이루 앞당기기 + 제단 402(CD +1) — 아군 필살기 턴(5·9·13)엔 추격이 안 쌓인다',
    flow: '프리셋이 402·아군 필살기 턴을 반영한 리듬을 만들고, 고정 칸이 전부 그대로 실행된다',
    config: '리카노·파미도·하니엘·모이루 · 제단 402 · 모이루 「방어로 필살기 앞당기기」',
    setup: (ctx) => { const st = ctx.mk(MOI_TEAM, 13); ctx.altar402(st); st.pins.applyPreset(4, 'defRush'); return st; }, runs: det,
    path: { status: '있음', how: '프리셋 한 번' }, onMismatch: { cat: '엔진 규칙', why: '402 · 추격' },
    checks: [
      { label: '모이루 필살기 턴 = 줄의 필살기 턴', basis: '구체화된 줄 vs 결과 log', type: 'fn', fn: (r) => lineUltsExec(r, 4, MOI) },
      { label: '고정 칸 = 실행', basis: 'store.pinsIgnored', type: 'pinsIgnored' },
    ] },
  { id: 'cs-moi-assist', fb: 90, intent: '[조합] 모이루 앞당기기 + 쿨감 제단 + 성공 가정',
    flow: '성공 가정만으로 필살기가 되는 턴은 방어 없이, 나머지는 방어로 — 줄의 필살기 턴이 그대로 실행',
    config: '리카노·파미도·하니엘·모이루 · 쿨감 제단 · ① 모이루 성공 가정 → 프리셋',
    setup: async (ctx) => { const st = ctx.mk(MOI_TEAM, 13); ctx.cdAltar(st); await ctx.uiAssist(st, 4); st.pins.applyPreset(4, 'defRush'); ctx.notes.push(`줄 ${(st.pins.line(4) || []).slice(0, 13).join('')}`); return st; }, runs: det,
    path: { status: '있음', how: '성공 가정 + 프리셋' }, onMismatch: { cat: '엔진 규칙', why: '성공 가정' },
    checks: [
      { label: '모이루 필살기 턴 = 줄의 필살기 턴', basis: '구체화된 줄 vs 결과 log(시드 777)', type: 'fn', fn: (r) => lineUltsExec(r, 4, MOI) },
      { label: 'UI 조작 기록', basis: '—', type: 'fn', info: true, fn: (r, ctx) => ({ verdict: 'info', actual: ctx.notes.join(' · ') }) },
    ] },
  { id: 'cs-moi-exc', fb: 90, intent: '[조합] 모이루 앞당기기 + 예외 턴(2턴에 모이루가 먼저 행동)',
    flow: '예외 턴에서 모이루가 아군보다 먼저 방어하면 그 턴 아군 보통 공격의 추격이 방어에 반영되지 않는다',
    config: 'cs-moi + ② 예외 턴 2턴 순서 모이루 → 리카노 → 파미도 → 하니엘',
    setup: (ctx) => { const st = ctx.mk(MOI_TEAM, 13); st.pins.applyPreset(4, 'defRush'); st.plan.setException([2], [4, 1, 2, 3]); return st; }, runs: det,
    path: { status: '부분', how: '예외 턴이 모이루를 앞으로 옮기면 CD 모델(아군 뒤 행동 가정)과 어긋남 → 예외 턴 저장 시 경고 토스트 + ④ 경고 점' }, onMismatch: { cat: '엔진 규칙', why: '추격은 같은 턴 앞선 아군 보통 공격만 반영' },
    note: '모델에 순서를 넣으려면 store.env 에 예외 턴을 실어야 한다(store.js 는 이번 수정 범위 밖) — 대신 저장 시 경고.',
    checks: [
      { label: '예외 턴 저장 시 경고 대상 = 모이루', basis: 'plan-helpers.stackOrderRisk', type: 'fn', fn: (r) => { const ids = UIH.stackOrderRisk(r.st.get(), [4, 1, 2, 3]); return { verdict: ids.join() === '10436' ? 'pass' : 'fail', actual: `경고 ${ids.join(',') || '없음'}` }; } },
      { label: '예외 턴이 없으면 경고 없음', basis: 'stackOrderRisk(기본 순서 — 모이루 마지막)', type: 'fn', fn: (r) => { const ids = UIH.stackOrderRisk(r.st.get(), [3, 1, 2, 4]); return { verdict: ids.length ? 'fail' : 'pass', actual: `경고 ${ids.join(',') || '없음'}` }; } },
      { label: '모이루 필살기 턴(정보 — 2턴 추격 부족으로 3턴 → 4턴 밀림)', basis: '결과 log', type: 'fn', info: true, fn: (r) => lineUltsExec(r, 4, MOI) },
      { label: '고정 칸 = 실행(정보)', basis: 'store.pinsIgnored', type: 'pinsIgnored', info: true },
    ] },
  { id: 'cs-moi-strict', fb: 90, intent: '[조합] 모이루 앞당기기 + 방식 「정해진 턴만」 — 흐름 동일',
    flow: 'cs-moi 와 같은 타임라인',
    expectTimeline: rhythm(MOI, [3, 6, 9, 12], [1, 2, 5, 8, 11]), core: [3, 6, 9, 12],
    config: 'cs-moi + ① 모이루 방식 「정해진 턴만」',
    setup: (ctx) => { const st = ctx.mk(MOI_TEAM, 13); st.plan.setUltMode(3, 'strict'); st.pins.applyPreset(4, 'defRush'); return st; }, runs: det,
    path: { status: '있음', how: '방식 + 프리셋' }, onMismatch: { cat: '엔진 규칙', why: 'strict' },
    checks: [{ label: '고정 칸 = 실행', basis: 'store.pinsIgnored', type: 'pinsIgnored' }] },

  { id: 'cs-taeho', fb: 90, intent: '이태호(1번)+임부언: 받은 추가 행동에서 필살기(fed)',
    flow: '임부언 필살기 턴(4·7·10·13)에 이태호가 추가 행동으로 필살기 · 평소 턴당 2회(1턴 필살기 → 이후 보통 공격)',
    expectTimeline: taehoFlow([4, 7, 10, 13]),
    config: '이태호(P1)·임부언·파미도·하니엘 · 이태호 직접 지정(1턴 칸) + 받은 추가 행동 4·7·10·13턴 → 필살기',
    recipe: ['메인 ① 이태호 직접 지정 → 1턴 칸 고정', '「임부언에게 받은 추가 행동」 칸 4·7·10·13 → 필살기'],
    setup: (ctx) => {
      const st = ctx.mk(TAEHO_TEAM, 13);
      st.pins.set(1, 1, '궁평');
      const eff = st.effectiveTeam();
      const fed = [...(ctx.P.taehoFedTurns(eff[0], eff, 13, st.env()) || [])].sort((a, b) => a - b);
      fed.forEach((t) => st.plan.setFed(0, t, '궁'));
      ctx.notes.push(`fed 턴 ${fed.join('·')}`);
      return st;
    }, runs: det,
    path: { status: '있음', how: '직접 지정 줄 + 받은 추가 행동 칸' }, onMismatch: { cat: '엔진 규칙', why: '임부언 필살기 · CD 변동 면역(엔진 작업 중)' },
    note: '엔진에 임부언 CD 변동 면역이 들어오는 중(다른 세션) — 8777/8778 엔진이 다르면 v1flow 가 어긋날 수 있다.',
    checks: [
      { label: 'v1(8777) 직접 계획 + fedActions 와 턴별 행동 같음', basis: 'v1 fedPayload', type: 'v1flow',
        v1: (V, set) => { set(TAEHO_TEAM.map((id) => id && { id })); V.exec(`(() => { const s = team[0]; s.usePlan = true; s.plan = defaultPlan(CHARS[10423], 30); s.rotation = s.plan.join(''); s.fedActions = {}; imbueonUltTurns(team, 13).forEach(t => { s.fedActions[t] = '궁'; }); })()`); return V.eval('snapshot()'); } },
    ] },
  { id: 'cs-invis', fb: 90, intent: '투명인간: 3턴마다 필살기(4·7·10·13)',
    flow: '보통 공격 3번으로 네온 표식 5 → 4턴 필살기(도장 전체 추가 피해) → 3턴마다',
    expectTimeline: rhythm(INV, [4, 7, 10, 13], []),
    config: '투명인간(P1)·파미도·하니엘·리카노 · 「3턴마다 필살기」', recipe: ['메인 ① 투명인간 직접 지정 → 「3턴마다 필살기」'],
    setup: (ctx) => { const st = ctx.mk(INV_TEAM, 13); st.pins.applyPreset(1, 'ult3'); return st; }, runs: det,
    path: { status: '있음', how: '프리셋 한 번' }, onMismatch: { cat: '엔진 규칙', why: '—' },
    checks: [
      { label: 'v1(8777) 3턴궁 버튼(ult3Plan)과 턴별 행동 같음', basis: 'v1 ult3Plan', type: 'v1flow', v1: v1Plan(INV_TEAM, 1, 'ult3Plan(CHARS[10437], 30)') },
      { label: '고정 칸 = 실행', basis: 'store.pinsIgnored', type: 'pinsIgnored' },
    ] },
  { id: 'cs-mataya', fb: 90, intent: '마타야: 3턴마다 필살기(파세 쌓기)',
    flow: '4·7·10·13턴 필살기, 나머지 보통 공격',
    expectTimeline: rhythm(MA, [4, 7, 10, 13], []),
    config: '마타야(P1)·파미도·하니엘·리카노 · 「3턴마다 필살기」',
    setup: (ctx) => { const st = ctx.mk(MATA_TEAM, 13); st.pins.applyPreset(1, 'ult3'); return st; }, runs: det,
    path: { status: '있음', how: '프리셋 한 번' }, onMismatch: { cat: '엔진 규칙', why: '—' },
    checks: [
      { label: 'v1(8777) 3턴궁 버튼과 턴별 행동 같음', basis: 'v1 ult3Plan', type: 'v1flow', v1: v1Plan(MATA_TEAM, 1, 'ult3Plan(CHARS[10442], 30)') },
      { label: '고정 칸 = 실행', basis: 'store.pinsIgnored', type: 'pinsIgnored' },
    ] },
  { id: 'cs-famido', fb: 90, intent: '파미도: 필살기 직전 방어(패시브 방어)',
    flow: '3·6·9·12턴 방어 → 4·7·10·13턴 필살기(롱 패스 준비 ATK +30% 2턴)',
    expectTimeline: rhythm(FAM, [4, 7, 10, 13], [3, 6, 9, 12]),
    config: '파미도(P1)·하니엘·리카노·아누비로스 · 「필살기 직전 방어」',
    setup: (ctx) => { const st = ctx.mk(FAM_TEAM, 13); st.pins.applyPreset(1, 'pdef'); return st; }, runs: det,
    path: { status: '있음', how: '프리셋 한 번' }, onMismatch: { cat: '엔진 규칙', why: '—' },
    checks: [
      { label: 'v1(8777) 패시브 방어 버튼(passiveDefendPlan)과 턴별 행동 같음', basis: 'v1 passiveDefendPlan', type: 'v1flow', v1: v1Plan(FAM_TEAM, 1, 'passiveDefendPlan(CHARS[10421], 30)') },
      { label: '고정 칸 = 실행', basis: 'store.pinsIgnored', type: 'pinsIgnored' },
    ] },
  { id: 'cs-famido-lock', fb: 90, intent: '[조합] 파미도 직전 방어 + ④ 6턴 잠금(전원 보통 공격) — 잠긴 턴만 바뀌고 7턴 필살기 유지',
    flow: '6턴 파미도 보통 공격(잠금이 고정 칸을 가림) → 7턴 필살기, 나머지 리듬 그대로',
    expectTimeline: { ...rhythm(FAM, [4, 7, 10, 13], [3, 9, 12]), 6: [S(FAM, '평')] },
    config: 'cs-famido + 6턴 잠금 [파미도·하니엘·리카노·아누 보통 공격]',
    setup: (ctx) => { const st = ctx.mk(FAM_TEAM, 13); st.pins.applyPreset(1, 'pdef'); st.pins.lockTurn(6, [1, 2, 3, 4].map((p) => ({ p, a: '평' }))); return st; }, runs: det,
    path: { status: '있음', how: '프리셋 + 턴 잠금' }, onMismatch: { cat: '엔진 규칙', why: '잠긴 턴 우선' }, checks: [] },
  { id: 'cs-ult3-asap', fb: 90, intent: '[조합] 투명인간 3턴마다 + 방식 「준비되면 바로」',
    flow: '「준비되면 바로」는 고정한 보통 공격보다 우선(엔진 규칙) — 3턴 리듬이 깨지는지 확인',
    config: 'cs-invis + ① 투명인간 방식 「준비되면 바로」',
    setup: (ctx) => { const st = ctx.mk(INV_TEAM, 13); st.pins.applyPreset(1, 'ult3'); st.plan.setUltMode(0, 'asap'); return st; }, runs: det,
    path: { status: '부분', how: '방식이 고정 칸보다 우선 — 이 방식에선 「3턴마다」 프리셋을 흐리게 + 이유, 이미 찍힌 칸은 ④ 경고 점' }, onMismatch: { cat: '엔진 규칙', why: 'asap' },
    checks: [
      { label: '「준비되면 바로」에서 3턴마다 프리셋 비활성(이유 표시)', basis: 'plan-helpers.presetBlockedByMode', type: 'fn', fn: (r) => { const b = UIH.presetBlockedByMode(r.st.get().team[0], 'ult3'); return { verdict: b === 'asap' ? 'pass' : 'fail', actual: `차단=${b}` }; } },
      { label: '투명인간 필살기 턴(정보)', basis: '결과 log', type: 'fn', info: true, fn: (r) => lineUltsExec(r, 1, INV) },
      { label: '고정 칸 = 실행(정보)', basis: 'store.pinsIgnored', type: 'pinsIgnored', info: true },
    ] },
  { id: 'cs-uk', fb: 90, intent: '욱영 「아군 필살기 나중」: v2 체크(연동 프리셋) == v1 버튼(allyUltAfter)',
    flow: '욱영 필살기 턴: 인접(리카노·아누)이 먼저 보통 공격 → 욱영 필살기 → 인접이 받은 추가 행동에서 필살기',
    expectTimeline: ukFlow([4, 7, 10, 13]), core: [4, 7, 10, 13],
    config: '리카노(P1)·욱영(P2)·아누비로스(P3)·하니엘·파미도 · 메인 욱영 「아군 필살기 나중」 체크',
    setup: (ctx) => { const st = ctx.mk(UK_TEAM, 13); st.sync.preset('uk'); return st; }, runs: det,
    path: { status: '있음', how: '체크 한 번' }, onMismatch: { cat: '엔진 규칙', why: 'v1 은 엔진 allyUltAfter, v2 는 연동 그룹 — 경로가 다름(인접 동료 보통 공격이 연동 순서로 앞당겨짐)' },
    checks: [{ label: 'v1(8777) 욱영 버튼 ON 과 턴별 행동 같음', basis: 'v1 allyUltAfter', type: 'v1flow',
      v1: (V, set) => { set(UK_TEAM.map((id) => id && { id })); V.exec('team[1].allyUltAfter = true'); return V.eval('snapshot()'); } }] },
  { id: 'cs-zeto', fb: 90, intent: '제토: 전투당 1회 필살기를 6턴에(다른 턴 필살기 고정 해제)',
    flow: '13턴 자동 필살기 대신 6턴 필살기, 나머지 보통 공격',
    config: '제토(P1)·파미도·하니엘 · 제토 9턴 → 6턴 칸 필살기',
    setup: (ctx) => { const st = ctx.mk(ZETO_TEAM, 13); st.pins.set(9, 1, '궁'); ctx.uiPinUltRules(st, 6, 1); ctx.notes.push(`핀 ${JSON.stringify(st.pins.row(1))}`); return st; }, runs: det,
    path: { status: '있음', how: '칸 누르기' }, onMismatch: { cat: '엔진 규칙', why: 'single_ult' },
    checks: [
      { label: '9턴 필살기 고정이 풀림', basis: 'pinUltRow single', type: 'fn', fn: (r) => { const row = r.st.pins.row(1); return { verdict: row[6] === '궁' && !row[9] ? 'pass' : 'fail', actual: JSON.stringify(row) }; } },
      // 제토는 도장(보통 공격 시 50% 행동 회복) 체인이 있어 턴별 행동 수가 들쭉날쭉 — 필살기 턴만 본다
      { label: '제토 필살기 = 6턴 1회(13턴 자동 필살기 없음)', basis: '결과 log', type: 'fn', fn: (r) => {
        const got = Object.keys(r.parsed).map(Number).filter((t) => r.parsed[t].some((s) => s.actor === ZETO && s.a === '궁')).sort((a, b) => a - b);
        return { verdict: got.join() === '6' ? 'pass' : 'fail', actual: `필살기 턴 ${got.join('·') || '없음'}` }; } },
      { label: 'v1(8777) 6턴 칸 클릭과 턴별 행동 같음', basis: 'v1 onclick singleUlt', type: 'v1flow', v1: v1Click(ZETO_TEAM, 1, [6]) },
    ] },
  { id: 'cs-imm', fb: 90, intent: '임부언 CD 변동 면역: 1번 아누비로스 + 성공 가정 + 매 턴 필살기 계획 → 3·6·9·12턴, 플래너가 면역 턴 필살기 칸을 막음',
    flow: '3턴 아누 필살기(+임부언 추가 행동 필살기) → 임부언이 매 턴 면역을 갱신 → 아누는 자연 충전으로만 6·9·12턴',
    config: '아누비로스(P1)·임부언·파미도·하니엘 · 쿨감 제단 · 아누·임부언 성공 가정 · 둘 다 「모두 필살기」',
    recipe: ['조건 패널 쿨감 제단', '① 아누·임부언 「성공 가정」', '④ 임부언 행 → 「모두 필살기」, 아누 행 → 「모두 필살기」'],
    setup: async (ctx) => {
      const st = ctx.mk([10401, 10410, 10421, 10425, null], 13); ctx.cdAltar(st);
      await ctx.uiAssist(st, 1); await ctx.uiAssist(st, 2);
      st.pins.applyPreset(2, 'allUlt'); st.pins.applyPreset(1, 'allUlt');
      ctx.notes.push(`아누 줄 ${(st.pins.line(1) || []).slice(0, 13).join('')}`, `막힌 칸 ${[...Array(13)].map((_, k) => (st.pins.ultAllowed(k + 1, 1) ? '' : k + 1)).filter(Boolean).join('·')}`);
      return st;
    }, runs: det,
    path: { status: '있음', how: '프리셋 — 플래너가 면역 턴을 막아 줄이 엔진과 같다' }, onMismatch: { cat: '엔진 규칙', why: '임부언 CD 변동 면역' },
    checks: [
      { label: '아누 필살기 턴(엔진) = 3·6·9·12', basis: 'IMBUEON_IMMUNITY.md §4 (b2)', type: 'fn', fn: (r) => {
        const got = Object.keys(r.parsed).map(Number).filter((t) => t <= 13 && r.parsed[t].some((s) => s.actor === AN && s.a === '궁')).sort((a, b) => a - b);
        return { verdict: got.join() === '3,6,9,12' ? 'pass' : 'fail', actual: `아누 필살기 턴 ${got.join('·')}` }; } },
      { label: '플래너: 면역 턴(4·5·7·8·10·11) 필살기 칸 막힘 · 6·9·12 열림', basis: 'core immuneFor → planView.lockUlt → pins.ultAllowed', type: 'fn', fn: (r) => {
        const blocked = [4, 5, 7, 8, 10, 11].every((t) => !r.st.pins.ultAllowed(t, 1)), open = [6, 9, 12].every((t) => r.st.pins.ultAllowed(t, 1));
        return { verdict: blocked && open ? 'pass' : 'fail', actual: `막힘 ${blocked} · 열림 ${open}` }; } },
      { label: '줄의 필살기 턴 = 엔진 필살기 턴(자기 행동)', basis: '구체화된 줄 vs log', type: 'fn', fn: (r) => lineUltsExec(r, 1, AN) },
      { label: 'UI 조작 기록', basis: '—', type: 'fn', info: true, fn: (r, ctx) => ({ verdict: 'info', actual: ctx.notes.join(' · ') }) },
    ] },
];

// ── 보조 ─────────────────────────────────────────────────────────────────────
function mm(x) { return (x / 1e4).toFixed(1) + '만'; }

function invExtra(r, pick, optional = false) {
  const hits = r.log.filter((e) => e.actor === INV && e.detail && e.detail.final && pick(e.detail));
  if (!hits.length) return { verdict: optional ? 'partial' : 'fail', actual: '해당 추가 피해 로그 없음(발동 조건 미충족)' };
  const bad = hits.filter((e) => e.kind !== '필살기' || e.detail.effLabel !== 'EX효과');
  return { verdict: bad.length ? 'fail' : 'pass', actual: `${hits.length}건 ${[...new Set(hits.map((e) => `${e.detail.act}/${e.detail.effLabel}`))].join(',')} (턴 ${[...new Set(hits.map((e) => e.turn))].join(',')})` };
}
function invCroc(r) {
  const acts = new Set(r.log.filter((e) => e.actor === INV && e.kind === '필살기').map((e) => e.act));
  const rows = [];
  for (const a of acts) {
    const hits = r.log.filter((e) => e.act === a && e.actor === INV && e.detail && e.detail.final && e.kind === '필살기');
    const main = hits.find((e) => e.detail.skillName === '서프라이즈 폭죽!');
    if (!main) continue;
    const n = (e) => (e.detail.eff || []).filter((x) => x.by === 10435).length;
    rows.push({ t: main.turn, m: n(main), e: hits.filter((e) => e !== main && e.detail.skillId === 10437).map(n) });
  }
  const w = rows.filter((x) => x.m > 0);
  if (!w.length) return { verdict: 'partial', actual: '크로크라인 버프가 걸린 투명인간 필살 턴 없음' };
  const ok = w.every((x) => x.e.length && x.e.every((k) => k === x.m));
  return { verdict: ok ? 'pass' : 'fail', actual: w.map((x) => `T${x.t} 주${x.m}/추가${x.e.join('·')}`).join(' ') };
}
