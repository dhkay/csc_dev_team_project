-- 산출물 세 표의 도구 버전을 NOT NULL 로 조인다: 버전은 요청의 축이고, 버전 없는 산출물은 없다.
-- 조이기 전에 남아 있는 null 을 채운다(비어 있으면 0행: 세 환경 모두 그렇다).
--   이 컬럼이 생긴 뒤 만들어진 행은 전부 값을 갖는다. null 은 그 이전 행뿐이라 기본 버전으로 귀속한다.
-- DEFAULT 는 두지 않는다: 기본값이 있으면 컬럼을 빠뜨린 INSERT 가 조용히 한쪽 버전 행을 만든다.
UPDATE "marketing_saved_plans" SET "version_mode" = 'v1.5' WHERE "version_mode" IS NULL;--> statement-breakpoint
UPDATE "marketing_video_projects" SET "version_mode" = 'v1.5' WHERE "version_mode" IS NULL;--> statement-breakpoint
UPDATE "marketing_video_finals" SET "version_mode" = 'v1.5' WHERE "version_mode" IS NULL;--> statement-breakpoint
ALTER TABLE "marketing_saved_plans" ALTER COLUMN "version_mode" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "marketing_video_finals" ALTER COLUMN "version_mode" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "marketing_video_projects" ALTER COLUMN "version_mode" SET NOT NULL;
