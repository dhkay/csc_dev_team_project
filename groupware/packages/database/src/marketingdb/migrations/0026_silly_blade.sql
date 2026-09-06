ALTER TABLE "marketing_asset_axes" DROP CONSTRAINT "marketing_asset_axes_category_key_uq";--> statement-breakpoint
ALTER TABLE "marketing_asset_tags" DROP CONSTRAINT "marketing_asset_tags_axis_value_uq";--> statement-breakpoint
ALTER TABLE "marketing_asset_axes" ADD COLUMN "scope" varchar(16) DEFAULT 'common' NOT NULL;--> statement-breakpoint
ALTER TABLE "marketing_asset_axes" ADD COLUMN "organization_id" integer;--> statement-breakpoint
ALTER TABLE "marketing_asset_tags" ADD COLUMN "scope" varchar(16) DEFAULT 'common' NOT NULL;--> statement-breakpoint
ALTER TABLE "marketing_asset_tags" ADD COLUMN "organization_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_asset_axes_common_key_uq" ON "marketing_asset_axes" USING btree ("category","key") WHERE "marketing_asset_axes"."organization_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_asset_axes_org_key_uq" ON "marketing_asset_axes" USING btree ("category","key","organization_id") WHERE "marketing_asset_axes"."organization_id" is not null;--> statement-breakpoint
CREATE INDEX "marketing_asset_axes_org_idx" ON "marketing_asset_axes" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_asset_tags_common_value_uq" ON "marketing_asset_tags" USING btree ("axis_id","value") WHERE "marketing_asset_tags"."organization_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_asset_tags_org_value_uq" ON "marketing_asset_tags" USING btree ("axis_id","value","organization_id") WHERE "marketing_asset_tags"."organization_id" is not null;--> statement-breakpoint
CREATE INDEX "marketing_asset_tags_org_idx" ON "marketing_asset_tags" USING btree ("organization_id");