# v2 라이브 전환 준비 체크리스트 (push 전 전부 ✓)

push·커밋은 사용자 확인 후 한 번에. 그 전까지 전부 로컬에서 끝낸다.

## A. 기능 마무리
- [x] 라운지 연결(인계서 §2-1~2-4) + 상단바(라운지·팀 비교 강조, 가이드→메뉴) + 로고 교체 + 적 공격 대상 기본값 전체
  - 근거(09-28): 딥링크 #code/#add 계약 테스트·uitest_v2 통과, 라운지 링크는 주소 없으면 숨김(정적 빌드 확인), 새 로고 스크린샷 확인, TDMG_DEFAULTS.hits=5(전체). 라운지 쪽은 다른 세션이 계속 작업 중
- [x] 구버전 병행: 빌드에 v1을 `v1/`로 함께 조립, ≡ 메뉴 피드백 아래 「구버전」, v1에 「새 버전」 링크(v1 파일은 링크 한 줄만 추가)
  - 근거: build_site_v2.sh가 deploy.yml과 같은 절차로 `_site/v1/` 조립(+__BUILD_VERSION__·새 버전 번역 주입), menu.js `V1_BUILT`(빌드가 true로), dashboard/index.html 링크 1줄. v1은 Pyodide 모드에서 전부 상대 경로라 하위 경로 그대로 동작(live_smoke_v2 로컬 ALL PASS)
- [x] 가이드 한 번에 정리: v2 최종 화면 기준 본문(맞추기→필살기 연동, 고급 설정 구조, 성공 가정·동료별 프리셋·임부언 면역), 그림 재촬영, 용어집 위반 4건 수정
  - 근거: guide-content.js·guide.*.json 211키×4언어 재작성, 그림 32장 재촬영, copy_lint(라운지 제외) 0
- [x] 번역: 미번역 키(현재 en 58·ja 60·zh 60) 0
  - 근거: `i18n_migrate.py` → keys=1602 untranslated=en:0,zh:0,ja:0
- [x] 패치노트 v2.0(`PATCH_DRAFT.md` → patch-notes 원문, 캐릭터 중립·"무엇이 있는지"만)
  - 근거: 사용자 원문(patch_notes_src 2.0, 15항목) 그대로 사용, build --check ok. 사실 대조 결과는 RELEASE_READY.md「사용자 확인 필요」

## B. 검증
- [x] pytest 전부 + 스냅샷 회귀(임부언 면역 외 변화 0)
  - 근거: pytest 182 통과, snapshot 63조합 회귀 0(수치 변화 0; 임부언 4조합은 면역 로그 줄 수만, 로그 문구 경고 4는 효과 이름 표기 수정)
- [x] 계약 테스트(`dashboard_v2 node --test`), `tools/uitest_v2.js`, 피드백 하네스(행동 흐름) 판정 유지
  - 근거: node --test 247/247, uitest_v2 124/0, 피드백 하네스 ✓47 △3 ✗1 —1 (19:46 실행과 판정 동일)
- [x] 라운지 로컬 검사(인계서 §5, 라이브 주소 금지)
  - 근거: lounge_api npm test ALL PASS(127.0.0.1:8787), uitest_lounge(?api=로컬) ALL PASS. copy_lint가 src/lounge/*에서 20여 건(다른 세션 파일, 보고만)
- [x] 정적 빌드(`build_site_v2.sh`) → 로컬 정적 서버에서 Pyodide 경로 부팅·실행·딥링크·구버전 링크·라운지 게이트
  - 근거: `_site_v2` → 127.0.0.1:8790에서 live_smoke_v2 ALL PASS(v2 부팅·실행·메뉴 구버전·딥링크·v1 부팅·실행·라운지 제외 게이트)
- [x] 모바일 390·데스크톱 1440 × 라이트·다크 전 화면 스크린샷 검수, 콘솔 에러 0, copy_lint 0
  - 근거: shoot_release.js 48장(11화면+v1 × 1440/390 × 라이트/다크) 검수, 콘솔 오류 0
- [x] v1 기록·공유 코드 → v2 열기, v2 → v1(구버전) 열기 왕복
  - 근거: live_smoke_v2 — v2 코드→v1 해독, v1 기록→v2 목록, v1 코드→v2 가져오기 모두 PASS

## C. 배포 준비(실행은 사용자 확인 후)
- [x] `deploy_v2.yml`(v2 기본 + v1 `v1/` + 라운지 게이트) 준비, 현재 deploy.yml과 diff 정리
  - 근거: RELEASE_READY.md §3 (diff 요약)
- [x] 라운지 golive(서버 주소 기입) 명령·되돌리기 명령 정리
  - 근거: RELEASE_READY.md §4
- [x] 커밋 대상 파일 목록(untracked `dashboard_v2/` 포함, `_backup/`·`_site_v2/`·secrets 제외) 정리
  - 근거: RELEASE_READY.md §5
- [x] 라이브 점검 스크립트(v2 + 구버전 + 라운지 읽기 전용)
  - 근거: tools/redesign/live_smoke_v2.js (미실행, 로컬 빌드로만 검증)
