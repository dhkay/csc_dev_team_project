CREATE TABLE "marketing_saved_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"owner_user_id" integer NOT NULL,
	"location" varchar(16) DEFAULT 'personal' NOT NULL,
	"channel_id" integer,
	"brand_name" varchar(200) DEFAULT '' NOT NULL,
	"title" varchar(300) NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"scenes" jsonb NOT NULL,
	"scene_images" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketing_saved_plans" ADD CONSTRAINT "marketing_saved_plans_channel_id_marketing_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."marketing_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_saved_plans_owner_idx" ON "marketing_saved_plans" USING btree ("organization_id","owner_user_id","location");--> statement-breakpoint
CREATE INDEX "marketing_saved_plans_org_location_idx" ON "marketing_saved_plans" USING btree ("organization_id","location");