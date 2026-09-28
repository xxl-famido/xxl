# XXL 라운지 API (Cloudflare Worker + D1)

화면은 GitHub Pages(`dashboard_v2/lounge.html`), 데이터는 이 Worker. 설계: `docs/community/PLAN.md`.

## 절대 규칙 (요금·보안)
- **Cloudflare 계정에 결제수단을 등록하지 않는다. Upgrade 를 누르지 않는다.** 무료 한도를 넘으면 오류로 멈출 뿐 과금은 없다
  (Workers 하루 10만 요청 → 1027 오류, D1 하루 읽기 500만/쓰기 10만 행·5GB → 쿼리 오류. 매일 UTC 0시 = 한국 09시 초기화).
- 비밀값 3개(`PIN_PEPPER`, `TURNSTILE_SECRET`, `ADMIN_TOKEN`)는 `wrangler secret put` 으로만. 저장소·채팅에 적지 않는다.
- 배포는 이 PC에서만. GitHub Actions 에 Cloudflare 토큰을 넣지 않는다.
- `RATE_SCALE` 은 로컬 검사 전용(.dev.vars). 라이브에 넣지 않는다.

## 도배 방지 (규칙 원본: dashboard_v2/src/lounge/shared.js ANTISPAM, 제한 수치: src/security.js RATE)
| 장치 | 기준 | 거절 |
|---|---|---|
| 봇 확인 | 모든 글쓰기에 Turnstile | 403 |
| 연속 작성 간격 | 같은 IP, 성공한 글 뒤 15초 | 429 + 남은 초(화면 버튼 카운트다운) |
| IP 분당·하루 | 3 / 50 | 429 |
| 한 게시판 몰아쓰기 | 같은 IP·같은 게시판 10분 5개 | 429 |
| 티어표·팀 | IP 하루 5개씩 | 429 |
| 같은 내용 | 24시간 안에 같은 사람(어디든) 또는 같은 게시판(누구든), 띄어쓰기·문장부호·대소문자 무시 | 409 |
| 의미 없는 반복 | 같은 글자 20연속, 같은 말 8번 연속, 40자 이상인데 글자 종류 4개 이하, 링크 3개 이상, 줄 40개 초과. 수정에도 적용 | 400 |
| 비상 정지 | 사이트 전체 분당 60 글(봇 확인 통과분만 셈) → 10분 자동 정지 | 503. `admin.mjs unlock` 으로 즉시 해제 |
| 반응 | IP 분당 40 · 하루 600 | 429 |
욕설 필터는 넣지 않음(사용자 결정). 검사용 배수(`RATE_SCALE`, `X-Test-*` 헤더)는 .dev.vars 가 있을 때만 켜지고 라이브에서는 무시된다.

## 로컬 개발 (계정 불필요)
```
npm install
npm run db:local                 # 스키마
node scripts/seed_local.mjs      # 목업과 같은 예시 데이터(로컬 DB 전용)
npm run dev                      # http://127.0.0.1:8787
node test/unit.mjs               # 단위 검사
npm test                         # 단위 + 예시 데이터 초기화 + 통합 검사(로컬 서버에만)
```
화면을 로컬 서버에 붙이기: `http://localhost:8779/lounge.html?api=http://127.0.0.1:8787` (?api= 는 localhost 만 허용, `?api=mock` 으로 복귀)
UI 검사: `LOUNGE_BASE="http://localhost:8779/lounge.html?api=http://127.0.0.1:8787" node tools/redesign/uitest_lounge.js`

## 배포 (로그인 후, 확인 받고 진행) — 전체 순서: docs/community/GO_LIVE.md
```
node scripts/deploy.mjs --check    # 로그인 없이 점검: 단위 검사 + 번들 dry-run + 설정·비밀값 누출 검사
node scripts/deploy.mjs            # D1 생성/재사용 → 스키마 → 배포+비밀값(임시파일 즉시 삭제) → /v1/health
node scripts/golive.mjs            # lounge.html 에 서버 주소 기입(--off 로 해제). push 는 사람이 확인 후
```
- 비밀값 파일은 `C:/Users/ZRUN/Documents/secrets/` 에만: `lounge_pin_pepper.txt`(**절대 재생성 금지** — 바뀌면 모든 글의 비밀번호가 안 맞음), `lounge_admin_token.txt`(첫 배포 때 자동 생성), `cloudflare_turnstile.txt`.
- 배포 후 Cloudflare Billing 에 결제수단이 여전히 없는지 확인.

## 운영 (토큰은 파일에서 읽고 화면에 출력하지 않음 · `--local` = 로컬 서버)
- `node scripts/admin.mjs reports` · `hide|show|delete post:p…` · `lock|unlock` · `health`
- `node scripts/backup.mjs` → 비밀 폴더 `lounge_backups/` (저장소·클라우드에 올리지 않음)
- PC 가 의심되면: `npx wrangler logout` + 대시보드 My Profile → API Tokens 에서 권한 취소
