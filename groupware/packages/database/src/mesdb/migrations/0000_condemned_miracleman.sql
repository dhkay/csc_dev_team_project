CREATE TYPE "public"."mes_device_status_enum" AS ENUM('ACTIVE', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."mes_sync_op_enum" AS ENUM('CREATE', 'UPDATE', 'DELETE', 'INTENT');--> statement-breakpoint
CREATE TYPE "public"."mes_sync_op_status_enum" AS ENUM('APPLIED', 'DUPLICATE', 'REJECTED');--> statement-breakpoint
CREATE TABLE "mes_devices" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"site_code" varchar(40),
	"allowed_line_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scope_version" integer DEFAULT 1 NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"status" "mes_device_status_enum" DEFAULT 'ACTIVE' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_acked_seq" bigint,
	"last_client_version" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mes_org_sequence" (
	"organization_id" integer PRIMARY KEY NOT NULL,
	"last_seq" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mes_sync_operations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_op_id" uuid NOT NULL,
	"device_id" varchar(64) NOT NULL,
	"entity" varchar(48) NOT NULL,
	"op" "mes_sync_op_enum" NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"status" "mes_sync_op_status_enum" NOT NULL,
	"reject_reason" varchar(48),
	"target_id" bigint,
	"result_seq" bigint,
	"result" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clock_skew_ms" integer,
	CONSTRAINT "mes_sync_operations_org_op_uq" UNIQUE("organization_id","client_op_id")
);
--> statement-breakpoint
CREATE INDEX "mes_devices_org_idx" ON "mes_devices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "mes_sync_operations_org_received_idx" ON "mes_sync_operations" USING btree ("organization_id","received_at");