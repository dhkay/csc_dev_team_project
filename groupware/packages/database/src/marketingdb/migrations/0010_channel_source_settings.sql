CREATE TABLE "marketing_channel_source_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer NOT NULL,
	"source_key" varchar(64) NOT NULL,
	"settings" text,
	"organization_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_channel_source_settings_channel_source_uq" UNIQUE("channel_id","source_key")
);
--> statement-breakpoint
ALTER TABLE "marketing_channel_source_settings" ADD CONSTRAINT "marketing_channel_source_settings_channel_id_marketing_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."marketing_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_channel_source_settings_channel_idx" ON "marketing_channel_source_settings" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "marketing_channel_source_settings_org_idx" ON "marketing_channel_source_settings" USING btree ("organization_id");