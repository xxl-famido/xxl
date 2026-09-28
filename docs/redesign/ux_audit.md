# XXL WOOFIA 전투 시뮬레이터 — UX 감사 보고서

- 감사일: 2026-09-28
- 대상: 라이브 `https://xxl-famido.github.io/xxl/` (index.html) + 로컬 `dashboard/boss.html`(라이브에 없음, 404 — `.gitignore:15`에서 제외. `python server.py` 로컬 서버로 감사)
- 방법: puppeteer-core + Chrome headless, 데스크톱 1440×900 / 모바일 390×844(isMobile·hasTouch), 언어 kr/en/ja/zh. 화면마다 스크린샷을 찍고 DOM을 계측함(터치 타깃, FAB 겹침, 가로 넘침, 텍스트 잘림, 포커스).
- 산출물: 스크린샷 148장 `tools/redesign/shots/audit/*.png`, 계측값 `tools/redesign/shots/audit/metrics_{main,lang,boss,mobile}.json`, 재현 스크립트 `tools/redesign/audit_all.js`
  (`NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/audit_all.js [main|lang|boss|mobile|all]`. 피드백 모달은 열기만 하고 전송하지 않음)
- 소스 수정: 없음(읽기와 스크린샷만)
- 표기: 추정 = 코드를 보고 추론했지만 화면에서 직접 확인하지 못한 항목. FAB 겹침 계측은 **기하학적 교차**만 셈(z-index 무시). 그래서 모달(z≥80) 안의 "겹침"은 오탐이고, 실제 가림은 스크린샷으로 확인한 것만 적음.

---

## 0. 요약 — 심각도별 개수

| 심각도 | 개수 | 대표 항목 |
|---|---|---|
| 치명 | 3 | ① 모바일: 첫 실행 뒤 가로 넘침(390→426~470px). 모든 모달과 FAB의 오른쪽이 잘림 ② 데스크톱: 고정 FAB이 제단 패널의 '사용' 스위치와 ✕를 덮음 ③ 조합 비교(모바일): 수치가 초상화·▲▼ 위에 겹치고 캐릭터 이름이 사라짐 |
| 높음 | 9 | 키보드 조작 불가(토글 input `display:none`, div 클릭), 텍스트 대비 미달(`--faint` 2.8:1, 위험 버튼 2.55:1), 모바일 터치 타깃 61%가 44px 미만, 행동 고급 설정 모바일 잘림, i18n 넘침·미번역, 라벨과 설명문 혼재, FAB 6개·3색 난립, 차트에 축이 없고 같은 속성끼리 색이 같음, 버튼 체계 파편화 |
| 중간 | 10 | 헤드라인 중앙값과 로그 평균 표본이 섞임, 로그 30턴 나열로 스크롤이 김, 가이드 16,000px에 목차 없음, 제단 기본 상태가 흐려서 안 읽힘, 타이포 22단계·radius 22종, boss.html 복제 CSS·모바일 미대응, 비교 차트 축 라벨 겹침, hover 전용 정보, 우선순위 목록이 FAB에 가림, 모션 과다 |
| 낮음 | 7 | 이모지 아이콘, 사용 안 하는 CSS(추정), 인라인 style 33곳, z-index 18단계, 무한 애니메이션 중 reduced-motion 미대응 2개, em dash 과다(333개), "마우스를 올려" 문구가 터치 환경에도 나옴 |

---

## 1. 화면별 감사표

### (1) 메인 편성/설정 화면
스크린샷: `desktop_01_main_top`, `desktop_02_main_full`, `desktop_03_focus_tab6`, `desktop_46_top_after_2runs`, `mobile_01_main_top`, `mobile_02_main_full`, `mobile_03_focus_tab6`, `mobile_46_top_after_2runs`

