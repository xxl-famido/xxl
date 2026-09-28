# v2 공개 직전 요약 (2026-09-28, 로컬 검증 완료 · 커밋/push 전)

## 1. 바뀌는 것
- 사이트 루트 = v2(`dashboard_v2/`), 구버전 v1(`dashboard/`)은 `v1/`에 함께 배포. v2 ≡ 메뉴 피드백 아래 「구버전」, v1 상단 「새 버전」(→ `../`).
- 같은 origin이라 기록·초안(localStorage `woofia_history`·`woofia_draft` 등) 공유.
- 라운지: `lounge.html` meta가 비어 있으면 빌드에서 자동 제외(현재 상태). golive 후 빌드하면 공개.
- 엔진: 임부언 CD 변동 면역, 효과 이름 3종 표기(`names.py`). 스냅샷 수치 변화 0.
- 가이드 v2 최종본(4개 언어, 그림 32장), 미번역 0, 패치노트 v2.0(원칙대로 정리 — §6).

## 2. 검증 결과 (전부 로컬)
| 항목 | 결과 |
|---|---|
| pytest | 182 통과 |
| snapshot.py | 63조합, 회귀 0 · 경고 4(로그 문구만) |
| dashboard_v2 node --test | 247/247 |
| tools/uitest_v2.js (8778) | 124 통과 · 0 실패 |
| feedback_cases/run.mjs | ✓47 △3 ✗1 —1, 이전 실행과 판정 동일 |
| lounge_api npm test / uitest_lounge / uitest_lounge_i18n(?api=로컬·목업) | ALL PASS / ALL PASS / ALL PASS |
| 정적 빌드 → 8790 live_smoke_v2 | ALL PASS (v2·v1 부팅/실행, 딥링크, 구버전 메뉴, 라운지 제외, v1↔v2 기록·코드 왕복) |
| shoot_release.js 48장 (1440·390 × 라이트·다크) | 콘솔 오류 0, `tools/redesign/shots/release/` |
| copy_lint | 0건 (메인 + `src/lounge/*`) |

## 3. deploy_v2.yml vs 현재 deploy.yml
- 트리거·권한·concurrency·actions 버전은 같다.
- 조립 단계만 다름: 현재는 inline `cp dashboard/*` 등 → v2는 `bash tools/redesign/build_site_v2.sh _site` 한 줄.
  스크립트 내용: v2 복사(목업·tests·legacy·parts·logs 제외) + 엔진·데이터 + version.json → `_site/v1/`에 현재 deploy.yml과 같은 v1 조립(+`__BUILD_VERSION__` 치환, 「새 버전」 번역 주입) → menu.js `V1_BUILT=true` → 라운지 게이트.
- 주의: 빌드는 커밋된 `dashboard_v2/i18n/{kr,en,ja,zh}.json`을 쓴다 → 커밋 전 `python tools/redesign/i18n_migrate.py` 한 번 실행.

## 4. 실행 순서 (사용자 확인 후)
```bash
cd C:/Users/ZRUN/Documents/python/etc/woofia_sim
python tools/redesign/i18n_migrate.py                   # 병합(미번역 0 확인)
python tools/redesign/build_patch_notes.py --check
node lounge_api/scripts/golive.mjs                       # 라운지 공개 시에만(서버 health 확인 후 meta 기입)
bash tools/redesign/build_site_v2.sh                     # "v1: 구버전 조립", "lounge: 공개"(또는 제외) 확인
cp .github/workflows-staged/deploy_v2.yml .github/workflows/deploy.yml
git add <§5 목록> && git commit && git push origin main
NODE_PATH=/c/Users/ZRUN/node_modules node tools/redesign/live_smoke_v2.js   # 라이브 읽기 전용(라운지 공개면 live_smoke_lounge 이어서 실행)
```
## 되돌리기
- 라운지만: `node lounge_api/scripts/golive.mjs --off` → 커밋 → push.
- 사이트 전체를 v1로: `git revert <v2 커밋>` → push (또는 `git show HEAD~1:.github/workflows/deploy.yml > .github/workflows/deploy.yml` 후 push — v1 조립으로 복귀, v2 파일은 저장소에 남음).

