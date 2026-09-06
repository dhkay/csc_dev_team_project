CREATE TABLE "organization_assistant_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"default_model" varchar(64),
	"prompt_addition" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_assistant_settings_org_uq" UNIQUE("organization_id")
);
