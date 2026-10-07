-- 2026-10-08 글 빌드 도장 보정(한 번만). 0922 이후 새 동료가 라운지에 들어온 뒤에도 서버 빌드가 0922 에 머물러,
-- 새 버전에 쓴 글·팀·티어표가 0922 로 찍혀 '이전 버전'으로 보였다(빌드는 2026-10-07 22:57 배포부터 1006).
-- 쓴 시각이 그 동료가 라운지에 들어온 서버 배포(Cloudflare 배포 기록) 뒤면 그 빌드로 고친다. 앞으로는 같은 배포에서 빌드가 같이 올라가 틈이 없다.
--   0924 = 2026-10-04 17:29:03 KST(시바히코, Worker 60d1448f) = 1791102543707
--   1006 = 2026-10-07 21:02:21 KST(하쿠이, Worker 26d4e53e)   = 1791374541139
UPDATE posts SET build = '1006' WHERE created_at >= 1791374541139 AND build IN ('0922', '0924');
UPDATE teams SET build = '1006' WHERE created_at >= 1791374541139 AND build IN ('0922', '0924');
UPDATE tiers SET build = '1006' WHERE created_at >= 1791374541139 AND build IN ('0922', '0924');
UPDATE posts SET build = '0924' WHERE created_at >= 1791102543707 AND created_at < 1791374541139 AND build = '0922';
UPDATE teams SET build = '0924' WHERE created_at >= 1791102543707 AND created_at < 1791374541139 AND build = '0922';
UPDATE tiers SET build = '0924' WHERE created_at >= 1791102543707 AND created_at < 1791374541139 AND build = '0922';
