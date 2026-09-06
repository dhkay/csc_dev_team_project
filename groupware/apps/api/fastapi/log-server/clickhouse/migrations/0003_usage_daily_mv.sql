-- 사용량 집계 MV — 조직/도구별 호출 수, LLM 토큰 합, p95 지연.
--
-- 이게 있어야 "버려지던 토큰 사용량"이 실제로 쓸 수 있는 값이 된다. 원본을 매번 훑지 않고
-- 사전 집계된 작은 테이블을 읽으므로 과금/쿼터 화면이 상수 시간에 가깝게 뜬다.
--
-- p95 는 quantileState 로 **중간 상태**를 저장한다. 평균과 달리 분위수는 부분 집계를 그냥
-- 더할 수 없어서, 조회 시 quantileMerge(0.95) 로 합쳐야 정확하다.
--
-- MV 는 INSERT 트리거라 **생성 이후의 데이터만** 채운다. 기존 데이터가 필요하면
-- usage_daily 에 INSERT SELECT 로 백필할 것.

CREATE TABLE IF NOT EXISTS usage_daily
(
    day             Date,
    organization_id UInt32,
    ai_tool         LowCardinality(String),
    action          LowCardinality(String),
    calls           UInt64,
    tok_in          UInt64,
    tok_out         UInt64,
    p95_state       AggregateFunction(quantile(0.95), UInt32)
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (organization_id, ai_tool, action, day);

CREATE MATERIALIZED VIEW IF NOT EXISTS usage_daily_mv TO usage_daily AS
SELECT
    toDate(occurred_at)              AS day,
    organization_id,
    ai_tool,
    action,
    count()                          AS calls,
    sum(token_input)                 AS tok_in,
    sum(token_output)                AS tok_out,
    quantileState(0.95)(duration_ms) AS p95_state
FROM domain_events
GROUP BY day, organization_id, ai_tool, action;
