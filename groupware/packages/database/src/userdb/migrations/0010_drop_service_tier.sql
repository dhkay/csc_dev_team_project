-- 0010: 서비스 계층 제거 (services/service_users/labels/service_user_labels + service_status_enum).
-- 유저 모델을 2계층(admin_users + organization_users)으로 단순화. 엔타이틀먼트는 0011 에서 userdb 로 들어온다.
-- ⚠️ DROP TABLE CASCADE = 파괴적·roll-forward only. 서비스 계층은 미사용 스캐폴딩이라 실제 row 없음(적용 전 확인).
-- 설계: .claude/rules/multi-tenancy.md
ALTER TABLE "labels" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service_user_labels" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service_users" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "services" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "labels" CASCADE;--> statement-breakpoint
DROP TABLE "service_user_labels" CASCADE;--> statement-breakpoint
DROP TABLE "service_users" CASCADE;--> statement-breakpoint
DROP TABLE "services" CASCADE;--> statement-breakpoint
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_id_org_uq" UNIQUE("id","organization_id");--> statement-breakpoint
DROP TYPE "public"."service_status_enum";