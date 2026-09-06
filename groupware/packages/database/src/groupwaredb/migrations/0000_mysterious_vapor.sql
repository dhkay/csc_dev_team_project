CREATE TYPE "public"."entitlement_principal_enum" AS ENUM('ORGANIZATION_USER', 'SERVICE_USER');--> statement-breakpoint
CREATE TABLE "features" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "features_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "ai_tools" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_tools_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "organization_ai_tools" (
	"organization_id" integer NOT NULL,
	"ai_tool_id" integer NOT NULL,
	"granted_by" integer,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_ai_tools_organization_id_ai_tool_id_pk" PRIMARY KEY("organization_id","ai_tool_id")
);
--> statement-breakpoint
CREATE TABLE "organization_features" (
	"organization_id" integer NOT NULL,
	"feature_id" integer NOT NULL,
	"granted_by" integer,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_features_organization_id_feature_id_pk" PRIMARY KEY("organization_id","feature_id")
);
--> statement-breakpoint
CREATE TABLE "user_ai_tools" (
	"organization_id" integer NOT NULL,
	"principal_type" "entitlement_principal_enum" NOT NULL,
	"user_id" integer NOT NULL,
	"ai_tool_id" integer NOT NULL,
	"assigned_by" integer,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_ai_tools_principal_type_user_id_ai_tool_id_pk" PRIMARY KEY("principal_type","user_id","ai_tool_id")
);
--> statement-breakpoint
CREATE TABLE "user_features" (
	"organization_id" integer NOT NULL,
	"principal_type" "entitlement_principal_enum" NOT NULL,
	"user_id" integer NOT NULL,
	"feature_id" integer NOT NULL,
	"assigned_by" integer,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_features_principal_type_user_id_feature_id_pk" PRIMARY KEY("principal_type","user_id","feature_id")
);
--> statement-breakpoint
ALTER TABLE "organization_ai_tools" ADD CONSTRAINT "organization_ai_tools_ai_tool_id_ai_tools_id_fk" FOREIGN KEY ("ai_tool_id") REFERENCES "public"."ai_tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_features" ADD CONSTRAINT "organization_features_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ai_tools" ADD CONSTRAINT "user_ai_tools_org_grant_fk" FOREIGN KEY ("organization_id","ai_tool_id") REFERENCES "public"."organization_ai_tools"("organization_id","ai_tool_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_features" ADD CONSTRAINT "user_features_org_grant_fk" FOREIGN KEY ("organization_id","feature_id") REFERENCES "public"."organization_features"("organization_id","feature_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- 초기 카탈로그 시드(플랫폼 정의) — key 기준. 이후 control-tower 에서 추가 관리.
INSERT INTO "features" ("key","name","description","sort_order") VALUES
	('notice','공지사항','조직 공지 작성/열람',10),
	('user-management','사용자 관리','조직유저/서비스/일반유저·라벨 관리',20),
	('roles','권한/역할','역할 및 접근권한 관리',30),
	('content','콘텐츠','콘텐츠 관리',40),
	('stats','통계','리포트/통계 대시보드',50),
	('settings','설정','조직 설정',60),
	('audit-log','감사 로그','활동 감사 로그',70),
	('billing','결제','구독/결제 관리',80)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "ai_tools" ("key","name","description","sort_order") VALUES
	('marketing-video','마케팅 영상 제작','AI 영상 제작 자동화(트랜스코딩/렌더링)',10),
	('ai-assistant','AI 어시스턴트','업무 보조 AI 에이전트',20)
ON CONFLICT ("key") DO NOTHING;