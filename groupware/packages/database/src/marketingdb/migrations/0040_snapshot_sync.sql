-- 스냅샷 동기화(사실상 no-op).
--
-- 0037/0039 를 `--custom` 으로 쓰면서 SQL 은 손으로 작성했는데 스냅샷이 그때 함께 갱신되지 않았다.
-- 그래서 스키마에는 없는 옛 키워드 테이블이 스냅샷에만 남아, 다음 generate 가 그 차이를 다시 뱉었다.
-- 이 마이그레이션은 그 스냅샷을 맞추는 것이 목적이고, 아래 DROP 은 이미 지워진 테이블을 향한다.
-- (0037/0039 를 거친 환경에서는 IF EXISTS 로 통과한다. 하나라도 남아 있으면 그때 정리된다.)

DROP TABLE IF EXISTS "marketing_part_keyword_links" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "marketing_channel_parts" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "marketing_keywords" CASCADE;
