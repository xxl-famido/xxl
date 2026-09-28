-- XXL 라운지 D1 스키마 v1.
-- 원칙: 싫어요 수·비밀번호 해시·IP 해시는 저장만 하고 응답으로 내보내지 않는다(src/index.js pub*).
--       비밀번호 해시 = HMAC-SHA256(PIN_PEPPER, salt:pin). 4자리는 오프라인 대입에 약하므로 비밀값(pepper) 없이는 풀 수 없게 한다.

CREATE TABLE posts (
  id          TEXT PRIMARY KEY,               -- 'p' + 12자
  thread      TEXT NOT NULL,                  -- 'char:10441' | 'tier:t…' | 'team:m…'
  kind        TEXT NOT NULL,                  -- 'char' | 'tier' | 'team' (최근 의견 조회용)
  parent      TEXT,                           -- 답글이면 최상위 의견 id (2단계까지만)
  reply_to    INTEGER,                        -- 답글의 답글 대상 익명 동료 id(@표시)
  anon        INTEGER NOT NULL,
  anon_no     INTEGER NOT NULL,
  body        TEXT NOT NULL,
  tags        TEXT NOT NULL DEFAULT '[]',
  build       TEXT NOT NULL,
  likes       INTEGER NOT NULL DEFAULT 0,
  dislikes    INTEGER NOT NULL DEFAULT 0,
  reports     INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'ok',     -- 'ok' | 'hidden'(관리자)
  deleted     INTEGER NOT NULL DEFAULT 0,     -- 답글이 있어 자리만 남긴 삭제
  pin_salt    TEXT NOT NULL,
  pin_hash    TEXT NOT NULL,
  pin_fail    INTEGER NOT NULL DEFAULT 0,
  pin_lock    INTEGER NOT NULL DEFAULT 0,     -- 잠금 해제 시각(ms)
  ip_hash     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  edited_at   INTEGER
);
CREATE INDEX posts_thread ON posts(thread, created_at);
CREATE INDEX posts_parent ON posts(parent);
CREATE INDEX posts_recent ON posts(kind, created_at);

CREATE TABLE tiers (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, basis TEXT NOT NULL, rows TEXT NOT NULL, descr TEXT NOT NULL DEFAULT '',
  anon INTEGER NOT NULL, anon_no INTEGER NOT NULL, build TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0, dislikes INTEGER NOT NULL DEFAULT 0, reports INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'ok',
  pin_salt TEXT NOT NULL, pin_hash TEXT NOT NULL, pin_fail INTEGER NOT NULL DEFAULT 0, pin_lock INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX tiers_basis ON tiers(basis, created_at);
CREATE TABLE tier_pos (tier_id TEXT NOT NULL, char_id INTEGER NOT NULL, pos REAL NOT NULL, PRIMARY KEY (tier_id, char_id));

CREATE TABLE teams (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, ids TEXT NOT NULL, summary TEXT NOT NULL,
  title TEXT NOT NULL, basis TEXT NOT NULL, descr TEXT NOT NULL DEFAULT '',
  anon INTEGER NOT NULL, anon_no INTEGER NOT NULL, build TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0, dislikes INTEGER NOT NULL DEFAULT 0, reports INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'ok',
  pin_salt TEXT NOT NULL, pin_hash TEXT NOT NULL, pin_fail INTEGER NOT NULL DEFAULT 0, pin_lock INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX teams_basis ON teams(basis, created_at);
CREATE TABLE team_char (team_id TEXT NOT NULL, char_id INTEGER NOT NULL, PRIMARY KEY (team_id, char_id));
CREATE INDEX team_char_char ON team_char(char_id);

-- 스레드마다 쓰인 익명 이름(새 이름 뽑을 때 중복 피하기)
CREATE TABLE idents (thread TEXT NOT NULL, anon INTEGER NOT NULL, anon_no INTEGER NOT NULL, PRIMARY KEY (thread, anon, anon_no));
-- 스레드별 글 수·마지막 시각(목록 화면이 글 전체를 세지 않게 — D1 읽기 한도 절약)
CREATE TABLE thread_stats (thread TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, last INTEGER NOT NULL DEFAULT 0);

CREATE TABLE votes (target TEXT NOT NULL, voter TEXT NOT NULL, value INTEGER NOT NULL, PRIMARY KEY (target, voter));
CREATE TABLE reports (target TEXT NOT NULL, voter TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, PRIMARY KEY (target, voter));
CREATE INDEX reports_recent ON reports(created_at);

-- 고정 창 요청 제한(키 = 종류:IP해시:창번호)
CREATE TABLE rate (k TEXT PRIMARY KEY, n INTEGER NOT NULL, exp INTEGER NOT NULL);
CREATE TABLE settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
