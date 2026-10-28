-- 2026-10-29 지난 버전 티어표 고정(사용자 결정): 신캐가 들어와 라운지 버전이 바뀐 뒤 지난 버전 티어표를 고치면
--            고치기 직전 상태를 그 버전에 고정해 두고, 고친 티어표는 이번 버전 티어표가 된다(shared.js tierEditPlan).
--            지우는 경우도 지우기 직전 상태를 고정한다. 지난 버전 평균 티어 = 그 버전 티어표(tiers) + 고정본(tier_frozen).
--            '전체 버전'과 목록·보기는 지금 상태(tiers)만 쓴다 — 고정본은 집계에만 쓰고 응답으로 내보내지 않는다.
CREATE TABLE tier_frozen (
  tier_id TEXT NOT NULL, build TEXT NOT NULL,
  title TEXT NOT NULL, basis TEXT NOT NULL, rows TEXT NOT NULL, descr TEXT NOT NULL DEFAULT '', fun INTEGER NOT NULL DEFAULT 0,
  anon INTEGER NOT NULL, anon_no INTEGER NOT NULL, op INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, edited_at INTEGER, frozen_at INTEGER NOT NULL,
  PRIMARY KEY (tier_id, build)
);
CREATE INDEX tier_frozen_build ON tier_frozen(build);
CREATE TABLE tier_frozen_pos (tier_id TEXT NOT NULL, build TEXT NOT NULL, char_id INTEGER NOT NULL, pos REAL NOT NULL, PRIMARY KEY (tier_id, build, char_id));
CREATE INDEX tier_frozen_pos_char ON tier_frozen_pos(char_id);
