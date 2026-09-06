CREATE TYPE "public"."org_status_enum" AS ENUM('ACTIVE', 'SUSPENDED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."org_type_enum" AS ENUM('PLATFORM', 'TENANT');--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" "org_type_enum" DEFAULT 'TENANT' NOT NULL,
	"status" "org_status_enum" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
-- 멀티테넌시 시드: PLATFORM(벤더) + 기본 TENANT 조직.
-- 기본 조직 slug 'default' 는 시더의 DEFAULT_ORG_SLUG 폴백과 일치해야 한다.
INSERT INTO "organizations" ("slug", "name", "type") VALUES ('platform', 'CSC Partners', 'PLATFORM');--> statement-breakpoint
INSERT INTO "organizations" ("slug", "name", "type") VALUES ('default', '비즈오피스 데모', 'TENANT');--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
-- 데이터 보존(nullable 추가 → 기존 유저 backfill → NOT NULL → FK): 단일 테넌트 무중단
ALTER TABLE "users" ADD COLUMN "organization_id" integer;--> statement-breakpoint
UPDATE "users" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default') WHERE "organization_id" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_org_email_uq" ON "users" USING btree ("organization_id","email");
