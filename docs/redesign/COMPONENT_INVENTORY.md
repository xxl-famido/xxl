# woofia_sim v2 — 컴포넌트·아이콘 인벤토리

작성 2026-09-28. 개편 구현 기준 문서. **소스는 읽기만 했고 수정하지 않았다.**
대상: `dashboard/index.html`(447줄) · `style.css`(1475) · `mobile.css`(148) · `app.js`(5099) · `i18n.js`(3437) · `feedback.js`(136).
원칙 근거: `RESEARCH.md` §2(토큰·컨트롤·카피 원칙) · §3(요약 헤더 아코디언, FAB 흡수, 충돌 배지), `ux_audit.md` §3(클래스·토큰 현황) · §4(A=CSS만 / B=마크업 / C=app.js 영향 범위).

표기
- 위치는 `파일:함수:줄`. app.js 줄은 현재(5099줄) 기준. `index` = index.html.
- 상태 열 약어: `on`(선택·켜짐) `sel`(다중 선택) `has`(값 있음) `dis`(disabled) `dim`(흐림 비활성) `dirty`(재계산 대기) `open`(패널 열림) `cust`(사용자 변경).
- "추정" = 코드만으로 확정하지 못한 판단.
- 범위 제외: `boss.html/boss.css/boss.js`(RESEARCH §3), 가이드 본문 이미지.

---

## 0. 요약 수치

| 항목 | 수치 |
|---|---|
| 인터랙티브 컴포넌트 유형 | **23종**(요청 20종 + 드롭다운 메뉴 · FAB · 게이지/pip) |
| 버튼 클래스(정적+동적, 선택자 단위) | **46개** → v2 4계층(primary 4 · secondary 13 · ghost 18 · danger 3) + 메뉴 항목 2 · 스위치로 전환 1 · FAB 삭제 5. 토글형(pressed) 대상 10개. 세그먼트·칩·탭은 별도 계열 |
| 이모지(그림 문자) | 서로 다른 **23종**, UI 소스 등장 **60회**(index 15 · app.js 34 · i18n.js 1 · feedback.js 10). i18n.js 사전 키·값에 **추가로 약 130회** 복제 |
| 아이콘처럼 쓰는 유니코드 기호 | **19종**(▲▼✕×◈◆⇅⇄◀▶↻▾▸↗★♥✓⋮ + CSS `content:"✓"`) |
| 안내 박스·설명문 | 61항목 → (a) ⓘ 16 · (b) 헤더 요약 4(겸용 8) · (c) 인라인 28 · (d) 가이드 2(겸용 7) · (e) 삭제 11 |

---

## 1. 인터랙티브 컴포넌트 전수 목록

### 1-1. 버튼 (행동 버튼) — 계층 매핑은 §2

| 클래스 | 생성 위치 | 상태 | 크기(현재) | 모바일 차이 |
|---|---|---|---|---|
| `.btn-run` | index:103 `#runBtn` | hover(translateY −1) · active · `.busy`(app.js `run`:4618 `classList.add('busy')`) | 15px · pad 13 · r11 · 전체 폭 | mobile.css: pad 14. 설정 열 맨 아래라 첫 화면 밖 |
| `.btn-ghost` / `.btn-ghost.sm` | index:100,160-163 · app.js `openPrioPop`:1114,1155 · `renderTurnEditor`:2788 · `renderAdvUlt`:2295-2296 · `renderAdvSync`:2365 · `openAdvPop`:2478-2498 · `tdmgBodyHTML`:2973 · `ultSummaryHTML`:3417(`.ult-open`) | hover · `:disabled`(.4) · `.on`(`.adv-tools .btn-ghost.on`, 전체 보기 토글) | 기본 pad 7/12 · `.sm` 11.5px pad 5/10 + margin-top 8(문맥마다 0으로 되돌림) | 없음 |
| `.btn-danger` / `.btn-danger.ghost` | index:169-170 | hover(brightness) · `:disabled` | 13px pad 10 r10 · flex:1 | 없음. 흰 글자 on #ff7a6b = 2.55:1(감사 §3-1) |
| `.proc-btn` | index:52-54,84,417-418,434 | hover · `.on`(골드 그라데이션+글로우) · `:disabled`(제단 켜짐 시 `#forceProc`, `syncAltarLock`:3488) | 11.5px pad 6/11 r8 | 없음 |
| `.proc-btn.tdmg-btn` | index:54 | `.on`(`syncTdmgUI`:2934) · `.open` · `aria-expanded` | 동일 | 모바일은 패널 대신 팝업(`openTdmg`:2991) |
| `.altar-btn` | index:56 | hover(translateY) · `.open` · `.on`(글로우) · `aria-expanded` · `:focus-visible` 있음(유일) | min-w 96, 배경 이미지 버튼 | 모바일은 팝업(`openAltar`:3562). en에서 넘침(감사 §3-4) |
| `.adv-open` | index:91 | hover · `.on`(`syncAdvLock`:1692 추정) | 11px pad 4/9 r7 골드 틴트 | en/ja에서 줄바꿈 |
| `.spec-open` (+`.so-ic` `.so-dot`) | app.js `openModal`:4021 | hover · `.on`(점에 글로우) | 11.5px pad 5/11 | 없음 |
| `.ci-spec` · `.ci-swap` | app.js `openCmpInfo`:796 | hover · `.on`(ci-spec) | 11.5~12px pad 4/9 | 없음 |
| `.ct-prio` / `.ct-prio.ct-adv` | app.js `renderCmpLane`:773-774 · `openPrioPop`:1106 | hover · `.on`(ct-adv) | 11.5px pad 6/11 | 없음 |
| `.cmp-run` | index:436 | hover · `.dirty`(무한 펄스 `cmpPulse`, `markCmpDirty`:670) | 13px pad 11/0 r10 | 없음 |
| `.io-big` | app.js `openExportPop`:546,549 · `openImportPop`:569,572 | hover | 13px pad 12 r10 | 없음 |
| `.fb-send` | feedback.js `injectUI`:91 (CSS L73-75 주입) | hover · `:disabled` | 14px | 없음 |
| `.toast-act` | app.js `toast`:4552-4553 (createElement) | hover | 12px pad 5/11 | 없음 |
| `.plan-fill button` (`data-fill/pdef/u3/early/reflow/ukafter`) | app.js `openModal`:4044,4050 · `renderPlanPop`:1005 | hover · `.on`(프리셋 적용 중, `syncPdef`:4103) · `dis` | 10.5px pad 4/9 r6 | 없음 |
| `.cp-add` | app.js `renderCellPop`:2108 | hover · `dis` | 11px 전체 폭 | 없음 |
| `.adv-add button` | app.js `renderAdv`:2244 | hover · `dis`(+긴 title) | 11px, 16px 초상 포함 | 없음 |
| `.adv-clip button` · `.adv-selbar button` · `.adv-teamwarn button` | app.js `renderAdv`:2147,2156,2172-2173 | hover | 10.5px | 없음 |
| `.bar-trace` | app.js `barrierCompHtml`:4890 | hover(추정) | 인라인 링크형 | 없음 |
| `.hi-menu` | app.js `renderHistList`:226 | hover | 24×24 | 없음 |
| `.histmenu button` / `.danger` | app.js `openHistMenu`:276-279 | hover · `[disabled]`(잠금 시 삭제) | 12.5px | 없음 |
| `.hist-clear` | index:30 `#histManage` | hover(빨강 — 의미 오류: "관리"인데 위험색) | 30×30 | 760px 이하 라벨 숨김 |
| `.cmp-fab` `.guide-fab` `.patch-fab`(+`.pf-dot`) | index:175-177 | hover(translateY) | 11.5~12px pad 8/12~14, 3색 | mobile.css bottom 재계산, 560px 이하 patch-fab 하단 이동 |
| `.lang-fab` · `.lang-menu button`(`.on`::after ✓) | i18n.js `injectUI`:3385-3409 (CSS 주입) | hover · `.on` | 12~13px | 없음(고정 top:72) |
| `.fb-fab` · `.fb-x` | feedback.js `injectUI`:80-88 | hover | 12px / 20px | 없음 |

### 1-2. 닫기·아이콘 버튼 (전부 텍스트 글리프)

| 클래스 | 글리프 | 생성 위치 | 크기 | 비고 |
|---|---|---|---|---|
| `.mc-close` | × | index:149,184,194,404 · app.js 544,567,796,841,880,909,941,1104,3897,4016,4974 | 30×30 abs | 모바일 top/right 12 |
| `.adv-x` | ✕ | app.js `openAdvPop`:2463 · `tdmgHeadHTML`:2946 · `altarHeadHTML`:3519 | 28×28 | 고정 FAB에 덮임(치명 ②) |
| `.cp-x` · `.cp-del` | ✕ | app.js `renderCellPop`:2096,2106 | 20×20 / 20×22 | 터치 타깃 미달 |
| `.adv-row .del` | ✕ | app.js `renderAdv`:2234 | 20×22 | 〃 |
| `.slot .rm` | × | app.js `renderTeam`:1511 | 17×17, hover에서만 보임 | 모바일에서 사실상 발견 불가 |
| `.fb-x` | × | feedback.js:88 | 20px 글자 | |
| `.sw-x`(+`.sw-none`) | 없음(텍스트) | app.js `openSwapPop`:911 | 타일형 | |

### 1-3. 세그먼트 (단일 선택 버튼 그룹)

공통: `.seg` + 자식 `button[.on]`. 값은 `seg.dataset.val`(index) 또는 `data-*`(동적). 클릭 핸들러는 `bindSettings`:2810 `$$('.seg')` 일괄.

| 인스턴스 | 클래스 | 위치 | 항목 수 | 상태 | 크기·모바일 |
|---|---|---|---|---|---|
| 더미 속성 | `.seg.elseg` | index:68 `#dummyElement`, 422 `#cmpEl` | 6 | `.on`(속성색 채움) | **6개 → v2 원칙상 select 또는 속성 점 칩**(RESEARCH §2 "5개 이하") |
| 적 더미 수 | `.seg` | index:73 `#dummies`, 426 | 5 | `.on` | 12.5px pad 7/0 · 모바일 11.5px |
| 아군 피격 횟수 | `.seg` | index:78 `#enemyHits`, 430 | **7**(0~5·전체) | `.on` | 모바일 7칸 → 터치 미달. v2: 슬라이더+전체 토글 또는 select |
| 궁극기 사용 방식 | `.seg.ult-modes` | app.js `ultRowHTML`:2273,2280 · `ultSectionHTML`:3433 | 3 | `.on` + 긴 title | 12px pad 6/4 |
| 연동 멤버 행동 | `.seg.sm-base` | `renderAdvSync`:2349 | 3(긴 문구) | `.on` | 11.5px, 줄바꿈 허용 |
| 연동 순서 | `.seg.sm-ord` | `renderAdvSync`:2345 | 2 | `.on` | |
| 앵커 안 쓰는 턴 | `.seg.sm-other` | `renderAdvSync`:2351 | 2 | `.on` | |
| 미준비 시 | `.seg.as-miss` | `renderAdvSync`:2355 | 2 | `.on` | 11px pad 4/6 |
| 턴 피해 대상 | `.seg.tdmg-hits` | `tdmgBodyHTML`:2966 | 5 | `.on` | |
| 셀 편집 행동 | (클래스 없음) `button[data-a]` | `renderCellPop`:2103-2105 | 3 | `.on` · `dis`(궁 쿨) | |
| 행 행동 평/궁/방 | `.adv-row .acts button` | `renderAdv`:2223-2228 | 3 | `.on` + `[data-a]`별 색(궁=골드·방=초록) · `dis` .28 | 26×24 · 560px 이하 폭 24 |
| 플래너 칸 평/궁/방 | `.planner .acts button.a평/.a궁/.a방` · `.pp-acts button` | `renderPlanner`:4459,4468 · `renderPlanPop`:985,993 | 3 | `.on` · `dis` · `.luck`/`.luck-off`(`planUltMark`:4410) | 10px |

