DROP TABLE "marketing_asset_set_members" CASCADE;--> statement-breakpoint
ALTER TABLE "marketing_asset_sets" ADD COLUMN "frame_upload_id" varchar(200);--> statement-breakpoint
ALTER TABLE "marketing_asset_sets" ADD COLUMN "outro_upload_id" varchar(200);