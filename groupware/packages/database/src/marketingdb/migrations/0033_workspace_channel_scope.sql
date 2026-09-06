-- 워크스페이스 채널 스코프 — 개인 워크스페이스가 (작업자 × 채널)로 분리된다.
--   기획안/원천영상: channel_id 컬럼은 이미 있어 인덱스만 교체.
--   최종영상: channel_id 컬럼 추가 + 기존 행 백필(아래).
--   보관함(location='archive'): 조직 공유지만 채널로는 분리 → org_location 인덱스에 channel_id 추가.
--     보관함 기능 자체는 미구현이며, 데이터 0건인 지금 맞춰 두면 구현 시 마이그레이션이 불필요하다.
--
-- DDL 과 백필(DML)을 한 마이그레이션에 둔다: 나누면 그 사이에 배포된 코드가 channel_id IS NULL 인
-- 최종을 어느 워크스페이스에서도 못 보게 되어 사용자에겐 데이터 소실로 보인다.
DROP INDEX "marketing_saved_plans_owner_idx";--> statement-breakpoint
DROP INDEX "marketing_saved_plans_org_location_idx";--> statement-breakpoint
DROP INDEX "marketing_video_finals_owner_idx";--> statement-breakpoint
DROP INDEX "marketing_video_projects_owner_idx";--> statement-breakpoint
ALTER TABLE "marketing_video_finals" ADD COLUMN "channel_id" integer;--> statement-breakpoint
ALTER TABLE "marketing_video_finals" ADD CONSTRAINT "marketing_video_finals_channel_id_marketing_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."marketing_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_saved_plans_owner_channel_idx" ON "marketing_saved_plans" USING btree ("organization_id","owner_user_id","location","channel_id");--> statement-breakpoint
CREATE INDEX "marketing_saved_plans_org_location_channel_idx" ON "marketing_saved_plans" USING btree ("organization_id","location","channel_id");--> statement-breakpoint
CREATE INDEX "marketing_video_finals_owner_channel_idx" ON "marketing_video_finals" USING btree ("organization_id","owner_user_id","channel_id");--> statement-breakpoint
CREATE INDEX "marketing_video_projects_owner_channel_idx" ON "marketing_video_projects" USING btree ("organization_id","owner_user_id","channel_id");--> statement-breakpoint
-- 백필: 최종영상의 채널을 원천영상에서 스냅샷한다. parent_source_id 가 null 인 고아(원천이 이미
-- 삭제된 최종)는 채널을 복원할 방법이 없어 null 로 남고, 워크스페이스 목록에 나오지 않는다(행은 보존).
UPDATE "marketing_video_finals" f
   SET "channel_id" = p."channel_id"
  FROM "marketing_video_projects" p
 WHERE f."parent_source_id" = p."id"
   AND f."channel_id" IS NULL;