### 1-4. 선택형 칩 (다중/필터)

| 인스턴스 | 클래스 | 위치 | 상태 | 크기 | 비고 |
|---|---|---|---|---|---|
| 로스터 속성 필터 | `.roster-filter button` | app.js `buildFilters`:1382 | `.on`(골드 채움) | 11.5px | 직업 필터·검색 없음(RESEARCH §3에서 추가) |
| 특정 턴 칩 | `.turn-chips button` | `renderTurnChips`:2764 · `openPrioPop.renderChips`:1135 | `.sel` · `.has`(골드 테두리) · `.sel.has` | 25×25 · 모바일 24×24 | 30개 격자 |
| 타임라인 턴 레일 | `.adv-rail button` | `renderAdv`:2139 | `.sel` · `.edited`(점) · `.bad`(빨강 점) · `.rng`(구간 선택) · 조합 | 11px | 가장 상태가 많은 칩 |
| 연동 멤버 | `.as-m` | `renderAdvSync`:2338 | `.on`(오른쪽 모서리 각짐) · `dis` | 11.5px max-w 120 | 형태 학습 필요(감사 (4)) |
| 패치 필터 | `.pf-chip`(+`.pf-cdot dot-*`) | `renderFilters`:5043 | `.on`(**파랑 그라데이션** — 다른 칩과 불일치) | 12px r999 | |

### 1-5. 슬라이더 (+숫자 입력 쌍)

공통: `input[type=range]`에 `--p`로 채움 폭 전달(인라인 style, 유지 대상).

| 인스턴스 | 위치 | 값 표시 | 짝 입력 | 상태 |
|---|---|---|---|---|
| 반복 횟수 `#runs` 1~200 | index:61 | `<b id="runsVal">` | 없음 | `#runsField.dim`(확률 100% 시, `syncRunsField`:2807) |
| 진행 턴 `#turns` 1~30 | index:65 | `#turnsVal` | 없음 | 변경 시 턴 칩 재생성 |
| 피격 데미지 `#incoming` 1~99 | index:85 | `#incomingVal` | 없음 | `style.opacity=.4`(끔일 때, 인라인) |
| 비교 턴 `#cmpTurns` · 피격 `#cmpIncoming` | index:416,435 | `#cmpTurnsVal`(인라인 골드) | 없음 | |
| 도장 강화 ATK/HP | app.js `openModal`:4028-4032 · `openSealPop`:846-848 | — | `input[type=number]` 80px | 섹션 `.mc-seal.on` |
| 스펙 스타·진화·레벨·육성 | app.js `renderSpec`:3910-3931 | pip(★/♥) + 숫자 | 없음 | `.cs-body.off` |
| 스킬 레벨 `.sr-range` | `renderSpec`:3871 | `.sr-lv` | 없음 | `.sr-pin`(고정)·`.sr-need`(잠김) |
| 턴 피해 % `[data-tdpct]` | `tdmgBodyHTML`:2962 | `[data-tdpctval]` | 없음 | |

v2 원칙(RESEARCH §2): 슬라이더 옆 직접 입력 — 현재 직접 입력이 있는 곳은 도장뿐.

### 1-6. 토글 스위치

공통 마크업: `<label class="toggle"><input type="checkbox"><span class="sw"></span>라벨</label>`. `input{display:none}` → 키보드 불가(감사 A-7).

| 인스턴스 | 위치 | 크기 변형 | 상태 |
|---|---|---|---|
| 타임라인 사용 `#advSwitch` | `openAdvPop`:2473 | 기본 38×21 (style L409) | checked |
| 제단 사용 `[data-altarsw]` · 층 활성화 `[data-floorsw]` | `altarHeadHTML`:3518 · `altarBodyHTML`:3545 | 층 스위치 32×18(L1315-1320) | `.altar-floor.off` |
| 턴 피해 사용 · 턴별 사용 | `tdmgHeadHTML`:2945 · `tdmgBodyHTML`:2970 | 기본 | `.tdmg-adv.off` |
| 방어 턴 유지 `.ult-keep` · 확률 쿨 가정 `.ult-assist` | `ultRowHTML`:2275-2282 · `ultAssistHTML`:2265 · `ultSectionHTML`:3432-3435 | 기본 | `.dim`(asap일 때) |
| 턴별 행동 직접 계획 `#usePlan` · `#ppOn` | `openModal`:4043 · `openPlanPopup`:943 | 기본 · `.pp-toggle` | `dis`(타임라인 켜짐) |
| 도장 강화 `#sealOn` · `#spOn` | `openModal`:4025 · `openSealPop`:843 | `.seal-head` | |
| 스펙 사용 `#csUse` · 도장 해제 `#csRune` | `renderSpec`:3895,3880 | `.cs-rune` 30×17(L1232-1238) | `.cs-body.off` |
| **버튼형 토글(체크박스 아님)** | `.proc-btn`(확률 100%·체력 10%·피격 on/off), `.plan-fill [data-ukafter]`, `#advGridBtn` | — | `.on`만 있고 `aria-pressed` 없음 |

### 1-7. 체크 (체크박스·체크 행)

| 인스턴스 | 클래스 | 위치 | 상태 | 비고 |
|---|---|---|---|---|
| 기록 선택 | `.hist-item input[type=checkbox]` | `renderHistList`:224 | checked · `.pinned` 행 | 16px, accent-color 골드 |
| 제단 효과 행 | `li.altar-row[role=checkbox][aria-checked]` + `i.ck` | `altarBodyHTML`:3531 | `.on` · 키보드 Space/Enter(`initAltar`:3678) | 유일하게 ARIA 체크 구현 |
| 로스터 선택 표시 | `.rc.picked::before{content:"✓"}` | style L109 | — | 체크 컨트롤은 아니고 표식 |

### 1-8. select

| 인스턴스 | 위치 | 비고 |
|---|---|---|
| 상단 기록 `#history` | index:29 · 옵션 `renderHistory`:150 (📌🔒 접두) | 모바일 폭 붕괴 원인(`min-width:0` 누락) |
| 기록 정렬 `#histSort` | index:152 | `.hist-filter select` |
| 비교 A/B `.cmp-sel` | index:406,408 · 옵션 `bindCompare`:1241 | 라벨 길이 문제 |
| 연동 앵커 `.as-anchor` | `renderAdvSync`:2358 | `option[disabled]`(점유·빈 자리) |

### 1-9. 텍스트·숫자 입력

| 인스턴스 | 위치 | 비고 |
|---|---|---|
| 기록 검색 `#histSearch` | index:151 | placeholder "이름 검색…" |
| 파일 입력 `#hImportFile` | index:164 (hidden) | |
| 공유 코드 `.io-code`(textarea 추정) | `openExportPop`:548 · `openImportPop`:571 | |
| 턴별 피해 `.tdmg-row input[type=number]` | `tdmgBodyHTML`:2954 | `.tdmg-row.set` · `dis`(고급 끔) · focus 테두리 `--fire` |
| 도장 숫자 `input[type=number]` | `openModal`:4029,4032 · `openSealPop`:846,848 | focus `outline:none` |
| 피드백 `#fbText` textarea · 허니팟 `.fb-hp` | feedback.js:89-90 | |

### 1-10. 아코디언 (접힘 행)

| 인스턴스 | 헤더 클래스 | 위치 | 상태 | 비고 |
|---|---|---|---|---|
| 로그 턴 | `.turn > .turn-h`(`.tn-num` `.sum` `.tn-caret ▾`) | `renderLog`:4717-4719 | `.turn.open` | 30턴 전부 렌더 |
| 로그 행동 | `.act > .act-h` | `renderActions`:4764-4785 | `.act.open` | |
| 비데미지 계산 | `.ndl.fatk > .ndl-h`(`.ndl-caret ▾`) | `renderND`:4829,4852 · `barrierCalcHtml`:4893,4897 | `.open` | |
| 패치 릴리스 | `.pr > .pr-head`(`.pr-caret ▼`) | `render`:5060-5089 | `.collapsed` | 마이너 기본 접힘 |
| 플래너 영역 | `#plannerWrap[hidden]` | `openModal`:4045 | 토글로 보이기 | 아코디언이라기보다 조건부 노출 |
| **설정 열 섹션** | 없음 | — | — | **v2 신설**(§5) |

### 1-11. 탭

| 인스턴스 | 클래스 | 위치 | 상태 | 모바일 |
|---|---|---|---|---|
| 행동 고급 설정 3탭 | `.adv-tabs > button[role=tab][data-advtab]` | `openAdvPop`:2465-2468 · 상태 `renderAdv`:2115-2118 | `.on` + `aria-selected`(설정됨) · 화살표 키 이동 없음 | 가로 스크롤 없음 → en 3번째 탭 잘림 |
| 제단 ↔ 턴 피해 "패널 탭" | `.altar-side` / `.tdmg-side` 교체 | `swapSide`:2987 | `.swap-out` `.in` | 모바일 팝업 |

### 1-12. 모달 · 팝오버 · 시트

| 종류 | 루트 / 카드 클래스 | 위치 | 열림 상태 | z-index(감사) | 모바일 |
|---|---|---|---|---|---|
| 캐릭터 상세 모달 | `.modal#modal` / `.modal-card el-*` + `.modal-wrap.with-spec` | index:135 · `openModal`:4009 | `hidden` 해제 | 80 | 96vw |
| 스펙 패널(사이드 시트) | `.specpanel`(+`.closing`) | index:141 · `renderSpec`:3842 | `hidden` | — | ≤1080px 우측 시트 |
| 기록 관리 | `.modal#histModal` / `.hist-card` | index:146 | hidden | 80 | 96vw |
| 기록 항목 메뉴 | `.histmenu`(드롭다운) | `openHistMenu`:274 | 존재 | 200 | |
| 내보내기/가져오기 | `.iopop` / `.io-card` | `openExportPop`:543 · `openImportPop`:566 | 존재 | 140 | |
| 패치 히스토리 | `.modal#patchModal` / `.patch-card` | index:181 | hidden | 80 | |
| 가이드 | `.modal#guideModal` / `.guide-card` | index:191 | hidden | 80 | 96vw |
| 조합 비교 | `.modal#cmpModal` / `.cmp-wrap > .cmp-card + .cmp-setcard` | index:399 | hidden | 80 | 세로 1단 |
| 비교 캐릭터 정보 | `.cmpinfo` / `.ci-card`(+`.ci-spanel`) | `openCmpInfo`:790 | 존재 | 120 | |
| 비교 도장 | `.sealpop` / `.sp-card` | `openSealPop`:840 | | 140 | |
| 비교 추가/교체 | `.swappop` / `.sw-card` | `openAddPop`:879 · `openSwapPop`:908 | | 140 | |
| 비교 계획 | `.planpop` / `.pp-card` | `openPlanPopup`:940 | | 130 | |
| 비교 우선순위 | `.priopop` / `.pr-card` | `openPrioPop`:1103 | | 140 | |
| 행동 고급 설정 | `.advpop` / `.adv-card[role=dialog][aria-modal]` | `openAdvPop`:2458 | 배경 `inert` | 150 | ≤560px 전체 폭 |
| 격자 칸 편집 팝오버 | `.adv-cellpop` | `renderCellPop`:2083 | | 160 | |
| 제단 설정 | 데스크톱 `aside.altar-side > .altar-inner` / 모바일 `.advpop.altar-modal > .adv-card.altar-card` | `openAltar`:3562-3581 | `.wrap.altar-open` | 150(모바일) | ≤900px 팝업 |
| 턴 피해 설정 | `aside.tdmg-side` / `.advpop.tdmg-modal` | `openTdmg`:2991-3009 | 동일 | 동일 | 동일 |
| 소스 팝오버 | `.srcpop` | `showSource`:4946 | | 90 | |
| 피드백 | `.fb-modal(.open)` / `.fb-card` | feedback.js:83 | `.open` | 60 | |
| 언어 메뉴 | `.lang-menu(.open)` | i18n.js:3403 | `.open` | 33 | |
| 부팅 오버레이 | `#boot > .boot-box` | index:13 | | 200 | |

