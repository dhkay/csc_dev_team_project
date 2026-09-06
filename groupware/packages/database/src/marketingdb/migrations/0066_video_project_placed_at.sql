-- 작업 공간 배치 시각. null 이면 아직 배치되지 않은 영상(생성 창의 마지막 단계를 거치지 않았다).
ALTER TABLE "marketing_video_projects" ADD COLUMN "placed_at" timestamp with time zone;--> statement-breakpoint
-- 이미 있던 영상은 전부 배치된 것으로 본다. 그러지 않으면 이 마이그레이션이 지금 워크스페이스에
--   보이는 것을 통째로 감춘다(배치라는 개념이 없던 시절에 만들어졌고, 그때는 만들기가 곧 배치였다).
UPDATE "marketing_video_projects" SET "placed_at" = "created_at" WHERE "placed_at" IS NULL;
