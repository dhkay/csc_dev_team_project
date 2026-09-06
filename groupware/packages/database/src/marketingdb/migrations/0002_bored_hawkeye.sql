CREATE TABLE "marketing_data_source_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"source_key" varchar(64) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"credentials" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_data_source_configs_org_source_uq" UNIQUE("organization_id","source_key")
);
--> statement-breakpoint
CREATE INDEX "marketing_data_source_configs_org_idx" ON "marketing_data_source_configs" USING btree ("organization_id");