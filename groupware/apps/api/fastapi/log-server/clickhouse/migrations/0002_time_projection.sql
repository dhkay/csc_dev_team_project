-- 시간축 우선 프로젝션 — 플랫폼 전역 조회의 풀스캔 회피.
--
-- 기본 ORDER BY 가 (organization_id, ...) 라 "조직 무관, 최근 1시간" 같은 플랫폼 관리자
-- 질의는 모든 조직 구간을 훑어야 한다. 프로젝션은 같은 데이터를 시간 정렬로 한 벌 더 들고 있어
-- 옵티마이저가 질의에 맞는 쪽을 고르게 한다(디스크를 쓰고 지연을 산다).
--
-- deduplicate_merge_projection_mode = 'rebuild' 이 반드시 필요하다.
--   ClickHouse 24.8+ 는 ReplacingMergeTree 에 프로젝션을 붙이는 걸 기본적으로 거부한다
--   (Code 344, SUPPORT_IS_DISABLED). 중복제거 머지가 일어나면 프로젝션이 원본과 어긋날 수 있기 때문.
--   'rebuild' 는 그 머지마다 프로젝션을 다시 만들어 정합성을 지킨다(머지 비용 증가가 대가).
--   'drop' 은 머지된 파트의 프로젝션을 버려서 조회가 조용히 느려지므로 쓰지 않는다.
--
-- 감사 로그는 프로젝션을 두지 않는다 — 볼륨이 작아 이득보다 저장 비용이 크다.

ALTER TABLE domain_events MODIFY SETTING deduplicate_merge_projection_mode = 'rebuild';
ALTER TABLE domain_events
    ADD PROJECTION IF NOT EXISTS p_by_time
    (SELECT * ORDER BY (occurred_at, organization_id));

ALTER TABLE error_logs MODIFY SETTING deduplicate_merge_projection_mode = 'rebuild';
ALTER TABLE error_logs
    ADD PROJECTION IF NOT EXISTS p_by_time
    (SELECT * ORDER BY (occurred_at, organization_id));

ALTER TABLE access_logs MODIFY SETTING deduplicate_merge_projection_mode = 'rebuild';
ALTER TABLE access_logs
    ADD PROJECTION IF NOT EXISTS p_by_time
    (SELECT * ORDER BY (occurred_at, organization_id));
