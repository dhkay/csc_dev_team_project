-- 로그 저장소 초기 스키마 — kind 당 테이블 1개.
--
-- 종류를 테이블로 나누는 이유: 보존기간(TTL)과 승격 컬럼이 kind 마다 다르다.
-- 공통 컬럼은 네 테이블에서 동일하게 유지해 kind 미지정 조회가 UNION 으로 가능하다.
--
-- ENGINE = ReplacingMergeTree(ingested_at)
--   Kafka at-least-once 라 같은 event_id 가 재적재될 수 있다. ORDER BY 말미의 event_id 를
--   중복제거 키로, ingested_at 을 버전으로 삼아 머지 시점에 최신 1건만 남긴다.
--   조회는 FINAL 을 붙여 머지 전에도 중복을 보지 않는다.
--
-- ORDER BY (organization_id, ai_tool, ...)
--   주 질의가 "이 조직의, 이 도구의, 이 기간" 이라 조직을 선두에 둔다.
--   플랫폼 전역(시간축) 조회는 이 정렬로는 풀스캔이 되므로 아래 프로젝션으로 보완한다.
--
-- LowCardinality(String) 컬럼은 NULL 을 쓰지 않는다 — 빈 문자열이 '없음' 센티넬이다.
-- organization_id = 0 은 '플랫폼 전역'. 계약이 organization_id > 0 을 보장해 충돌하지 않는다.

CREATE TABLE IF NOT EXISTS domain_events
(
    event_id        UUID,
    occurred_at     DateTime64(3, 'UTC'),
    ingested_at     DateTime64(3, 'UTC'),
    environment     LowCardinality(String),
    service         LowCardinality(String),
    scope           LowCardinality(String),
    ai_tool         LowCardinality(String),
    organization_id UInt32,
    level           LowCardinality(String),
    action          LowCardinality(String),
    message         String,
    trace_id        String,
    request_id      String,
    job_id          String,
    actor_type      LowCardinality(String),
    actor_id        UInt32,
    duration_ms     UInt32,
    token_input     UInt32,
    token_output    UInt32,
    payload         String CODEC(ZSTD(3)),
    INDEX idx_trace   trace_id   TYPE bloom_filter GRANULARITY 4,
    INDEX idx_request request_id TYPE bloom_filter GRANULARITY 4,
    INDEX idx_job     job_id     TYPE bloom_filter GRANULARITY 4
)
ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (organization_id, ai_tool, action, occurred_at, event_id)
TTL toDateTime(occurred_at) + INTERVAL 90 DAY;

CREATE TABLE IF NOT EXISTS error_logs
(
    event_id        UUID,
    occurred_at     DateTime64(3, 'UTC'),
    ingested_at     DateTime64(3, 'UTC'),
    environment     LowCardinality(String),
    service         LowCardinality(String),
    scope           LowCardinality(String),
    ai_tool         LowCardinality(String),
    organization_id UInt32,
    level           LowCardinality(String),
    action          LowCardinality(String),
    message         String,
    trace_id        String,
    request_id      String,
    job_id          String,
    actor_type      LowCardinality(String),
    actor_id        UInt32,
    duration_ms     UInt32,
    token_input     UInt32,
    token_output    UInt32,
    payload         String CODEC(ZSTD(3)),
    -- 승격 컬럼 — payload JSON 안에 두면 집계도 인덱싱도 안 된다.
    error_type      LowCardinality(String),
    stack           String CODEC(ZSTD(3)),
    INDEX idx_trace   trace_id   TYPE bloom_filter GRANULARITY 4,
    INDEX idx_request request_id TYPE bloom_filter GRANULARITY 4,
    INDEX idx_job     job_id     TYPE bloom_filter GRANULARITY 4
)
ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (organization_id, ai_tool, action, occurred_at, event_id)
TTL toDateTime(occurred_at) + INTERVAL 180 DAY;

-- 감사 로그: TTL 없음(무기한 보존). 규정 대응/추적용이라 자동 삭제가 있으면 안 된다.
CREATE TABLE IF NOT EXISTS audit_logs
(
    event_id        UUID,
    occurred_at     DateTime64(3, 'UTC'),
    ingested_at     DateTime64(3, 'UTC'),
    environment     LowCardinality(String),
    service         LowCardinality(String),
    scope           LowCardinality(String),
    ai_tool         LowCardinality(String),
    organization_id UInt32,
    level           LowCardinality(String),
    action          LowCardinality(String),
    message         String,
    trace_id        String,
    request_id      String,
    job_id          String,
    actor_type      LowCardinality(String),
    actor_id        UInt32,
    duration_ms     UInt32,
    token_input     UInt32,
    token_output    UInt32,
    payload         String CODEC(ZSTD(3)),
    -- 변경 전/후 스냅샷(JSON 문자열) — "누가 무엇을 어떻게 바꿨나"의 실체.
    before          String CODEC(ZSTD(3)),
    after           String CODEC(ZSTD(3)),
    INDEX idx_trace   trace_id   TYPE bloom_filter GRANULARITY 4,
    INDEX idx_request request_id TYPE bloom_filter GRANULARITY 4,
    INDEX idx_actor   actor_id   TYPE bloom_filter GRANULARITY 4
)
ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (organization_id, action, occurred_at, event_id);

CREATE TABLE IF NOT EXISTS access_logs
(
    event_id        UUID,
    occurred_at     DateTime64(3, 'UTC'),
    ingested_at     DateTime64(3, 'UTC'),
    environment     LowCardinality(String),
    service         LowCardinality(String),
    scope           LowCardinality(String),
    ai_tool         LowCardinality(String),
    organization_id UInt32,
    level           LowCardinality(String),
    action          LowCardinality(String),
    message         String,
    trace_id        String,
    request_id      String,
    job_id          String,
    actor_type      LowCardinality(String),
    actor_id        UInt32,
    duration_ms     UInt32,
    token_input     UInt32,
    token_output    UInt32,
    payload         String CODEC(ZSTD(3)),
    method          LowCardinality(String),
    path            String,
    status_code     UInt16,
    INDEX idx_trace   trace_id   TYPE bloom_filter GRANULARITY 4,
    INDEX idx_request request_id TYPE bloom_filter GRANULARITY 4
)
ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (organization_id, service, occurred_at, event_id)
TTL toDateTime(occurred_at) + INTERVAL 30 DAY;
