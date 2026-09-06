CREATE TABLE "marketing_banned_words" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"value" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_banned_words_org_value_uq" UNIQUE("organization_id","value")
);
--> statement-breakpoint
CREATE TABLE "marketing_keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"value" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_keywords_org_value_uq" UNIQUE("organization_id","value")
);
--> statement-breakpoint
CREATE INDEX "marketing_banned_words_org_idx" ON "marketing_banned_words" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "marketing_keywords_org_idx" ON "marketing_keywords" USING btree ("organization_id");