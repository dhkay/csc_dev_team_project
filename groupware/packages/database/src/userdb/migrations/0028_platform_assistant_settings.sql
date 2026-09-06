-- Custom SQL migration file, put your code below! --

-- 플랫폼 AI 어시스턴트 전역 설정 — 싱글톤 1행(id=1 고정). control-tower→user 위임으로 편집.
CREATE TABLE IF NOT EXISTS "platform_assistant_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"global_enabled" boolean DEFAULT true NOT NULL,
	"default_model" varchar(64),
	"common_prompt" text,
	"allowed_models" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_assistant_settings_singleton_chk" CHECK ("id" = 1)
);

-- 기본 1행 시드(멱등). 전역 활성 + 나머지 NULL(리졸버 기본 폴백). 재적용 무해.
INSERT INTO "platform_assistant_settings" ("id", "global_enabled")
VALUES (1, true)
ON CONFLICT ("id") DO NOTHING;
