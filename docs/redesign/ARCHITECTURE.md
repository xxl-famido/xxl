# v2 프런트엔드 아키텍처 (3~5단계 구현 기준)

목업 `dashboard_v2/mockup.html` 확정(2026-09-28). 이 문서가 모든 구현 에이전트의 계약이다. 여기 없는 전역·DOM id·이벤트를 새로 만들지 않는다.

## 0. 원칙
- **엔진·데이터·저장 계약은 v1과 동일**: `sim_api.py`(fetch: 8778 / 정적: Pyodide 워커), `data/chars.json`·`skills.json`, `localStorage` 키(`woofia_history`, `woofia_draft`, `woofia_altar`, `woofia_sync`, `woofia_tdmg`, `woofia_lang`), 스냅샷 형태(`snapshot()`), 공유 코드 v2 코덱, 엔진 페이로드(`slotPayload`/`fedPayload`/`ultPayload`/`planRotation`). v1 기록·공유 코드가 v2에서 그대로 열려야 한다.
- **UI는 전부 새로 쓴다**: 마크업은 목업, 스타일은 토큰만 참조, 문구는 `GLOSSARY.md`·`COPY_AUDIT.md`, 아이콘은 `ui-icons/sprite.svg`.
- **ES 모듈 + 단일 스토어**. 전역 변수 금지. `app.v1.js`는 `dashboard_v2/legacy/`에 참고용으로만 둔다(로드하지 않음).
- **모션은 적극 활용**하되 사용자 행동에 답하거나(무엇이 바뀌었는지), 기다림을 설명하는(로딩) 모션만. 장식 반복 모션 금지. `prefers-reduced-motion`이면 이동 제거·페이드만.

## 1. 파일 구조
```
dashboard_v2/
  index.html                 목업 마크업 → 실제 마운트 포인트(id 고정, §4)
  tokens.css                 생성 파일(gen_tokens.py)
  app.css                    컴포넌트(목업 mockup.css를 정리해 계승) + 레이아웃
  motion.css                 키프레임·전환(§6)
  ui-icons/sprite.svg        Lucide
  sim-worker.js              v1 그대로(경로만 확인)
  src/
    main.js                  부트: 스토어 생성 → 모듈 mount → 초기 복원 → 인트로 모션
    core/api.js              fetch(8778)/Pyodide 브릿지. progress 콜백 노출(로딩 모션용)
    core/store.js            상태 + 구독 + snapshot/applySnap + 초안/기록 저장
    core/codec.js            공유 코드 v2 encode/decode (v1 이식, 라운드트립 테스트 필수)
    core/payload.js          slotPayload·fedPayload·ultPayload·planRotation·buildCfg (v1 이식)
    core/plan.js             행동 계획 모델: 프리셋, 예외 턴, 맞추기 정규화, 완전 수동(turnPlans) 재조정, 프로브
    core/format.js           fmt, fmtShort(만/억), 이름, 속성/포지션 매핑
    core/i18n.js             ID 키 사전(kr/en/ja/zh) + t(key, vars). 문서: §5
    ui/topbar.js             기록 select, 팀 비교/가이드/메뉴 버튼, 테마 토글
    ui/team.js               슬롯 5 + 동료 목록(검색·속성·포지션 필터·번호 배지)
    ui/plan.js               행동 계획 패널(① 순서와 필살기(+직접 지정 30칸·프리셋) ② 예외 턴 ③ 맞추기 문장형) + 실행 미리보기 + 완전 수동 진입
    ui/manual.js             완전 수동 편집기(전체 화면 시트; v1 타임라인 격자 기능 이식: 복사/붙여넣기/되돌리기/구간/N턴 반복)
    ui/cond.js               전투 조건 아코디언(반복·턴 / 적 / 받는 데미지 3필드 / 방탈출 제단) + 실행 버튼(sticky·모바일 바)
    ui/altar.js              방탈출 제단 층별 별/달 점등 편집(시트)
    ui/results.js            헤드라인·확률 범위·턴별 데미지 스트립·동료별 데미지·전투 로그(표)
    ui/compare.js            팀 비교(시트, 나란히 컬럼) — 기존 cmp* 상태·스코프 규칙 이식
    ui/grow.js               동료 육성 창(레벨·스타·진화·적합도·스킬 레벨·도장·제련·스킬 설명) — 행동 설정은 없음
    ui/records.js            기록 목록(핀·잠금·이름·정렬·검색·가져오기/내보내기)
    ui/guide.js, ui/patch.js, ui/feedback.js, ui/menu.js
    ui/components.js         공용: 아코디언, 세그먼트, 슬라이더+입력, 스위치, 툴팁(?), 토스트, 시트/모달, 드롭다운
    motion/orchestrate.js    인트로·로딩·결과 공개·상태 전환(§6). WAAPI 기반, CSS 변수로 duration/easing
  legacy/app.v1.js, i18n.v1.js   참고 전용
  tests/                     node: codec 라운드트립, 스냅샷 호환, payload 동등성(v1 함수 vs v2 함수 같은 입력→같은 출력), plan 모델
```

