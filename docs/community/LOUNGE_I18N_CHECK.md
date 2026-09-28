# XXL 라운지 언어별 점검 (2026-09-28)

대상: 라운지 사전(`tools/redesign/lounge_i18n_src.py` → `gen_lounge_i18n.py` → `dashboard_v2/i18n/lounge/{kr,en,ja,zh}.json`)과 `dashboard_v2/src/lounge/*`, `lounge.html`.
검사는 전부 로컬에서 했다: 로컬 서버 `?api=http://127.0.0.1:8787`(8779 정적 서버)와 목업 모드(`?api=mock`). 라이브 서버에는 호출하지 않았다.

## 1. 사전 전수 검사

| 항목 | 결과 | 비고 |
|---|---|---|
| 키 수 | 321키 × 4언어 (코드가 쓰는 키 320개 모두 있음) | 점검 전 315키. 목업 오류용 6키 추가 |
| 언어별 누락 키 (en/ja/zh vs kr) | 0 | |
| 자리표시자 `{x}` 불일치 | 0 | 생성기 검사 |
| 미번역 표식(`[미번역]`·TODO 등) | 0 | |
| en/ja/zh 값에 한글 남음 | 0 | 생성기 검사를 영어만 → **en/ja/zh 전부**로 넓힘 |
| ja/zh 값이 영어 그대로 | 0 | |
| zh 라운지 명칭 | 「交流區」 3곳, 다른 표기(大廳·休息室 등) 0 | 메인 사전(`top.lounge`=交流區)과 같음 |
| JS 하드코딩 한국어 (사용자 노출) | **`api-mock.js` 오류 21곳 → 0** | 아래 2절 |
| JS 한국어 중 남겨 둔 것 | 주석·`console.warn`(개발자용), 저장값 토큰(`POST_TAGS`·`ROLES`·`TAG_KEY`: 화면에는 `tagLabel`/`roleLabel`로 번역돼 나옴), `OPERATOR.name`(파미도 — 화면에는 현지 이름) | 화면 문구 아님 |
| `seed.js` 목업 예시 글 | 한국어 그대로 | 유저가 쓴 글 역할이라 번역 대상 아님(실서버에는 안 올라감) |

## 2. 고친 것

| 파일 | 내용 |
|---|---|
| `src/lounge/api-mock.js` | 한국어 `throw new Error('…')` 21곳 → `fail(code, vars)`(서버와 같은 `err.*` 코드 → `errorText` 로 현재 언어). 목업에서도 오류가 en/ja/zh 로 나옴 |
| `tools/redesign/lounge_i18n_src.py` | 새 키 `err.pinWrongPlain` · `err.continuePin` · `err.tierNotFound` · `err.teamNotFound` · `err.mockOp` · `err.mockPin` (4언어). 한국어 시스템 문구 45개를 해요/하세요체 → 평서·명사형(예: "잠시 후 다시 시도하세요." → "잠시 후 다시 시도", "내용을 입력하세요." → "내용 입력 필요"). 변경 전 사본 `logs/lounge_i18n_src.before_tone.py` |
| `tools/redesign/gen_lounge_i18n.py` | `fail('code'` 도 사용 키로 인식, 한글 잔존 검사를 en/ja/zh 로 확대 |
| `src/lounge/main.js` + `lounge.css` | 언어 메뉴 체크 `✓` → SVG `icon('check')`(스프라이트에 이미 있음) |
| `src/lounge/seed.js` | 용어(캐릭터→동료, 딜→데미지, 주딜→주력 데미지)·어미(해요체→평서) |
| 메인 사전 `i18n/parts/{guide,lounge_link}.{en,ja,zh}.json` | 라운지 안내 문구를 라운지 사전 표기로 맞춤: zh 階級表/排行表→**梯度表**, 評價→**留言**(查看留言) · ja 編成共有→**チーム共有**, 意見→**コメント** · en opinions→**comments**(See comments). `i18n_migrate.py` 로 병합. GLOSSARY 에 라운지 다국어 표기 행 추가 |

## 3. 화면 점검 (en / ja / zh)

`tools/redesign/uitest_lounge_i18n.js` 를 넓혀 전 화면을 언어별로 찍고, 화면의 정해진 문구(유저 글·제목·행 이름·설명·코드 제외)에서 한글을 찾았다.
스크린샷: `tools/redesign/shots/lounge/i18n_{en,ja,zh}_*.png` (언어당 13장 + 목업 1장).

| 화면 | 라우트 | en | ja | zh |
|---|---|---|---|---|
| 동료 게시판 목록 | `#/` | 한글 0 | 한글 0 | 한글 0 |
| 스레드(동료 게시판) | `#/c/10441`, `#/c/10421` | 한글 0 · 이름 Famido | 한글 0 · ファミド | 한글 0 · 法米多 |
| 티어표 목록 / 작성 / 보기 | `#/tier`, `#/tier/new`, `#/tier/<id>` | 한글 0 | 한글 0 | 한글 0 |
| 팀 공유 목록 / 작성 / 보기 | `#/team`, `#/team/new`, `#/team/<id>` | 한글 0 | 한글 0 | 한글 0 |
| 내 활동 | `#/me` | 한글 0 | 한글 0 | 한글 0 |
| 운영자(숨은 주소) | `#/op` | 한글 0 | 한글 0 | 한글 0 |
| 작성 창 빈 내용 등록 → 오류 토스트 | 스레드 | Please write something. | 本文を入力してください。 | 請輸入內容。 |
| 서버 오류(틀린 비밀번호) | 수정 대화상자 | Wrong PIN. (4 tries left) | 暗証番号が違います。（残り3回） | 密碼錯誤。（剩餘 2 次） |
| 목업 오류(틀린 비밀번호) | `?api=mock` | — | 暗証番号が違います。（残り4回） | — |
| 언어 메뉴 | 상단 | 체크 = SVG | 체크 = SVG | 체크 = SVG |
| 언어 메뉴로 즉시 전환(kr→en) | `#/tier` | 티어표 → Tier Lists, 새로고침 없이 | | |
| 페이지 오류 | 전 화면 | 0 | 0 | 0 |

결과: **ALL PASS**. 남는 한국어는 유저 글(시드 예시 글·제목)뿐.

## 4. 다시 돌리는 법
```bash
python tools/redesign/gen_lounge_i18n.py            # 사전 생성 + 누락/자리표시자/한글 잔존 검사
node lounge_api/scripts/seed_local.mjs               # 로컬 서버(8787) 예시 데이터
LOUNGE_BASE="http://localhost:8779/lounge.html?api=http://127.0.0.1:8787" NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/uitest_lounge_i18n.js
```
목업 검사는 `lounge.html` 의 서버 주소 meta 가 비어 있을 때만 돈다(라이브 주소가 들어가면 자동 건너뜀).