카드 15종 · 오버레이 8종(감사 §3-2)과 일치. v2: **모달 1종 + 팝오버 1종 + 사이드/바텀 시트 1종**으로 선언 통합.

### 1-13. 토스트

| 인스턴스 | 위치 | 상태 | 비고 |
|---|---|---|---|
| `#toast`(+`.ti ⚠` 아이콘, `.toast-act`) | `toast`:4547 (createElement), 호출 63곳 | `.show` | 모든 토스트에 ⚠ 아이콘 고정(정보성도 경고 아이콘) |
| `.up-toast` | `notifyUpdate`:4560 | 무한 펄스 `upPulse` | 🔄/⚠️ 문자 아이콘 |

### 1-14. 툴팁

| 종류 | 위치 | 비고 |
|---|---|---|
| 네이티브 `title` | index 13곳 · app.js 약 40곳(§4-3) | 터치 불가. v2: ⓘ 툴팁(탭 가능) 또는 삭제 |
| 차트 호버 `.chart .tip`(`.tip-h` `.tip-row` `.tip-ic` `.tip-nm` `.tip-dv`) | `renderResults`:4694-4699 | 숨김 상태에서도 폭 차지 → 모바일 가로 넘침(치명 ①) |
| 비교 차트 `.cc-tip` `.cc-cursor` `.cc-dot` | `cmpCursor`:1193 | |
| 소스 팝오버 `.srcpop`(`.sp-h` `.sp-row` `.sp-v` `.sp-tip`) | `showSource`:4943 | 클릭형 |

### 1-15. 드래그 목록

| 인스턴스 | 위치 | 상태 | 모바일 대체 |
|---|---|---|---|
| 행동 우선순위 `ol.prio > li` | `renderPrio`:2738 · `makeDraggable`:2717 | `.cust` · `.dragging` · `.over` | `.mv-col > .mv ▲▼`(30×20) |
| 특정 턴 순서 `#turnEditor ol.prio` | `renderTurnEditor`:2775 | 동일 | 동일 |
| 비교 우선순위 `#prPrio` | `openPrioPop.renderList`:1118 | 동일 | 동일 |
| 타임라인 행동 `.adv-track > .adv-step[draggable]` | `renderAdv`:2215 · 드래그 `openAdvPop`:2630 | `.granted` · `.dragging` · `.over` | `.adv-row .mv ▲▼`(20×22) |
| 비교 셀 `.cmp-cell[draggable]` | `cmpCell`:744 | | `.cc-mv ▲▼`(20×17) |

### 1-16. 슬롯 카드

| 인스턴스 | 클래스 | 위치 | 상태 | 모바일 |
|---|---|---|---|---|
| 팀 슬롯 | `.slot` / `.slot.filled.el-*` (`.pos` `.empty` `.nm` `.rm` `.spec-badge`) | `renderTeam`:1501 | hover · `.target`(빈 슬롯 지정) · 속성색 테두리 | `.nm` 10px, `.rm` hover 전용 |
| 비교 셀 | `.cmp-cell el-*`(`.cc-n` `.cc-d` `.cc-mv`) / `.cmp-cell.empty` | `cmpCell`:741 | `.pend` | 수치 겹침(치명 ③) |
| 로그 행동 카드 | `.act` / `.act.hitgrp` / `.act.enemy-grp` | `renderActions`:4747 | `.open` | |

### 1-17. 로스터 타일

| 인스턴스 | 클래스 | 위치 | 상태 | 모바일 |
|---|---|---|---|---|
| 로스터 | `.rc.el-*`(`img` `.dot`) | `renderRoster`:1386 | hover(translateY −2) · `.picked`(골드 outline + ✓) | minmax(56px) |
| 교체/추가 후보 | `.sw-ic.el-*`(`.cur`) | `openAddPop`:877 · `openSwapPop`:905 | hover · `.cur` · `dis` | |
| 패치 얼굴 | `.pr-face` `.pi-face` | `faces`:5034 · `render`:5064 | — | 비인터랙티브 |

`<div>` 클릭 요소(키보드 불가): `.slot`, `.rc`, `.cmp-cell`, `.ci-r.tap`(감사 C-1).

### 1-18. 차트

| 인스턴스 | 클래스 | 위치 | 비고 |
|---|---|---|---|
| 턴별 데미지 막대 | `.chart > .col > .bar > .seg-el`(속성색 누적) | `renderResults`:4690-4701 | 축·눈금 없음, 같은 속성 구분 불가 |
| 기여 랭킹 막대 | `.rbar el-*`(`.rk` `.pic` `.track>.fill` `.lab` `.role` `.val`) | `renderResults`:4676-4684 | 폭 rAF 애니메이션 |
| 비교 누적 곡선 | `.cmp-chart`(`.cc-plot` `.cc-grid` `.cc-axis` `.ln-a/.ln-b` `.cc-leg .lg`) | `renderCmpChart`:1172 | 축 라벨 중복 버그(감사 C) |

### 1-19. 표·로그 행

| 인스턴스 | 클래스 | 위치 |
|---|---|---|
| 로그 턴 요약 | `.turn-h .sum .s-val.dmg/.heal/.bar` | `renderLog`:4718 |
| 로그 행동 헤더 | `.act-h`(`.ai` `.an` `.ak` `.at` `.atkr` `.hit-arrow`) | `renderActions`:4762-4785 |
| 히트 행 | `.hit`(`.hit-top` `.hit-tgt` `.hm` `.num` `.formula` `.elemx`) | `renderHit`:4900-4940 |
| 계산식 채널 칩 | `.chan` / `.chan-static` | `chan`:4859 |
| 피격 행 | `.ndl.indmg`(`.in-top` `.in-lbl` `.in-dmg` `.in-bar .in-seg.lost/.remain` `.in-brk`) | `renderIncoming`:4790 |
| 배리어 구성 | `.bar-comp` `.bar-dep` `.bc-src` | `barrierCompHtml`:4885 |
| 기록 목록 행 | `.hist-item`(`.hi-label` `.hi-date` `.hi-menu`) | `renderHistList`:218 |
| 비교 행 | `.cmp-row`(`.cmp-awrap` `.cmp-mid` `.cmp-bwrap`) · `.cmp-total` | `renderCmpLane`:747 |
| 스펙 행 | `.cs-row`(`.sr-ic` `.sr-n` `.sr-lv` `.sr-range`) | `renderSpec`:3884 |
| 전체 보기 격자 | `.adv-grid .g-head/.g-row > u`(`.g-atk/.g-ult/.g-def/.g-none`) | `renderAdvGrid`:2051 |
| 비교 도장/정보 행 | `.ci-r(.tap/.locked)` `.seal-row` | `openCmpInfo`:799 · `openModal`:4027 |
| 패치 항목 | `.pr-item`(`.pi-tag dot-*` `.pi-text` `.pi-details`) | `render`:5074 |

### 1-20. 배지·태그 (비인터랙티브)

| 클래스 | 위치 | 용도 |
|---|---|---|
| `.tag` / `.tag.el` | `openModal`:4019 · `openCmpInfo`:795 · `openSkillFromSource`:4973 | 속성·직업·포지션 |
| `.ak` / `.ak-hit` / `.ak-${KCLASS}` | `renderActions`:4766-4783 | 행동 종류(보통공격·필살기…) |
| `.gtag` / `.gtag.bad` | `renderAdv`:2220-2222 | "추가" · "실행 안 됨" · "N(으)로 나감" |
| `.spec-badge` | `renderTeam`:1508 | ★N (스펙 사용 중) |
| `.pr-badge cat-*` | `badge`:5015 | 패치 분류 |
| `.sk-pin` | `renderSkills`:4530 | "1레벨 고정" |
| `.sr-need` `.sr-pin` | `renderSpec`:3868-3869 | 스타 해금 조건 |
| `.hit-ctr` | `renderHit`:4938 | 🗡 반격 |
| `.in-red rd-def/rd-take/rd-deal` | `renderIncoming`:4804-4807 | 🛡/🗡 감소 채널 |
| `.adv-scope` | `openAdvPop`:2462 | 비교군 A/B |
| `.pf-dot`(새 패치 점) · `.so-dot`(스펙 점) · `.dot`(로스터 속성 점) | index:177 · `openModal`:4022 · `renderRoster`:1394 | 표식 점 |

### 1-21. 안내 박스 — 목록·처리는 §4

`.hint` `.adv-hint` `.adv-note(.lock/.warn)` `.adv-order` `.adv-lock` `.pr-lock` `.adv-clip` `.adv-selbar` `.adv-teamwarn` `.adv-railwarn` `.adv-warn` `.adv-empty` `.altar-hint` `.altar-note` `.ult-sync` `.ult-lock` `.ult-desc` `.sg-flow` `.sm-note` `.sm-fixed` `.cs-hint` `.cs-note` `.te-head` `.plan-legend` `.cmp-hint` `.g-note` `.g-intro` `.empty-state` `.hist-empty` `.patch-empty` — 30개 클래스(감사의 "15종"은 행동 고급 설정·제단 계열만 센 수).

### 1-22. 드롭다운 메뉴 (추가 유형)

`.histmenu`(`openHistMenu`:272), `.lang-menu`(i18n.js:3403). v2 상단바 "≡ 메뉴"·"기록 ▾"가 같은 컴포넌트를 쓰도록 통합.

### 1-23. FAB · 게이지/pip (추가 유형)

- FAB 6개: `.cmp-fab` `.guide-fab` `.patch-fab` `.lang-fab` `.fb-fab` + `.last-update`(텍스트). v2 = 전부 상단바로 흡수(RESEARCH §3).
- pip: `.cs-pips.star .pip(.lit)` ★ · `.cs-pips.bond .pip` ♥ (`renderSpec`:3909,3930, `specSyncStats`:3997).
- 게이지: `.in-bar`(배리어 잔량), `.seal-ratio`/`.cs-ratio`(도장 비율), `.rbar .track`.

---

## 2. 버튼 계층 매핑표

### 2-1. v2 계층 정의 (토큰 1단계에서 확정할 값의 틀)