## 2. 스토어 (`core/store.js`)
```js
state = {
  chars: {},                           // id → meta (API.chars)
  team: [slot|null ×5],                // slot = { id, skill, rune, rotation, spec?, priority?, ult?, plan?, usePlan?, allyUltAfter?, fedActions? } — v1 필드 그대로
  cond: { runs, turns, dummyElement, dummies, enemyHits, forceProc, hp10, incomingOn, incomingPct },
  tdmg: { on, pct, adv, per, hits },
  altar: { on, floors },
  sync: [group×≤3],                    // v1 syncGroups 정규화 형식
  overrides: { turn: [pos…] },         // turnOverrides
  manual: { on, plans: {turn:[{p,a}]}, touched:Set, teamSig },   // advOn/turnPlans/advTouched/advTeamSig
  ui: { filterEl, filterRole, search, lang, theme, openPanels, busy },
  result: lastResult | null,
  records: [...], activeRecId, draftReady
}
store.get() · store.set(patch, {silent}) · store.subscribe(selector, fn) · store.snapshot() · store.applySnap(s)
store.saveDraft() · store.records.{save, restore, remove, pin, lock, rename, import, export}
```
- `snapshot()`은 v1과 **동일한 객체 형태**를 반환한다(team, turns, dummies, enemyHits, dummyElement, runs, forceProc, hp10, turnOverrides, incomingOn, incomingPct, advOn, altar, sync, turnDamage, turnPlans). 테스트로 고정.
- 구독은 세분화(`subscribe(s => s.team, render)`). 렌더는 diff 없이 섹션 단위 재그리기. 대신 포커스·스크롤 보존.
- 파생값은 `core/plan.js`: `deriveOrder(state)`, `deriveSummary.*` (아코디언 요약 문구), `isDefault.*` (변경 표식).

## 3. API (`core/api.js`)
`api.chars()`, `api.char(id)`, `api.simulate(cfg)`, `api.probe(cfg)`, `api.ready` (Promise), `api.onProgress(fn)` (Pyodide 단계 문자열·진행률 추정). 8778이면 fetch, 아니면 워커. 첫 로드(약 10초)는 §6 로딩 연출로 덮는다.

## 4. index.html 마운트 id (고정)
`#app-topbar` `#app-team` `#app-plan` `#app-cond` `#app-result` `#app-runbar` `#app-sheets`(시트·모달 컨테이너) `#app-toast` `#app-boot`(로딩 오버레이). 각 UI 모듈은 자기 마운트 안만 그린다. 시트/모달은 `components.openSheet({title, content, size})`로만 연다(중첩 1단계까지).

## 5. i18n (`core/i18n.js`)
- 키는 ID(`plan.step1.title`), 사전은 `i18n/kr.json en.json ja.json zh.json`. kr이 원본.
- 변환: `legacy/i18n.v1.js`의 EXACT/PAT 사전을 **용어집 교체 후** ID로 재매핑(도구 `tools/redesign/i18n_migrate.py`, 대응표 출력). 새 문구는 kr만 넣고 en/ja/zh는 `[미번역]` 표식으로 두되 기존 번역이 있으면 재사용.
- 동료 이름·스킬 설명은 `data/chars.json`·`skills.json`의 언어별 값(v1과 동일).
- 파이썬이 만드는 문자열(`치유` 등)은 프런트에서 키로 매핑(`format.role()`), 백엔드는 이번에 바꾸지 않는다(회귀 범위 억제). 후속으로 `sim_api.py` 정리.

