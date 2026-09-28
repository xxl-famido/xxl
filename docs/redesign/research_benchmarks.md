# UX 벤치마크 리서치 — XXL WOOFIA 전투 시뮬레이터 리디자인

작성 2026-09-28 · 모든 스크린샷은 로컬 `bench/` 폴더(puppeteer-core + 로컬 Chrome headless, 데스크톱 1440×900 / 모바일 390×844 iPhone UA)로 촬영했음. 외부로 올린 것은 없음.
표기 규칙: 출처 URL이 없는 판단은 **(추정)** 으로 표시함. 캡처 스크립트는 `bench/shoot*.js`.

---

## 0. 요약

1. **설정이 많은 계산기는 모두 "기본값으로 바로 실행 가능 + 고급은 접힘"** 구조를 씀. 제일 좋은 예는 Raidbots와 Genshin Optimizer의 **"접힌 섹션 헤더에 현재 값 요약을 한 줄로 보여주기"**(예: `Simulation Options: Smart Sim, Patchwerk, 1 Boss, 5 minutes`). 펼치지 않아도 무엇이 설정됐는지 보임. WOOFIA에 가장 먼저 도입할 패턴임.
2. **결과는 "헤드라인 1개 → 분해(기여 바) → 원시 로그" 3단계 드릴다운**이 업계 표준임(Raidbots Quick Sim, FFLogs). 로그는 기본으로 접혀 있고, "평균값(요약)"과 "샘플 1회(로그)"를 명시적으로 구분함. WOOFIA도 이 구조를 이미 갖췄으니 **정리·강조** 수준의 개선이면 충분함.
3. **실시간 재계산 도구(Showdown calc)는 결과를 입력보다 위에** 둠. WOOFIA처럼 "실행" 버튼이 있는 도구(Raidbots, Penguin Planner)는 **실행 CTA를 항상 보이게** 함(Raidbots = 설정 바로 아래 고정 위치, Penguin = 플로팅 FAB).
4. 모바일에서는 **"한 페이지 스크롤 + 고정 실행 바 + 결과로 자동 스크롤"**이 WOOFIA의 반복 사용 패턴(편성 조금 바꾸기 → 재실행 → 비교)에 맞음. 스텝(위저드)형은 NN/g 기준으로 "초보자·드문 작업"에 유리하고 **반복 사용자에게는 짜증을 유발**함. 대신 첫 방문 온보딩이나 "빠른 시작" 경로로 부분 도입할 수 있음.
5. 현재 WOOFIA의 가장 큰 문제(캡처 `bench/current_woofia_*`): ① 데스크톱에서 좌측 편성 패널이 짧고 우측 설정 열이 길어 **빈 공간이 크고 실행 버튼이 화면 밖**에 있음. ② 모바일은 전체 약 4,350px 단일 스크롤이고 **실행 버튼이 약 1/3 지점, 결과는 그 아래**에 있음. ③ 플로팅 버튼(Language·패치·조합 비교·가이드·피드백) 5개가 콘텐츠를 가림.

---

## 1. 현재 WOOFIA (기준점)

| 데스크톱 | 모바일(전체 페이지 축소) |
|---|---|
| ![](bench/current_woofia_desk_full.png) | ![](bench/current_woofia_mob_full.png) |

- 데스크톱: 좌측 팀 편성(5슬롯 + 44명 로스터 + 속성 칩)과 우측 전투 설정(슬라이더 2개, 세그먼트 4개, 우선순위 목록, 턴 1~30 토글 그리드, 실행 버튼)을 2열로 배치함. 우측 열이 약 1,300px로 좌측의 2배라서 **좌측 하단이 비어 있고, 실행 버튼은 첫 화면(900px) 밖**에 있음.
- 모바일: 편성 → 설정 → 실행 → 결과(헤드라인 52,297,452 / 기여 바 / 턴 차트 / 30턴 로그) 순서의 한 줄 스크롤임. 실행 후 결과를 보려면 직접 스크롤해야 함(자동 스크롤 여부는 미확인, **추정**). 우하단 플로팅 버튼들이 로그 행과 겹침.

---

## 2. 사례별 카드

