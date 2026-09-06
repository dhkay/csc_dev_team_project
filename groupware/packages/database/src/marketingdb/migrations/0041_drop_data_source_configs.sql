-- 조직별 소스 활성 토글 제거: 어떤 소스를 쓸 수 있는지는 수집 서버 카탈로그(GET /sources)의
-- available 이 단일 판정이다. 이 테이블은 그 답을 조직이 덮어쓰는 예외 장치였고, 게이트가
-- 이미 행 부재를 활성으로 읽고 있어(fail-open) 걷어내면 카탈로그 판정만 남는다.
-- 채널별 수집 분야(marketing_channel_source_settings 의 DATALAB_HOME)는 그대로 둔다.
DROP TABLE "marketing_data_source_configs" CASCADE;