## 6. 모션 (`motion/orchestrate.js`, `motion.css`)
사용자 승인: "로딩과 여러 움직임에 적극 활용". 원칙: 한 번에 한 연출, 의미 있는 순간에만, 모두 토큰 duration/easing.
| 순간 | 연출 | 길이 |
|---|---|---|
| 첫 로드(Pyodide) | `#app-boot`: 로고 심볼(막대 4개)이 엔진 단계에 맞춰 차오름 + 단계 문구("런타임 받는 중 → 엔진 준비 → 동료 불러오는 중") + 실제 진행 비율. 완료 시 오버레이가 위로 접히며 상단바가 되고, 편성·행동·조건 패널이 40ms 스태거로 들어옴 | 로딩 시간 + 600ms |
| 재방문(캐시) | 로고 1회 펄스 → 패널 스태거만 | 400ms |
| 슬롯 배치/해제 | 동료 타일이 슬롯 위치로 FLIP 이동(복제 이미지가 날아가 안착), 빈 슬롯은 점선→실선 | 300ms |
| 순서 이동 ▲▼ | 행 FLIP 교환 | 200ms |
| 아코디언 | 높이 전환 + 요약 문구 크로스페이드 | 200ms |
| 실행 버튼 | 누르면 버튼이 진행 바로 변형(반복 진행 n/50 실시간 — 워커는 진행 없으니 시간 추정) | 실행 시간 |
| 결과 공개 | 헤드라인 숫자 롤업(0→값, 700ms, expo.out), 확률 범위 점이 좌→우 슬라이드 후 안착, 30턴 스트립 막대가 1→30턴 순서로 40ms 간격 상승(필살기 턴은 살짝 늦게 튀어오름), 동료별 바 채움 | 총 1.2초, 스크롤은 결과 상단으로 부드럽게 |
| 미리보기 갱신 | 바뀐 칸만 색 크로스페이드 + 1회 하이라이트 | 200ms |
| 시트/모달 | 하단(모바일)/우측(데스크톱)에서 슬라이드 + 배경 디밍 | 300/200ms |
| 토스트 | 위로 8px 슬라이드 인 | 150ms |
| 테마 전환 | 배경·텍스트 색 200ms 크로스페이드 | 200ms |
구현: Web Animations API + FLIP 유틸(`motion/flip.js`). 숫자 롤업은 `requestAnimationFrame`. reduced-motion이면 전부 opacity 150ms.

