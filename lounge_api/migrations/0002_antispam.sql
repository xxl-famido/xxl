-- 도배 방지 v2: 중복 글 판정용 정규화 본문 키 + 조회 인덱스.
-- body_key = HMAC(PIN_PEPPER, 공백·문장부호·대소문자를 뺀 본문) 앞 16자 — 원문 대신 키로 비교(인덱스 크기 작게).
ALTER TABLE posts ADD COLUMN body_key TEXT;
CREATE INDEX posts_bodykey ON posts(body_key, created_at);
CREATE INDEX posts_ip ON posts(ip_hash, created_at);