### 2-1. Raidbots (WoW 시뮬레이터) — "접힌 섹션 + 요약 헤더"의 교과서
![](bench/raidbots_desk.png) ![](bench/raidbots_mob.png)
- **정보 구조**: 상단 도구 탭(Top Gear / Droptimizer / Quick Sim / Advanced) → 입력(SimC 텍스트 붙여넣기 / Armory / History 탭) → **접힌 아코디언들**(Simulation Options, Custom APL, Report…) → 실행 버튼 + High Precision 체크. 결과는 **별도 리포트 페이지**(공유 URL)로 보여줌.
- **설정 컨트롤**: 아코디언 헤더에 현재 값을 요약해 둠 — `Simulation Options: Smart Sim, Patchwerk, 1 Boss, 5 minutes, SimC Weekly`. 기본값만으로도 바로 실행할 수 있음.
- **결과 시각화**: 헤드라인 DPS를 페이지 제목과 상단에 표시함(예: 리포트 제목 "Quick Sim - Nibana - 2,285,454 DPS"). 그 아래 순서는 ① Damage Breakdown(주문 계열별 색상 가로 바, 화살표로 하위 항목 펼침) → ② Buff Uptime(100% 버프는 위 섹션으로 따로 분리) → ③ Sample Ability Log(**1회 반복 예시**, 클릭해서 펼침). 요약은 전체 반복의 평균이고 로그는 1회분이라는 점을 문서에 명시함.
- **통계 표현**: Margin of Error를 표기하고, 오차 범위 안의 조합을 "sidegrade"로 묶어 "이 안에서는 뭘 골라도 됨"이라고 안내함.
- **모바일**: 탭이 세로로 쌓이는 반응형임. 실행 버튼은 입력 바로 아래에 있음.
- 잘한 점: 요약 헤더, 오차 안내, 평균과 샘플의 구분. 아쉬운 점: 입력 텍스트박스가 모바일에서 거의 쓸모가 없음.
- 출처: https://www.raidbots.com/simbot/quick · https://support.raidbots.com/article/65-detailed-stats-in-quick-sim · https://www.icy-veins.com/wow/how-to-use-the-top-gear-feature-of-raidbots · https://support.raidbots.com/article/59-droptimizer-how-does-it-work

### 2-2. Pokémon Showdown Damage Calculator — 결과를 맨 위에, 실시간 재계산
![](bench/showdown_calc_desk.png) ![](bench/showdown_calc_mob.png) ![](bench/showdown_onevsall_desk.png)
- **정보 구조**: 세대 탭 + 모드 탭(One vs One / One vs All / All vs One) → **결과가 최상단**(양측 기술 4개 × 데미지 % 범위, 선택한 기술의 상세 문장 "…162-192 (50.4 - 59.8%) -- guaranteed 2HKO", 가능한 난수 목록) → 3열(Pokémon 1 | Field | Pokémon 2).
- **컨트롤**: 드롭다운, 숫자 입력, 세그먼트 버튼(날씨·지형·레벨), 토글 버튼(Reflect, Helping Hand 등). 실행 버튼 없이 **입력 즉시 재계산**함.
- **결과**: 헤드라인은 "범위 + KO 확률" 한 문장이고, 드릴다운은 난수 전체 나열임. One vs All 모드는 정렬·검색이 되는 테이블.
- **모바일**: 반응형이 아님(데스크톱을 그대로 축소). App Store 리뷰에 "PC에서는 최고지만 모바일 웹에서는 매우 쓰기 어렵다"는 평이 있음.
- 잘한 점: 결과를 위에 두기, 범위와 확률을 한 문장으로 표현하기(WOOFIA의 편차 밴드와 같은 개념), 모드 분리. 아쉬운 점: 모바일, 조밀한 폼.
- 출처: https://calc.pokemonshowdown.com/ · https://apps.apple.com/app/id1554958775 · https://www.poketools.com/damage-calculator

### 2-3. Genshin Optimizer (frzyc) — 팀 = 탭, 적 설정 = 요약 바
![](bench/genshin_opt_newteam_desk.png)
- **정보 구조**: 팀 페이지의 상단 탭 = `Team Settings | Character 1 | 2 | 3 | 4`. 팀, 캐릭터, 탭 선택이 URL(`/teams/:teamId/:characterKey?/:tab?`)에 반영되어 공유와 뒤로가기가 됨. 캐릭터 안에는 다시 Overview / Theorycraft / Optimize 탭이 있음.
- **설정**: 적 설정(레벨, 8원소 저항, 방깎)을 **한 줄 요약 바(`Enemy 100 · 10% 10% … DEF Red. 0%`) + 펼침 셰브런**으로 처리함. Raidbots와 같은 패턴임.
- **팀 규칙 안내**: "첫 번째 슬롯이 필드 캐릭터로 버프를 받음" 같은 규칙을 인라인 info 배너로 알려줌.
- **모바일**: 반응형이지만 광고가 화면 대부분을 덮어 실사용이 어려움(캡처 확인).
- 잘한 점: 요약 바, URL 상태, 팀 단위 컨텍스트. 아쉬운 점: 탭이 깊음(팀→캐릭터→탭→빌드), 광고.
- 출처: https://frzyc.github.io/genshin-optimizer/ · https://github.com/frzyc/genshin-optimizer · https://deepwiki.com/frzyc/genshin-optimizer/3.3-zenless-zone-zero-(zzz)

