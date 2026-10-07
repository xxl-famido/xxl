-- 2026-10-07 티어표 끌올: 지금 빌드보다 늦게 들어온 동료를 수정으로 넣으면 빌드를 그 동료의 빌드로 올리고 목록 위로 끌어올린다.
--            bumped_at = 끌올 시각(목록 정렬·'N일 전 (수정됨)' 표시 기준). 규칙 원본은 shared.js tierBuildFor, 빌드 기록은 builds.js.
ALTER TABLE tiers ADD COLUMN bumped_at INTEGER;
-- 이 기능 전에는 라운지 빌드가 0922 에 머물러, 뒤에 들어온 동료(builds.js since: 10301·10306 = 0924, 10444 = 1006)가 든 티어표도 0922 로 남아 있다.
-- 같은 규칙으로 빌드를 올린다(늦은 빌드부터). 수정된 적이 있으면 그 동료를 넣은 수정으로 보고 그 시각에 끌올, 처음부터 들어 있었으면 끌올 없이 빌드만.
UPDATE tiers SET build = '1006', bumped_at = edited_at
WHERE build <> '1006'
  AND EXISTS (SELECT 1 FROM json_each(tiers.rows) r, json_each(r.value, '$.ids') c WHERE c.value = 10444);
UPDATE tiers SET build = '0924', bumped_at = edited_at
WHERE build NOT IN ('0924', '1006')
  AND EXISTS (SELECT 1 FROM json_each(tiers.rows) r, json_each(r.value, '$.ids') c WHERE c.value IN (10301, 10306));
CREATE INDEX tiers_build ON tiers(build);
