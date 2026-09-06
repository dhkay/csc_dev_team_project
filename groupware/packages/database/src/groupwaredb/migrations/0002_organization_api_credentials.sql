CREATE TABLE "organization_api_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"provider" varchar(64) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"credentials" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_api_credentials_org_provider_uq" UNIQUE("organization_id","provider")
);
--> statement-breakpoint
CREATE INDEX "organization_api_credentials_org_idx" ON "organization_api_credentials" USING btree ("organization_id");