### 2-4. Fribbels HSR Optimizer — 좌측 내비 + 카드형 "3열 설정 → 단일 CTA"
![](bench/hsr_optimizer_desk.png) ![](bench/hsr_opt_benchmarks_desk.png) ![](bench/hsr_opt_benchmarks_mob.png)
- **정보 구조**: 좌측 고정 사이드바(Tools / Optimization / Links). Benchmark Generator 화면은 카드 하나에 `[캐릭터 초상] | [캐릭터·성혼(E0~E6 세그먼트)·광추·팀원 3명 아바타] | [Settings 토글 + 세트 + ⚡Generate + Clear]`를 넣고, 아래에 **해석 주의 경고** 박스와 결과 테이블 탭(100% / 200%)을 둠.
- **캐릭터 선택**: 팀원을 원형 아바타로 보여주고, 아바타 아래에 E0/S1 배지로 선택 상태와 스펙을 표시함. WOOFIA 슬롯의 성급·스킬레벨 표시와 같은 개념임.
- **결과 해석 가드**: "Combo DMG로 팀 간 비교를 하지 마세요"라는 빨간 경고와 "Understood, hide warning" 버튼. 시뮬 수치를 오독하는 것을 UI 차원에서 막음.
- **최근 기능**: 2026-09 Team Showcase — 4인 카드를 2×2로 배치하고 한 장의 이미지로 공유함. 드래그로 재정렬하고 저장 팀 갤러리를 둠.
- **모바일**: 반응형이 아니고 데스크톱을 축소함(캡처 확인).
- 출처: https://fribbels.github.io/hsr-optimizer · https://github.com/fribbels/hsr-optimizer/pull/1914 · https://github.com/fribbels/hsr-optimizer/releases

### 2-5. Prydwen.gg (HSR 가이드) — 모바일 캐릭터 필터의 모범
![](bench/prydwen_hsr_char_mob.png) ![](bench/prydwen_hsr_charpage_mob.png)
- **캐릭터 선택 UX**: 검색창 + 희귀도(★4/★5) 세그먼트 + 원소 아이콘 행 + 운명의 길 아이콘 행 + Reset + "Showing 94 Characters" 카운트. **아이콘만 있는 필터 칩**을 여러 줄로 두어 모바일에서도 한 손으로 쓸 수 있음. 전체 선택은 `*` 칩으로 표시함.
- 잘한 점: 필터 결과 카운트, Reset. WOOFIA는 속성 칩 1줄뿐임(검색, 직업, 결과 수가 없음).
- 출처: https://www.prydwen.gg/star-rail/characters

### 2-6. Overframe (Warframe 빌더) — 선택 → 빌드 2단계 분리
![](bench/overframe_mob.png) ![](bench/overframe_build_mob.png)
- **정보 구조**: 1단계 "Choose An Item" 카테고리 탭 + 큰 카드 그리드 → 2단계 빌드 화면(이름·설명·아트 → 어빌리티 4개 → Item Rank → 모드 슬롯 그리드 + 모드 목록, 드래그로 장착). 게임 내 모드 화면(가운데 슬롯, 아래 목록)을 그대로 따라서 학습 비용이 거의 없음.
- 잘한 점: 게임 UI를 모사한 친숙함. 아쉬운 점: 모바일에서 히어로 아트가 첫 화면을 차지해 실제 편집부가 멀리 있음. 데스크톱은 Cloudflare 챌린지로 캡처하지 못함.
- 출처: https://overframe.gg/build/new/ · https://warframe.fandom.com/wiki/WARFRAME_Wiki:Overframe · https://wiki.warframe.com/w/Mod

