DROP INDEX "marketing_video_finals_owner_channel_idx";--> statement-breakpoint
ALTER TABLE "marketing_video_finals" ADD COLUMN "location" varchar(16) DEFAULT 'personal' NOT NULL;--> statement-breakpoint
CREATE INDEX "marketing_video_finals_org_location_channel_idx" ON "marketing_video_finals" USING btree ("organization_id","location","channel_id");--> statement-breakpoint
CREATE INDEX "marketing_video_finals_owner_channel_idx" ON "marketing_video_finals" USING btree ("organization_id","owner_user_id","location","channel_id");