-- 설정에서 데이터 수집을 없애면서 채널별 수집 분야(DATALAB_HOME) 도 함께 폐기한다.
-- 그 값을 정할 화면이 사라지고, 그것을 읽던 쇼핑인사이트 키워드 pool 도 걷었다.
-- (수집 서버의 인기검색어는 cid 가 필수라, 분야 없이 전체를 모으는 경로가 없다.)
-- 스키마 변경이 아니라 KV 한 key 의 행 정리라 --custom 으로 작성한다.
DELETE FROM "marketing_channel_source_settings" WHERE "source_key" = 'DATALAB_HOME';
