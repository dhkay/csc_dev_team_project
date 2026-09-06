CREATE TABLE "marketing_asset_set_members" (
	"set_id" integer NOT NULL,
	"category" varchar(32) NOT NULL,
	"asset_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_asset_set_members_set_id_category_pk" PRIMARY KEY("set_id","category")
);
--> statement-breakpoint
CREATE TABLE "marketing_asset_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" varchar(16) DEFAULT 'common' NOT NULL,
	"organization_id" integer,
	"name" varchar(300) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketing_asset_set_members" ADD CONSTRAINT "marketing_asset_set_members_set_id_marketing_asset_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."marketing_asset_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_asset_set_members" ADD CONSTRAINT "marketing_asset_set_members_asset_id_marketing_common_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."marketing_common_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_asset_set_members_asset_idx" ON "marketing_asset_set_members" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "marketing_asset_sets_scope_sort_idx" ON "marketing_asset_sets" USING btree ("scope","sort_order");