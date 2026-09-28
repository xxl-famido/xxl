# XXL 라운지 공개 체크리스트

메인(v2)이 준비되기 전까지 **배포 직전 상태**로 세팅돼 있다. 아래 순서대로만 하면 된다.
원칙: 로컬 확인 → 사람 확인 → 라이브(push). 결제수단 등록·Upgrade 금지.

## 현재 상태 (2026-09-28)
| 항목 | 상태 |
|---|---|
| 라운지 화면 | `dashboard_v2/lounge.html` 완성, 서버 주소 비어 있음(=빌드에서 자동 제외). **메인 연결 인계서: HANDOFF_MAIN.md** |
| 라운지 서버 | **배포 완료(2026-09-28)** `https://xxl-lounge-api.xxl-famido.workers.dev` · D1 `xxl-lounge`(APAC) · 비밀값 3개 secret_text · 라이브 읽기 점검 통과 · 운영자 초기 글(의견 1 고정·티어표 1·팀 2), 테스트 흔적 0 |
| 배포 스크립트 | `node lounge_api/scripts/deploy.mjs` (점검만: `--check`, 통과) |
| 비밀값 | `C:/Users/ZRUN/Documents/secrets/` — lounge_pin_pepper.txt(재생성 금지) · lounge_admin_token.txt · cloudflare_turnstile.txt · 백업 lounge_backups/ |
| 시뮬 연결 | `src/core/deeplink.js` + 테스트 5개 통과. **main.js 에 아직 안 꽂음**(메인 작업 중이라) |
| Pages 워크플로 | `.github/workflows-staged/deploy_v2.yml` 대기(비활성) |

## A. 라운지 서버 먼저 올리기 — ✅ 완료(2026-09-28, 하위주소 xxl-famido · 결제수단 없음 확인)
사용자:
1. Workers & Pages → Subdomain 을 이메일과 무관한 이름으로 변경
2. Billing → Payment Methods 비어 있는지 확인
3. PC 앞에서 `! npx wrangler login` → Allow

Claude:
4. `cd lounge_api && node scripts/deploy.mjs`
   (D1 생성 → 스키마 → 배포+비밀값 → /v1/health 확인 → deploy_state.json 기록)
5. 사용자: Billing 다시 확인
6. (선택) Turnstile 위젯 Hostnames 에서 `localhost` 제거 — 로컬 검사는 공식 테스트 키를 쓰므로 필요 없음

이 단계까지는 사이트에 아무 변화가 없다(화면이 아직 서버를 가리키지 않음).

## A2. 초기 글 올리기 (공개 전)
1. 사용자: `lounge_api/content/initial_content.example.json` 을 복사해 `C:/Users/ZRUN/Documents/secrets/lounge_initial_content.json` 으로 저장하고 채운다(공통 비밀번호 pin 포함). 또는 원하는 글을 말로 주면 Claude 가 파일을 채운다.
2. `node lounge_api/scripts/seed_content.mjs --check` → `--local` → 화면 미리보기(`lounge.html?api=http://127.0.0.1:8787`)
3. 사용자 확인 → `node lounge_api/scripts/seed_content.mjs --remote`
   - 같은 파일을 다시 돌려도 이미 넣은 key 는 건너뛴다. 넣은 글은 그 pin 으로 화면에서 수정·삭제 가능.

## A3. 초기 글 — ✅ 완료(2026-09-28, 사용자가 운영자 모드로 직접 작성, 작성 창 닫음·백업)

## B. 메인(v2) 공개 날
1. `src/main.js` 부트에 딥링크 연결(`src/core/deeplink.js` 맨 아래 주석의 6줄) + 문구 키 추가
2. 시뮬 상단 바에 "라운지" 링크(`lounge.html`)
3. `node lounge_api/scripts/golive.mjs` → lounge.html 에 서버 주소 기입
4. 로컬 확인
   - `bash tools/redesign/build_site_v2.sh` → 출력에 `lounge: 공개` 확인
   - 로컬 서버로 UI 검사: `LOUNGE_BASE="http://localhost:8779/lounge.html?api=http://127.0.0.1:8787" node tools/redesign/uitest_lounge.js`
   - `node --test dashboard_v2/tests/*.test.js`
5. `.github/workflows-staged/deploy_v2.yml` 로 `.github/workflows/deploy.yml` 교체
6. 사용자 확인 후 커밋 → main push (GitHub Pages 자동 배포)
7. `node tools/redesign/live_smoke_lounge.js` (읽기 전용 라이브 점검)

## 되돌리기
- 라운지만 내리기: `node lounge_api/scripts/golive.mjs --off` → push (빌드가 라운지를 자동 제외)
- 스팸 공격: `node lounge_api/scripts/admin.mjs lock` (풀기: `unlock`)
- 서버는 그대로 두면 요금 없음(무료 플랜, 카드 없음). 완전히 지우려면 대시보드에서 Worker·D1 삭제.

## 운영
- 신고 확인: `node lounge_api/scripts/admin.mjs reports` → `hide|show|delete post:p…`
- 백업: `node lounge_api/scripts/backup.mjs` → `secrets\lounge_backups\` (주기는 사용자와 정함)
- 새 동료 출시: `python tools/redesign/gen_lounge_chars.py --new <ID>` (서버는 data/chars.json 을 읽으므로 **서버도 재배포**: `node lounge_api/scripts/deploy.mjs`)
- 새 게임 빌드: `dashboard_v2/src/lounge/shared.js` 의 `CURRENT_BUILD` 수정 → 서버 재배포 + 화면 배포
