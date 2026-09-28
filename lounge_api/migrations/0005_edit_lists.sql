-- 티어표·팀 수정 시각(수정됨 표시). 팀은 공유 코드(구성)는 못 바꾸고 제목·기준·설명만.
ALTER TABLE tiers ADD COLUMN edited_at INTEGER;
ALTER TABLE teams ADD COLUMN edited_at INTEGER;