| 계층 | 용도 | 시각(제안) | 한 화면 개수 |
|---|---|---|---|
| **primary** | 화면의 주 행동 1개 | 강조색 단색 채움, 글자 `--on-accent`. 그라데이션·글로우·hover 이동 없음 | 1개 |
| **secondary** | 보조 행동·패널 진입 | 표면색(`--panel2`) + 1px 보더 | 제한 없음 |
| **ghost** | 도구·되돌리기·아이콘 버튼 | 배경 투명, hover 때만 표면색 | 제한 없음 |
| **danger** | 삭제 확정 | 빨강 채움(대비 4.5:1 이상 재계산) 또는 danger-ghost(빨강 글자+투명) | 1개 |
| 크기 | sm 28px / md 36px / lg 44px(모바일은 sm도 터치 영역 44px) | 폰트 12/13/14, 라운드 6 | |
| **토글형(pressed)** | 켜고 끄는 버튼 | `aria-pressed="true"` 시 강조색 2px 링 또는 강조색 틴트 배경. 채움 금지(primary와 구분) | |

### 2-2. 매핑

"선언만 통합" = style.css 선택자 묶음으로 끝남(ux_audit §4-A-11). "마크업" = index.html 변경 필요(§4-B). "JS" = app.js/외부 JS 문자열 변경 필요(§4-C).

