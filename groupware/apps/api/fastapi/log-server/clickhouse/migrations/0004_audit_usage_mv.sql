-- 감사 로그 사용량 집계 MV — audit_logs 를 기존 usage_daily 타깃에 합류시킨다.
--
-- 왜 필요한가: 0003 의 usage_daily_mv 는 `FROM domain_events` 하나뿐이다. 활동 원장을 AUDIT 으로
-- 적재하면(비용 이력은 영구 보존이어야 해서 TTL 없는 audit_logs 를 쓴다) POST /logs/usage 가
-- 영구히 0행을 돌려준다. 집계가 조용히 비는 것이라 장애로 보이지도 않는다.
--
-- 한 SummingMergeTree 타깃에 MV 두 개를 붙이는 것은 정상 구성이다. 두 MV 가 각자 INSERT 를
-- 트리거해 같은 (organization_id, ai_tool, action, day) 키로 부분 집계를 쌓고, SummingMergeTree
-- 가 병합에서 더한다. domain_events 와 audit_logs 는 action 접두사가 갈리므로 실제로 같은 키가
-- 겹치지도 않는다.
--
-- MV 는 INSERT 트리거라 **생성 이후의 데이터만** 채운다. 이미 쌓인 audit_logs 를 넣으려면
-- usage_daily 에 INSERT SELECT 로 수동 백필할 것(0003 과 동일한 제약).

CREATE MATERIALIZED VIEW IF NOT EXISTS usage_daily_audit_mv TO usage_daily AS
SELECT
    toDate(occurred_at)              AS day,
    organization_id,
    ai_tool,
    action,
    count()                          AS calls,
    sum(token_input)                 AS tok_in,
    sum(token_output)                AS tok_out,
    quantileState(0.95)(duration_ms) AS p95_state
FROM audit_logs
GROUP BY day, organization_id, ai_tool, action;
