-- 고정 글: 관리자가 고정한 최상위 의견은 정렬과 무관하게 스레드 맨 위. 수정·삭제는 운영자(관리자 토큰)만.
ALTER TABLE posts ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