## 7. 작업 분할(에이전트 단위)과 완료 기준
| # | 모듈 | 담당 | 완료 기준 |
|---|---|---|---|
| A | core/{api,store,codec,payload,plan,format} + tests | 에이전트 A | `node tests/*.js` 통과: 코덱 라운드트립(샘플 코드 20개, v1 함수와 결과 동일), 스냅샷 v1↔v2 동일, payload 동등성 |
| B | core/i18n + i18n/*.json + tools/i18n_migrate.py | 에이전트 B | 키 수·미번역 수 보고, 용어집 위반 0 |
| C | ui/team + ui/grow + ui/records + ui/topbar + components | 에이전트 C | 스크린샷(데스크톱·모바일·라이트·다크) + 체크리스트 |
| D | ui/plan + ui/manual + core/plan 연동 + 미리보기(probe) | 에이전트 D | 사례 3종(레오전 3·6·9·12 / 마타야 방어→욱영→마타야 / fed carry) 페이로드가 v1과 동일 |
| E | ui/cond + ui/altar + ui/results + ui/compare | 에이전트 E | 결과 화면 실데이터 렌더, 비교 스코프 격리 테스트 |
| F | motion + 로딩 + main.js 통합 + guide/patch/feedback/menu | 본인 | 전 흐름 스모크, 회귀 하네스 포팅, 배포 |
순서: A·B 먼저(계약) → C·D·E 병렬 → F.

## 8. 검증
- `tests/`(node) 계약 테스트 + `tools/uitest_v2.js`(JSDOM/puppeteer)로 v1 하네스의 시나리오를 v2 DOM으로 포팅.
- 실브라우저 스모크: 편성→실행→새로고침 유지→기록 복원→공유 코드 왕복→팀 비교.
- DESIGN_PRINCIPLES 체크리스트 14항목 + 문구 검사(`tools/redesign/copy_lint.py`: 금지어 목록 = 궁극기·평타·문양·룬·캐릭터·조합·치유·길드전·해요체·이모지).

## 9. v2.1 재개편(핀) 계약 — RESTRUCTURE_PROPOSAL.md 구현용 (2026-09-28 승인)
### 상태
- `state.pins: { [turn]: { [pos]: '궁'|'방'|'평' } }` — 사용자가 고정한 칸. 비어 있으면 스냅샷·코드에서 **생략**(v1 바이트 호환 유지).
- `state.locked: { [turn]: [{p, a}] }` — 턴 전체를 직접 짠 턴(옛 완전 수동 `turnPlans`의 후신). `manual.on` 개념은 없어진다(항상 규칙+핀+잠긴 턴 혼합).
- 필살기 방식은 `auto | strict | asap` 셋만. `usePlan/plan`(v1 직접 계획)은 **읽기 전용 호환**: applySnap 시 계획의 '궁'·'방' 칸을 pins로 변환하고 usePlan=false로 정리.
### 스토어 API
- `store.pins.set(turn, pos, act|null)` · `clearTurn(turn)` · `clearAll()` · `applyPreset(pos, name)`(모두 필살기·3턴마다·첫 필살기 당기기·필살기 직전 방어·간격 맞추기 → 핀 묶음, 되돌리기 토큰 반환) · `lockTurn(turn, seq)` · `unlockTurn(turn)` · `lockAllFromProbe(probe)`
- `store.plan.setAssist(pos, on)` · `setKeepDef(pos, on)` · `assistAll(on)` (v1 `ult.assist`/`keepDef` 그대로 페이로드)
- `store.altar.quickCd(on)` — on: altar.on=true, 전 층 on, 별 제단 전부 점등(off={}), 달 제단은 1012·1013만 점등(나머지 off). `store.altar.isQuickCd()` 로 표시 판정. off: altar.on=false.
- `store.materialize(probeRulesOnly)` → `turnPlans`: 잠긴 턴은 그대로, 핀이 있는 턴은 규칙 프로브의 그 턴 순서에서 핀 칸만 덮어씀(추가 행동 슬롯은 프로브 그대로). 핀·잠금 없는 턴은 포함하지 않는다(규칙으로 자동 진행).
- `store.buildCfg({mode})`: `mode:'rules'` = 핀·잠금 없이(1차 프로브용), `mode:'probe'|'run'` = materialize 결과 포함. 미리보기·실행은 **2단계**: rules 프로브 → materialize → probe/run.
### 스냅샷·코덱
- snapshot에 `pins`·`locked` 추가(비면 생략). `advOn/turnPlans`는 쓰지 않고 읽기만: `advOn=true+turnPlans` → 그 턴들을 `locked`로. 공유 코드 v2 꼬리에 pins/locked 압축 필드 추가(없으면 빈 것). 기록·초안 동일.
- 계약 테스트 추가: (1) 핀→turnPlans 구체화가 규칙 프로브 기준으로 결정적 (2) v1 코드(직접 계획·완전 수동·정해진 턴만)를 열면 pins/locked/strict가 화면 상태로 드러나고 run cfg가 v1과 동일 (3) 피드백 3사례 페이로드 유지 (4) quickCd 판정.
### UI
- `ui/plan.js`: 행(≡ · 초상 · 이름 · 방식 select · ⋯ 메뉴{성공 가정·방어 턴 유지·프리셋}) + 30칸 편집 격자(규칙 결과 연하게, 핀 진하게+핀 표식, 잠긴 턴 열은 자물쇠), 턴 머리 클릭 → 그 턴 편집 시트(순서·추가 행동 위치·잠금/해제), 패널 머리에 쿨감 제단 스위치·전원 성공 가정 스위치·초기화 ▾. 맞추기 문장형은 격자 아래 유지. 예외 턴 UI는 턴 머리 편집으로 흡수. 모바일 전치.
- `ui/manual.js` → `ui/turn-edit.js`(한 턴 편집 시트)로 축소. 완전 수동 진입 버튼·잠금 배너 제거.
- `ui/grow.js`: 머리에 "행동 계획에서 보기" 링크. `ui/cond.js`: 방탈출 제단 요약에 "쿨감 제단만" 상태 표시. 첫 방문 1회 카드(v1 이름 → 위치).