### 2-7. Penguin Statistics · ArkPlanner (명일방주) — 옵션 행 + 풀폭 CTA + 플로팅 FAB
![](bench/arknights_penguin_desk.png) ![](bench/arknights_penguin_mob.png)
- **정보 구조**: 레이블-값 행(`Data | Options | Excludes`) → **풀폭 CALCULATE 버튼** → 재료 카드 그리드(Have/Need 스테퍼). 입력이 길어져도 **우하단 계산기 FAB이 항상 떠 있어** 어디서든 실행할 수 있음.
- 잘한 점: 옵션을 토글 3개로 압축, CTA 중복 배치(상단 고정 + FAB). 아쉬운 점: 모바일에서 레이블-값 2열이 어색하게 줄바꿈됨.
- 출처: https://penguin-stats.io/planner

### 2-8. Path of Building (pob.cool 웹판) — 좌측 상시 스탯 사이드바
![](bench/pob_cool_desk.png) ![](bench/pob_cool_mob.png)
- **정보 구조**: 데스크톱 PoB의 Lua 코드를 WASM으로 실행하고 canvas에 렌더링함. 좌측에 **계산된 스탯 목록(DPS, 생명력, 저항…)이 항상 보이고**, 우측이 Tree / Skills / Items / Calcs / Config 탭임. 어느 탭에서 무엇을 바꾸든 **좌측 수치가 즉시 바뀌는 "상시 결과 패널"** 구조(레이아웃 설명은 데스크톱 PoB 기준, pob.cool 자체 문서가 아니므로 **추정** 포함).
- 모바일은 줌 컨트롤과 가상 키보드 오버레이만 추가함. 데스크톱 UI를 그대로 쓰므로 모바일 친화적이지 않음.
- 출처: https://pob.cool/ · https://github.com/atty303/pob-web

### 2-9. FFLogs / Warcraft Logs — 결과 드릴다운의 끝판
(Cloudflare 인증 때문에 캡처하지 못함, 문서로 조사)
- **보기 3종**: Tables(스킬별 사용 수·기여도) / Timelines(가로 타임라인) / Events(시간순 이벤트 표). **그래프를 드래그해서 구간을 선택하면 아래 표가 필터링**되고 Reset Zoom으로 복귀함. 페이즈 프리셋이 있음. Filter pins로 "특정 버프가 켜진 동안만" 같은 조건 필터를 걺.
- WOOFIA 적용: 턴 차트의 막대를 탭하면 해당 턴 로그로 점프하거나 필터링. 30턴 로그 아코디언을 "표 / 타임라인" 두 보기로 나누는 것도 고려할 수 있음.
- 출처: https://www.icy-veins.com/ffxiv/fflogs-breakdown · https://www.icy-veins.com/ffxiv/fflogs-damage-dealt · https://www.fflogs.com/help/pins

### 2-10. op.gg — 모바일 결과 페이지의 헤드라인 + 가로 스크롤 탭
![](bench/opgg_mob.png)
- 상단은 신원(아이콘·이름·랭크), 그다음 **가로 스크롤 탭**(Summary / Style / Champions / Highlights…) → 필터 드롭다운 → 큰 헤드라인 카드(Challenger 2,046 LP, 승률 54%) → 표. 모바일에서 **탭이 넘치면 가로 스크롤과 ">" 힌트**로 처리함.
- 출처: https://op.gg/lol/summoners/kr/Hide%20on%20bush-KR1

### 2-11. maxroll.gg D4 Planner / Fribbels E7 Optimizer (문서 조사)
- **maxroll D4Planner**: 장비·전설 위상·어픽스·스킬 트리·정복자 보드를 한 빌드로 묶고, 저장·공유·커뮤니티 DB를 제공함. 스킬 트리, 보드, 계산이 연동됨. (캡처는 동의 모달 뒤에서 오류가 나 실패함.) 출처: https://maxroll.gg/d4/news/d4planner-is-live · https://maxroll.gg/d4/planner
- **Fribbels E7 Optimizer**(데스크톱 전용 앱): Optimizer / Gear / Heroes / Importer 탭. Optimizer 탭은 **좌측에 설정 패널(영웅 선택 + Start/Filter/Cancel + 스탯 미리보기) → 스탯·등급·서브스탯 우선순위(드래그 + Top % 슬라이더)·세트 필터를 쌓고, 아래에 색상 코딩된 결과 그리드**를 둠. 드래그로 우선순위를 정하는 방식은 WOOFIA 행동 우선순위와 같은 계열임. 출처: https://github.com/fribbels/Fribbels-Epic-7-Optimizer

---

## 3. 대기업 "설정 많은 도구" 사례

