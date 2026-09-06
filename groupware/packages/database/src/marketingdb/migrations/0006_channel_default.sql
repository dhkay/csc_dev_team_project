ALTER TABLE "marketing_channels" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- 백필: 조직마다 순서상 첫 채널(sort_order, id 오름차순)을 대표 채널로 지정. 이후 신규 조직은
-- 첫 채널 생성 시 자동 대표(서비스). 조직당 하나만 true 를 유지한다.
UPDATE "marketing_channels" SET "is_default" = true
WHERE "id" IN (
  SELECT DISTINCT ON ("organization_id") "id"
  FROM "marketing_channels"
  ORDER BY "organization_id", "sort_order", "id"
);
