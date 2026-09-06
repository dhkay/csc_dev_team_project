-- 3계층 유저 모델 리팩토링 (데이터 보존)
-- 관리자유저(admin_users) / 조직유저(organization_users) / 서비스(services) → 일반유저(service_users)
-- 라벨은 서비스 스코프로 재구성. 0007 의 labels/user_labels(미적용·빈 테이블)는 폐기 후 재생성.

-- ── 1) 핵심 테이블 리네임 (데이터 보존: ALTER TABLE RENAME) ──
ALTER TABLE "users" RENAME TO "organization_users";--> statement-breakpoint
ALTER TABLE "platform_admins" RENAME TO "admin_users";--> statement-breakpoint

-- 인덱스/제약 이름을 새 테이블명 규약에 맞춰 정합화
ALTER INDEX "users_org_email_uq" RENAME TO "organization_users_org_email_uq";--> statement-breakpoint
ALTER TABLE "organization_users" RENAME CONSTRAINT "users_organization_id_organizations_id_fk" TO "organization_users_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "admin_users" RENAME CONSTRAINT "platform_admins_email_unique" TO "admin_users_email_unique";--> statement-breakpoint

-- 조직유저 기본 역할 EMPLOYEE → ADMIN (조직유저는 관리 주체)
ALTER TABLE "organization_users" ALTER COLUMN "role" SET DEFAULT 'ADMIN';--> statement-breakpoint

-- ── 2) 서비스 상태 enum ──
CREATE TYPE "public"."service_status_enum" AS ENUM('ACTIVE', 'SUSPENDED', 'ARCHIVED');--> statement-breakpoint

-- ── 3) services (조직 하위 서비스) ──
CREATE TABLE "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"kind" varchar(50) DEFAULT 'GROUPWARE' NOT NULL,
	"status" "service_status_enum" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ── 4) service_users (서비스의 일반유저) ──
CREATE TABLE "service_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(100) NOT NULL,
	"nickname" varchar(100),
	"status" "user_status_enum" DEFAULT 'ACTIVE' NOT NULL,
	"user_type" "user_type_enum" DEFAULT 'WEB_USER' NOT NULL,
	"token_version" integer DEFAULT 0 NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ── 5) 라벨 재구성: 0007 의 (미적용·빈) labels/user_labels 폐기 후 서비스 스코프로 재생성 ──
DROP TABLE "user_labels" CASCADE;--> statement-breakpoint
DROP TABLE "labels" CASCADE;--> statement-breakpoint
CREATE TABLE "labels" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(9) DEFAULT '#463c6c' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_user_labels" (
	"service_user_id" integer NOT NULL,
	"label_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_user_labels_service_user_id_label_id_pk" PRIMARY KEY("service_user_id","label_id")
);
--> statement-breakpoint

-- ── 6) FK 제약 ──
ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_users" ADD CONSTRAINT "service_users_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_users" ADD CONSTRAINT "service_users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_user_labels" ADD CONSTRAINT "service_user_labels_service_user_id_service_users_id_fk" FOREIGN KEY ("service_user_id") REFERENCES "public"."service_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_user_labels" ADD CONSTRAINT "service_user_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_user_labels" ADD CONSTRAINT "service_user_labels_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- ── 7) 인덱스/유니크 ──
CREATE UNIQUE INDEX "services_org_slug_uq" ON "services" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "service_users_service_email_uq" ON "service_users" USING btree ("service_id","email");--> statement-breakpoint
CREATE INDEX "service_users_org_idx" ON "service_users" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "labels_service_name_uq" ON "labels" USING btree ("service_id","name");--> statement-breakpoint
CREATE INDEX "labels_org_idx" ON "labels" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "service_user_labels_label_idx" ON "service_user_labels" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "service_user_labels_service_idx" ON "service_user_labels" USING btree ("service_id");