### 3-1. Apple — iOS 단축어 / HIG 점진적 공개
- 단축어 에디터는 액션 블록마다 **핵심 파라미터만 문장형으로 인라인 표시**하고, 부가 옵션은 "더 보기(Show More)" 확장으로 숨김(Show More 자체는 Apple 공식 가이드에 별도 항목이 없어 **추정·경험 기반**). 파라미터를 탭하면 값 선택 메뉴가 뜨고, 액션 추가는 시트로 함.
- HIG: 시트는 "현재 맥락과 밀접한 범위가 정해진 작업"에 씀. 디스클로저 컨트롤은 "관련 정보·기능을 열고 닫는" 용도. 인쇄 대화상자처럼 **기본은 소수 옵션, "세부사항 보기"로 확장**하는 방식이 점진적 공개의 대표 예시로 인용됨. WWDC22 발표도 "기본값이 채워져 있고 흔한 선택지는 가까이, 나머지는 확장"을 강조함.
- **배울 점**: 문장형 설정 요약("적 **1명** · **무속성** · 아군 **5명** 피격 · **30턴**")을 탭하면 해당 값만 편집하는 방식.
- 출처: https://developer.apple.com/design/human-interface-guidelines/disclosure-controls · https://developer.apple.com/design/human-interface-guidelines/sheets · https://developer.apple.com/videos/play/wwdc2022-10059 · https://support.apple.com/guide/shortcuts/use-variables-apdd02c2780c/ios

### 3-2. Google Ads — 캠페인 생성의 좌측 스텝 내비 + 경고 하이라이트
- "섹션을 스크롤해 다니는 대신 **좌측 내비게이션 메뉴로 섹션에 바로 이동**"할 수 있고, 메뉴는 "구성 진행 상황을 한눈에 보여주며 확인할 알림을 강조"함. 타기팅·입찰·예산 선택에 따라 **문제 가능성이 있는 단계에 경고 배지**가 뜸.
- **배울 점**: 긴 설정을 "단계 = 앵커 목차"로 만들고 **충돌이나 이상값이 있는 섹션에 배지**를 다는 것. WOOFIA에는 이미 충돌 경고(연동·궁극기 사용 방식)가 있으므로 섹션 헤더 배지로 끌어올리면 됨.
- Material 3: 바텀시트는 "보조 콘텐츠" 용도이며 **항상 필요한 도구에는 부적합**함. 시트를 겹쳐 쌓지 말 것. 복잡한 설정은 전체 화면이 나음(NN/g).
- 출처: https://support.google.com/google-ads/answer/11052121?hl=en-GB · https://support.google.com/google-ads/answer/6324971?hl=en · https://m3.material.io/components/bottom-sheets/guidelines · https://www.nngroup.com/articles/bottom-sheet/

### 3-3. 토스 — One thing per page, Value First
- 제품 원칙 "하나의 화면은 하나의 메시지만 표현한다", "Tap & Scroll(핵심 플로우를 탭과 스크롤만으로)", "Easy to Answer(3초 안에 대답)", **"Value First, Cost Later(가치를 먼저, 입력 비용은 나중에)"**.
- 가입 화면 사례: 4개 필드를 4페이지로 나누면 "다음"을 4번 눌러야 해서 귀찮으므로, **한 화면에서 이름을 입력하면 다음 필드가 자동으로 위에 쌓이는** 방식을 택함. 즉 "단계 분리"와 "한 페이지" 사이의 절충안임.
- **배울 점**: 첫 방문자에게 **"기본 편성으로 이미 계산된 결과"를 먼저 보여주는 것**(Value First). 설정은 결과를 본 뒤에 조정하게 함.
- 출처: https://toss.tech/article/toss-signup-process · https://story.pxd.co.kr/1411 · https://maily.so/eddy/posts/knrjvlp1rld

---

## 4. 공통 패턴 표

