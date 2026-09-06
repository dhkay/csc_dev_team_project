-- 0001: 엔타이틀먼트(features/ai_tools/organization_*/user_* + entitlement_principal_enum) 를 userdb 로 이전하며 제거.
-- 카탈로그는 userdb 0011 에서 key 로 재시드. 미사용 스캐폴딩이라 실제 grant row 없음. 설계: .claude/rules/multi-tenancy.md
DROP TABLE "features" CASCADE;--> statement-breakpoint
DROP TABLE "ai_tools" CASCADE;--> statement-breakpoint
DROP TABLE "organization_ai_tools" CASCADE;--> statement-breakpoint
DROP TABLE "organization_features" CASCADE;--> statement-breakpoint
DROP TABLE "user_ai_tools" CASCADE;--> statement-breakpoint
DROP TABLE "user_features" CASCADE;--> statement-breakpoint
DROP TYPE "public"."entitlement_principal_enum";