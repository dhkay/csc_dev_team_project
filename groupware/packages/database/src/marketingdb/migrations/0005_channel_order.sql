ALTER TABLE "marketing_channels" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- 백필: 기존 채널 순서(생성순 = id 오름차순)를 sort_order 로 보존. 이후 재정렬은 0..n-1 로 덮어쓴다.
UPDATE "marketing_channels" SET "sort_order" = "id";