## 5. 커밋 대상 (git status 기준)
포함: `.github/workflows/deploy.yml`(교체본), `.github/workflows-staged/`, `dashboard_v2/`(logs/ 빈 폴더 제외), `dashboard/index.html`(링크 1줄) · `dashboard/i18n.js`(다른 세션의 효과 이름 번역 4줄), `woofia_sim/{effects,engine,names}.py`, `tests/test_cd_immunity.py`, `tools/snapshots/*`(11개), `tools/uitest_v2.js`, `tools/feedback_cases/`, `server_v2.py`, `lounge_api/`(자체 .gitignore로 node_modules·.dev.vars 제외), `docs/community/`, `docs/redesign/*.md`·그림, `tools/redesign/*.js|*.py|*.sh`, `tools/redesign/patch_notes_src/`, `tools/redesign/fixtures/`, `.gitignore`.
제외 제안: `_backup/`, `_site*`, `logs/`(pn_backup·pn_agent_draft 포함), `tools/redesign/shots/`(125MB, 검수용), `tools/redesign/tmp_inventory/`, `tools/redesign/__pycache__/`, **`docs/redesign/user_impl/`(APK·dex·서명 파일 — 공개 저장소 금지)**, `docs/redesign/bench/`, 실행 `.bat` 2개(로컬 전용), `lounge_api/deploy_state.json`(DB id, 비밀은 아니나 로컬 상태 — 판단 필요). → `.gitignore`에 추가 권장.
비밀값: 미추적 텍스트에서 토큰·PEPPER·JWT 패턴 0건.

## 6. 사용자 확인 필요 → 처리 결과 (2026-09-28, 사용자가 판단 위임)
- **패치노트 v2.0 — 처리함.** 사용자 원문 사본 `logs/pn_user_original_v20/`(kr·en·ja·zh·meta). `build_patch_notes.py` 빌드 + `--check` 통과.
  1. 캐릭터 중립: 동료 이름(란·모이루·히토하·임부언·욱영) 제거 → 역할로 서술("방어로 필살기 CD를 줄이는 동료", "포지션 1 동료에게 필살기 CD 변동 면역을 거는 필살기", "인접 동료의 필살기를 뒤로 미루는 동료 설정"). `meta.json` 2.0 항목의 인라인 얼굴(`chars`)도 제거. 히어로(파미도)는 유지.
  2. "무엇이 있는지만": 옮겼다·없어졌다·이전의·이제·수정되었다 서술 제거(예: 버튼 폐지 → "첫 필살기를 특정 턴에 두려면 격자에서 고정", 표기 통일 → 현재 표기 나열, v1 호환 → "현재 규칙으로 계산됩니다").
  3. 테마: "기본으로 기기의 시스템 설정을 따르고, ≡ 메뉴에서 라이트 · 다크 · 시스템 설정".
  4. 성공 가정: "‘준비되면 바로’를 뺀 방식(자동 · 정해진 턴만)에서" + 흐리게 표시되는 경우(준비되면 바로 · 전투당 1회 · 제단 꺼짐).
  5. 상단바 = 기록 · 팀 비교 · 라운지, ≡ 메뉴 = 가이드 · 패치 히스토리 · 피드백 · 언어 · 테마. 구버전 = "≡ 메뉴의 ‘구버전’에서 v1 화면"(en은 실제 메뉴명 ‘Classic version’). 라운지 항목의 버튼명은 실제 라벨(en ‘Simulate this team’·‘See comments’, ja ‘シミュレーションする’·‘コメントを見る’·暗証番号, zh 梯度表·夥伴討論區·「分享到隊伍分享」·「查看留言」)로 맞춤. 4개 언어 같은 항목·같은 줄 수.
- **`src/lounge/*` copy_lint — 처리함, 전체 0건.** 목업 오류는 서버와 같은 `err.*` 코드로 바꿔 4개 언어로 나오게 했고, 라운지 한국어 시스템 문구 45개를 평서·명사형으로, 언어 메뉴 ✓ → SVG `check`, seed 예시 글 용어·어미 정리. 상세·스크린샷 표: `docs/community/LOUNGE_I18N_CHECK.md`.
- **라운지 서버 재배포 필요 여부: 필수 아님(선택).** 서버(`lounge_api/src`)는 오류 문구를 따로 갖지 않고 `dashboard_v2/i18n/lounge/kr.json`을 번들에 넣어 `error` 대체 문구로만 쓴다. 화면은 응답의 `code`로 현재 언어 문구를 고르므로 재배포 없이도 새 문구가 보인다. 재배포하면 코드 없는 클라이언트(구 화면·CLI)에 보이는 한국어 대체 문구만 새 톤이 된다. `deploy.mjs --check` 통과(배포는 하지 않음).
- 메인 사전의 라운지 안내 문구(en/ja/zh)를 라운지 사전 표기로 맞춤(zh 梯度表·留言, ja チーム共有·コメント, en comments) → `i18n_migrate.py` 재병합, 미번역 0.
- 남은 확인: 영어 프리셋 이름 "Passive Def"(plan 번역) 어색 — 바꾸면 guide.en·패치노트 en 문장도 함께. 메인 `plan.ult.mode.hint` en/zh 에 "Ultimate"·"角色" 등 옛 표기가 남아 있음(라운지 범위 밖, 미수정).
