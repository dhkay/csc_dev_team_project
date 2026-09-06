CREATE TABLE "marketing_user_ai_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"owner_user_id" integer NOT NULL,
	"settings" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_user_ai_models_org_owner_uq" UNIQUE("organization_id","owner_user_id")
);

-- 채널 단위 AI 모델 설정 폐기: 모델 선택이 유저 스코프로 옮겨졌다(위 테이블).
-- 같은 테이블의 BRAND_CONCEPT / PLAN_PROMPT 는 여전히 채널 단위라 건드리지 않는다.
-- 이미 만든 기획안은 생성 시점 모델을 자기 컬럼(llm_model/image_model)에 굳혀 두므로 표시에 영향 없다.
DELETE FROM "marketing_channel_source_settings" WHERE "source_key" = 'AI_MODEL';
