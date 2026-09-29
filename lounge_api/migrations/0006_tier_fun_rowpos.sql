-- 2026-09-29 (1) 평균 티어 집계 제외 티어표: 커뮤니티 평균 티어 집계에서 빠진다(tiers.fun = 1).
--            (2) 행 위치 = 행 구간의 가운데 (i + 0.5) / n (shared.js rowPos). 예전 값 i / (n - 1) 을 다시 계산한다.
--                행이 몇 개든 5칸(S~D)에 고르게 나뉜다(2행 = A·C, 3행 = S·B·D, 5행 = S~D 그대로).
ALTER TABLE tiers ADD COLUMN fun INTEGER NOT NULL DEFAULT 0;
UPDATE tier_pos SET pos = (
  ROUND(pos * ((SELECT json_array_length(t.rows) FROM tiers t WHERE t.id = tier_pos.tier_id) - 1)) + 0.5
) / (SELECT json_array_length(t.rows) FROM tiers t WHERE t.id = tier_pos.tier_id)
WHERE (SELECT json_array_length(t.rows) FROM tiers t WHERE t.id = tier_pos.tier_id) >= 2;
