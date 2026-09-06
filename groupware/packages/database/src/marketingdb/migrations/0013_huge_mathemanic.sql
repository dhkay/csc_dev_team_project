CREATE TABLE "marketing_knowledge_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"term" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"background" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_knowledge_entries_org_term_uq" UNIQUE("organization_id","term")
);
--> statement-breakpoint
CREATE INDEX "marketing_knowledge_entries_org_idx" ON "marketing_knowledge_entries" USING btree ("organization_id");