| # | 패턴 | 사례 | WOOFIA 현황 | 적용 우선순위 |
|---|---|---|---|---|
| P1 | **접힌 섹션 + 헤더에 현재 값 요약** | Raidbots, Genshin Optimizer(적 요약 바), iOS 단축어 | 모든 설정이 늘 펼쳐져 있음 | ★★★ |
| P2 | **기본값만으로 즉시 실행 가능 / 결과 먼저** | Raidbots, Showdown, 토스 Value First | 기본 편성이 있음(확인 필요), 결과는 실행 후 | ★★★ |
| P3 | **실행 CTA 상시 노출**(sticky 바 / FAB) | Penguin FAB, Raidbots(설정 직후) | 설정 열 맨 아래(첫 화면 밖) | ★★★ |
| P4 | **결과 3단 드릴다운**: 헤드라인 → 분해 바 → 로그(기본 접힘) | Raidbots, FFLogs, Showdown | 이미 있음 | ★(다듬기) |
| P5 | **평균과 샘플의 구분 + 오차·범위 표현** | Raidbots(평균 vs 샘플 로그, Margin of Error, sidegrade), Showdown(범위·KO%) | 편차 밴드 있음 | ★★ 문구 명확화 |
| P6 | **차트 ↔ 표 연동**(구간 선택 → 로그 필터) | FFLogs | 없음 | ★★ |
| P7 | **캐릭터 선택: 검색 + 아이콘 필터 다중 행 + 결과 수 + Reset** | Prydwen, Overframe | 속성 칩 1줄 | ★★ |
| P8 | **선택 상태 = 아바타 + 스펙 배지** | HSR Optimizer(E0/S1), GO | 슬롯 카드 + 로스터 체크 표시 | ★ 유지 |
| P9 | **상시 결과 패널**(입력하면 즉시 반영) | PoB 좌측 스탯, Showdown 상단 결과 | 반복 50회 실행이라 즉시 재계산은 부담(**추정**: 1회 계산이 빠르면 "미리보기 1회"는 가능) | ★ 선택 |
| P10 | **모드 분리**(1v1 / 1vAll, Quick / Top Gear) | Showdown, Raidbots | 메인 / 보스 시뮬 / 비교 모달 | ★★ 비교를 모달 말고 모드로 |
| P11 | **해석 가드**(오독 방지 경고) | HSR Optimizer 빨간 경고 | 가이드에 분산 | ★ |
| P12 | **URL·공유 상태** | GO(URL 라우팅), Raidbots 리포트 URL, Team Showcase 이미지 | 공유 코드 있음 | ★ 유지 |
| P13 | **섹션 목차 + 이상값 배지** | Google Ads 좌측 내비 | 충돌 경고가 모달 안에 있음 | ★★ |

---

## 5. 모바일: 한 페이지 스크롤 vs 스텝/탭

| | 한 페이지 스크롤 | 스텝(위저드) / 탭 |
|---|---|---|
| 장점 | 전체 맥락이 보임, 뒤로 가기 쉬움, 반복 수정·재실행이 빠름, 구현 단순. Nielsen: "필드가 모두 필요하면 긴 한 페이지도 괜찮다 — 스크롤만 하면 되게" | 한 번에 한 주제에 집중, 초보자 안내, 화면당 정보량 감소, 이탈 단계 측정이 쉬움 |
| 단점 | 길어지면 실행 버튼과 결과가 멀어짐, 현재 위치를 잃음(WOOFIA 모바일 약 4,350px) | NN/g: **"반복 사용 시 금방 짜증나고 통제적"**, 단계 간 비교가 어려움, 중단 후 재개가 어려움 → 반복 사용자·전문가에게 부적합 |
| 실제 사례 | Showdown·Raidbots·Penguin(모두 한 페이지), op.gg(한 페이지 + 가로 탭) | Overframe(선택 → 빌드 2단계), Google Ads(스텝 + 자유 이동 내비), 토스(가입) |
| WOOFIA 사용 패턴 | 편성 1~2명 교체 → 재실행 → 수치 비교 = **반복·전문가형** | 첫 방문자는 소수(**추정**) |

**결론**: 기본은 **한 페이지 스크롤**을 유지하되 다음 세 가지를 보강함.
1. **하단 고정 실행 바**(시뮬레이션 실행 + 마지막 결과 요약 칩 "52.3M ▲2.1%").
2. 실행하면 **결과 섹션으로 자동 스크롤**하고, 상단에 **섹션 점프 칩**(편성 · 설정 · 결과 · 로그)을 둠. Google Ads의 목차 내비를 모바일에 맞게 옮긴 형태.
3. 설정은 P1(요약 헤더 아코디언)으로 접어서 **편성 → 실행 거리를 1스크린 안으로** 줄임.

스텝형은 "처음 오셨나요? 3단계 빠른 시작" 온보딩에만 쓰고, 반복 사용자는 건너뛰게 함.
출처: https://www.nngroup.com/articles/wizards/ · https://www.nngroup.com/articles/forms-vs-applications/

---

## 6. 정보 구조 제안 2안

