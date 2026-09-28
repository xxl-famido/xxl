# 디자인 트렌드·원칙 조사: woofia_sim 전면 개편용

작성일: 2026-09-28 · 범위: 2025~2026 기준 · 작성 방식: 로컬 조사(WebSearch/WebFetch), 외부 게시 없음

표기 규칙
- **[검증]**: 공식 문서나 1차 출처에서 확인한 값
- **[2차]**: 제3자가 역공학·요약한 값(공식 값과 다를 수 있음)
- **[추정]**: 조사 결과를 바탕으로 한 필자의 판단이나 보간

---

## 0. 요약 (10줄)

1. 대기업 시스템은 모두 **"중립색이 화면의 90% 이상, 강조색은 1개"** 구조다. Linear는 테마 입력을 base·accent·contrast 3개로 줄였고, 2026년 3월 개편에서 푸른 기가 도는 회색을 **채도가 더 낮은 따뜻한 회색**으로 바꿨다.
2. 회색 단계는 번호가 아니라 **역할**로 정의한다(Geist 10단계, Radix 12단계: 배경1~3 / 보더4~6 / 채움7~8 / 텍스트9~10).
3. 타이포는 **굵기 3단계(400/500/600)**, 크기 6~7단계, 데스크톱 도구 본문은 13~14px가 표준이다(macOS 기본 13pt, Geist copy-14).
4. 라운드는 **작게(4~8px)** 쓰고, 안쪽 요소는 바깥 요소보다 작은 반경을 쓴다(M3: 중첩 시 같은 반경 금지).
5. 다크모드는 **순수 검정 금지**(M2 #121212, M3 tone 6, Notion #191919, Vercel #0a0a0a). 위계는 그림자 대신 **밝기가 한 단계씩 올라가는 표면**으로 만든다.
6. 모션은 웹 UI 기준 **150~250ms, ease-out 계열**. M3 standard 곡선 `cubic-bezier(0.2,0,0,1)`. reduced-motion에서는 이동을 **페이드로 대체**한다(전부 제거하지 않는다).
7. Liquid Glass/글래스모피즘은 Apple 스스로 **"내비게이션 레이어 전용, 콘텐츠에는 쓰지 말 것"**이라고 한다. 텍스트 대비를 보장할 수 없으므로 이 앱에서는 쓰지 않는다.
8. "AI가 만든 UI" 징후는 보라~파랑 그라디언트, 글로우, 카드 속 카드, 똑같은 카드 3~6개 반복, 왼쪽 컬러 띠, 바운스 호버, 그라디언트 숫자, 이모지 아이콘이다. 하나하나보다 **여러 기본값이 한꺼번에 몰려 있을 때** 티가 난다.
9. 도구형 UI의 위계는 **라벨은 항상 보이게, 도움말은 필요할 때만, 고급 설정은 한 단계 접기**로 만든다(NN/g: 공개 단계는 2단계 이하).
10. 캐릭터 일러스트가 주인공인 화면에서는 **UI를 "갤러리 벽"처럼 무채색**으로 두고, 속성색은 8px 점이나 2px 링 같은 **작은 표식**으로만 쓴다.

---

## 1. 대기업 디자인 시스템의 현재 기조

### 1.1 Apple HIG (Liquid Glass 이후)
- **Liquid Glass는 "콘텐츠 위에 떠 있는 내비게이션·컨트롤 레이어" 전용이다** [검증]. "Liquid Glass를 모든 곳에 쓰고 싶겠지만, 콘텐츠 위에 떠 있는 내비게이션 레이어에만 쓰는 것이 가장 좋다." 표(table)에 쓰면 다른 요소와 경쟁해 위계가 흐려진다고 예시로 든다. 글래스를 겹쳐 쌓지 말라고 하며, 중첩되면 시스템이 자동으로 불투명 fill로 바꾼다.
  - 출처: [Meet Liquid Glass – WWDC25](https://developer.apple.com/videos/play/wwdc2025/219/), [Get to know the new design system – WWDC25](https://developer.apple.com/videos/play/wwdc2025/356/), [Apple Developer Forums Design Group Lab 요약](https://developer.apple.com/forums/thread/791070)
- **웹에 적용할 때 주의점** [검증/2차]
  - 반투명 표면은 대비가 고정돼 있지 않다. 뒤에 무엇이 있느냐에 따라 WCAG AA를 통과하기도 하고 떨어지기도 한다 ([CSS-Tricks](https://css-tricks.com/getting-clarity-on-apples-liquid-glass/), [Grafit](https://www.grafit.agency/blog/why-you-shouldnt-use-the-liquid-glass-effect-on-your-website-yet): "텍스트가 있는 곳에는 쓰지 말 것").
  - Apple도 베타 기간에 내비게이션 바 불투명도를 올리는 식으로 여러 번 후퇴했다 ([Infinum](https://infinum.com/blog/apples-ios-26-liquid-glass-sleek-shiny-and-questionably-accessible/), [Revert to Saved](https://reverttosaved.com/2025/06/10/liquid-glass-apple-vs-accessibility/)).
  - 요약: "glass is chrome, never content" ([buildmvpfast](https://www.buildmvpfast.com/blog/liquid-glass-css-backdrop-filter-recipes-2026), [2차]).
- **타이포** [검증]: 기본 크기는 iOS 17pt(최소 11), **macOS 13pt(최소 10)**. 가독성을 위해 Ultralight/Thin/Light는 피하고 Regular·Medium·Semibold·Bold만 쓰라고 한다 ([HIG Typography](https://developers.apple.com/design/human-interface-guidelines/foundations/typography/)). iOS Dynamic Type 스케일은 34/28/22/20/17/16/15/13/12/11 [2차].
- **세그먼트 컨트롤** [검증]: iPhone은 약 5개 이하, 넓은 화면은 5~7개 이하. 세그먼트 폭은 같게 하고, 액션(추가·삭제)에는 쓰지 말고 관련 선택지에만 쓴다 ([HIG Segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls)).

### 1.2 Google Material 3 / M3 Expressive
- **라운드 스케일** [검증]: none 0, extra-small 4, small 8, medium 12, large 16, large-increased 20, extra-large 28, extra-large-increased 32, (extra-extra-large 48 [2차]), full. Expressive에서 10단계로 늘었다. **중첩된 둥근 요소에 같은 반경을 쓰지 말 것** ([M3 Shape](https://m3.material.io/styles/shape/corner-radius-scale)).
- **타입 스케일** [검증]: display·headline·title·body·label 5개 역할 × L/M/S = 15개. Expressive는 emphasized 15개를 더해 30개. body-large는 16/24, 굵기 400. 본문·라벨의 행간은 약 1.5배 ([Material Web Typography](https://material-web.dev/theming/typography/)).
- **모션** [검증]: standard `cubic-bezier(0.2,0,0,1)`, standard-decelerate `(0,0,0,1)`, standard-accelerate `(0.3,0,1,1)`, emphasized-decelerate `(0.05,0.7,0.1,1)`, emphasized-accelerate `(0.3,0,0.8,0.15)`. duration 토큰은 short1~4 = 50/100/150/200, medium1~4 = 250/300/350/400, long1~2 = 450/500ms. "emphasized를 모든 곳에 쓰지 말 것. 마이크로인터랙션에는 standard를 쓴다." ([M3 Easing & duration](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs))
- **다크** [검증/2차]: M2는 표면 #121212를 권장했다. 순수 검정은 그림자가 안 보이고 눈이 피로하기 때문이다. 채도 높은 색은 어두운 배경에서 "떨리므로" 밝고 채도 낮은 변형을 쓴다 ([M2 Dark theme](https://m2.material.io/design/color/dark-theme.html)). M3는 반투명 흰색 오버레이 대신 **톤 기반 표면**을 쓴다. 다크에서는 surface tone 6, container-low 10, container 12, high 17, highest 22 ([Flutter 새 ColorScheme 역할](https://docs.flutter.dev/release/breaking-changes/new-color-scheme-roles), 톤 수치는 [2차]).

### 1.3 Linear
- 테마 변수를 98개에서 **3개(base, accent, contrast)**로 줄이고 나머지는 LCH에서 파생한다. 목표는 "더 중립적이고 오래가는 외관". 크롬(컬러) 사용을 줄이고 텍스트·아이콘 대비를 높였다(라이트는 더 진하게, 다크는 더 밝게). 제목은 Inter Display, 본문은 Inter Regular [검증] ([How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui)).
- 2026-03 개편: 차가운 푸른 회색을 **"선명하되 채도가 더 낮은 따뜻한 회색"**으로 바꿨다 [검증] ([Behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh)).
- 2025 웹사이트: 색이 크게 줄어 모노크롬 흑백이 되었다 [2차] ([LogRocket](https://blog.logrocket.com/ux-design/linear-design/)).

### 1.4 Stripe
- 대시보드 디자인 시스템은 비공개다. 공개된 것은 Stripe Apps 토큰뿐이며, **이름 기반 토큰**만 허용한다(`padding:'xxlarge'`, `font: heading|subheading|body|caption`, `keyline`, `borderRadius:'small'`). 임의 폰트는 금지 [검증] ([Stripe Apps Style](https://docs.stripe.com/stripe-apps/style)).
- 역공학 값 [2차]: 4px 기반 간격(4/8/12/16/24/32), 라운드 4~8px, 보더는 1px을 넘지 않음, 가장 강한 그림자도 `rgba(50,50,93,0.12) 0 16px 32px`, 숫자에는 `tnum`(고정폭 숫자) ([designmd.run Stripe breakdown](https://www.designmd.run/blog/stripe-design-system-breakdown), [DesignSystems.one](https://www.designsystems.one/design-systems/stripe-design)).

### 1.5 Vercel Geist
- 10개 색상 스케일 × 10단계, 단계마다 역할이 있다 [검증] ([Geist Colors](https://vercel.com/geist/colors)).
  - 1 기본 배경 / 2 hover 배경 / 3 active 배경
  - 4 기본 보더 / 5 hover 보더 / 6 active 보더
  - 7 고대비 배경 / 8 그 hover
  - 9 보조 텍스트·아이콘 / 10 주 텍스트·아이콘
  - 페이지 배경은 Background 1(대부분)과 Background 2(드물게, 미세한 구분용) 두 개뿐
- 타입 토큰은 크기가 이름에 들어간다: heading-72/40/24, copy-16(행간 24), copy-14(행간 20). 굵기는 **400·500·600 세 개만** 쓴다 [2차] ([designmd.cc Vercel](https://designmd.cc/benchmarks/vercel)).
- Next.js 기본 CSS는 라이트 #fff/#171717, 다크 **#0a0a0a/#ededed**. 텍스트도 순수 흑백이 아니다 [2차].

### 1.6 Toss Design System (TDS)
- 2025년 컬러 시스템을 7년 만에 개편하면서 **OKLCH**를 채택했다. 문제는 Grey100·Blue100·Red100의 명도가 서로 달라 100단계만 써도 화면이 얼룩져 보인다는 점이었다. 개편 후 **같은 단계 = 같은 인지 명도**가 되었다. 다크모드는 따로 보정해 대비를 더 강하게 준다. 토큰은 Base → Semantic → Component 3계층, 노랑은 수동 보정 [검증] ([토스 테크: 7년만의 컬러 시스템 업데이트](https://toss.tech/article/tds-color-system-update)).
- 값: UI blue500 **#3182F6**, grey900 #191F28, grey50 #F9FAFB. `text-primary`는 파랑이 아니라 grey900이다(브랜드 블루 #0064FF는 로고 전용) [2차] ([oh-my-design Toss](https://oh-my-design.kr/design-systems/toss), [TDS RN Colors](https://tossmini-docs.toss.im/tds-react-native/foundation/colors/)).
- 참고: #3182F6은 흰 배경 대비가 약 3.6:1 [추정 계산]이라 버튼 채움에는 괜찮지만 작은 링크 텍스트에는 부족하다.

### 1.7 Notion
- 다크 표면 3단계 **#191919(페이지) / #202020(패널·hover) / #252525(메뉴·팝오버)**, 본문 #F0EFED(순백 아님), 보조 #ADA9A3 [2차, 2026-08 스타일시트 확인이라고 명시] ([matthiasfrank Notion colors](https://matthiasfrank.de/en/notion-colors/)).
- 라이트는 따뜻한 잉크색 #37352F, 보조 #787774, 선 #E9E9E7 1px, 강조 #2383E2 [2차].
- 색 옵션은 10가지이며 텍스트용과 배경용이 분리돼 있다. 아이콘용이 텍스트용보다 채도가 높다 [2차].

### 1.8 공통 규칙 정리

| 요소 | 수렴값 | 근거 |
|---|---|---|
| 중립 단계 수 | 10~12단계, 단계마다 역할 지정 | Geist 10, Radix 12, TDS 50~900 |
| 강조색 | 1개(+상태색 success/warn/danger) | Linear accent 1, Toss blue, Notion blue |
| 굵기 | 3단계 400/500/600 | Geist, HIG(Light 금지) |
| 본문 크기 | 데스크톱 도구 13~14px, 콘텐츠 15~16px | macOS 13pt, Geist copy-14, M3 body-L 16 |
| 간격 | 4px 기반 | Stripe, Notion, M3 |
| 라운드 | 컨트롤 4~8, 컨테이너 8~12, 중첩 시 안쪽이 더 작게 | M3, Stripe |
| 보더 | 1px, 저대비 | Stripe, Notion |
| 그림자 | 떠 있는 요소(메뉴·모달)에만, 약하게 | Stripe, M3 tonal |
| 다크 배경 | #0A0A0A~#191919, 텍스트는 #EDEDED 수준 | M2, Vercel, Notion |
| 모션 | 150~250ms, standard ease-out | M3, NN/g |

---

## 2. "AI가 만든 UI처럼 보이는" 안티패턴과 대안

배경: Tailwind 제작자 Adam Wathan이 2025년 8월 "5년 전 Tailwind UI의 모든 버튼을 bg-indigo-500으로 만들어서 미안하다"고 사과했다. 그 결과 모든 AI 생성 UI가 보라색이 됐다는 것이다. 모델이 2019~2024년 튜토리얼의 **중앙값**을 출력하기 때문이라는 설명이 일반적이다 ([DEV: The Purple Gradient Problem](https://dev.to/james_anderson_h/the-purple-gradient-problem-why-ai-ui-all-looks-alike-and-how-to-fix-it-3j65), [prg.sh](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)). 핵심 통찰: **징후 하나하나가 나쁜 것이 아니라, 선택하지 않은 기본값이 여러 개 몰려 있을 때 티가 난다** ([925studios](https://www.925studios.co/blog/ai-slop-design-tells)).

| # | 안티패턴 | 지적 출처 | 대신 할 것 |
|---|---|---|---|
| 1 | 보라↔파랑/시안 그라디언트(버튼·헤더·배경) | 925studios, SmoothUI, BrainGrid | 단색 강조 1개. 그라디언트는 쓰지 않는다 |
| 2 | 네온 글로우, 컬러 box-shadow | SmoothUI, UI Craft 금지목록 | 그림자는 중립색·저불투명도로, 떠 있는 요소에만 |
| 3 | 글래스모피즘/backdrop-blur 남발 | SmoothUI, Apple 가이드 | 불투명 표면. 블러는 쓰지 않거나, 쓰더라도 sticky 헤더 하나에만 |
| 4 | 카드 안 카드(보더 박스 중첩) | UI Craft 금지목록, Refactoring UI | 한 겹의 표면 안에서 **간격·구분선·타이포**로 그룹 구분 |
| 5 | 똑같은 카드 3~6개 가로 반복(아이콘+제목+2줄) | 925studios, SmoothUI | 목록/표로 바꾸거나 정보 밀도에 따라 크기를 다르게 |
| 6 | 3~4px 왼쪽 컬러 띠 | Vibe Code Kit("가장 확실한 징후") | 상태는 작은 점 또는 텍스트 라벨로 |
| 7 | 그라디언트 텍스트(특히 수치·KPI) | UI Craft 금지목록 | 수치는 text-primary + 고정폭 숫자, 굵기 600 |
| 8 | 호버마다 바운스/elastic, scale-up | SmoothUI, UI Craft | 배경색만 바꾸는 hover, 120~150ms |
| 9 | 과한 라운드(16~24px 카드, 모든 것이 pill) | Stripe 분석("pill은 너무 친근, 8px 초과는 너무 물렁") | 컨트롤 6, 컨테이너 10, pill은 태그·토글에만 |
| 10 | 이모지 아이콘, 의미 없는 얇은 라인 아이콘 장식 | 925studios("weightless icons") | 아이콘은 기능 식별용으로만. 섹션 제목에는 아이콘을 넣지 않는다 |
| 11 | 모든 라벨 밑에 설명문 | NN/g(공개 우선순위), Refactoring UI | 라벨만 보이게. 설명은 (?) 툴팁이나 펼침에. 꼭 필요한 경고만 인라인 |
| 12 | 공허한 헤드라인 카피("더 빠르게, 더 똑똑하게") | 925studios | 구체적 동사와 명사("편성 저장", "12턴 합산 피해") |
| 13 | Tailwind 기본 indigo-500/slate/shadcn 회색 그대로 | Vibe Code Kit | 자체 중립 램프(약간의 따뜻한 기)와 자체 강조색 |
| 14 | 포커스 상태 누락, 대비 미달 | SmoothUI | 2px 포커스 링(강조색, 대비 3:1 이상) |
| 15 | 빈 상태·에러 상태 미설계 | SmoothUI | 문장 1줄과 다음 행동 버튼 1개 |
| 16 | 배지·칩 남발(모든 것에 색 태그) | [추정] 경험칙 | 색 태그는 상태를 뜻할 때만. 나머지는 회색 텍스트 |

출처: [SmoothUI – AI Design Slop](https://smoothui.dev/blog/ai-design-slop), [925studios – AI Slop Tells](https://www.925studios.co/blog/ai-slop-design-tells), [Vibe Code Kit](https://vibecodekit.dev/ai-slop-design), [BrainGrid](https://www.braingrid.ai/blog/design-system-optimized-for-ai-coding), [Refactoring UI 노트](https://gist.github.com/selcukcihan/b9418596a98abfcd4bbc622550820cc5). 이들 출처 상당수는 도구 판매 블로그라는 점에 유의할 것. 다만 목록 자체는 서로 일치한다.

---

## 3. 라이트 기본 + 다크 지원 토큰 설계

### 3.1 계층 [검증: TDS 3계층, Geist/Radix 역할 스케일]
```
Base(원시)     gray.1..12, accent.1..12, red/green/amber …   ← 모드별로 값이 다름
Semantic(의미) bg.canvas, bg.surface, bg.subtle, border.*, text.*, accent.*, status.*
Component      button.primary.bg = accent.solid, input.border = border.strong …
```
- 컴포넌트는 **Semantic만 참조**한다. 다크모드는 Base 값만 바꾸면 끝나야 한다.
- Radix 12단계 역할표 [검증] ([Radix Colors – Understanding the scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)): 1 앱 배경 / 2 미세 배경 / 3 UI 요소 배경 / 4 hover / 5 active·selected / 6 미세 보더·구분선 / 7 요소 보더·포커스 링 / 8 hover 보더 / 9 솔리드 배경 / 10 솔리드 hover / 11 저대비 텍스트(APCA Lc60 보장) / 12 고대비 텍스트(Lc90).

### 3.2 라이트↔다크 매핑 규칙
1. **역할은 같게, 값만 반전**한다. 다크에서 "위에 뜬" 표면일수록 밝게 한다(M3 tonal: 6 → 10 → 12 → 17 → 22) [검증].
2. 순수 #000·#FFF 텍스트는 피한다. 다크 배경은 #0A0A0A~#191919, 텍스트는 #EDEDED~#F0EFED [검증: Vercel/Notion/M2].
3. 강조색은 다크에서 **더 밝고 채도 낮게** 한다(M2: 채도 높은 색은 어두운 배경에서 떨려 보임) [검증].
4. 다크에서는 그림자가 안 보이므로 **보더 + 표면 밝기**로 깊이를 표현한다 [검증: M2/M3].
5. 인지 균일 색공간(OKLCH/LCH)에서 단계를 만들면 색상이 달라도 같은 단계는 같은 밝기가 된다 [검증: Toss, Linear].
6. 다크모드 대비는 **따로 다시 계산**한다. 라이트에서 통과한 버튼도 다크에서 떨어질 수 있다 [검증: TestParty].

### 3.3 대비 기준 [검증] ([W3C 1.4.11](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast), [WebAIM](https://webaim.org/articles/contrast/))
- 본문 텍스트 **4.5:1**. 큰 텍스트(18pt≈24px, 또는 14pt bold≈18.7px bold) **3:1**.
- UI 컴포넌트(입력 보더, 포커스 표시, 의미 있는 아이콘, 차트 선) **3:1**(인접 색 대비). 비활성 요소는 예외.
- 텍스트가 충분한 대비를 가지면 버튼 배경 자체는 3:1이 아니어도 된다.

---

## 4. 데이터 많은 도구형 UI의 위계

1. **라벨은 필드 밖에 항상 보이게** 둔다. placeholder를 라벨 대신 쓰지 않는다. 꼭 필요한 설명은 필드 밖에 항상 보이게, 부가 힌트만 placeholder에 [검증] ([NN/g Placeholders Are Harmful](https://www.nngroup.com/articles/form-design-placeholders/)).
2. **Progressive disclosure**: "처음 화면에 있다는 사실 자체가 중요하다는 신호"다. 드물게 쓰는 옵션은 2차 화면이나 펼침으로 보낸다. **공개 단계는 2단계 이하**(3단계 이상이면 사용자가 길을 잃음). 숨긴 것은 정보 냄새(information scent)가 있는 라벨로 발견 가능하게 한다 [검증/2차] ([NN/g Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)).
3. **그룹핑은 간격 먼저, 선은 그다음, 박스는 마지막**이다. 그룹 사이는 그룹 안의 간격보다 2배 이상 벌린다 [추정: Refactoring UI의 "간격으로 구분" 원칙에서 수치화]. 가로 구분선은 데이터 표가 아닌 표면을 나누는 데 쓰지 않는다 [검증: Polaris] ([Shopify Polaris Spacial organization](https://polaris.shopify.com/design/layout/spacial-organization)).
4. **덜 중요한 것을 약하게 만들어 강조**한다(emphasize by de-emphasizing) [검증: Refactoring UI]. 라벨은 text-secondary 13px/500, 값은 text-primary 14px/600 같은 식이다.
5. **세그먼트 컨트롤**은 5개 이하, 폭을 같게, 선택지 전환에만 쓴다(액션 금지) [검증: HIG]. 6개 이상이면 select로 바꾼다.
6. **기본값은 드러내지 않는다** [추정]: 기본값에서 바뀐 설정에만 강조점(accent 점 6px)과 "초기화" 링크를 보여 준다. 사용자가 무엇을 바꿨는지 한눈에 보이고, 설정이 모두 기본값일 때는 화면이 조용하다.
7. **수치**는 `font-variant-numeric: tabular-nums`로 자릿수를 정렬한다 [2차: Stripe tnum]. 단위는 값보다 한 단계 약한 색으로.
8. **슬라이더**는 옆에 직접 입력칸을 붙이고, 값은 트랙 위가 아니라 라벨 행 오른쪽에 둔다 [추정: 도구형 UI 관행].

---

## 5. 고채도 캐릭터 일러스트를 담는 UI

- **중립 배경은 "갤러리 벽"**이다. 틀을 잡아 주되 경쟁하지 않는다. Spotify는 어두운 UI로 앨범 아트와의 시각적 경쟁을 줄이고 "콘텐츠가 곧 색"이 되게 한다. 시그니처 그린은 재생 버튼·진행바·CTA 같은 **상호작용 요소에만** 쓴다. Airbnb는 UI가 거의 사라지고 사진이 이야기를 한다 [2차] ([Medium – Muted tones](https://medium.com/@designstudiouiux/muted-tones-are-taking-over-app-design-heres-why-94a180165589), [UXPin – Color schemes](https://www.uxpin.com/studio/blog/color-schemes-for-apps/)).
- **60-30-10**: 중립 60, 보조 30, 강조 10. 너무 무채색이기만 하면 탐색이 불가능해지므로 **의도된 소량의 색**은 남긴다 [2차].
- 구체 규칙 [추정: 위 원칙과 게임 DB 사이트 관행 종합]
  1. 초상화 썸네일은 **gray-2 단색 배경 + 1px border.subtle** 위에 둔다. 희귀도나 속성으로 배경 전체를 칠하지 않는다.
  2. 속성은 **8px 원형 점** 또는 초상 우하단 16px 아이콘 하나로만 표시한다. 텍스트 라벨은 회색.
  3. 선택 상태는 속성색이 아니라 **강조색 2px 링**(모든 캐릭터 공통)으로 표시한다. 속성색과 선택색이 섞이면 의미가 충돌한다.
  4. 희귀도 별은 단색(amber 1개)으로, 크기는 작게.
  5. 차트 시리즈 색은 캐릭터 속성색과 **분리**한다. 차트는 중립 램프와 강조색 1개(주 캐릭터 또는 선택 캐릭터)를 쓰고, 나머지는 회색 계열로 둔다. 속성별 비교가 필요할 때만 속성 팔레트를 쓴다.
  6. 일러스트 주변에 그림자·글로우·그라디언트 오버레이를 넣지 않는다(일러스트 자체의 색을 해침).
  7. 다크모드에서 일러스트가 붕 떠 보이면 썸네일 배경을 gray-3로 한 단계 올린다.
- 참고 레퍼런스: [Game UI Database](https://www.gameuidatabase.com/)(가챠·컬렉션 카테고리 필터).

---

## 6. 추천 토큰 초안 (woofia_sim용)

전제 [추정]: 데스크톱 우선 도구, 라이트 기본, 한국어 중심. 아래 hex는 모두 WCAG 대비를 **직접 계산해 확인**했다(2026-09-28, 상대휘도 공식). 괄호 안은 대비비다.

### 6.1 색: 라이트 (기본)
| 토큰 | hex | 용도 / 대비 |
|---|---|---|
| `bg.canvas` | `#F6F6F7` | 앱 배경 |
| `bg.surface` | `#FFFFFF` | 패널·표 |
| `bg.subtle` | `#EFEFF1` | hover, 썸네일 배경, 세그먼트 트랙 |
| `bg.selected` | `#E7E7EA` | active/selected 행 |
| `border.subtle` | `#E4E4E7` | 구분선 |
| `border.default` | `#D4D4D8` | 패널 외곽 |
| `border.strong` | `#8A8A93` | 입력 보더·체크박스 (흰 배경 3.42 ✓ UI 3:1) |
| `text.primary` | `#18181B` | 본문·수치 (흰 배경 17.7) |
| `text.secondary` | `#52525B` | 라벨 (7.7) |
| `text.tertiary` | `#6B6B74` | 단위·힌트 (흰 배경 5.28, canvas 4.88 ✓) |
| `text.disabled` | `#A1A1AA` | 비활성(대비 예외) |
| `accent.solid` | `#1D5FD6` | 주 버튼 배경, 링크 (흰 배경 5.74, 흰 글씨 5.74 ✓) |
| `accent.hover` | `#1A56C4` | (6.62) |
| `accent.subtle` | `#EAF1FD` | 선택 배경 틴트 [추정 값] |
| `status.danger` | `#B42318` | (6.57) |
| `status.success` | `#157F3D` | (5.08) |
| `status.warning` | `#B45309` | (5.02) |

### 6.2 색: 다크
| 토큰 | hex | 용도 / 대비 |
|---|---|---|
| `bg.canvas` | `#111113` | 앱 배경(순수 검정 아님) |
| `bg.surface` | `#18181B` | 패널 |
| `bg.subtle` | `#202024` | hover, 썸네일 배경 |
| `bg.selected` | `#27272B` | selected |
| `bg.overlay` | `#232327` | 메뉴·팝오버(표면보다 밝게) |
| `border.subtle` | `#26262B` | 구분선 |
| `border.default` | `#34343A` | 패널 외곽 |
| `border.strong` | `#75757E` | 입력 보더 (surface 3.88, #202024 3.56 ✓) |
| `text.primary` | `#EDEDEF` | (surface 15.2) |
| `text.secondary` | `#A1A1AA` | (6.9) |
| `text.tertiary` | `#8B8B94` | (5.25, #202024 4.81 ✓) |
| `accent.solid` | `#7AA2FF` | 링크·포커스 (7.1). 다크 주 버튼은 이 배경 + `#111113` 글씨(7.58) |
| `status.danger` | `#F97066` | (6.4) |
| `status.success` | `#4ADE80` | (10.2) |
| `status.warning` | `#FBBF24` | (10.6) |

회색은 약간 푸른 zinc 계열로 잡았다. Linear 2026처럼 따뜻한 회색을 원하면 `#F6F6F7→#F7F7F5`, `#18181B→#1A1A18` 식으로 R/G를 1~2 올린다 [추정]. 어느 쪽이든 **Tailwind 기본값을 그대로 쓰지 않는다**는 점이 중요하다(현재 값 일부는 zinc와 겹치므로 확정할 때 OKLCH로 재생성하는 것을 권장).

### 6.3 속성 표식 색 (8px 점·16px 아이콘 전용, 텍스트에는 쓰지 않음)
| 속성 | 라이트 | 다크 | 비고 |
|---|---|---|---|
| 화 | `#D14B3D` | `#F0806F` | 라이트 흰 배경 4.39 / 다크 6.77 |
| 수 | `#2F7FC1` | `#6AAEE6` | 4.26 / 7.43 |
| 풍/목 | `#3F8F4E` | `#73C282` | 4.00 / 8.24 |
| 광 | `#B08A12` | `#E0BE4A` | 3.24 / 9.81 |
| 암 | `#7453A6` | `#A98BDB` | 5.95 / 6.25 |

모두 비텍스트 3:1 이상 ✓. 실제 속성 목록과 이름은 게임 데이터에 맞춰 조정한다.

### 6.4 타이포
- 폰트 [추정]: `Pretendard Variable`(한글·라틴 균형, 로컬 번들). 숫자에는 `tabular-nums`. 코드·공유코드에는 `ui-monospace, "JetBrains Mono", Consolas`. Inter 단독 사용은 AI 징후 목록에 있으므로 피한다.
- 굵기: **400 / 500 / 600** 세 개만 쓴다(700은 쓰지 않는다).

| 토큰 | size / line-height | weight | 용도 |
|---|---|---|---|
| `text.caption` | 12 / 16 | 500 | 단위, 메타, 표 헤더 |
| `text.body-sm` | 13 / 18 | 400 | 라벨, 보조 설명 |
| `text.body` | 14 / 20 | 400 | 기본 본문·컨트롤 |
| `text.title-sm` | 16 / 24 | 600 | 패널 제목 |
| `text.title` | 20 / 28 | 600 | 섹션 제목 |
| `text.display` | 28 / 36 | 600 | 결과 헤드라인 수치 |

- 20px 이상에서는 자간 -0.01em, 28px에서는 -0.02em [2차: Stripe·Geist 경향].

### 6.5 간격 (4px 기반)
`space.1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48`
- 컨트롤 내부 패딩 8×12, 필드 간 12, 그룹 간 24~32, 패널 패딩 16(밀집)/20, 페이지 여백 24.
- 컨트롤 높이: 28(sm) / 32(기본) / 36(주 버튼) [추정: 데스크톱 도구 관행].

### 6.6 라운드
`radius.sm=4`(체크박스·태그·세그먼트 안쪽 thumb) · `radius.md=6`(버튼·입력·세그먼트 트랙) · `radius.lg=10`(패널·모달·썸네일) · `radius.full`(토글·아바타만)
- 규칙: 중첩 시 안쪽 반경 = 바깥 반경 − 패딩(최소 2) [검증 원칙: M3 "같은 반경 금지"].

### 6.7 그림자 (라이트 전용, 다크는 보더와 표면 밝기로 대체)
- `shadow.none`: 패널·카드(보더만)
- `shadow.sm`: `0 1px 2px rgba(16,16,20,.06)`: 세그먼트 선택 thumb, sticky 헤더
- `shadow.md`: `0 4px 12px rgba(16,16,20,.08), 0 1px 3px rgba(16,16,20,.06)`: 드롭다운·팝오버
- `shadow.lg`: `0 12px 32px rgba(16,16,20,.12)`: 모달 (Stripe 최대값 수준)
- 다크: 위 요소에 `1px border.default` + `bg.overlay`. 그림자는 `rgba(0,0,0,.5)`로 두되 거의 보이지 않는 것을 전제한다.

### 6.8 모션
| 토큰 | 값 | 용도 |
|---|---|---|
| `dur.instant` | 100ms | hover 배경, 체크 |
| `dur.fast` | 150ms | 세그먼트 thumb, 토글, 툴팁 |
| `dur.base` | 200ms | 펼침/접힘, 드롭다운 등장 |
| `dur.slow` | 300ms | 모달·시트 등장(퇴장은 200) |
| `ease.standard` | `cubic-bezier(0.2, 0, 0, 1)` | 기본 (M3 standard) |
| `ease.enter` | `cubic-bezier(0, 0, 0, 1)` | 등장 (M3 standard-decelerate) |
| `ease.exit` | `cubic-bezier(0.3, 0, 1, 1)` | 퇴장 (M3 standard-accelerate) |

- 근거 [검증]: NN/g는 100~400ms(400은 큰 이동에만), 웹은 모바일의 약 절반(150~200ms), 퇴장은 등장보다 짧게 ([NN/g Animation duration](https://www.nngroup.com/articles/animation-duration/)).
- 바운스·elastic·spring overshoot는 쓰지 않는다. 차트 첫 렌더 애니메이션도 쓰지 않거나 200ms 페이드만 [추정].
- `prefers-reduced-motion: reduce` [검증] ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion), [CSS-Tricks](https://css-tricks.com/nuking-motion-with-prefers-reduced-motion/)):
  - transform(이동·확대)은 제거하고 opacity 150ms만 남긴다.
  - `scroll-behavior: smooth`는 끈다.
  - 전역 `animation-duration: 0.01ms` 리셋은 피한다(opacity:0 시작 요소가 영구히 안 보이거나 `animationend`에 의존하는 JS가 깨짐).
  - JS 애니메이션(차트 라이브러리 포함)도 `matchMedia`로 분기한다.

---

## 7. 안티패턴 체크리스트

색·표면
- [ ] 그라디언트가 하나도 없다(배경·버튼·텍스트·차트 영역 채움 포함)
- [ ] 강조색은 1개이고 인터랙티브 요소와 선택 상태에만 쓴다
- [ ] 글로우·컬러 그림자·backdrop-blur가 없다
- [ ] 다크 배경이 `#000`이 아니고 텍스트가 `#FFF`가 아니다
- [ ] 속성색은 8px 점과 16px 아이콘에만 쓰고, 배경·보더 전체를 칠하지 않는다
- [ ] 차트 색이 속성색과 분리돼 있다(주 시리즈 = 강조색, 나머지 = 중립)

구조
- [ ] 카드 안에 보더 박스가 또 있지 않다(중첩 표면 0)
- [ ] 똑같은 카드 3개 이상을 가로로 반복하는 곳이 없다(목록이나 표로 대체)
- [ ] 왼쪽 컬러 띠(border-left 3~4px 컬러)가 없다
- [ ] 그룹 구분을 간격으로 먼저 한다. 가로선은 표에만 쓴다
- [ ] 라운드가 4/6/10/full 네 값뿐이고 안쪽이 바깥보다 작다

타이포·카피
- [ ] 굵기는 400/500/600뿐이다
- [ ] 크기 단계가 6개를 넘지 않는다(12/13/14/16/20/28)
- [ ] 수치에 `tabular-nums`를 적용했다. 그라디언트 수치는 없다
- [ ] 이모지 아이콘이 없고, 섹션 제목 앞 장식 아이콘이 없다
- [ ] 라벨마다 설명문을 달지 않았다(툴팁이나 펼침으로 이동)
- [ ] 헤드라인·버튼 문구가 구체적 동사와 명사다

상호작용
- [ ] hover는 배경색 변화뿐이다(scale·bounce 없음)
- [ ] 모든 전환이 300ms 이하이고 standard 곡선을 쓴다
- [ ] `prefers-reduced-motion`에서 이동은 제거하고 페이드만 남는다
- [ ] 포커스 링이 모든 인터랙티브 요소에 있다(2px, 대비 3:1 이상)
- [ ] 세그먼트 컨트롤은 5개 이하이고 폭이 같다. 6개 이상이면 select로 바꾼다
- [ ] 고급 설정은 한 단계 접혀 있고, 공개 단계가 2단계 이하다
- [ ] 기본값에서 바뀐 설정만 표식과 "초기화"가 보인다
- [ ] 빈 상태와 에러 상태에 문장 1줄과 행동 1개가 있다

접근성
- [ ] 본문 4.5:1, UI 보더·아이콘 3:1을 라이트와 다크 모두에서 따로 확인했다
- [ ] placeholder를 라벨 대신 쓰지 않는다
