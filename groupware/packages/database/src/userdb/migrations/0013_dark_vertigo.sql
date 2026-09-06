CREATE TABLE "admin_features" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_features_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "admin_user_features" (
	"admin_user_id" integer NOT NULL,
	"admin_feature_id" integer NOT NULL,
	"granted_by" integer,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_user_features_admin_user_id_admin_feature_id_pk" PRIMARY KEY("admin_user_id","admin_feature_id")
);
--> statement-breakpoint
ALTER TABLE "admin_user_features" ADD CONSTRAINT "admin_user_features_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_features" ADD CONSTRAINT "admin_user_features_admin_feature_id_admin_features_id_fk" FOREIGN KEY ("admin_feature_id") REFERENCES "public"."admin_features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- 플랫폼 관리자 옵션 카탈로그 시드(멱등) — 사이드바/페이지 영역과 1:1. 추가 영역은 여기 한 줄.
INSERT INTO "admin_features" ("key","name","description","sort_order") VALUES
	('org-management','조직 관리','조직(테넌트) 생성·수정·삭제 및 AI도구 부여',10),
	('ai-tools-management','AI도구 관리','플랫폼 AI 도구 목록·관리',20)
ON CONFLICT ("key") DO NOTHING;