### A안 — 현 구조 유지형 (적은 비용, 즉효)
2열을 유지하되 **설정 열을 접고, 실행 버튼을 고정하고, 결과를 강조**함.

```
데스크톱 (1440)
┌───────────────────────────────────────────────────────────────┐
│ XXL WOOFIA  [기록 ▾]                 [조합 비교] [가이드] [≡] │ ← 플로팅 5개를 헤더/≡ 메뉴로 흡수
├──────────────────────────────────┬────────────────────────────┤
│ 팀 편성                          │ 전투 설정                  │
│ [P1][P2][P3][P4][P5]             │ ▸ 기본  반복50 · 30턴      │ ← 접힘 + 요약 헤더(P1)
│ 로스터 [검색____] 속성○○○○○      │ ▸ 더미  무속성 · 적1 · 피격5│
│        직업○○○  (44명)  [초기화] │ ▸ 행동 순서  하니엘→리카노…│
│ ┌──┬──┬──┬──┬──┬──┬──┬──┐        │ ▸ 특정 턴만  없음          │
│ │  │  │  │  │  │  │  │  │ ...    │ ▸ 길드 제단  3개 적용 ⚠1   │ ← 충돌 배지(P13)
│ └──┴──┴──┴──┴──┴──┴──┴──┘        │ ┌────────────────────────┐ │
│                                  │ │  ▶ 시뮬레이션 실행      │ │ ← sticky(P3)
│                                  │ └────────────────────────┘ │
├──────────────────────────────────┴────────────────────────────┤
│ 결과  총 데미지 52,297,452   [최소 48.1M ━━●━━ 최대 57.9M]    │ ← 헤드라인 + 밴드(P5)
│       평균(50회) · 로그는 샘플 1회                            │
│ 기여 ▇▇▇▇▇▇▇▇ 아누비로스 35.0M 66.9% │ 턴별 차트(막대 탭→로그) │ ← P6
│ ▸ 상세 로그 (30턴)                                            │
└───────────────────────────────────────────────────────────────┘
```
- 변경점: 설정 섹션 아코디언화 + 요약 문구, 실행 버튼 `position: sticky`, 로스터 검색·직업 필터·카운트, 플로팅 버튼 정리, 결과 문구("평균 50회 / 로그는 샘플") 추가.
- 리스크: 적음. 기존 DOM과 계약(turnPlans 등)을 유지함.

### B안 — 개선형 ("결과 우선 + 편성 바 + 설정 시트")
Showdown(결과를 위에) + PoB(상시 결과) + Raidbots(요약 헤더)를 합친 구조. **결과를 페이지의 주인공**으로 둠.

```
데스크톱 (1440)
┌───────────────────────────────────────────────────────────────┐
│ XXL WOOFIA   [메인 시뮬 | 보스전 | 비교]   [기록▾] [가이드] [≡]│ ← 모드 탭(P10): 비교를 모달→모드로
├───────────────────────────────────────────────────────────────┤
│ 편성 바  [P1][P2][P3][P4][P5]  [+ 로스터 열기]  [공유]        │ ← 상단 고정 얇은 바
│ 조건    적 1 · 무속성 · 피격 5 · 30턴 · 반복 50 · 제단 3  [편집]│ ← 문장형 요약(Apple식), 탭→우측 시트
├──────────────────────────────────────────┬────────────────────┤
│ ■ 총 데미지  52,297,452                  │ [ ▶ 다시 실행 ]    │
│   최소 48.1M ━━━━●━━━━ 최대 57.9M        │ 직전 대비 ▲2.1%    │
│ ┌ 기여 ───────────────┐ ┌ 턴별 ────────┐ │ ─ 설정 시트 ─      │ ← 편집 시 우측 패널 슬라이드
│ │ 아누비로스 ▇▇▇▇ 67% │ │ ▁▂▇▁▂▇▁▂▇... │ │ ▸ 더미             │
│ │ 임부언     ▇ 5%      │ │  (탭→로그)   │ │ ▸ 행동 순서        │
│ └─────────────────────┘ └──────────────┘ │ ▸ 특정 턴          │
│ ▸ 상세 로그  [표 | 타임라인]              │ ▸ 제단 ⚠1          │
└──────────────────────────────────────────┴────────────────────┘
로스터: [+ 로스터 열기] → 큰 모달/드로어 (검색·속성·직업·카운트, 슬롯 탭→교체)
```
- 첫 방문: 기본 편성으로 **자동 1회 실행된 결과**가 바로 보임(토스 Value First, Showdown). **추정**: 50회 × 30턴 계산이 수백 ms 이내면 가능하고, 느리면 "샘플 미리보기 1회 + 전체 실행 버튼"으로 대체.
- 비교: 모달을 "비교" 모드 탭으로 바꾸고, 조합 A·B를 **나란히 컬럼**으로 보여줌(헤드라인, 기여, 턴 차트를 같은 축에 놓음).
- 리스크: 대규모 레이아웃 변경. 가이드 스크린샷(`tools/guide_shots.js`)과 UI 회귀 하네스(uitest_*)를 전부 갱신해야 함.

