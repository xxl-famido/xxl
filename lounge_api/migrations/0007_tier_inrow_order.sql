-- 2026-09-29 같은 행 안의 순서(왼쪽 = 더 높음)를 평균 티어에 반영(shared.js inRowPos).
-- pos = (행 번호 + 0.5) / 행 수 + ((행 안 순서 + 0.5) / 그 행 동료 수 - 0.5) * 0.01  — 칸(S~D)은 바뀌지 않고 같은 칸 안의 순서만 정해진다.
UPDATE tier_pos SET pos = (
  SELECT (r.key + 0.5) / json_array_length(t.rows)
       + ((c.key + 0.5) / json_array_length(r.value, '$.ids') - 0.5) * 0.01
  FROM tiers t, json_each(t.rows) r, json_each(r.value, '$.ids') c
  WHERE t.id = tier_pos.tier_id AND c.value = tier_pos.char_id
)
WHERE EXISTS (
  SELECT 1 FROM tiers t, json_each(t.rows) r, json_each(r.value, '$.ids') c
  WHERE t.id = tier_pos.tier_id AND c.value = tier_pos.char_id
);
