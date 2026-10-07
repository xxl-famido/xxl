# XXL 라운지 → 메인 시뮬레이터(v2) 인계서

작성 2026-09-28. **메인 v2 작업을 하는 에이전트가 먼저 읽을 문서.** 라운지는 완성·서버 라이브 상태이고, 메인이 공개될 때 아래만 하면 같이 열린다.
관련 문서: `GO_LIVE.md`(공개 체크리스트) · `PLAN.md`(설계·결정 기록) · `lounge_api/README.md`(서버·도배 방지·운영).

---

## 0. 한눈에 보는 현재 상태

| 항목 | 상태 |
|---|---|
| 라운지 화면 | `dashboard_v2/lounge.html` + `lounge.css` + `src/lounge/*` — 완성. **서버 주소 meta 가 비어 있음**(= 목업 모드, 빌드에서 자동 제외) |
| 라운지 서버 | **라이브** `https://xxl-lounge-api.xxl-famido.workers.dev` (Cloudflare Worker `xxl-lounge-api` + D1 `xxl-lounge`, 무료 플랜·결제수단 없음). 출처는 `https://xxl-famido.github.io` 만 허용 |
| 라이브 데이터 | 운영자(사용자)가 쓴 초기 글: 의견 1(파미도 게시판 **고정**), 티어표 1, 팀 2. 테스트 흔적 0. 백업 `C:\Users\ZRUN\Documents\secrets\lounge_backups\` |
| 메인 쪽 연결 | **아직 없음** — 이 문서 §2 가 할 일 |
| 배포 워크플로 | `.github/workflows-staged/deploy_v2.yml` 대기(비활성). 지금 `.github/workflows/deploy.yml` 은 v1(`dashboard/`)을 배포 중 |

---

## 1. 라운지가 메인에 기대는 것 (바꾸면 라운지가 깨진다)

라운지는 메인 v2의 토큰·공용 CSS·모션·코덱을 **그대로 가져다 쓴다.** 아래 이름을 바꾸거나 지울 때는 라운지 검사(§5)를 반드시 돌린다.

**JS 모듈(import)**
| 파일 | 라운지가 쓰는 export |
|---|---|
| `src/core/codec.js` | `decodeShare`, `encodeShare`, `unpackRecords`, `b64urlToBytes`, `bytesToB64url`, `deflate` (서버 `lounge_api` 도 import — 공유 코드 재판독) |
| `src/core/format.js` | `shortName` |
| `src/motion/index.js` | `dur`, `ease`, `flip`, `rollup`, `stagger`, `themeFade` |
| `src/core/i18n.js` | `createI18n`, `LANGS` (+ 인스턴스의 `t`, `setLang`, `onChange`, `setData`, `nameOf`, `has`, `ready`, `lang`) — 라운지는 사전 위치만 `i18n/lounge/` 로 바꿔 쓴다 |

**CSS**: `tokens.css`(전 토큰), `motion.css`(`.enter`, `.fly`, `fade`·`toast-in` 키프레임), `app.css` 의 클래스
`btn btn-primary btn-secondary btn-ghost btn-danger btn-icon btn-sm btn-lg btn-block topbar brand brand-mark brand-name topnav menu toast toasts empty sr el-tag dot`
(라운지는 `seg`·`search` 를 자체 정의. `[data-el]` 속성색 규칙도 app.css 것을 씀)

**아이콘**(`ui-icons/sprite.svg` 의 `i-*`): `arrow-down arrow-left arrow-up chevron-right copy corner-down-right ellipsis-vertical flag history image-down key-round message-circle message-square moon pencil pin play plus rotate-ccw rows-3 search sun swords thumbs-down thumbs-up trash-2 upload users x`
(라운지 작업 때 14개를 추가했고 `tools/redesign/build_sprite.py` 로 다시 만들었다. 스프라이트를 재생성할 때 `ui-icons/*.svg` 원본을 지우지 말 것)

**localStorage 키(공유)**: `woofia_theme`, `woofia_lang` — 메인과 라운지가 같은 테마·언어를 쓴다(시뮬에서 언어를 바꾸면 라운지도 그 언어). 라운지 전용 키는 모두 `woofia_lounge_*` 접두어라 메인과 겹치지 않는다.

**라운지 전용 파일(메인은 건드리지 않아도 됨)**: `lounge.html`, `lounge.css`, `lounge_chars.json`, `src/lounge/*`, `src/core/deeplink.js`, `tests/deeplink.test.js`, `lounge_api/*`

---

## 2. 메인에 할 연결 (메인 공개 전에)

### 2-1. 딥링크 — 라운지 "시뮬하러 가기"·"시뮬에서 편성" 받기 (필수)
라운지가 만드는 주소:
- `index.html#code=<encodeURIComponent(공유코드)>&run=1` — 팀을 불러와 **바로 실행**
- `index.html#add=<동료ID>` — 빈 자리에 동료 추가

처리 모듈은 이미 있다: `src/core/deeplink.js` (+ `tests/deeplink.test.js` 5개 통과).
`src/main.js` 부트에서 **초안 복원 다음**에 아래를 넣는다(파일 맨 아래 주석과 같음):
```js
import { parseDeepLink, applyDeepLink, clearDeepLink } from './core/deeplink.js';
// …초안 복원 뒤
const link = parseDeepLink(location.hash);
if (link) {
  const r = await applyDeepLink(store, link);        // 코드 길이·압축 크기 상한, 모르는 동료·빈 팀 거부
  clearDeepLink();                                   // 새로고침해도 다시 덮어쓰지 않게 주소 정리
  if (r.applied === 'code') toast(t('deeplink.loaded'), { label: t('common.undo'), run: () => { store.applySnap(r.undo); store.saveDraft(); } });
  if (r.reason) toast(t(`deeplink.${r.reason}`));   // bad | empty | unknown | full | dup | imbueonP1
  if (r.run) runSimulation();                        // 실행 버튼과 같은 경로(로딩 모션 포함)
}
```
- 문구 키 `deeplink.loaded / bad / empty / unknown` 을 GLOSSARY·i18n 에 추가. (`full`·`dup`·`imbueonP1` 은 기존 team.add 사유 문구 재사용 가능)
- `applyDeepLink` 는 적용 **전 상태를 undo 로 돌려준다** → 작업 중이던 초안을 되돌리기로 살릴 수 있게 토스트 필수.
- 주의: 메인의 해시 라우팅/섹션 점프(`#team` 등)와 충돌하지 않는다 — `parseDeepLink` 는 `code=`·`add=` 가 있을 때만 반응.

### 2-2. 상단 바에 "라운지" 링크 (필수)
`src/ui/topbar.js` 에 `lounge.html` 로 가는 링크(같은 탭 이동). 라운지 쪽 상단 바에는 이미 "시뮬레이터"(`index.html`) 링크가 있다.
문구는 용어집 기준으로 — 정식 명칭 **XXL 라운지**, 버튼은 "라운지".

### 2-3. 결과 화면 "팀 공유에 올리기" (권장)
`lounge.html#/team/new?code=<encodeURIComponent(현재 공유 코드)>` 로 보내면 라운지가 코드를 읽어 5인 프로필을 자동으로 채운다(`src/lounge/team.js` 가 `params.get('code')` 처리).
공유 코드는 기존 `records.exportCode` / `codec.encodeShare` 결과를 그대로.

### 2-4. 동료 상세 → 라운지 의견 (선택)
동료 상세·육성 시트에 `lounge.html#/c/<동료ID>` 링크("의견 보기").

---

## 3. 공개 날 순서 (메인 v2 공개와 함께)
1. §2-1, §2-2 (필요하면 2-3·2-4) 구현 + 메인 검사 통과
2. `node lounge_api/scripts/golive.mjs` → `lounge.html` 의 `<meta name="lounge-api">` 에 라이브 서버 주소 기입(서버 health 확인 후에만 씀)
3. `bash tools/redesign/build_site_v2.sh` → 출력에 **`lounge: 공개`** 가 나와야 함(주소가 비면 라운지를 빌드에서 자동 제외 — 목업이 공개되는 사고 방지)
4. `.github/workflows-staged/deploy_v2.yml` 로 `.github/workflows/deploy.yml` 교체 (조립은 `build_site_v2.sh _site` 한 줄)
5. 로컬 확인 → **사용자 확인 후** 커밋 → main push (GitHub Pages)
6. `NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/live_smoke_lounge.js` — 라이브 읽기 전용 점검(글을 쓰지 않음)

되돌리기: `node lounge_api/scripts/golive.mjs --off` → push (라운지만 빌드에서 빠진다. 서버·데이터는 그대로)

---

## 4. 하지 말 것
- **Cloudflare 결제수단 등록·Upgrade 금지.** 무료 한도를 넘으면 오류로 멈출 뿐 과금 없음.
- **`secrets/lounge_pin_pepper.txt` 재생성·수정 금지** — 바뀌면 모든 글의 비밀번호가 무효.
- 비밀값(`PIN_PEPPER`, `ADMIN_TOKEN`, `TURNSTILE_SECRET`)을 저장소·GitHub Actions 에 넣지 않는다. 서버 배포는 이 PC에서 `node lounge_api/scripts/deploy.mjs` 로만.
- `lounge.html` 에 라이브 주소가 들어간 상태에서 `uitest_lounge.js` 를 **`?api=` 없이** 돌리지 말 것 — 라이브 DB 에 테스트 글이 써진다. 검사는 항상 로컬 서버(`?api=http://127.0.0.1:8787`)로.
- `wrangler.toml` 의 `ALLOWED_ORIGINS` 에 localhost 를 넣지 말 것(로컬은 `.dev.vars` 가 덮어씀). `deploy.mjs --check` 가 막는다.
- 라운지 CSS 는 `lg-` 접두어, 메인 CSS 와 섞지 말 것. 라운지가 app.css 클래스를 쓰므로 app.css 를 개편할 때 §1 목록 유지.

---

## 5. 검사 명령
| 대상 | 명령 |
|---|---|
| 메인 v2 전체(딥링크 포함) | `cd dashboard_v2 && node --test tests/*.test.js` (현재 240 통과) |
| 라운지 서버 단위+통합 | `cd lounge_api && npm run dev` (별도 창) → `npm test` (예시 데이터 초기화 포함) |
| 라운지 화면(로컬 서버) | `node lounge_api/scripts/seed_local.mjs` → `LOUNGE_BASE="http://localhost:8779/lounge.html?api=http://127.0.0.1:8787" NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/uitest_lounge.js` |
| 서버 배포 전 점검 | `node lounge_api/scripts/deploy.mjs --check` (로그인 불필요) |
| 빌드 게이트 | `bash tools/redesign/build_site_v2.sh` |

로컬 확인용 v2 서버는 사용자 8778 을 건드리지 말고 별도 포트: `python -c "import server_v2 as s; from http.server import ThreadingHTTPServer; ThreadingHTTPServer(('127.0.0.1',8779), s.Handler).serve_forever()"`

---

## 6. 앞으로 반복되는 작업
- **신규 동료 출시**: `python tools/redesign/gen_lounge_chars.py --new <ID> --build <MMDD>`(그 동료가 들어온 게임 빌드 — `dashboard_v2/src/lounge/builds.js` 에 기록돼 글 도장·평균 티어 이번 버전·티어표 끌올 기준이 된다) + 서버 재배포 `node lounge_api/scripts/deploy.mjs`(서버가 `data/chars.json` 으로 유효 동료를 판정). 이전 신규 표시는 `--new` 에서 빼면 사라진다.
- **새 게임 빌드**: `dashboard_v2/src/lounge/shared.js` 의 `CURRENT_BUILD` 수정 → 서버 재배포 + 화면 배포(글에 빌드 도장, 이전 빌드 글은 "이전 버전").
- **운영**: 사용자는 라운지 `#/op`(숨은 주소)에 관리자 토큰을 넣어 운영자 모드 → 이름 '파미도' 고정, ⋯ 메뉴에서 맨 위 고정/해제. CLI: `node lounge_api/scripts/admin.mjs reports | hide|show|delete|pin|unpin post:p… | lock | unlock`, 백업 `node lounge_api/scripts/backup.mjs`.

---

## 7. 라운지 기능 요약(메인 UI 문구·안내에 참고)
- 동료 게시판(메인): 동료별 의견, 익명 이름 "익명의 ○○"(스레드마다 다름, 파미도는 운영자 전용), 4자리 비밀번호로 수정·삭제·이어 쓰기, 좋아요(수 공개)·싫어요(수 비공개, 점수 낮으면 아래로), 답글, 태그, 신고.
- 티어표: 드래그 편집기, PNG 저장, 커뮤니티 평균 티어, 수정.
- 팀 공유: 공유 코드 → 5인 프로필 자동, 설명, "시뮬하러 가기"(§2-1), 제목·기준·설명 수정.
- 도배 방지: 15초 간격, 게시판 10분 5개, 같은 내용 24시간, 반복·링크 도배, 티어표·팀 하루 5, 사이트 분당 60 초과 시 10분 비상 정지. 욕설 필터 없음(사용자 결정).

---

## 메인 연결 완료 (2026-09-28)
§3 공개 날 절차(golive·meta 기입·워크플로 교체·커밋·push)는 **아직 하지 않음** — 사용자 확인 대기.

| 항목 | 상태 | 파일 |
|---|---|---|
| 2-1 딥링크 | 완료. 초안 복원(`store.init`) 직후 적용 → 로딩 후 토스트(되돌리기 = 이전 편성+활성 기록 복원) → `run=1` 이면 `ctx.run()` 1회(부팅 자동 실행 건너뜀). 이미 열린 화면의 해시 이동(`hashchange`)도 처리 | `src/main.js` |
| 2-2 상단바 라운지 | 완료. 「가이드」 → ≡ 메뉴, 그 자리에 `lounge.html` 링크(같은 탭, 강조 secondary). 팀 비교도 secondary. 모바일 아이콘+짧은 라벨. `lounge.html` 없으면 숨김(HEAD, 로컬은 GET) | `src/ui/topbar.js` · `src/ui/menu.js` · `css/topbar.css` · `src/ui/lounge-link.js` |
| 2-3 팀 공유에 올리기 | 완료. 결과 머리 기록 내보내기 뒤 → `lounge.html#/team/new?code=<encodeURIComponent(encodeShare)>` (화면 편성 = 활성 기록이면 그 기록, 아니면 지금 편성) | `src/ui/results.js`(머리 버튼만) |
| 2-4 의견 보기 | 완료. 육성 창 머리 → `lounge.html#/c/<동료ID>` | `src/ui/grow.js` · `css/grow.css` |
| 문구 | `i18n/parts/lounge_link.{kr,en,ja,zh}.json` (`deeplink.*`·`top.lounge*`·`result.share.lounge*`·`grow.lounge*`·`top.brand.*`), GLOSSARY §2 | |
| 검사 | `node --test tests/*.test.js` 247 통과 · `tools/uitest_v2.js` 124 통과(상단바·딥링크·팀 공유 URL 검사 추가) | |


## 8. 다국어 (2026-09-28 추가)
라운지 화면의 정해진 문구는 kr/en/ja/zh 전부 번역돼 있다. **유저가 쓴 글·제목·행 이름·설명은 번역하지 않는다.**
- 사전: `dashboard_v2/i18n/lounge/{kr,en,ja,zh}.json` — **생성 파일, 손대지 말 것.** 원본은 `tools/redesign/lounge_i18n_src.py`, 생성·검사 `python tools/redesign/gen_lounge_i18n.py`
  (코드가 쓰는 키가 네 언어에 다 있는지·자리표시자 일치까지 검사, 실패 시 종료 코드 1)
- 속성(element.*)·포지션(role.*)은 생성기가 **메인 사전 `dashboard_v2/i18n/*.json` 에서 복사** — 메인 용어를 바꾸면 생성기만 다시 돌리면 라운지도 따라간다.
- 동료 이름: `lounge_chars.json` 의 `name_kr/en/ja/cn`(생성기 `gen_lounge_chars.py` 가 data/chars.json 에서 채움).
- 서버 오류: 응답에 `code`·`vars` 가 붙고 화면이 번역(`err.*`). 서버의 한국어 문구도 같은 kr.json 에서 가져온다 → **문구 변경 = src 수정 → 생성기 → 서버 재배포**.
- 라운지 상단 바에 언어 선택(🌐) 있음. 메인과 같은 `woofia_lang`.
- 검사: `NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/uitest_lounge_i18n.js` (로컬 서버 전용 — en/ja/zh 화면에 한국어 고정 문구가 없는지, 서버 오류 번역, 언어 즉시 전환)
- 메인 쪽 영향: 없음(메인 사전 파일은 읽기만 함). 단, 메인 `core/i18n.js` 의 `createI18n` 옵션(`baseUrl`, `dicts.engine`)·반환 API 를 바꾸면 라운지 검사를 돌릴 것.