| 구분 | 발견 | 근거 | 심각도 |
|---|---|---|---|
| 시각 | 설정 패널 우상단을 Language(골드)와 패치 히스토리(파랑) FAB이 덮고, 하단은 조합 비교·가이드·피드백·마지막 업데이트가 덮음. 1440px에서도 `.wrap`(max 1280) 오른쪽 여백이 FAB 폭보다 좁음 | `desktop_01`, style.css L539-547·L581-584, i18n.js L3388 | 높음 |
| 시각 | 편성 슬롯(속성색 테두리)과 로스터(선택 시 골드 외곽선 + ✓ 배지 + 속성 점 글로우)가 모두 강하게 발광해서 시선이 분산됨 | style.css L83, L108-111 | 중간 |
| 시각 | '길드 제단 설정' 버튼만 256px 일러스트 배경의 정사각 카드이고, 옆의 확률/체력/턴 피해는 이모지 알약 버튼. 같은 줄의 토글 3개와 진입 버튼 1개가 시각 언어가 다름 | index.html L50-57, style.css L1269-1282 | 중간 |
| UX | 필드 라벨 안에 괄호 설명이 들어감. 예: "더미 속성 (상성 ×1.5 / 역상성 ×0.75 / 무속성·무관 영향 없음)", "피격 데미지 (… HP 0이면 전투불능·이탈)". 라벨이 2~3줄로 길어져 스캔이 안 됨 | index.html L60, L67, L77, L82 | 높음 |
| UX | 반복 횟수·턴 수 슬라이더 트랙 높이가 4px, thumb 15px. 모바일 터치 타깃으로 부족 | style.css L119-122, metrics `#runs 300×4` | 높음 |
| UX | 슬롯 제거 ✕(`.rm` 17×17)가 `:hover`에서만 보임(opacity 0). 터치에서는 보이지 않는 버튼이 슬롯 우상단에 있어서 잘못 탭하면 캐릭터가 빠짐. Tab 포커스도 보이지 않는 이 버튼에 먼저 걸림 | style.css L91-93, `desktop_03_focus_tab6`(포커스 = `.rm`, 화면 표시 없음) | 높음 |
| UX | '특정 턴만 다르게' 턴 칩 30개가 24~25px 정사각이고, 설명(em)은 라벨 안에 있음 | style.css L158-159, mobile.css `.turn-chips button 24px` | 높음(모바일) |
| UX | 행동 우선순위: 드래그 핸들 대신 ▲▼(30×20) 2단 버튼. 모바일에서 행 높이는 넉넉한데 조작 버튼만 작음 | style.css L148-154 | 중간 |
| 상태 | '실행' 중 `.btn-run.busy`는 opacity .6만 적용. 진행률·단계 표시 없음(부트 오버레이에만 있음) | style.css L177 | 중간 |
| 모바일 | **첫 실행 뒤 문서 폭이 390→426px(en 459, ja 470)로 늘어남.** 원인: `.topbar-hist{flex:1}`에 `min-width:0`이 없어서 긴 기록 라벨을 담은 `<select>`의 고유 폭이 헤더를 밀어냄. 그리고 `.chart .tip`이 opacity 0인데도 레이아웃을 차지해 오른쪽으로 삐져나옴. 결과적으로 Language·패치 FAB과 모든 모달의 오른쪽이 잘림 | style.css L42, L44, L206-208 · metrics_mobile `mobile_result scrollW 426`, `mobile_en_main 459` · `mobile_46`, `mobile_en_01_main_top`, `mobile_en_31_adv_time` | **치명** |
| 모바일 | 슬롯 이름이 "명계 경비…"로 잘리고, P1~P5 라벨이 초상화와 겹침 | `mobile_01`, metrics clipped `.nm` | 중간 |
| 모바일 | 우하단 FAB 4개와 업데이트 표시가 로스터 타일 8개 위에 떠서 가림(콘텐츠 하단 여백 130px로는 스크롤 끝만 해결됨) | metrics_mobile `mobile_main.covered` 8건, mobile.css L32, L140-142 | 높음 |
| 접근성 | 포커스: `:focus-visible`은 style.css 전체에 2곳(L1283, L1342)뿐. 브라우저 기본 outline(1px, #101010)이 검은 배경에서 보이지 않음. input 5곳은 `outline:none` 뒤에 border 색만 바꿈 | metrics `desktop_focus outline auto 1px rgb(16,16,16)`, style.css L360, L396, L709, L766, L1374 | 높음 |
| 접근성 | 슬롯·로스터가 `<div>` + onclick이라 Tab으로 도달할 수 없음 | app.js `renderTeam` L1501-1525, `renderRoster` L1386-1396 | 높음 |
| 일관성 | 세그먼트 버튼: 기본 `.seg`는 골드 채움, `.elseg`는 속성색 채움. 같은 컴포넌트가 두 가지 의미 체계를 씀(속성 선택만 컬러라는 점은 타당) | style.css L123-135 | 낮음 |

### (2) 캐릭터 상세 모달 + 스펙 패널
스크린샷: `desktop_10_char_modal`, `desktop_11_char_modal_planner`, `desktop_12_char_modal_skill_open`, `desktop_13_char_spec_panel`, `desktop_14_char_spec_panel_on`, `mobile_10~14`, `desktop_en_10/13`, `desktop_ja_10/13`, `desktop_zh_10/13`

| 구분 | 발견 | 근거 | 심각도 |
|---|---|---|---|
| 시각 | 모달 안에 테두리 카드가 5겹으로 쌓임(도장 카드 > 스탯 카드 2개 > 궁극기 카드(골드 테두리) > 스킬 카드 N개). 한 화면에 테두리 박스만 9~10개 | `desktop_10` | 중간 |
| 시각 | '궁극기 사용 방식' 요약 카드만 골드 테두리라서 이 모달의 주 행동처럼 보임. 실제로는 다른 창으로 가는 링크 | style.css L1402 `.mc-ult{border:1px solid var(--gold-d)}` | 중간 |
| 시각 | 턴별 계획 격자: 30칸 × 버튼 3개(평/궁/방, 10px 글씨). 궁만 골드라서 주기는 보이지만, 비활성 '궁'이 opacity .22라 잘 안 보임 | style.css L479-486, `desktop_11` | 중간 |
| UX | 도장 강화가 꺼져 있을 때 본문을 opacity .4로 흐리게 두기만 해서 슬라이더가 활성처럼 보임. 스위치가 왼쪽 위에 작게 있음 | style.css L386-387 | 중간 |
| UX | 스펙 패널 머리의 '사용' 스위치가 꺼져 있으면 본문 전체가 opacity .34. 켜기 전에는 값을 읽기 어려움 | style.css L1120, `desktop_13` vs `desktop_14` | 중간 |
| UX | 스펙 진입 버튼('◈ 캐릭터 스펙 설정')이 도장 카드 위 오른쪽의 11.5px 알약이라 잘 안 보임. 가이드에서 위치를 따로 설명해야 할 정도 | index.html L214(가이드 문구), style.css L1167-1174 | 중간 |
| 상태 | 스탯 숫자 tween(`tweenNum`)과 해금 행 flash가 있어서 피드백은 좋음 | app.js L3793, style.css L1159-1164 | (양호) |
| 모바일 | 스펙 패널이 오른쪽 전체 높이 시트(`min(360px,92vw)`)로 뜨고, 아래 카드가 왼쪽 20px만 보여서 두 겹이 어색함. 슬라이더 thumb 15px | style.css L1182-1190, `mobile_13` | 중간 |
| 접근성 | 토글(`.toggle input{display:none}`)은 키보드 포커스와 조작이 불가능. 도장 강화·턴별 계획·스펙 사용·도장 해제 모두 해당 | style.css L408 | 높음 |
| 일관성 | 토글 크기 3종: 38×21(기본), 32×18(제단·턴 피해), 30×17(도장 해제) | style.css L409-412, L1318-1320, L1235-1237 | 낮음 |
| 일관성 | 닫기 버튼: 모달 `.mc-close` 30px, 스펙 패널은 같은 클래스를 static으로, 고급 설정은 `.adv-x` 28px(✕ 글리프), 셀 팝업은 `.cp-x` 20px, 피드백은 `.fb-x`(테두리 없음, ×). 글리프가 ×와 ✕ 두 가지 | style.css L499-501, L897-899, L1039-1041, feedback.js L66-67 | 중간 |

### (3) 길드 제단 설정 (+ 턴 피해 탭)
스크린샷: `desktop_20_altar`, `desktop_21_altar_full`, `desktop_22_altar_on`, `desktop_23_tdmg`, `mobile_20~23`, `desktop_en_20_altar`

| 구분 | 발견 | 근거 | 심각도 |
|---|---|---|---|
| UX | **데스크톱: 패치 히스토리 FAB(top:112px, z31)이 사이드 패널 머리의 '사용' 스위치와 ✕ 위에 겹침.** en에서는 "Enable" 라벨까지 가려짐. 패널이 일반 흐름(z auto)이라 FAB이 위에 옴 | `desktop_20_altar`, `desktop_en_20_altar`, metrics `desktop_altar.covered: patch-fab ⟂ .adv-x`, style.css L581, L1294-1297 | **치명** |
| UX | 사용이 꺼진 기본 상태에서 행 opacity .7, 그룹 .35, 체크 아이콘은 골드 채움이 그대로 남아 있음. '켜짐'인지 '꺼짐'인지 헷갈림(행에는 체크가 있는데 전체는 흐림) | style.css L1312, L1328-1341, `desktop_20` vs `desktop_22` | 높음 |
| UX | 별 제단 "켤수록 불리", 달 제단 "켤수록 유리"라는 반대 의미를 회색 한 줄 캡션(10.5px, `--faint`)으로만 전달. 색·아이콘으로 구분되지 않음 | style.css L1326, `desktop_20`(캡션 거의 안 보임) | 높음 |
| UX | 층 토글('활성화')과 개별 행 체크의 위계가 비슷함. "1층부터 순서대로만" 규칙은 상단 안내문으로만 설명 | style.css L1313-1320 | 중간 |
| 시각 | 열 때 행이 26ms 간격으로 순차 슬라이드 인(stagger), 탭 전환 시 좌우 스왑. 설정 패널로서는 과한 연출 | style.css L1344-1348 | 낮음 |
| 레이아웃 | 사이드 패널이 3번째 그리드 열로 열리면서 `.wrap` max-width가 1280→1640으로 바뀌어 좌측 편성 패널 폭이 급변함(1440 뷰포트에서 로스터가 11열→9열) | style.css L1292-1293, `desktop_01` vs `desktop_20` | 중간 |
| 상태 | 턴 피해를 열면 "길드 제단 설정 OFF" 토스트가 하단 중앙에 뜸. 턴 피해를 연 동작과 무관한 메시지라 혼란스러움(추정: 제단 탭을 닫으며 상태 토스트 출력) | `desktop_23_tdmg` | 중간 |
| 모바일 | 팝업(`.advpop` 재사용)으로 뜨고, 머리 '사용'과 ✕가 오른쪽 가장자리에 붙음. 첫 실행 뒤에는 넘침 때문에 ✕가 잘림 | `mobile_20` | 높음(넘침과 연동) |
| 대비 | 행 설명 `.altar-row .at` 꺼짐 = `--muted` on `--panel` 5.23:1인데 행 opacity .7 → 실효 대비 약 3.2:1(추정 계산) | style.css L1329, L1336 | 높음 |

### (4) 행동 고급 설정 — 3탭
스크린샷: `desktop_30_adv_time_off`, `desktop_31_adv_time_on`, `desktop_32_adv_time_tools`, `desktop_33_adv_ult`, `desktop_34_adv_sync`, `desktop_35_adv_sync_group`, `mobile_30~35`, `desktop_en_31/33/34`, `desktop_ja_31/33/34`, `mobile_en_31_adv_time`

| 구분 | 발견 | 근거 | 심각도 |
|---|---|---|---|
| UX | 타임라인 탭: 안내문 박스(2~3줄)와 '사용' 스위치가 같은 줄에 있음. 스위치가 꺼져 있으면 본문 전체가 .32로 흐려짐 → 처음 들어온 사용자는 비활성 화면만 보게 됨 | style.css L1462-1466, `desktop_30` | 중간 |
| UX | 궁극기 사용 방식 탭 상단: 안내 박스 + "필살기를 쓸지 정하는 순서" 4항목 ol(각 2줄) + 잠금 안내 박스 = 캐릭터 행에 닿기 전에 텍스트가 약 12줄. 규칙 설명이 UI를 대신함 | `desktop_33_adv_ult`, app.js `renderAdvUlt` L2288, style.css L1468-1471 | 높음 |
| UX | 한 캐릭터 행에 모드 3개(골드 채움) + 설명 1줄 + 토글 1개. 5명이면 길게 스크롤해야 하고, 모든 행의 기본값이 골드 채움이라 "변경한 행"이 눈에 띄지 않음 | `desktop_33` | 중간 |
| UX | 연동 탭: 앵커 `<select>`와 멤버 칩이 같은 줄. 멤버 칩(on=골드, 오른쪽 모서리만 각진 `.as-m.on` + `.as-ord` 이어붙이기)의 형태가 독특해서 학습이 필요함. 그룹 2는 비활성 흐림 상태로 늘 노출 | style.css L1388-1398, `desktop_35` | 중간 |
| 시각 | 행 액션 버튼 '평/궁/방' 26×24, ▲▼ 20×22, ✕ 20×22. 비활성 궁 .28. 행 오른쪽 끝에 작은 버튼 6개가 몰려 있음 | style.css L944-956 | 높음(모바일) |
| 시각 | 전체 보기 격자: 5px 점, 9px 턴 번호, `--faint` 범례. 정보 밀도는 좋지만 가독성 한계 | style.css L1010-1026, `desktop_32` | 중간 |
| 모바일 | **390px에서 카드가 뷰포트를 넘음**: '사용' 라벨과 '이 턴 기본값으로' 버튼이 잘리고, en에서는 3번째 탭 "Sync (ultimate timing)"이 잘림. 탭 바가 가로 스크롤/줄바꿈을 지원하지 않음 | `mobile_31_adv_time_on`, `mobile_en_31_adv_time`, style.css L1422-1426, L969-974 | 높음 |
| i18n | en에서 평/궁/방이 "A/U/D"로 번역됨(Attack/Ultimate/Defend 추정). 로스터·로그는 "EX Skill"이라 U와 대응되지 않음 | i18n.js EXACT `궁→U`, `필살기→EX Skill`, `desktop_en_31` | 중간 |
| 접근성 | 탭은 `role=tab`이지만 `aria-selected`와 화살표 키 이동이 없음(추정: `.on` 클래스만 토글). 포커스 트랩은 구현됨(app.js L2667) | app.js L2465-2469 | 중간 |
| 일관성 | 같은 "안내" 역할의 박스가 `.adv-hint`, `.adv-note.lock`, `.adv-note.warn`, `.adv-order`, `.adv-clip`, `.adv-selbar`, `.adv-teamwarn`, `.adv-railwarn`, `.adv-warn`, `.altar-hint`, `.ult-sync`, `.ult-lock`, `.sg-flow`, `.pr-lock`, `.adv-lock`로 15종. 배경·테두리(실선/점선)·색(muted/gold/bad/#e0bc6e)이 제각각 | style.css L885, L902, L966, L988, L996, L1061, L1069, L1085, L1307, L1417, L1428-1430, L1455, L1468 | 높음 |

### (5) 결과 화면
스크린샷: `desktop_40_result_view`, `desktop_41_result_panel`, `desktop_42_chart_hover`, `desktop_43_log_open`, `desktop_43b_log_open_view`, `desktop_44_log_srcpop`, `desktop_45_full_after_run`, `mobile_40~45`, `desktop_en_41`, `mobile_en_41`

| 구분 | 발견 | 근거 | 심각도 |
|---|---|---|---|
| 시각 | 헤드라인 숫자 3개가 모두 골드 그라데이션 텍스트(27px). '턴 30'처럼 입력값을 되돌려주는 칸이 총 데미지와 같은 위계 | style.css L184-185, index.html L114-116 | 중간 |
| 데이터 | 헤드라인은 **중앙값**, 기여 바·차트·로그는 **평균에 가까운 1회 표본**, 상단 메타는 **평균 ±표준편차**. 기준이 셋이라 합계가 서로 맞지 않음(예: 헤드라인 52,475,858 vs 기여 합계) | app.js `renderResults` L4655-4667, `#logOrder` 문구 | 중간 |
| 데이터 | 기여 바는 속성색. 같은 속성 캐릭터(리카노·하니엘 모두 화속성)는 색이 같음. 턴별 차트도 **캐릭터가 아닌 속성색**으로 누적해서 같은 속성끼리 구분이 불가능함 | app.js L4694 `background:var(--${actorEl[a]})`, `desktop_40` | 높음 |
| 데이터 | 턴별 차트에 y축·눈금·x축 턴 번호가 없음. 값은 hover 툴팁으로만 확인 가능. 모바일은 hover가 없어서 사실상 읽을 수 없음(추정: tap 시 :hover 에뮬레이션에 의존) | style.css L201-217, `desktop_42` | 높음 |
| 시각 | 기여 바 fill에 `box-shadow:0 0 16px -2px var(--el)` 글로우, 0.7s 스프링 폭 애니메이션 | style.css L192-193 | 낮음 |
| UX | 로그: 30턴 헤더를 전부 나열하고, 헤더 안에서 데미지는 가운데 정렬, 턴 번호는 왼쪽 absolute, caret은 10px `--faint`(2.8:1). 숫자 비교가 어렵고 펼칠 수 있다는 단서가 약함. 결과 영역 높이 약 2,200px(데스크톱 문서 3,693px) | style.css L222-232, `desktop_41` | 중간 |
| UX | 로그 펼침 3단(턴→행동→히트 분해→출처 팝업)은 정보 설계가 우수함. 계산식 칩(`.chan`)을 클릭하면 출처 팝업이 뜸 | `desktop_43b`, `desktop_44` | (양호) |
| UX | 행동 헤더에서 종류 배지(`.ak`)가 `left:50%` 절대 위치로 가운데에 떠 있어서, 이름이 긴 캐릭터는 배지와 겹칠 수 있음(추정) | style.css L255-256 | 낮음 |
| 모바일 | 헤드라인 3열이 16px로 축소되고 "최소 3,222만 ~ 최대 6,364만"이 3줄로 쪼개짐. en에서는 턴 칸 라벨이 "T" 한 글자 | `mobile_40`, `mobile_en_41_result_panel` | 중간 |
| 모바일 | FAB 5개가 로그 턴 행 6~10을 덮음 | metrics `mobile_main.covered`(첫 계측), `mobile_40` | 높음 |

### (6) 조합 비교하기
스크린샷: `desktop_60_cmp_empty`, `desktop_61_cmp_loaded`, `desktop_62_cmp_result`, `desktop_63_cmp_result_bottom`, `desktop_64_cmp_charinfo`, `desktop_65_cmp_prio`, `mobile_60~65`, `desktop_en_60_cmp`

| 구분 | 발견 | 근거 | 심각도 |
|---|---|---|---|
| UX | 두 select에 같은 팀 기록이 들어가면 라벨이 끝에서 잘려서("…30턴 · 5,306…") 구분할 수 없음. 차이가 나는 조건(턴 수 등)이 잘리는 뒷부분에 있음 | `desktop_62`, `mobile_61` | 높음 |
| UX | A는 오른쪽 정렬(row-reverse), B는 왼쪽 정렬이라 좌우 대칭 레이아웃. 가운데 열에 ◀ +8% 식 차이 표시. 개념은 좋지만 각 셀 바깥의 ▲▼(20×17) 버튼이 셀과 따로 떠 있음 | style.css L722-736 | 중간 |
| 모바일 | **A측 수치("1,535만")가 ▲▼ 버튼과 초상화 위에 겹치고, 캐릭터 이름은 숨겨지며, B측 수치는 오른쪽이 잘림("1,493")** | `mobile_61_cmp_loaded`, mobile.css L134-136(96px 가운데 열) | **치명** |
| 시각 | A=물색(파랑), B=골드. 사이트 전반에서 골드가 "주 행동/선택"을 뜻해서 B가 늘 선택된 것처럼 보임 | style.css L707-708, L770 | 중간 |
| 시각 | '비교하기' 버튼이 변경 대기 중(dirty)에 무한 펄스 | style.css L693-694 | 낮음 |
| 차트 | 누적 선 차트의 x축 마지막 눈금이 중복됨("11 1313"). 마지막 i 눈금과 n 눈금이 겹침 | `mobile_62`, app.js `renderCmpChart` L1183-1184 | 중간 |
| 문구 | "막대 위에 마우스를 올려 턴별 차이 보기": 선 차트인데 '막대'라고 하고, 터치 환경에서도 '마우스'라고 함 | `desktop_62` | 낮음 |
| 레이아웃 | 공통 설정 카드(288px)가 모달 옆에 별도 카드로 뜸. 1440에서는 괜찮지만, 모바일에서는 두 카드가 세로로 이어져 스크롤 컨테이너가 중첩됨 | style.css L684-688, mobile.css L121-130 | 중간 |

### (7) 가이드
스크린샷: `desktop_70_guide`, `desktop_71_guide_mid`, `mobile_70`, `mobile_71`

| 구분 | 발견 | 근거 | 심각도 |
|---|---|---|---|
| UX | 본문 스크롤 높이 16,002px(모바일 14,610px), 이미지 42장, 목차·앵커·검색 없음. 원하는 기능을 찾기 어려움 | metrics `desktop_guide` | 중간 |
| UX | `h3.g-sec`는 물색, `h4`는 골드로 제목 2단계에 서로 다른 강조색을 씀. 본문 13.5px `--text2` | style.css L555-556 | 낮음 |
| 시각 | 첫 화면 '팀 편성' 예시 이미지가 실제 UI 스크린샷이라 모달 안에 사이트가 한 번 더 보이는 느낌. 크롭 이미지는 적절함 | `desktop_70` | 낮음 |
| 유지보수 | 가이드 본문이 index.html 안의 한국어 정적 HTML(L195-396). 이미지 캡처가 kr 전용이라 언어를 바꿔도 이미지는 한국어로 남음(추정) | index.html | 중간 |

### (8) 패치 히스토리
스크린샷: `desktop_80_patch`, `desktop_81_patch_mid`, `mobile_80`, `mobile_81`

| 구분 | 발견 | 근거 | 심각도 |
|---|---|---|---|
| 시각 | 메이저 버전: 24px/900 골드 그라데이션 텍스트, 18px 발광 점, 최신은 파란 그라데이션. 마이너는 13.5px. 세로 타임라인 + 색 점 + 알약 배지 + 카테고리 점까지 장식 요소가 4겹 | style.css L601-632, L667-672 | 중간 |
| UX | 필터 칩 on 상태가 파란 그라데이션. 사이트의 다른 선택 상태(골드)와 다름 | style.css L597 | 낮음 |
| UX | 34개 항목, 스크롤 5,091px(모바일 7,372px). 최신 항목만 펼쳐져 있고 나머지는 접혀 있어서 적절함 | metrics `desktop_patch` | (양호) |
| 모바일 | 필터 칩 5개가 2줄로 줄바꿈되고 항목 본문 13px 줄간격이 촘촘함 | `mobile_80` | 낮음 |

### (9) 피드백
스크린샷: `desktop_90_feedback`, `mobile_90_feedback` (전송하지 않음)

| 구분 | 발견 | 근거 | 심각도 |
|---|---|---|---|
| 일관성 | CSS가 feedback.js 안에 문자열로 들어 있고 색이 하드코딩됨(#1a1814, #48402f, #6bd28c …). 토큰을 쓰지 않음 | feedback.js L55-77 | 중간 |
| 일관성 | FAB만 초록 그라데이션. 모달 z-index 60이라 다른 모달(80+)보다 아래에 뜸 | feedback.js L55-59 | 낮음 |
| UX | 제목 외 안내가 없음(어떤 정보를 쓰면 좋은지, 답변 여부). 전송 후 1.4초 뒤 자동으로 닫힘. 성공 문구에 이모지 🙌 | feedback.js L20, L127 | 낮음 |
| UX | GAS `no-cors` 전송이라 실패해도 성공으로 표시됨(코드 주석에 명시) | feedback.js L41-43 | 중간 |

### (10) 언어 전환 en/ja/zh
스크린샷: `desktop_{en,ja,zh}_01/02/10/13/20/31/33/34/41/60`, `mobile_{en,ja,zh}_*`, `desktop_95_lang_menu`, `mobile_95_lang_menu`

| 구분 | 발견 | 근거 | 심각도 |
|---|---|---|---|
| 넘침 | en "Battle Settings" 패널 제목이 2줄로 꺾임. "Guild Altar Settings"가 96px 고정 폭 제단 버튼 밖으로 넘침. "Advanced Action Setup" 버튼이 우선순위 라벨 아래 줄로 떨어짐 | `desktop_en_01_main_top`, style.css L1269 `min-width:96px` | 높음 |
| 넘침 | en 고급 설정 탭 "Sync (ultimate timing)"이 모바일에서 잘림. en 제단 헤더 "Enable" 라벨을 FAB이 가림 | `mobile_en_31_adv_time`, `desktop_en_20_altar` | 높음 |
| 미번역 | 우하단 "마지막 업데이트 26.09.26 02:11"이 모든 언어에서 한국어로 남음. EXACT 사전에는 '마지막 업데이트'가 있지만 노드 전체가 날짜를 포함한 문자열이라 EXACT가 매치되지 않고, PAT도 없음 | app.js L602, i18n.js L410, `desktop_en_01` | 중간 |
| 길이 | 한→영 길이 비: 보통공격→Normal attack 3.3×, 전투 설정→Battle Settings 3.0×, 호환 턴 전부 체크→Select all compatible turns 2.7×, 행동 고급 설정→Advanced Action Setup 2.6×, 길드 제단 설정 2.5×(표 4-4 참조). ja/zh는 대부분 0.5~1.4×라 영향이 적음 | i18n.js RES.en.EXACT | 중간 |
| 약어 | en 턴이 "1T", 헤드라인 턴 칸이 "T", 평/궁/방이 "A/U/D" | `mobile_en_41`, `desktop_en_31` | 중간 |
| 구조 | i18n 방식이 5가지로 나뉨: i18n.js DOM 덮어쓰기(EXACT/PAT/REGEX/SUB) + app.js 로컬 사전 `advT`/`altarT`/`tdmgT`(L1658, L3191, L2882) + feedback.js 자체 T(L19-25) + 패치노트 JSON. 메뉴와 FAB도 i18n.js 안에 CSS 문자열로 주입됨(L3388-3400) | 좌동 | 중간 |
| 가로 넘침 | 모바일 en/ja/zh 문서 폭 459/470/461px(첫 실행 뒤). 한국어보다 넘침 폭이 큼 | metrics_mobile | 치명(1-모바일 항목과 동일 원인) |

### (11) boss.html 보스 시뮬 (로컬 전용)
스크린샷: `desktop_boss_01_top`, `desktop_boss_02_full`, `desktop_boss_10_char_modal`, `desktop_boss_40_result_view`, `desktop_boss_41_result_full`, `mobile_boss_01/02/10/40/41`

| 구분 | 발견 | 근거 | 심각도 |
|---|---|---|---|
| 배포 | 라이브에서 404. `.gitignore:15`로 저장소에서 제외되어 있고 `/api/boss`(server.py)에 의존함. 즉 정적 사이트로 동작하지 않음 | curl 404, boss.js L10-13 | 참고 |
| 코드 | boss.css가 style.css의 :root 토큰과 기본 컴포넌트를 복제(L1-40 동일). mobile.css를 링크하지 않음 | boss.html L8 | 중간 |
| 모바일 | 결과를 본 뒤 문서 폭이 651px로 늘어남(390 대비 +261px) | metrics_mobile `mobile_boss_result scrollW 651` | 높음(로컬 한정) |
| 데이터 | "보스 HP 추이"를 단색 살몬 막대 7개로 표시(추이는 선 차트가 적합). 축 없음 | `desktop_boss_40` | 중간 |
| 시각 | 결과 배너 '실패' 빨강, HP 바 빨강 그라데이션, 생존 카드는 흑백 초상 필터. 메인 사이트와 톤은 일관됨 | `mobile_boss_40` | (양호) |
| UX | 우하단 "⚔ 조합 시뮬레이터 하러가기"(빨강 테두리) + "개발 모드 · 로컬" 표시. 메인 사이트에서 보스 페이지로 가는 링크는 없음 | boss.html L128 | 낮음 |

### (12) 모바일 390px 종합
위 표의 "모바일" 행을 모은 것. 추가 계측값:

| 항목 | 값 | 근거 |
|---|---|---|
| 44px 미만 인터랙티브 요소(메인, 첫 로드) | **85 / 139 (61%)** | metrics_mobile `mobile_main` |
| 스펙 패널을 열었을 때 | 197 / 258 (76%) | `mobile_spec_panel` |
| 고급 설정 타임라인 | 163 / 217 (75%) | `mobile_adv_time` |
| 주요 소형 타깃 | `.rm` 17×17(5개), 턴 칩 24×24(30개), `.mv` 30×20(10개), 세그먼트 32×27(20개), `#histManage` 30×30, `.adv-open` 82×27, proc-btn 96×31, 슬라이더 트랙 높이 4px | `smallByClass` |
| 문서 높이 | 첫 로드 2,258px → 결과 후 4,354px(로그 30행) | metrics |
| 가로 넘침 | 첫 로드 0 → 첫 실행 뒤 +36px(kr), +69~80px(en/ja/zh) | metrics_mobile |
| 고정 요소 | 우상단 Language(z32), 우하단 패치(bottom 148)·비교(108)·가이드(74)·피드백(40)·업데이트(10). 세로로 약 180px를 오른쪽 110px 폭이 상시 점유 | mobile.css L140-142, style.css L675, feedback.js L55, i18n.js L3388 |

---

## 2. "AI가 만든 것처럼" 보이게 하는 요소

| # | 요소 | 근거(스크린샷 / CSS 줄) |
|---|---|---|
| 1 | **골드 135° 그라데이션을 모든 주요 버튼에 사용**: `linear-gradient(135deg,var(--gold),var(--gold-d))`가 13회(실행, 비교하기, 활성 proc-btn, plan-fill on, adv-open on, ci-swap hover, io-big, up-toast, logo-mark 등) | style.css L36, L73, L172-174, L423, L540, L690, L760, L807, L847, L884, L1078 |
| 2 | **그라데이션 텍스트(`-webkit-text-fill-color:transparent`)** 4곳: 로고, 헤드라인 숫자, 패치 메이저 버전 2종 | style.css L38-39, L184-185, L617-621 · `desktop_40`, `desktop_80` |
| 3 | **골드 글로우 box-shadow** 23곳 + 속성색 글로우(로스터 점, 기여 바, 별/하트 pip text-shadow) | style.css L37, L74, L111, L174-175, L193, L1174, L1216-1217 |
| 4 | **배경 radial "glow" 블롭 2개**(골드 우상단 + 보라 좌상단): 전형적인 다크 SaaS 랜딩 기법 | style.css L20-24 (boss.css에도 복제) |
| 5 | **이모지를 아이콘으로 사용**: 🎲 ❤️ 🩸 💥 ⚔️ 📖 📜 💬 🌐 ⚙ ⚠️, app.js 내 📌🔒🛡🗡💤 등 약 60개 | index.html L52-54, L84, L175-177, L184, L194; feedback.js L20; i18n.js L3405 · `desktop_01` |
| 6 | **알록달록 캡슐 FAB 무리**: 골드/파랑/초록 그라데이션 + 컬러 그림자 + hover translateY. 기능 위계가 없는 "버튼 모음" | style.css L539-547, L581-584; feedback.js L55-58; i18n.js L3388-3391 · `desktop_01`, `mobile_01` |
| 7 | **카드 안의 카드 안의 카드**: panel > chart-card/log-card > turn > act > hit. 테두리+radius 블록 선언 81개, radius 22종(3~20px) | style.css 전반 · `desktop_43b` |
| 8 | **설명문이 UI를 대신함**: 라벨 괄호 설명, 안내 박스 15종, 궁극기 탭 규칙 ol 4항목, 모든 버튼에 긴 title 툴팁. em dash "—"가 index 37개 + app.js 296개 | index.html L60-96, `desktop_33_adv_ult` |
| 9 | **과한 모션 기본값**: 모달 `pop` 스프링 overshoot `cubic-bezier(.2,.9,.3,1.2)`, 행 stagger 진입, 거의 모든 버튼 hover `translateY(-1px/-2px)`, 무한 펄스(비교 dirty·업데이트 토스트·fedGlow). `transition:.14s` 식 all-shorthand 57회 | style.css L336-337, L1344-1346, L106, L175, L459-465, L522-525, L693-694 |
| 10 | **골드 대문자 자간 킥커**(`.cs-kick` letter-spacing .14em uppercase) + 제목 조합. 한국어에는 uppercase 효과도 없음 | style.css L1112 · `desktop_13` |
| 11 | **글래스 알약**: backdrop-filter 12회(상단바, 모달 배경, 마지막 업데이트 표시, 툴팁) | style.css L33, L333, L537, L783 |
| 12 | **색 점 + 알약 배지 범례 남용**: 패치 카테고리 점/배지, 제단 체크 원, 타임라인 점 링 글로우 | style.css L598, L603-616, L640, L1338-1341 · `desktop_80` |
| 13 | **"다크 + 골드 = 프리미엄" 기본 팔레트**: 따뜻한 무채색 7단계 + 골드 3단계 + 6속성색 + good/bad. 게임 고유 아이덴티티(원작 UI 색·폰트) 참조 없음 | style.css L2-11 |
| 14 | **친근체 마이크로카피 + 이모지**: "~해요", "감사합니다! … 🙌", "최초 1회만 (~10초), 이후엔 캐시되어 빨라요" | index.html L18, feedback.js L20 |

---

## 3. 코드 구조 표

### 3-1. `:root` 토큰 (style.css L2-11)

| 그룹 | 토큰 | 값 | 참조 수 | 비고 |
|---|---|---|---|---|
| 배경 | `--bg` `--bg2` `--panel` `--panel2` `--raise` | #0d0c0a #141210 #1a1814 #221f19 #2a261d | 7 / 78 / 33 / 14 / 2 | 5단계 차이가 미세함(bg→panel 명도 차 약 4%) |
| 선 | `--line` `--line2` | #322d22 #48402f | 93 / 77 | bg2 대비 1.37:1 / 1.82:1. 비텍스트 대비 3:1 미달(컨트롤 경계 식별 약함) |
| 텍스트 | `--text` `--text2` `--muted` `--faint` | #f3eede #cfc7b4 #928b7a #615c50 | 36 / 70 / 95 / 55 | `--faint`는 텍스트 용도로 **2.66~2.94:1 → WCAG AA 미달** |
| 강조 | `--gold` `--gold-d` `--gold-soft` | #e8b84b #caa036 #3a2f14 | **146** / 61 / 42 | 골드 하나가 선택·주 행동·수치·경고·제목을 모두 담당 |
| 속성 | `--fire` `--water` `--wood` `--light` `--dark` `--none` | … | 11 / 36 / 6 / 2 / 3 / 2 | `--water`는 가이드·패치·비교 A 색으로도 겸용 |
| 상태 | `--good` `--bad` | #74e0a0 #ff7a6b | 15 / 31 | warning 토큰 없음 → #e0bc6e 하드코딩(L433, L1061) |
| 형태 | `--r` `--r2` | 14px 10px | 6 / 4 | radius 선언 176개 중 10개만 토큰 사용 |
| 폰트 | `--pretendard` | Pretendard Variable | 2 | |
| 없음 | 간격, 폰트 크기, 그림자, z-index, 모션 duration/easing | — | — | 전부 하드코딩 |

대비 계산(WCAG 2.x, 실제 hex 기준):

| 전경 \ 배경 | bg #0d0c0a | bg2 #141210 | panel #1a1814 | panel2 #221f19 |
|---|---|---|---|---|
| text | 16.85 | 16.10 | 15.27 | 14.16 |
| text2 | 11.62 | 11.11 | 10.54 | 9.77 |
| muted | 5.77 | 5.51 | 5.23 | **4.85** |
| **faint** | **2.94** | **2.81** | **2.66** | **2.47** |
| gold | 10.60 | 10.13 | 9.61 | 8.91 |
| water / fire / dark / bad | 8.86 / 7.59 / 7.35 / 7.68 | 8.46 / 7.26 / 7.02 / 7.34 | … | … |

특이 조합: `.btn-danger` 흰 글자 on #ff7a6b = **2.55:1**(L372-373) · `--muted` on `--gold-soft` = 3.88:1 · `.log .line.k-필살 .who` = gold-soft on panel **1.35:1**(L240, 단 해당 클래스는 현재 렌더에서 쓰이지 않는 것으로 추정) · 버튼 텍스트 #0d0c0a on gold = 10.6:1(양호) · 가이드 FAB #06121d on #3a93db = 5.73:1(양호).

### 3-2. 컴포넌트 클래스와 사용 빈도 (app.js + index.html + feedback.js 정적 참조 수)

| 역할 | 클래스(참조 수) | 비고 |
|---|---|---|
| 주 버튼 | `.btn-run`(1) `.cmp-run`(1) `.io-big`(4) `.fb-send`(인라인 CSS) | 4종이 모두 골드 그라데이션인데 패딩·radius·폰트가 다름(13~15px, r10~11) |
| 보조/고스트 | `.btn-ghost`(22) `.btn-ghost.sm`(24) `.proc-btn`(7) `.adv-open`(1) `.spec-open`(1) `.ci-spec`(1) `.ci-swap`(1) `.ct-prio`(3) `.plan-fill button`(9) `.adv-add button` `.cp-add` `.adv-clip button` `.adv-selbar button` `.adv-teamwarn button` | **같은 역할에 14종**. 골드 틴트 알약(`.adv-open/.spec-open/.ci-spec/.ci-swap`)만 4종 |
| 세그먼트 | `.seg`(26) `.elseg` `.ult-modes` `.sm-base/.sm-ord/.sm-other` `.as-miss` | 기반은 하나이고 크기 오버라이드가 많음 |
| 토글 | `.toggle`(72) | 크기 변형 3종(L409, L1318, L1235), input `display:none` |
| 칩 | `.turn-chips button` `.adv-rail button` `.pf-chip`(2) `.roster-filter button` `.as-m` | 선택 시 채움: 골드(4종) vs 파랑 그라데이션(pf-chip) |
| 닫기 | `.mc-close`(15) `.adv-x`(3) `.cp-x`(1) `.fb-x` `.hist-clear`(⚙) | 5종, 20~30px |
| 모달 컨테이너 | `.modal`(36) `.modal-card` `.hist-card` `.guide-card` `.patch-card` `.cmp-card` `.cmp-setcard` `.adv-card`(6) `.pr-card` `.io-card` `.ci-card` `.sp-card` `.sw-card` `.pp-card` `.fb-card` + 오버레이 `.priopop/.iopop/.cmpinfo/.sealpop/.swappop/.planpop/.advpop` | **카드 15종·오버레이 8종**. 배경(그라데이션/단색), radius(14/16), 그림자가 제각각 |
| 안내 박스 | `.hint`(6) `.adv-hint`(3) `.altar-hint`(4) `.adv-note`(4) `.g-note`(9) 외 10종 | §1-(4) 참조 |
| 태그/배지 | `.tag`(17) `.ak-*` `.gtag` `.pr-badge` `.sk-pin` `.sr-need/.sr-pin` `.spec-badge` `.hit-ctr` `.in-red` `.adv-scope` | 10종 |
| 정적 참조 0 | `fed-pick` `proc-row` `mc-ctrl` `mc-rot` `grip` `ci-planbtn` `cmp-diff` `cd-*` `as-title` `g-hl` `hide` `k-필살/k-발동/k-시전` 등 | `ak-*`, `cat-*`, `dot-*`, `el-*`는 템플릿 문자열로 **동적 생성**(예: app.js L4773 `ak-${KCLASS[kind]}`). 나머지는 사용하지 않는 CSS로 **추정** |

규모: CSS 클래스 약 580개, `cursor:pointer` 선언 74개, 테두리+radius 블록 81개.

### 3-3. 하드코딩된 색·크기

| 항목 | 수치 | 예 |
|---|---|---|
| `:root` 밖 hex | 61회 | `#0d0c0a` 34회(버튼 위 글자색, 토큰 `--bg`와 같은 값인데 변수 미사용), `#3a93db` 4, `#fff` 4, `#a98a2e`·`#b58e30`(그라데이션 끝색), `#e0bc6e`(경고) |
| rgba() | 142회 | `rgba(232,184,75,*)` 골드 알파 12단계, `rgba(84,182,255,*)`, `rgba(255,122,107,*)`. 토큰에 알파 변형이 없음 |
| font-size | **22종** 8~27px(0.5px 단위: 9.5/10.5/11.5/12.5/13.5/14.5) | 최다 11px(55) 11.5px(49) 12px(47) |
| font-weight | 400/500/600/700/800/900 | 600이 83회 |
| border-radius | **22종** | 8px(38) 6px(27) 9px(21) 7px(19) … |
| padding | **109종** | |
| z-index | 18단계(-1~210) | 모달 80, 소스 팝업 90, cmpinfo 120, planpop 130, 각종 pop 140, advpop 150, cellpop 160, boot/toast 200, up-toast 210, FAB 30~33, 피드백 모달 60 |
| 외부 파일 CSS 주입 | feedback.js L54-77, i18n.js L3386-3400 | 토큰 미사용 hex |
| app.js 인라인 style | 33곳 | `--el`/`--p`/`--i`/`--n` 변수 전달(정상 용도) + `color:var(--gold)` 하드 스타일 6곳(L1002-1003, L4048-4049), `margin-top` 등 |

### 3-4. i18n 텍스트 길이 차이가 큰 항목 (i18n.js `RES.*.EXACT`, 468키/언어)

| 한국어 | en | en/kr | ja | zh | 영향 위치 |
|---|---|---|---|---|---|
| 보통공격 | Normal attack | 3.3× | 通常攻撃 | 普通攻擊 | 로그 `.ak` 배지(중앙 absolute) |
| 전투 설정 | Battle Settings | 3.0× | 戦闘設定 | — | 패널 제목 → **2줄 꺾임** |
| 공통 전투 설정 | Common Battle Settings | 2.8× | 共通戦闘設定 | 共用戰鬥設定 | 비교 설정 카드 |
| 기록 관리 | Manage History | 2.8× | 記録管理 | — | |
| 호환 턴 전부 체크 | Select all compatible turns | 2.7× | 互換ターンを全選択 | 勾選所有相容回合 | 고급 설정 툴바 |
| 필살기 | EX Skill | 2.7× | 必殺技 | 必殺技 | |
| 행동 고급 설정 | Advanced Action Setup | 2.6× | 行動詳細設定 | 行動進階設定 | 우선순위 옆 버튼 → **줄바꿈** |
| 더미 속성 | Dummy Element | 2.6× | ダミー属性 | 假人屬性 | |
| 길드 제단 설정 | Guild Altar Settings | 2.5× | ギルド祭壇設定 | 公會祭壇設定 | 96px 버튼 → **넘침** |
| 피격 데미지 / 턴별 데미지 / 팀 편성 | Incoming Damage / Damage per Turn / Team Setup | 2.5× | | | |
| 연동 (궁 맞추기) | Sync (ultimate timing) | 2.2× | 連動（必殺同期） | | 탭 → **모바일 잘림** |
| 평 / 궁 / 방 | A / U / D | 1.0× | 通/必/防 | 普/必/防 | 의미 전달 약함 |
| 마지막 업데이트 {날짜} | (미적용) | — | — | — | EXACT 불일치로 **미번역** |

EXACT에 없는 주요 라벨(PAT/SUB나 로컬 사전으로 처리): 확률 100%, 체력 10%, 턴 피해, 정해진 턴, 정해진 턴만, 준비되면 바로, 활성화, 가이드, 피드백, 패치 히스토리.

### 3-5. 모션(transition / animation) 현황

| 종류 | 수 | 내용 |
|---|---|---|
| `transition` 선언 | 81 | all-shorthand(`.12s`/`.14s`/`.1s`…) 57회 → 레이아웃 속성까지 전환 대상. 지속시간 9종(.1~.7s) |
| `@keyframes` | 16 | pop, barFlash, fedGlow, fedFlash, upDrop, upPulse, cmpPulse, sp, spIn, spOut, spRow, spInSheet, spOutSheet, spInC, spOutC, altarIn |
| `animation` 선언 | 30 | 모달 진입 스프링 overshoot(`cubic-bezier(.2,.9,.3,1.2)`), 제단 행 stagger(26ms×i) |
| 무한 반복 | 4 | fedGlow 2.8s(L459), upPulse 2s(L522), cmpPulse 1.3s(L693), 스피너 |
| `prefers-reduced-motion` 블록 | 6 | 대응: fedGlow, fedFlash, adv, spec, altar/tdmg. **미대응: upPulse, cmpPulse, 모달 pop, hover translateY, 기여 바 0.7s** |
| hover 이동 | 약 8 | `.rc` -2px, `.btn-run`, FAB 3종, `.altar-btn`, `.lang-fab`, `.fb-fab` -1px |
| JS 모션 | — | `tweenNum` 숫자 롤링(app.js L3793, `_reduceMotion` 체크 있음), 기여 바 폭 rAF(L4683) |

---

## 4. 리디자인 영향 범위 분류

### A. CSS만 바꿔도 되는 부분 (style.css / mobile.css)
1. **토큰 재정의**: 팔레트, `--faint` 상향(최소 #8a8373급, 4.5:1), 경고 토큰 추가, 알파 변형 토큰, 간격·폰트·radius·그림자·z-index·모션 토큰 신설. `#0d0c0a` 34곳을 `var(--on-accent)`로 치환
2. **골드 그라데이션·글로우·그라데이션 텍스트·배경 블롭 제거**(L20-24, L36-39, L73-74, L172-175, L184-185, L192-193, L539-547, L581-584, L613-621)
3. **타이포 스케일 축소**(22→6~7단계), radius 22→3단계, 패딩 정규화
4. **모바일 가로 넘침 수정**: `.topbar-hist{min-width:0}`, `#history{width:100%}`, `.chart .tip{visibility:hidden}` 또는 `display:none` 기반 전환, `.adv-card` 모바일 폭·탭 가로 스크롤(L42-44, L206-209, L969-974, L1422)
5. **터치 타깃 44px**: mobile.css에서 `.seg button`, `.turn-chips button`, `.mv`, `.adv-row .acts button`, `.hist-clear`, `.rm`(상시 표시), 슬라이더 thumb/트랙 확대
6. **포커스 링 전역**: `:focus-visible{outline:2px solid …;outline-offset:2px}`, `outline:none` 5곳 대체
7. **토글 접근성**: `.toggle input{display:none}` → 시각적 숨김(`position:absolute;opacity:0;width:1px…`)으로 바꾸면 마크업 변경 없이 키보드 포커스 가능 + `input:focus-visible+.sw` 링
8. **FAB 겹침 완화(임시)**: `.wrap`에 FAB 폭만큼 우측 padding, 데스크톱 제단 패널을 FAB보다 위(z)로. 근본 해결은 B-1
9. **모션 정리**: all-shorthand → 속성 지정, overshoot 제거, stagger/무한 펄스 제거 또는 reduced-motion 확대
10. **안내 박스 15종 → 2~3종 시각 통일**(클래스는 그대로 두고 규칙만 통합)
11. **버튼 계층 통일**: 주/보조/고스트/위험 4단계로 기존 14종 클래스의 선언을 통합(클래스명 유지)
12. **비교 모바일 겹침**: `.cmp-awrap/.cmp-bwrap` 모바일 레이아웃 재배치(mobile.css L133-136)
13. **dead CSS 제거**(추정 목록 §3-2)
14. **boss.css**: style.css + 추가분만 남기고 mobile 규칙 추가(단, boss.html `<link>` 변경은 B)

### B. index.html 마크업을 바꿔야 하는 부분
1. **FAB 5개 통합**: `#cmpBtn`·`#guideBtn`·`#patchBtn`(L175-177), `.last-update`(L178)을 상단바 메뉴/도움말 드롭다운으로 이동. Language·피드백 FAB은 각각 i18n.js·feedback.js가 주입하므로 C/별도 파일 수정 필요
2. **필드 라벨/설명 분리**: `<span>라벨 <em>설명</em></span>`(L60, L67, L77, L82, L90, L96) → 라벨 + 별도 help 텍스트(또는 ⓘ 툴팁) 구조
3. **전투 설정 헤더 재구성**: proc-stack(L50-57)의 토글 3개 + 제단 진입 버튼을 "모드 토글 그룹"과 "고급 패널 진입" 두 그룹으로 분리. 이모지 제거
4. **결과 헤더**: `hero-stats`(L113-117)에 기준(중앙값/평균) 명시 구조, 턴 칸 위계 축소
5. **가이드**: 목차/앵커 추가(L195-396), 정적 한국어 HTML → 데이터화 검토
6. **아이콘 체계**: 이모지 텍스트(L52-54, L84, L175-177, L184, L194, L417-418, L434)를 SVG 아이콘으로
7. **비교 모달**: `.cmp-pick` select(L405-409) 라벨 요약 표시 영역 추가
8. **boss.html**: mobile.css 링크, 공통 CSS 분리(L8)

### C. app.js 렌더 함수를 건드려야 하는 부분

| 목적 | 함수(줄) | 내용 |
|---|---|---|
| 슬롯·로스터 키보드 접근 | `renderTeam` L1501, `renderRoster` L1386 | `<div>` → `<button>`(또는 role/tabindex + Enter/Space), `.rm` 노출 방식 |
| 차트 색 기준·축 | `renderResults` L4649(차트 L4690-4701) | 속성색 → 캐릭터별 고유색, 축/눈금/턴 라벨 마크업, 탭(터치) 툴팁 |
| 기여 바 | `renderResults` L4676-4684 | 같은 속성 구분(캐릭터 색/패턴), 글로우 제거는 CSS |
| 헤드라인 기준 통일 | `renderResults` L4655-4667 | 중앙값/평균 표기 정리, topMeta 문구 |
| 로그 헤더 정렬 | `renderLog` L4708(L4717), `renderActions` L4747 | 턴·데미지 열 정렬 구조, 30턴 요약/페이징 |
| 캐릭터 모달 | `openModal` L4009-4058, `ultSummaryHTML` L3410, `renderPlanner` L4430, `renderSkills` L4516 | 카드 중첩 축소, 인라인 `color:var(--gold)` 제거, 스펙 진입 버튼 위치 |
| 스펙 패널 | `renderSpec` L3842 | 슬라이더 인라인 `--p`는 유지, 구조 조정 시 |
| 고급 설정 3탭 | `openAdvPop` L2452, `renderAdv` L2112, `renderAdvUlt` L2288, `renderAdvSync` L2320, `renderAdvGrid` L2051, `renderCellPop` L2080, `ultRowHTML` L2267 | 탭 `aria-selected`/키 이동, 규칙 ol 축소(접기), 행 버튼 크기·배치, 안내 박스 클래스 통일 |
| 제단/턴 피해 | `altarHeadHTML` L3515, `altarBodyHTML` L3522, `openAltar` L3562, `tdmgHeadHTML` L2942, `tdmgBodyHTML` L2949, `openTdmg` L2991 | 별/달 의미 구분 시각화, 꺼짐 상태 표현, 무관한 토스트 |
| 조합 비교 | `renderCmpLane` L747, `cmpCell` L741, `midHtml` L733, `renderCmpChart` L1172(축 중복 L1183-1184), `openCmpInfo` L780, `openPrioPop` L1101, `bindCompare` L1240(옵션 라벨) | 모바일 셀 구조, 축 라벨 버그, select 라벨 요약 |
| 기록/내보내기 | `renderHistory` L146, `renderHistList` L218, `openExportPop` L537, `openImportPop` L564 | 이모지(📌🔒) 제거, select 라벨 길이 |
| 패치 히스토리 | L5015-5060(`badge`, `faces`, `renderFilters`, `render`) | 메이저/마이너 장식 축소 |
| 토스트 | `toast` L4547, `notifyUpdate` L4560 | 무한 펄스, 위치 |
| i18n 로컬 사전 | `advT` L1658, `altarT` L3191, `tdmgT` L2882, 마지막 업데이트 L595-602 | 날짜 포함 문자열의 번역 경로(PAT 추가는 i18n.js 쪽) |
| 외부 주입 UI | i18n.js `injectUI` L3385-3417, feedback.js `injectUI` L53-133 | FAB 위치·CSS 문자열 → 토큰 기반 스타일시트로 이관(app.js는 아니지만 JS 수정 필요) |

---

## 5. 핵심 결론
1. **가장 급한 결함은 모바일 레이아웃 붕괴다.** 첫 시뮬레이션을 실행해 기록이 하나 생기면 긴 기록 라벨(`.topbar-hist` min-width 누락)과 숨겨진 차트 툴팁 때문에 문서 폭이 390px에서 426~470px로 늘어나고, 모든 모달·FAB의 오른쪽이 잘린다. CSS 몇 줄로 고칠 수 있다.
2. 고정 FAB 6개가 3가지 색으로 흩어져 있고, 데스크톱에서도 제단 패널의 '사용' 스위치를 덮는다. 전역 메뉴로 통합하는 것이 레이아웃과 "AI스러움"을 동시에 줄이는 가장 큰 한 수다.
3. "AI스러움"의 주원인은 골드 그라데이션(13회)·글로우(23곳)·그라데이션 텍스트·배경 블롭·이모지 아이콘·카드 중첩·설명문 과다다. 대부분 토큰과 CSS 교체로 해결되고, 마크업(B)은 FAB·라벨 구조·아이콘 정도만 손보면 된다.
4. 접근성은 토글 input `display:none`, div 클릭 요소, 포커스 링 부재, `--faint` 2.8:1 대비, 모바일 터치 타깃 61% 미달이 핵심이다. 토글과 대비는 CSS로, 슬롯·로스터는 `renderTeam`/`renderRoster` 마크업 수정으로 해결한다.
5. 데이터 표현(차트 축 없음, 속성색 누적으로 같은 속성 구분 불가, 중앙값/평균 혼재)과 조합 비교 모바일 겹침은 app.js 렌더 함수(`renderResults`, `renderCmpLane`, `renderCmpChart`) 수정이 필요한 범위다.
