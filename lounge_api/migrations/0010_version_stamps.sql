-- 2026-10-08 라운지 버전 도장: 게임 빌드(MMDD) → 시뮬레이터 버전(앞 두 자리 X.N). 사용자 결정 — 티어표 '이번 버전'은
-- 신캐가 들어와 N 이 바뀐 버전에서만 갱신되고, 패치(v2.0.3 XL 동료·v2.1.1 수정)는 새 버전이 아니다. 화면 표기는 vX.N.
--   0922 = 라운지 시작(시뮬 v2.0, 2026-09-28) → 2.0
--   0924 = 시바히코·코드B(시뮬 v2.0.3, XL·패치)  → 2.0
--   1006 = 은빛투신 하쿠이(시뮬 v2.1)             → 2.1
UPDATE posts SET build = CASE build WHEN '1006' THEN '2.1' ELSE '2.0' END WHERE build IN ('0922', '0924', '1006');
UPDATE teams SET build = CASE build WHEN '1006' THEN '2.1' ELSE '2.0' END WHERE build IN ('0922', '0924', '1006');
UPDATE tiers SET build = CASE build WHEN '1006' THEN '2.1' ELSE '2.0' END WHERE build IN ('0922', '0924', '1006');
-- 0922 → 0924 끌올은 이제 같은 버전(2.0) 안이라 끌올이 아니다 → 끌올 시각을 지워 목록 순서·'(수정됨)' 표시를 되돌린다.
-- (2.1 티어표의 끌올은 하쿠이를 넣어 2.0 → 2.1 로 올라간 것이라 그대로 둔다.)
UPDATE tiers SET bumped_at = NULL WHERE build = '2.0' AND bumped_at IS NOT NULL;
