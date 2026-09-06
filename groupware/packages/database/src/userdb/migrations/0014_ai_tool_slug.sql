-- ai_tools.slug 추가 (데이터 변환형) — 라우팅 경로 세그먼트. 기존 행은 slug = key 로 백필.
-- 1) nullable 로 컬럼 추가
ALTER TABLE "ai_tools" ADD COLUMN "slug" varchar(64);--> statement-breakpoint
-- 2) 기존 행 백필 (key 가 이미 slug 형태: 'marketing-video' 등)
UPDATE "ai_tools" SET "slug" = "key" WHERE "slug" IS NULL;--> statement-breakpoint
-- 3) NOT NULL + UNIQUE 제약
ALTER TABLE "ai_tools" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_tools" ADD CONSTRAINT "ai_tools_slug_unique" UNIQUE("slug");