| 현재 클래스 | 역할 | v2 계층 | 크기 | 토글형 | 통합 방식 | 비고 |
|---|---|---|---|---|---|---|
| `.btn-run` | 시뮬레이션 실행 | primary | lg | — | 선언만 | sticky 배치는 마크업(B) |
| `.cmp-run` | 비교하기 | primary | md | — | 선언만 | `.dirty` 펄스 → 정적 점 표식 |
| `.io-big` | 파일 저장·코드 복사·파일 선택·코드로 가져오기 | 첫 번째 primary, 나머지 secondary | md | — | **JS** | 한 팝업에 골드 버튼 2개 → 한쪽을 secondary로 바꾸려면 클래스 추가 필요 |
| `.fb-send` | 피드백 보내기 | primary | md | — | **JS**(feedback.js 주입 CSS 제거·토큰 스타일시트 이관) | |
| `.toast-act` | 토스트 "되돌리기" | ghost(강조색 글자) | sm | — | 선언만 | |
| `.btn-ghost` | 일반 도구 | secondary | md | — | 선언만 | 이름은 ghost지만 역할은 보조 |
| `.btn-ghost.sm` | 기본값으로·복사·붙여넣기·되돌리기 등 24곳 | ghost | sm | `#advGridBtn.on` | 선언만 | `margin-top:8px` 기본값 제거하고 문맥 여백으로 |
| `.btn-danger` | 선택 삭제 | danger | md | — | 선언만 | 대비 수정 |
| `.btn-danger.ghost` | 선택 제외 삭제 | danger(ghost 변형) | md | — | 선언만 | |
| `.histmenu button.danger` | 기록 삭제 | danger(메뉴 항목) | — | — | 선언만 | |
| `.proc-btn`(#forceProc · #hp10Btn · #cmpForce · #cmpHp10) | 모드 토글 | secondary | sm | **예** | 선언 + **마크업·JS**(`aria-pressed` 추가: index 4곳, `bindSettings`:2820-2826, `syncCommon`) | 채움 on → pressed 링 |
| `.proc-btn`(#incomingBtn · #cmpIncomingBtn) | 피격 데미지 켬/끔 | → **토글 스위치로 변경** | — | — | **마크업+JS**(텍스트 "💥 켬/끔" 교체: `bindSettings`:2834, `applySnap`:196, `bindCompare`:1286) | 버튼 글자로 상태를 말하는 패턴 제거 |
| `.proc-btn.tdmg-btn` | 턴 피해 패널 열기 | secondary | sm | 켜짐=점 표식, 열림=`aria-expanded` | 선언만(점은 CSS ::after) | |
| `.altar-btn` | 제단 패널 열기 | secondary | md | 동일 | **마크업**(배경 이미지 버튼 → 아이콘+라벨) | en 넘침 해결 |
| `.adv-open` | 행동 고급 설정 열기 | secondary | sm | `.on`=점 표식 | 선언만 | |
| `.spec-open` | 캐릭터 스펙 설정 열기 | secondary | sm | `.on`=점 표식(`.so-dot` 재사용) | 선언만(◈ 제거는 JS) | |
| `.ci-spec` | 비교 스펙 | secondary | sm | `.on` | 선언만 | |
| `.ci-swap` | 비교 교체 | secondary | sm | — | 선언만 | hover 골드 그라데이션 제거 |
| `.ct-prio` / `.ct-prio.ct-adv` | 비교 우선순위 / 고급 설정 | secondary | sm | `.ct-adv.on` | 선언만 | |
| `.plan-fill button` | 모두 평타·모두 방어·패시브 방어·3턴궁·첫 궁 당기기·궁 간격 맞추기·욱영 | ghost | sm | **예**(pdef·u3·early·ukafter) | 선언 + JS(`aria-pressed`: `syncPdef`:4103, `renderPlanPop`:1005) | 즉시 실행(fill·reflow)과 토글(pdef·u3·early)이 같은 모양 → 토글만 pressed |
| `.cp-add` | 셀 행동 추가 | secondary | sm | — | 선언만 | |
| `.adv-add button` | 행동 추가(캐릭터별) | secondary | sm | — | 선언만 | |
| `.adv-clip button` · `.adv-selbar button` | 비우기·선택 해제 | ghost | sm | — | 선언만 | |
| `.adv-teamwarn button` | 기본값으로 다시 시작·그대로 두기 | 첫째 secondary · 둘째 ghost | sm | — | **JS**(구분 클래스 없음) | |
| `.bar-trace` | "N턴 ↗" 로그 이동 | ghost(링크형) | sm | — | 선언만 | |
| `.hi-menu` | 기록 ⋮ | ghost 아이콘 | sm | — | 선언만(글리프는 JS) | |
| `.hist-clear` | 기록 관리 ⚙ | ghost 아이콘 | md | — | 선언 + 마크업(아이콘) | hover 빨강 제거 |
| `.histmenu button` | 이름 변경·고정·잠금 | 메뉴 항목 | — | — | 선언만 | 이모지는 JS |
| `.lang-menu button` | 언어 선택 | 메뉴 항목 | — | `.on` ✓ | **JS**(i18n.js 주입 CSS) | |
| `.mc-close` `.adv-x` `.cp-x` `.fb-x` | 닫기 | ghost 아이콘 | md(28~30 → 32, 터치 44) | — | 선언만(× ✕ 글리프 교체는 JS) | 5종 → 1종 |
| `.cp-del` `.adv-row .del` | 행동 삭제 | ghost 아이콘(hover 빨강) | sm | — | 선언만 | |
| `.slot .rm` | 슬롯에서 빼기 | ghost 아이콘 | sm(터치 44) | — | 선언 + 모바일 상시 표시 | |
| `.mv`(`.prio .mv`) · `.adv-row .mv button` · `.cc-mv button` | ▲▼ 순서 이동 | ghost 아이콘 | sm | — | 선언만(글리프는 JS) | 3종 → 1종 |
| `.cmp-fab` `.guide-fab` `.patch-fab` `.lang-fab` `.fb-fab` | 전역 기능 | **삭제 → 상단바 ghost 버튼/메뉴** | — | — | **마크업+JS**(i18n.js·feedback.js 주입 위치) | RESEARCH §3 |
| `.adv-tabs button` | 탭 | (탭 컴포넌트) | — | `aria-selected` | 선언만 | 화살표 키는 JS |
| `.seg button` 계열 11종(§1-3) | 단일 선택 | (세그먼트 컴포넌트) | sm/md | `.on` → `aria-pressed` 또는 radio | 선언만(+JS에서 aria 추가 권장) | 6~7칸 세그먼트는 마크업 변경 |
| `.adv-row .acts button` · `.planner .acts button` · `.pp-acts button` · 셀 편집 `button[data-a]` | 평/궁/방 | (세그먼트 소형) | sm | `.on` | 선언만 | 행동색(평=중립·궁=강조·방=상태색) 한 규칙으로 |
| `.roster-filter button` `.turn-chips button` `.adv-rail button` `.as-m` `.pf-chip` | 칩 | (칩 컴포넌트) | sm | `.on/.sel/.has/.edited/.bad/.rng` | 선언만 | pf-chip 파랑 그라데이션 제거 |
| `.sw-ic` | 교체 후보 타일 | (타일 컴포넌트) | — | `.cur` | 선언만 | |

집계(세그먼트·칩·탭 계열 제외): 버튼 클래스 **46개** → primary 4(`.btn-run` `.cmp-run` `.io-big` `.fb-send`) · secondary 13 · ghost 18 · danger 3 · 메뉴 항목 2(`.histmenu button` `.lang-menu button`) · 스위치로 전환 1(피격 on/off) · 삭제 5(FAB). 토글형 pressed 대상 10개(`.proc-btn` `.tdmg-btn` `.altar-btn` `.adv-open` `.spec-open` `.ci-spec` `.ct-adv` `.plan-fill` `#advGridBtn` `.lang-menu`). **선언만 통합 가능 = 32개**, **마크업·JS 필요 = 14개**(`.io-big` `.fb-send` `.proc-btn` aria / 피격 스위치 / `.altar-btn` / `.plan-fill` aria / `.adv-teamwarn` / `.hist-clear` 아이콘 / `.lang-menu` / FAB 5).

---

## 3. 이모지·기호 → 아이콘 치환표

Lucide 이름은 lucide.dev 기준(ISC). 처리 구분: **아이콘** = SVG로 교체 · **제거** = 장식이라 삭제 · **문구 수정** = 텍스트에 섞인 이모지를 문장째 고침 · **유지** = 텍스트 기호로 남김.
i18n 주의: i18n.js `RES.*.EXACT`의 키가 이모지를 포함한다(예 `'🎲 확률 100%'`, `'💥 끔'`, `'⇅ 행동 우선순위'`). 마크업에서 이모지를 빼면 **해당 EXACT 키도 이모지 없는 문자열로 바꿔야 번역이 끊기지 않는다**(4개 언어 × 항목, 표의 "i18n" 열).

### 3-1. 그림 문자(이모지) 23종 · 60회

| # | 문자 | 위치(파일:줄) | 의미·문맥 | 처리 | Lucide | i18n 키 수정 |
|---|---|---|---|---|---|---|
| 1 | 🎲 | index:52,417 | 확률 100% 모드 버튼 | 아이콘 | `dices` | EXACT `'🎲 확률 100%'` (i18n:424 외 3) |
| 2 | ❤️ | index:53,418 | 체력 10% 모드 버튼 | 아이콘 | `heart-pulse` | `'❤️ 체력 10%'` (i18n:425 외 3) |
| 3 | 🩸 | index:54 | 턴 피해 패널 버튼 | 아이콘 | `droplet` | `'🩸 턴 피해'` (i18n:202,429 외) |
| 4 | 🩸 | app.js `renderIncoming`:4799 | 로그 "배리어 없음 · HP −N" | 아이콘(12px 인라인) | `heart-crack` | EXACT 해당 PAT 확인 필요(추정) |
| 5 | 💥 | index:84,434 · app.js `applySnap`:196 · `bindCompare`:1286 · `bindSettings`:2834(각 켬/끔 2회) | 피격 데미지 켬/끔 버튼 글자 | **토글 스위치로 교체 → 제거** | (필요 시 `shield-alert`) | `'💥 끔'` `'💥 켬'` (i18n:443-444 외) |
| 6 | ⚔️ | index:175 | 조합 비교 FAB | 아이콘(상단바) | `git-compare-arrows` (대안 `columns-2`) | `'⚔️ 조합 비교하기'` (i18n:521 외) |
| 7 | ⚔️ | index:379 | 가이드 본문 "⚔️ 조합 비교하기 버튼" | 문구 수정 | — | 가이드 본문 문구 "상단바의 [조합 비교]" |
| 8 | 📖 | index:176 | 가이드 FAB | 아이콘 | `book-open` | `'📖 가이드'` (i18n:510 외) |
| 9 | 📖 | index:194 | 가이드 모달 제목 | 제거 | — | `'📖 시뮬레이터 가이드'`(i18n:511 외) |
| 10 | 📜 | index:177 | 패치 히스토리 FAB | 아이콘(메뉴 항목) | `scroll-text` | `'📜 패치 히스토리'` (i18n:512 외) |
| 11 | 📜 | index:184 | 패치 모달 제목 | 제거 | — | 동일 키 계열 |
| 12 | ⚙ | index:30 `#histManage` | 기록 관리(선택 삭제) | 아이콘 | `list-checks` (톱니는 "설정" 오해) | 없음(글자만) |
| 13 | ⚠️ | index:394 | 가이드 마지막 g-note | 제거(경고 스타일로) | — | i18n:361 외 |
| 14 | ⚠ | app.js `toast`:4550 `.ti` | 모든 토스트 앞 | 아이콘(유형별) | 정보 `info` · 경고 `triangle-alert` · 성공 `check` | 없음 |
| 15 | ⚠️ | app.js `notifyUpdate`:4565 | "옛 버전을 쓰고 있어요" | 아이콘 | `triangle-alert` | i18n PAT 확인(추정) |
| 16 | 🔄 | app.js `notifyUpdate`:4566 · `hardReload`:4573 | 새 버전 배포·새로고침 중 | 아이콘 | `refresh-cw` / 진행 중 `loader-circle` | `'🔄 새 버전이 배포됐어요 —'`(i18n:411 외) |
| 17 | 📌 | app.js `renderHistory`:150 · `renderHistList`:223 · `bindCompare`:1241 | 기록 이름 앞 고정 표식(select option 안) | option 안은 SVG 불가 → **제거**, 목록 행은 아이콘 | `pin` | 없음(prefix) |
| 18 | 📌 | app.js `openHistMenu`:277 | 메뉴 "상단 고정/고정 해제" | 아이콘 | `pin` / `pin-off` | `'📌 상단 고정'` `'📌 고정 해제'`(i18n:564 외) |
| 19 | 🔒 | app.js :150,223,1241 | 기록 잠금 표식 | 17과 같음 | `lock` | 없음 |
| 20 | 🔒/🔓 | app.js `openHistMenu`:278 | 메뉴 잠금/잠금 해제 | 아이콘 | `lock` / `lock-open` | `'🔒 잠금'` `'🔓 잠금 해제'`(i18n:565 외) |
| 21 | ✏️ | app.js `openHistMenu`:276 | 이름 변경 | 아이콘 | `pencil` | i18n:562 외 |
| 22 | 🗑️ | app.js `openHistMenu`:279 | 삭제 | 아이콘 | `trash-2` | i18n:563 외 |
| 23 | 📁 | app.js `openExportPop`:546 | 파일로 저장 | 아이콘 | `file-down` | i18n:559 외 |
| 24 | 📁 | app.js `openImportPop`:569 | 파일 선택 | 아이콘 | `file-up` | i18n:560 외 |
| 25 | 📋 | app.js `openExportPop`:549 | 코드 복사 | 아이콘 | `clipboard-copy` | i18n:561 외 |
| 26 | 🛡 | app.js `renderIncoming`:4797 | "🛡 남은 배리어 N / M" | 아이콘 | `shield` | PAT 확인(추정) |
| 27 | 🛡 | app.js :4804-4806 `.in-red` | 방어 −50% · 받는뎀 감소 배지 | 아이콘 | `shield` | `'방어 −50%'`(i18n:656) 등 |
| 28 | 🗡 | app.js :4807 `.in-red rd-deal` | 공격자 주는뎀 감소 | 아이콘 | `sword` | PAT |
| 29 | 🗡 | app.js `renderHit`:4938 `.hit-ctr` | 반격 배지 | 아이콘 | `reply` (대안 `sword`) | PAT |
| 30 | 💤 | app.js `renderHit`:4928 | 수면 추가 피해 채널 | 아이콘(추정: Lucide에 zzz 없음) | `moon` | PAT |
| 31 | 🌐 | i18n.js `injectUI`:3405 | Language FAB | 아이콘(상단바 메뉴) | `languages` | 없음 |
| 32 | 💬 | feedback.js:20-24(5개 언어 `fab`) | 피드백 FAB | 아이콘(메뉴 항목) | `message-square` | feedback.js T 사전 |
| 33 | 🙌 | feedback.js:20-24(5개 언어 `ok`) | 전송 완료 문구 끝 | 문구 수정 | — | "보냈습니다. 확인 후 반영하겠습니다." |

(행 번호는 문맥 단위라 33행이지만 문자 종류는 23종, 등장 60회.)

### 3-2. 아이콘처럼 쓰는 유니코드 기호

| 기호 | 위치(파일:줄) | 의미·문맥 | 처리 | Lucide |
|---|---|---|---|---|
| × | index:149,184,194,404 · app.js `.mc-close` 11곳 · `renderTeam`:1511 `.rm` · feedback.js:88 | 닫기 / 빼기 | 아이콘 | `x` |
| × | app.js `renderND`/`renderHit`/`chan`/`barrierCalcHtml` 4801~4940 · index:67,254 | 계산식 곱셈 | **유지**(텍스트, tabular) | — |
| ✕ | app.js 911,2096,2106,2234,2463,2946,3519 · index:299(가이드 설명) | 닫기·행동 삭제 | 아이콘(가이드 문구는 "삭제 버튼"으로 문구 수정) | `x` |
| ▲ ▼ | app.js `mvArrows`:2735-2736 · `renderAdv`:2231-2232 · `renderCmpLane`:748 | 순서 이동 | 아이콘 | `chevron-up` / `chevron-down` |
| ▲▼ | app.js `openPrioPop`:1109 "(드래그·▲▼)" · index:279,299(가이드) · i18n:326,340,453 | 설명문 속 기호 | 문구 수정(괄호 설명 삭제, §4) | — |
| ▼ | app.js `render`:5081 `.pr-caret` | 패치 릴리스 접기 | 아이콘 | `chevron-down` |
| ▾ | app.js `renderLog`:4719 · `renderND`:4829,4852 · `barrierCalcHtml`:4893,4897 | 로그 펼침 | 아이콘 | `chevron-down`(열림 시 rotate 180, 150ms) |
| ▸ | app.js `openCmpInfo`:799,803 · `updateCiStats`:833 · `openPlanPopup`:954 | "ON ▸" "수동 ▸" 다음 단계 열기 | 아이콘 | `chevron-right` |
| ◀ ▶ | app.js `midHtml`:739 · `renderCmpLane`:775 "높은 쪽 ◀▶" | 비교에서 높은 쪽 방향 | 아이콘 | `chevron-left` / `chevron-right`(또는 A/B 색 점) |
| ↻ | app.js `midHtml`:734 · `renderCmpLane`:750 | 재계산 대기 | 아이콘 | `refresh-cw`(정적. 회전 애니메이션 금지) |
| ⇅ | app.js `renderCmpLane`:773-774 | 행동 우선순위 버튼 | 아이콘 | `arrow-up-down` · i18n `'⇅ 행동 우선순위'`(i18n:451 외) |
| ⇄ | app.js `openCmpInfo`:796 | 교체 버튼 | 아이콘 | `arrow-left-right` · i18n `'⇄ 교체'`(i18n:608 외) |
| ◈ | app.js `openModal`:4022 `.so-ic` · `openCmpInfo`:796 · index:214(가이드) | 스펙 설정 | 아이콘 | `sliders-horizontal` · i18n `'◈ 캐릭터 스펙 설정'`(i18n:218 외 32회) |
| ◆ | app.js `openPrioPop`:1106 | 비교 행동 고급 설정 | 아이콘 | `list-ordered` (메인 `.adv-open`과 같은 아이콘) |
| ↗ | app.js `barrierCompHtml`:4890 | "N턴 ↗" 로그로 이동 | 아이콘 | `arrow-up-right` |
| ★ | app.js `renderTeam`:1508 `.spec-badge` · `renderSpec`:3909 pip · 3919 문구 · i18n:272 | 스타 등급 | 배지·pip는 아이콘, 문구는 "스타 5" | `star` |
| ♥ | app.js `renderSpec`:3930 pip | 육성도 | 아이콘 | `heart` |
| ✓ | style.css:109 `.rc.picked::before` · i18n.js:3400 `.lang-menu button.on::after` | 선택됨 | 아이콘(CSS mask 또는 SVG) | `check` |
| ⋮ | app.js `renderHistList`:226 · i18n:385(가이드 영문) | 기록 항목 메뉴 | 아이콘 | `ellipsis-vertical` |
| → | app.js `renderActions`:4765 `.hit-arrow` · `syncFlowHTML`:2315 · `#logOrder`(4675) · index:96 | 공격자→대상, 행동 흐름 | **유지**(텍스트 흐름) · `.hit-arrow`만 아이콘 `arrow-right` 선택 | — |
| − ≥ ≈ ≧ ▏ | app.js 4797~4908, 4617 등 | 수식·수치 | 유지 | — |
| ─ ═ | 전 파일 주석 | 주석 구분선 | 대상 아님 | — |
| ‧ ⁴ ⁸ | i18n.js 번역 문자열·주석 | 텍스트 | 유지 | — |

### 3-3. 새로 필요한 아이콘(현재 이모지 없음, v2 구조 변경으로 필요)

| 자리 | Lucide | 근거 |
|---|---|---|
| ⓘ 도움말 툴팁 트리거 | `info` | §4 (a) 분류 전부 |
| 아코디언 헤더 펼침 | `chevron-down` | §5 |
| 섹션 초기화 | `rotate-ccw` | §5 "표식 점 + 초기화" |
| 드래그 핸들 | `grip-vertical` | "(드래그로 순서 변경)" 문구 삭제 대체 |
| 상단바 ≡ 메뉴 | `menu` | RESEARCH §3 |
| 기록 ▾ | `history` + `chevron-down` | RESEARCH §3 |
| 테마 | `sun` / `moon` | RESEARCH §3 메뉴 |
| 로스터 검색 | `search` | RESEARCH §3 |
| 필터 초기화 | `x` | 〃 |
| 로딩 스피너 `.spin` | `loader-circle` | 현재 CSS 스피너 |
| 충돌 배지 | `triangle-alert` | §5 "⚠ 충돌 1" |
| 제단 별/달 | 현재 `icons/altar_star.webp` `altar_moon.webp` **유지**(게임 고유 이미지) | 아이콘 치환 대상 아님 |

---

## 4. 안내 박스·설명문 인벤토리

분류: **(a)** 라벨만 남기고 ⓘ 툴팁 · **(b)** 아코디언 헤더 요약으로 대체 · **(c)** 인라인 경고/상태로 유지 · **(d)** 가이드로 이동 · **(e)** 삭제.
제안 문구는 구체 동사+명사, 친근체("~해요")·em dash 제거. (c)는 "조건이 참일 때만 보이는 한 줄"이 기준.

### 4-1. 라벨 속 `<em>` 설명

| # | 위치 | 현재 | 분류 | 제안 |
|---|---|---|---|---|
| 1 | index:60 | 반복 횟수 (평균 — 많을수록 정확·느림) | (a) | 라벨 "반복 횟수" · ⓘ "많이 반복할수록 평균이 정확해지고 계산이 느려집니다." |
| 2 | index:67 | 더미 속성 (상성 ×1.5 / 역상성 ×0.75 / 무속성·무관 영향 없음) | (a) | ⓘ "상성 ×1.5 · 역상성 ×0.75 · 무속성은 배율 없음" |
| 3 | index:77 | 아군 피격 횟수 (N=랜덤 N명 개별 타격 / 전체=…) | (a) | ⓘ "숫자: 아군 N명을 무작위로 한 번씩 공격 · 전체: 아군 전체를 한 번에 공격" |
| 4 | index:82 | 피격 데미지 (더미가 아군 피격 시 … 전투불능·이탈) | (a)+(b) | 헤더 요약 "30%"/"끔" · ⓘ "피격마다 아군 최대 HP의 N% 피해. 배리어가 먼저 흡수하고 HP 0이면 이탈합니다." |
| 5 | index:90 | 행동 우선순위 (드래그로 순서 변경) | (e) | 드래그 핸들 아이콘으로 대체 |
| 6 | index:96 | 특정 턴만 다르게 (턴 여러 개 토글 선택 → 한 번에 순서 편집) | (b)+(a) | 헤더 "없음"/"3턴 편집됨" · ⓘ "턴을 여러 개 고르면 같은 순서를 한꺼번에 적용합니다." |
| 7 | index:114-115 | 총 데미지 / DPS 중앙값 | (c) | 결과 기준 문구 통일 "평균 50회"(RESEARCH §3) — 라벨 em 대신 헤드라인 아래 한 줄 |
| 8 | index:164 | 공통 전투 설정 — 두 조합에 함께 적용 | (e) | 제목 "공통 설정" |
| 9 | index:17 boot | 최초 1회만 (~10초), 이후엔 캐시되어 빨라요 | (c) 문구 | "처음 한 번만 약 10초 걸립니다." |
| 10 | app.js `openModal`:4025 · `openSealPop`:843 | 도장 강화 한계 N (공격력+체력) | (c) | 라벨 옆 값 "한도 N" · ⓘ "공격력과 체력에 나눠 배분합니다." |
| 11 | app.js `openModal`:4043 · `openPlanPopup`:943 | 턴별 행동 직접 계획 (끄면 자동) / 행동 직접 지정 (끄면 자동) | (a) | ⓘ "끄면 자동 계획으로 계산합니다." |
| 12 | app.js `openPrioPop`:1105 | 행동 우선순위 (비교군 A) | 유지 | 제목 보조 "비교군 A" |
| 13 | app.js `openPrioPop`:1109,1111 | 행동 순서 (드래그·▲▼) / 특정 턴만 다르게 (턴 선택 후 순서 변경) | (e) | 괄호 삭제 |
| 14 | app.js `renderTurnEditor`:2784 | "N개 턴 행동 순서 — 변경됨/기본 따름 · 같은 순서로 일괄 적용" | (c) 축약 | "4·7·10턴 순서 · 변경됨" |
| 15 | app.js `altarBodyHTML`:3538 | 별 제단 "활성화시 제단 효과가 비활성화됩니다" / 달 제단 "활성화시 제단 효과가 활성화됩니다" | (c) 문구 | 별 "켜면 페널티 해제" · 달 "켜면 효과 적용" |
| 16 | app.js `altarBodyHTML`:3543 | 에너지 N · 별 x · 달 y | 유지 | 층 헤더 메타 |
| 17 | app.js `tdmgBodyHTML`:2965 | 피해 대상 — 전체보다 적으면 현재 HP%가 높은 아군부터… | (a) | ⓘ "일부만 맞을 때는 현재 HP 비율이 높은 아군부터 맞습니다." |
| 18 | app.js `tdmgBodyHTML`:2969 | 고급 · 턴별로 다르게 — 켜면 아래 칸에… (비우면 위 값) | (a) | 라벨 "턴별 값" · 칸 placeholder가 기본값을 보여주므로 ⓘ "빈 칸은 기본 %를 씁니다." |

### 4-2. 안내 박스(블록)

| # | 클래스 | 위치 | 현재(요지) | 분류 | 제안 |
|---|---|---|---|---|---|
| 19 | `.hint` | index:39 | 로스터에서 캐릭터를 골라 슬롯에 배치 · 아이콘을 눌러 스펙/스킬 조정 | (e) | 빈 슬롯 자체에 "캐릭터 추가" 표시(`.slot .empty`) |
| 20 | `.hint#logOrder` | index:127 · `renderResults`:4675 | 행동 순서: A → B … · 로그는 평균에 가까운 1회 표본 | (c) | "샘플 1회(평균에 가장 가까운 회차) · 순서 A → B → …" |
| 21 | `.adv-lock` | index:93 · `syncAdvLock`:1692 | 고급 설정이 켜져 있어요 — 순서는 고급 설정에서 정합니다 | (c)+(b) | 헤더 요약 "타임라인 사용 중" · 본문 "타임라인이 순서를 정합니다. [타임라인 열기]" |
| 22 | `.adv-lock` | app.js `openModal`:4041 | 행동 고급 설정이 켜져 있어요 — 이 캐릭터의 턴별 행동도… | (c) | "타임라인 사용 중이라 턴별 행동을 여기서 바꿀 수 없습니다." |
| 23 | `.pr-lock` | app.js `openPrioPop`:1107 | 고급 설정이 켜져 있어요 — 순서는 고급 설정에서 정합니다 | (c) | #21과 동일 문구 |
| 24 | `.adv-hint`(타임라인) | app.js `openAdvPop`:2472 | 켜면 행동 우선순위·특정 턴·턴별 계획이 모두 대체됩니다 … ‘추가’ 표시는… | (b)+(d) | 스위치 라벨 "타임라인 사용" + 요약 "켜면 우선순위·특정 턴·턴별 계획 대신 이 타임라인으로 계산" 한 줄. '추가' 설명은 가이드 |
| 25 | `.adv-hint`(ultHint) | app.js `renderAdvUlt`:2291 | 필살기를 언제 쓸지 캐릭터마다 정합니다. 기본은 ‘정해진 턴’… | (b) | 탭 헤더 요약 "기본 · 2명 변경"(§5-8). 설명 삭제 |
| 26 | `.adv-order` ol 4항목 | app.js `renderAdvUlt`:2292 | 필살기를 쓸지 정하는 순서 1~4 | (d) | 가이드 "적용 우선순위" 절로 이동 + 탭 안에 [적용 순서 보기] 링크 1개 |
| 27 | `.adv-note.lock`(timeOn) | app.js `renderAdvUlt`:2293 · `renderAdvSync`:2366 | 타임라인이 켜져 있어요 — 켜져 있는 동안엔… 이 탭의 설정은 쉽니다 | (c) | "타임라인 사용 중에는 이 탭 설정이 적용되지 않습니다." |
| 28 | `.adv-note.warn`(cdProcWarn) + 버튼 2 | app.js `renderAdvUlt`:2294-2296 | 확률로 필살기 쿨이 줄어드는 효과(길드 제단)가 켜져 있어요… | (c) | "길드 제단의 확률 쿨 감소가 켜져 있습니다." + [모두 성공 가정] [모두 준비되면 바로] |
| 29 | `.adv-conflict` | app.js `openAdvPop`:2476 · `renderAdvConflict`:2397 | 타임라인이 켜져 있는 동안 적용되지 않는 설정: {0}. 반영하려면 ‘기존 설정 불러오기’를… | (c)+(b) | 헤더 배지 "⚠ 충돌 N"(RESEARCH §3) · 본문 "적용 안 됨: 특정 턴(4·7턴), 턴별 계획(리카노). [기존 설정 불러오기]" |
| 30 | `.adv-clip` | app.js `renderAdv`:2146 | 클립보드 N턴 · M행동 [비우기] | (c) 상태 바 | "복사됨: 3턴 · 5행동 [비우기]" |
| 31 | `.adv-selbar` | app.js `renderAdv`:2155 | 선택 1·2·3턴 — 붙여넣기·기본값이 여기에 적용됩니다 [선택 해제] | (c) 상태 바 | "선택: 1·2·3턴 [선택 해제]" (적용 대상 설명 삭제) |
| 32 | `.adv-teamwarn` | app.js `renderAdv`:2171 | 팀 편성이 바뀌었어요 — 이 타임라인은 이전 편성 기준이라… | (c) | "편성이 바뀌었습니다. 같은 자리의 계획을 새 캐릭터가 이어받습니다. [기본값으로 다시 시작] [그대로 두기]" |
| 33 | `.adv-railwarn` | app.js `renderAdv`:2179 | 다른 턴에도 확인할 게 있어요 — N턴 | (e) | 레일 칩의 `.bad` 점으로 충분. 필요 시 "실행 안 되는 행동: 4·9턴" |
| 34 | `.adv-warn` | app.js `renderAdv`:2257 | {이름} — 표시된 행동은 실행되지 않아요. 추가 행동은 임부언·욱영의 필살기가… | (c) 축약 + (d) | "리카노: 행동 횟수를 넘어 실행되지 않습니다." 원리 설명은 가이드 |
| 35 | `.adv-empty` | app.js `renderAdv`:2237 | 이 턴엔 행동이 없어요 — 아래에서 추가하세요 | (c) 빈 상태 | "행동 없음" |
| 36 | `.ult-desc` | app.js `ultRowHTML`:2274,2281 · `ultSectionHTML`:3434 | 선택된 모드의 긴 설명(ult_*Tip) | (a) | 세그먼트 옆 ⓘ 1개. 버튼 title 중복 제거 |
| 37 | `.ult-sync` | app.js `ultRowHTML`:2272,2277,2283 · `ultSectionHTML`:3431,3436 | 연동 그룹 N 멤버 — {앵커}의 궁 턴에 맞춰요 (연동 탭에서 변경) / 앵커예요 | (c) 축약 | 행 오른쪽 배지 "연동 1 · 앵커 리카노" / "연동 1 앵커" |
| 38 | `.ult-lock` | app.js `ultSectionHTML`:3430 | 행동 고급 설정이 켜져 있어요 — 타임라인이 궁 시점을 정합니다 | (c) | #27과 동일 문구 |
| 39 | `.adv-hint`(syncHint) | app.js `renderAdvSync`:2366 | 한 캐릭터(앵커)가 필살기를 쓰는 턴에… 최대 3그룹… | (b)+(a) | 헤더 요약 "2그룹" · ⓘ "앵커가 필살기를 쓰는 턴에 멤버 행동을 맞춥니다. 최대 3그룹." |
| 40 | `.sg-preset span` | app.js `renderAdvSync`:2365 | 인접 아군이 평타 → 욱영 궁 → … 원하는 멤버는 ‘방어 →’로 바꾸세요 | (a) | 버튼 "욱영 연동 자동 설정" + ⓘ |
| 41 | `.sm-fixed` | app.js `renderAdvSync`:2347 | 앵커 앞 — 추가 행동은 이미 행동을 마친 아군에게만… | (a) | "앵커 앞(고정)" + ⓘ |
| 42 | `.sm-note`(noGrant) | app.js `renderAdvSync`:2347 | {앵커}의 필살기는 추가 행동을 주지 않아요 — … | (c) | "리카노의 필살기는 추가 행동을 주지 않습니다. 이 멤버는 미준비 규칙대로 궁을 씁니다." |
| 43 | `.sg-flow` | app.js `syncFlowHTML`:2317 | 흐름 미리보기 "{앵커}이(가) 궁을 쓰는 턴: A 궁 → …" | (c) 유지 | 결과 미리보기라 유지. 라벨만 "흐름" |
| 44 | `.altar-hint`(hint+floorRule) | app.js `altarBodyHTML`:3550 | 제단을 눌러 활성화 여부를 바꿉니다… 별·달은 의미가 반대… / 층은 1층부터 순서대로만… | (a)+(c) | 의미 차이는 #15 그룹 라벨로 해결, 층 규칙은 층 스위치 ⓘ "위층을 켜면 아래층도 켜집니다." |
| 45 | `.altar-note` | app.js `altarBodyHTML`:3551 | 보스 ATK·보스 주는 데미지·아군 받는 데미지 별 제단은 피격 데미지 모드를 켰을 때만… | (c) 조건부 | 해당 제단이 적용 중이고 피격 데미지가 꺼져 있을 때만: "피격 데미지를 켜야 보스 공격 관련 제단이 반영됩니다." 합산 규칙은 (d) |
| 46 | `.altar-hint`(로딩/실패) | app.js `altarBodyHTML`:3523-3524 | 제단 데이터를 불러오는 중… / 불러오지 못했어요 (altars.json) | (c) | "제단 데이터 불러오는 중" / "제단 데이터를 불러오지 못했습니다. [다시 시도]" |
| 47 | `.altar-hint`(tdmg hint) | app.js `tdmgBodyHTML`:2959 | 적 페이즈가 끝날 때 아군 전체가 … 반격은 발동하지 않고… | (a)+(d) | 패널 제목 옆 ⓘ 요약 "적 턴 종료마다 아군이 최대 HP의 N% 피해", 세부 규칙 가이드 |
| 48 | `.altar-note`(tdmg note) | app.js `tdmgBodyHTML`:2975 | 아군 피격 설정·길드 제단 설정과 함께 켤 수 있어요… 무명처럼… | (e) | 삭제(가이드에 이미 있음) |
| 49 | `.cs-hint` | app.js `renderSpec`:3899 | 끄면 풀육성(Lv60 · 스타5 · …) 기준으로 계산합니다 | (a) | "사용" 스위치 옆 ⓘ |
| 50 | `.cs-note` | app.js `renderSpec`:3919,3933 | ★5는 더 밟을 단계가 없어요 등 | (e) | 슬라이더 비활성 상태로 표현 |
| 51 | `.plan-legend` | app.js `openModal`:4046 · `openPlanPopup`:944 | 필살 CD N턴 · 첫 사용 N턴 — 궁은 CD 안 찬 턴엔 비활성 (인라인 골드 5곳) | (c) 축약 | "필살 CD 3턴 · 첫 사용 2턴" (뒷문장 삭제, 인라인 색 제거) |
| 52 | `.cmp-hint` | app.js `runCompare`:1212-1216,1238 | 비교할 대상을 골라주세요 / 서로 다른 두 기록을… / 재실행 중… / 비교 실패 — | (c) 빈·오류 상태 | "비교할 기록 두 개를 고르세요" · "서로 다른 기록을 고르세요" · "비교 계산 중" · "비교 실패: {사유}" |
| 53 | `.g-note` 9개 · `.g-intro` | index:223~394 | 가이드 보조 설명 | (d) 유지 | 이미 가이드. ⚠️ 이모지 제거, em dash 정리 |
| 54 | `.empty-state` `.hist-empty` `.patch-empty` | app.js 4055 · 227 · 5051 | 로딩/빈 상태 | (c) | 문구만 "~없음" 체계로 |

### 4-3. 긴 `title` 툴팁

| # | 위치 | 현재(요지) | 분류 | 제안 |
|---|---|---|---|---|
| 55 | index:52 `#forceProc` | 모든 확률형 발동·버프(…)를 100%로 강제 | (a) | ⓘ "확률형 효과를 모두 발동한 것으로 계산합니다." |
| 56 | index:53 `#hp10Btn` | 더미 체력을 10%로 고정 (카라트 등…) | (a) | ⓘ "더미 HP를 10%로 고정해 저HP 조건을 확인합니다." |
| 57 | index:54 `#tdmgOpen` · index:56 `#altarOpen` | 매 턴 아군 전체가… / 길드전 방탈출의 별·달 제단 효과를… | (e) | 버튼 라벨로 충분. 패널 안 ⓘ로 이관(#47) |
| 58 | index:84,434 피격 버튼 | 켜면 더미의 아군 피격이 … 배리어 탱커·힐러의 실전 성능 검증용 | (e) | #4 ⓘ와 중복 |
| 59 | index:29-30,175-177 | 지난 시뮬레이션 기록 / 기록 관리 (선택 삭제) / FAB 설명 | (e) | `aria-label`로만 유지 |
| 60 | app.js 긴 title 약 40곳 | `ULT3_TITLE`(52-55) · `EARLY_ULT_TITLE`(4322) · `data-pdef`·`data-reflow`·`data-ukafter`(1005,4044,4050) · `#advPasteAll`(2480) · `#advImport`(2500) · 레일 `turnBad`(2138) · 궁 비활성 "쿨타임"(2105,2228) · 행동 추가 비활성(2245) · `.spec-badge`(1508) · 편차 밴드 `bandTip`(4661) · `.bar-trace`(4890) · `.in-red` 4종(4804-4807) · `.hit-ctr`(4938) · 수면(4928) · `planUltMark` luck(4412-4413) · `syncAltarLock` lock(3488) · `ult_*Tip`(2273,2280,3433) · `ultAssistTip`(2265) · `.cmp-cell`(744) · 격자 칸(2069) · `.hi-menu`(226) · `.fed-slot`(994,4469) · `.sk-pin`(4530) | 분류 | 프리셋 버튼 5종(ULT3·early·pdef·reflow·ukafter) = **(a)** 버튼 옆 ⓘ 1개로 묶음 · 비활성 사유(궁 쿨·추가 불가·luck·lock) = **(c)** 비활성 컨트롤 탭 시 인라인 한 줄 · 편차 밴드 = **(a)** "최소~최대 ⓘ" · 계산식 배지(in-red·hit-ctr·수면) = 유지(데이터 툴팁, 탭 가능 팝오버로) · `.cmp-cell`·격자 칸·`.hi-menu` = **(e)** aria-label만 · `ult_*Tip` = #36과 통합 |
| 61 | 토스트 63곳 중 모드 on/off 안내 | "확률 100% 모드 ON<br>· 모든 확률형 스킬 100% 강제"(`bindSettings`:2822) · "체력 10% 모드 ON…"(2826) · "피격 데미지 모드 ON…"(2836) · 제단/턴 피해 toastOn/Off · `hpSchedChar` 동반 안내(`run`:4617) | (e) 대부분 / (c) 1건 | 토글 pressed 상태가 이미 알려 주므로 on/off 토스트 삭제. 동반 캐릭터 HP 단계 안내는 결과 헤더 인라인 "적 HP 단계 감소 적용(4구간)"으로 |

### 4-4. 처리 분포

| 분류 | 항목 수(주 분류) | 해당 # | 비고 |
|---|---|---|---|
| (a) ⓘ 툴팁 | 16 | 1·2·3·4·11·17·18·36·40·41·44·47·49·55·56·60 | #60은 title 약 40곳 묶음(내부에 (c)·(e) 혼재) |
| (b) 헤더 요약 | 4 | 6·24·25·39 | 겸용까지 치면 8(#4·21·29·45도 헤더 요약에 반영) |
| (c) 인라인 유지 | 28 | 7·9·10·12·14·15·16·20·21·22·23·27·28·29·30·31·32·34·35·37·38·42·43·45·46·51·52·54 | 빈·오류·상태 바 포함. lock 문구 3종(#21·23·27·38)은 한 문장으로 통일 |
| (d) 가이드 이동 | 2 | 26·53 | 겸용까지 치면 7(#24·34·45·47의 세부 규칙 부분) |
| (e) 삭제 | 11 | 5·8·13·19·33·48·50·57·58·59·61 | |
| 합계 | 61 | | |

겸용 항목은 주 분류로 한 번만 셌다. **시각 스타일은 (c)를 2종으로 통합**: `note`(중립: lock·상태 바·빈 상태) / `warn`(경고색 1개 토큰: conflict·cdProcWarn·teamwarn·adv-warn·noGrant). 기존 30개 클래스는 유지하고 선언만 두 규칙으로 묶는다(ux_audit §4-A-10).

---

## 5. 아코디언 요약 헤더 문구 설계

### 5-1. 공통 규칙

| 규칙 | 내용 |
|---|---|
| 형태 | `▸ 섹션명   요약값 ·  ·  ·   [● 변경됨 점] [↺ 초기화]` — 접힘 상태 한 줄. 요약값은 `--text2`, 섹션명은 `--text`. 펼침 시 요약 숨김(본문과 중복) |
| 기본값일 때 | 요약값만 `--muted`로 표시. 점·초기화 없음 |
| 변경됐을 때 | 요약값 `--text`, 섹션명 오른쪽에 강조색 6px 점, 헤더 끝 `rotate-ccw` 아이콘 버튼(ghost sm, `aria-label="섹션 기본값으로"`). 초기화는 되돌리기 토스트 제공(기존 `toast(msg,{label,fn})` 재사용) |
| 경고 | 조건부 `triangle-alert` + 숫자 배지("⚠ 충돌 1"). 경고는 기본값 여부와 무관하게 표시 |
| 잠금 | 타임라인(`advOn`)이 대체하는 섹션은 요약값 자리에 "타임라인 사용 중"(`lock` 아이콘). 초기화 버튼 숨김 |
| 구분자 | " · "(가운데점, 앞뒤 공백). 이름 나열은 " → ". 3개 초과 시 "…(n)" |
| 숫자 | tabular-nums. 단위는 한국어 그대로("30턴", "30%") — i18n은 advT/altarT 패턴처럼 로컬 사전 `{0}` 치환으로 |
| 갱신 시점 | 각 섹션 상태를 바꾸는 기존 함수 끝에서 `renderSummary(section)` 호출(추정 삽입 지점은 각 행 "갱신 훅") |

### 5-2. 섹션별 규칙

| # | 섹션 | 상태 변수(실제 이름) | 요약 규칙 | 기본값 판정 | 초기화 동작 | 갱신 훅 |
|---|---|---|---|---|---|---|
| 1 | **기본 반복·턴** | `#runs.value`(기본 50) · `#turns.value`(30) · `forceProc`(false) · `hp10`(false) | `반복 {runs} · {turns}턴` / `forceProc`면 `확률 100% · {turns}턴`(반복은 결정론이라 생략, 현재 `syncRunsField`의 dim과 같은 의미) / `hp10`이면 끝에 ` · 체력 10%` | runs=50 ∧ turns=30 ∧ !forceProc ∧ !hp10 | 슬라이더 50/30, forceProc·hp10 false(+`syncRunsField`, 버튼 `.on` 해제) | `bindSettings` `upd`/`rupd`/`#forceProc.onclick`/`#hp10Btn.onclick` |
| 2 | **더미** | `#dummyElement.dataset.val`(0) · `#dummies.dataset.val`(1) · `#enemyHits.dataset.val`(**"5"**, 비교 모달 기본은 "all") | `{속성명} · 적 {dummies} · 피격 {enemyHits==='all' ? '전체' : enemyHits}` 예 "무 · 적 1 · 피격 5". 속성명 앞에 8px 속성 점(무속성은 점 없음) | "0"·"1"·"5" | `setSeg`(:153)로 세 값 복원 | `bindSettings` `.seg` onclick |
| 3 | **피격 데미지** | `incomingOn`(false) · `#incoming.value`(30) | 꺼짐 `끔` / 켜짐 `{value}%` ; 2번과 합칠 경우 2번 끝에 ` · {value}%` (예시 "무 · 적 1 · 피격 5 · 30%") | !incomingOn(값 30은 꺼져 있으면 무시) | `incomingOn=false`, 값 30 | `bindSettings` `ib.onclick`/`iupd` |
| 4 | **행동 우선순위** | `team[i].priority`(null=기본) · 순서 = `teamOrder()` · `advOn` | `{이름1} → {이름2} → …({n})` (n = 편성 인원). 인원 ≤3이면 전부 나열. 편성 0명 `편성 없음`. `advOn`이면 `타임라인 사용 중` | 모든 `s.priority == null` | 각 슬롯 `delete s.priority`(**현재 `#prioReset`은 turnOverrides까지 지움 → 두 섹션 분리 시 핸들러를 둘로 나눠야 함, JS 변경**) | `renderPrio`:2738 끝 |
| 5 | **특정 턴만 다르게** | `turnOverrides`({turn:[pos]}) · 턴 수 `#turns.value` · `advOn` | 유효 키 = `turnOverrides`의 키 중 ≤turns. 0개 `없음` / 1~3개 `{t1}·{t2}·{t3}턴 편집됨` / 4개↑ `{k}턴 편집됨` | 유효 키 0 | `turnOverrides={}; selTurns.clear()` | `renderTurnChips`:2758 끝 |
| 5-경고 | | `advOn` ∧ 유효 키 ≥1 | `⚠ 충돌 1`(타임라인이 무시함, `renderAdvConflict`의 `conflictOv` 조건과 동일) | — | — | 동일 |
| 6 | **길드 제단** | `altarOn`(false) · `altarCfg.floors[1..3].on/off` · `ALTAR_FLOORS` · `altarData` · `altarProcCdActive()` | 꺼짐 `끔` / 켜짐 `{N}층 · 별 {s} · 달 {m}`. N = 켜진 층 수(접두 구간이라 "1~N층"과 동치), s = 켜진 층의 별 제단 중 **off에 들어 있는 수(페널티 적용)**, m = 켜진 층의 달 제단 중 **off에 없는 수(축복 적용)** — `cdPlus`:3222·`altarProcCdActive`:1669 판정과 같은 방향(추정 검증 필요: 결과 meta `m.altar.star/moon`과 일치 확인) | !altarOn | `setAltarOn(false)`(설정 보존, 스위치만) — 층/행 초기화는 패널 안 버튼으로 별도 | `syncAltarLock`:3488 · `toggleAltarRow`:3614 · `setAltarFloor`:3467 |
| 6-경고 | | `altarOn` ∧ `altarProcCdActive().length` | ` · 확률 쿨 감소` 태그(경고 아님, 정보 배지) · 제단 켜짐으로 `forceProc`가 잠기면 1번 요약에서 "확률 100%"가 빠짐 | — | — | — |
| 7 | **턴 피해** | `tdmgOn`(false) · `tdmgCfg.pct`(10) · `tdmgCfg.hits`(5=전체) · `tdmgCfg.adv` · `tdmgPerClean()` | 꺼짐 `끔` / 켜짐 `{pct}% · {hits===5 ? '전체' : hits+'명'}` / `adv` ∧ 유효 턴별 값 k>0이면 ` · 턴별 {k}` | !tdmgOn | `setTdmgOn(false)` | `syncTdmgUI`:2934 · `renderTdmg`:2980 |
| 8 | **궁극기 사용 방식** | 슬롯별 `ultOf(team[i])` · `_ultDefault(u)` · `advOn` | 변경 인원 c = `team.filter(s => s && !_ultDefault(ultOf(s))).length`. 0 `기본(정해진 턴)` / c≥1 `{c}명 변경` ; 한 명이면 `{이름} {ult_mode 라벨}` (예 "리카노 준비되면 바로"). 가정 켠 인원 있으면 ` · 성공 가정 {n}` | c=0 | 각 슬롯 `setUlt(s, {mode:'fixed', keepDef:true})` | `setUlt`:3212 호출부 · `renderAdvUlt` |
| 8-경고 | | `altarProcCdActive().length` ∧ 가정·asap 모두 없는 캐릭터 존재 | `⚠ 확률 쿨 감소 1`(cdProcWarn 조건과 동일) | | | |
| 9 | **연동** | `syncGroups` → `normalizeSyncGroups(syncGroups).filter(g => g.anchor && g.members.length)` | 0 `없음` / 1그룹 `{앵커명} + {멤버 수}명` / 2그룹↑ `{g}그룹 · {멤버 합}명` | 유효 그룹 0 | `applySyncSnap([])`(되돌리기 토스트는 `syncCleared` 문구 재사용) | `setSyncGroup`:3306 · `applySyncSnap`:3305 |
| 8·9 잠금 | | `advOn` | 두 섹션 모두 `타임라인 사용 중`(timeOn 조건과 동일) | | | |
| 10 | **행동 고급 설정(타임라인)** — 섹션 헤더 또는 우선순위 헤더의 버튼 | `advOn` · `turnPlans` · `advTouched` | 꺼짐 `끔` / 켜짐 `켬 · {advTouched.size}턴 편집` | !advOn | 스위치 끔(작업물 보존 — 현 동작 `#advSwitch.onchange`와 동일) | `renderAdv`:2112 · `syncAdvLock`:1692 |
| 10-경고 | | `advOn` ∧ (`ovTurns.length` + `plans.length`) | `⚠ 충돌 {개수}` — `renderAdvConflict`:2397의 `parts.length`와 같은 식. 우선순위 헤더(4)와 특정 턴 헤더(5)에도 같은 배지 | | | |

### 5-3. 예시 (접힘 상태)

| 상태 | 표시 |
|---|---|
| 첫 방문 | `▸ 기본  반복 50 · 30턴` / `▸ 더미  무 · 적 1 · 피격 5` / `▸ 피격 데미지  끔` / `▸ 행동 우선순위  하니엘 → 리카노 → …(5)` / `▸ 특정 턴만 다르게  없음` / `▸ 길드 제단  끔` / `▸ 턴 피해  끔` / `▸ 궁극기 사용 방식  기본(정해진 턴)` / `▸ 연동  없음` (전부 muted, 점 없음) |
| 사용 중 | `▸ 기본 ●  확률 100% · 13턴  ↺` / `▸ 더미 ●  ●불 · 적 3 · 피격 전체  ↺` / `▸ 특정 턴만 다르게 ●  4·7·10턴 편집됨  ↺` / `▸ 길드 제단 ●  3층 · 별 2 · 달 5 · 확률 쿨 감소  ↺` / `▸ 궁극기 사용 방식 ●  2명 변경 · 성공 가정 1  ⚠1  ↺` / `▸ 연동 ●  욱영 + 2명  ↺` |
| 타임라인 켬 | `▸ 행동 우선순위  🔒 타임라인 사용 중  ⚠ 충돌 2` / `▸ 특정 턴만 다르게  🔒 타임라인 사용 중` (🔒은 Lucide `lock` 아이콘 자리 표기) |

### 5-4. 구현 메모

- 요약 문자열은 i18n.js `translateString`에 맡기지 말고 advT/altarT/tdmgT와 같은 **로컬 사전 + `{n}` 치환**으로 만든다(날짜·숫자 포함 문자열의 EXACT 불일치 문제, 감사 §3-4).
- 비교 모달의 공통 설정(`cmpCommon`)은 같은 요약 함수를 `cmpCommon` 입력으로 재사용 가능(추정). 단 `enemyHits` 기본값이 메인("5")과 비교("all")에서 다르므로 기본값 판정은 인자로 받는다.
- "변경됨" 판정은 기록 불러오기(`restoreRecord`:160) 직후에도 같은 식을 쓴다. 불러온 기록이 기본값이 아니면 점이 켜지는 것이 맞음(기록 = 조건 재현).

---

## 6. 핵심 결론

1. 인터랙티브 컴포넌트는 **23종**이다. 같은 역할인데 클래스가 따로 있는 경우가 많다. 닫기 5종, ▲▼ 이동 3종, 칩 5종, 모달 카드 15종, 안내 박스 30개 클래스.
2. 버튼 클래스 **46개**를 **4계층(primary 4 · secondary 13 · ghost 18 · danger 3)**과 메뉴 항목 2개로 묶고, 토글형 10개에는 pressed 상태를 붙인다. FAB 5개는 없애고 피격 버튼 1개는 스위치로 바꾼다. 32개는 CSS 선언만 통합하면 되고, 14개는 마크업이나 JS를 고쳐야 한다. 고칠 곳은 `aria-pressed`, 피격 버튼의 스위치 전환, `.io-big`의 계층 분리, 외부 주입 CSS, FAB 5개다.
3. 이모지는 **23종 60회**이고 아이콘처럼 쓰는 기호가 **19종** 더 있다. 대부분 Lucide 아이콘으로 바꾸고, 모달 제목과 가이드 ⚠️은 없애고, 🙌·⚔️(가이드 본문)은 문구를 고친다. 계산식의 ×와 흐름 표시 →는 텍스트로 둔다. 이모지를 뺄 때는 i18n.js EXACT 키 약 130곳도 같이 바꿔야 번역이 끊기지 않는다.
4. 안내 박스와 설명문 **61항목**의 처리 분포는 ⓘ 툴팁 16 · 헤더 요약 4(겸용 포함 8) · 인라인 유지 28 · 가이드 이동 2(겸용 포함 7) · 삭제 11이다. 인라인 유지 28개 중 상당수는 빈 상태·상태 바·잠금 안내다. 인라인으로 남기는 것도 시각 스타일은 `note`와 `warn` 2종으로 합친다.
5. 설정 열 요약 헤더 10개는 모두 기존 전역 상태로 계산할 수 있다(`team[].priority`, `turnOverrides`, `altarOn/altarCfg`, `tdmgOn/tdmgCfg`, `ultOf()`, `syncGroups`, `advOn/advTouched`). 충돌 배지는 `renderAdvConflict`와 같은 식을 쓴다. JS 구조를 바꿔야 하는 곳은 `#prioReset` 하나다. 지금은 우선순위와 특정 턴을 함께 초기화하므로 핸들러를 둘로 나눠야 한다.