---

## 7. 모바일 제안 (390px 기준, A·B 공통)

```
┌──────────────────────────┐
│ XXL WOOFIA      [기록][≡]│
│ [편성][설정][결과][로그] │ ← 섹션 점프 칩(sticky, 현재 섹션 하이라이트)
├──────────────────────────┤
│ 팀 편성                  │
│ [P1][P2][P3][P4][P5]     │ ← 5슬롯 한 줄(각 ~64px)
│ [검색___] [속성▾][직업▾] │
│ ┌─┬─┬─┬─┬─┬─┐  44명      │ ← 6열 그리드
│ └─┴─┴─┴─┴─┴─┘            │
│ 전투 설정                │
│ ▸ 기본  반복50 · 30턴    │ ← 전부 접힘 + 요약
│ ▸ 더미  무 · 적1 · 피격5 │
│ ▸ 행동 순서  하니엘→…    │ ← 펼치면 전체 화면 시트(드래그 대신 ▲▼ 유지)
│ ▸ 특정 턴  없음          │
│ ▸ 길드 제단  3 ⚠1        │
│ 결과  52,297,452 ▲2.1%   │
│ 48.1M ━━●━━ 57.9M        │
│ 기여 바 …                │
│ 턴 차트(가로 스크롤)     │
│ ▸ 상세 로그              │
├──────────────────────────┤
│ 52.3M │ [▶ 시뮬레이션 실행]│ ← 하단 고정 바(엄지 영역), 실행 후 결과로 자동 스크롤
└──────────────────────────┘
```
1. **하단 고정 실행 바**: 마지막 결과 요약과 실행 버튼. 플로팅 버튼 5개는 헤더의 ≡ 메뉴로 옮겨 겹침을 없앰.
2. **설정 아코디언 기본 접힘**: 편성부터 실행까지 약 1.5스크린(현재 약 3스크린, **추정**).
3. **바텀시트는 짧은 선택(더미 속성·적 수)에만** 쓰고, 행동 순서·턴별 오버라이드처럼 복잡한 편집은 **전체 화면 시트**로 연다(M3/NN/g 권고. 시트를 겹쳐 쌓지 않음).
4. **로그 30턴**: 기본 접힘. 턴 차트 막대를 탭하면 해당 턴 행으로 점프함. 행은 "턴 · 데미지 · 핵심 이벤트 1개"로 줄임.
5. **로스터 필터**: 아이콘 칩 다중 행 + 결과 수 + 초기화(Prydwen). 선택된 캐릭터는 체크 배지와 함께 슬롯 번호 배지(①~⑤)를 표시함.
6. **스텝형은 온보딩에만**: "처음이세요? 편성 → 적 → 실행" 3단계 가이드 투어를 두고 건너뛸 수 있게 함.

---

## 8. 핵심 결론 (3~5줄)

- 벤치마크 10여 개가 공통으로 쓰는 구조는 **"기본값으로 즉시 실행 → 헤드라인 → 분해 → 로그" + 접힌 고급 설정**이고, WOOFIA는 결과 쪽은 이미 표준에 가깝고 **설정 쪽이 과하게 펼쳐져 있음**.
- 가장 효과가 큰 단일 개선은 **Raidbots·Genshin Optimizer식 "요약 헤더 아코디언" + 고정 실행 버튼**임(A안, 저비용).
- 모바일은 위저드보다 **한 페이지 스크롤 + 섹션 점프 칩 + 하단 고정 실행 바 + 결과 자동 스크롤**이 반복 사용 패턴에 맞음(NN/g: 위저드는 반복 사용자에게 부적합).
- 중장기로는 **결과를 위에 두는 B안**(편성 바 + 문장형 조건 요약 + 우측 설정 시트 + 비교를 모드 탭으로 전환)이 토스 Value First·Showdown·PoB의 장점을 합친 방향임.
