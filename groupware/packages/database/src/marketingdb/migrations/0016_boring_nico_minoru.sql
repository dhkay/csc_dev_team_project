CREATE TABLE "marketing_common_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" varchar(32) NOT NULL,
	"scope" varchar(16) DEFAULT 'common' NOT NULL,
	"organization_id" integer,
	"upload_id" varchar(200) NOT NULL,
	"name" varchar(300) NOT NULL,
	"mime_type" varchar(128) NOT NULL,
	"size_bytes" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "marketing_common_assets_scope_category_idx" ON "marketing_common_assets" USING btree ("scope","category","sort_order");