CREATE TABLE "marketing_sagas" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"owner_user_id" integer NOT NULL,
	"saga_type" varchar(64) NOT NULL,
	"client_request_id" varchar(120),
	"status" varchar(16) DEFAULT 'RUNNING' NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"context" jsonb NOT NULL,
	"error" text,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_sagas_request_uq" ON "marketing_sagas" USING btree ("organization_id","owner_user_id","saga_type","client_request_id") WHERE "marketing_sagas"."client_request_id" is not null;--> statement-breakpoint
CREATE INDEX "marketing_sagas_stale_idx" ON "marketing_sagas" USING btree ("status","updated_at");