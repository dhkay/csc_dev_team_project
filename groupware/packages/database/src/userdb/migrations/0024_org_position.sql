CREATE TYPE "public"."org_position_enum" AS ENUM('REPRESENTATIVE', 'TEAM_LEADER');--> statement-breakpoint
ALTER TABLE "organization_users" ADD COLUMN "position" "org_position_enum";--> statement-breakpoint
-- 데이터 이전: 기존 '대표' 권한(representative) 보유자를 직책(position=REPRESENTATIVE)으로 옮긴다.
--  대표는 권한 카탈로그에서 직책(OrgPosition)으로 이전됨(단일 컬럼 → 대표↔팀장 상호배제).
UPDATE "organization_users" AS ou
SET "position" = 'REPRESENTATIVE'
FROM "organization_user_permissions" AS oup
INNER JOIN "permissions" AS p ON p."id" = oup."permission_id"
WHERE oup."user_id" = ou."id" AND p."key" = 'representative';--> statement-breakpoint
-- 이전 완료된 대표 권한 grant 행 제거. (permissions 카탈로그의 representative 행 자체는
--  코드 SSOT 에서 빠져 다음 부팅에 CatalogSeederService 가 soft-비활성화 — grant 가 없어 안전.)
DELETE FROM "organization_user_permissions"
WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "key" = 'representative');--> statement-breakpoint
CREATE UNIQUE INDEX "org_users_dept_team_leader_uq" ON "organization_users" USING btree ("department_id") WHERE "organization_users"."position" = 'TEAM_LEADER';--> statement-breakpoint
ALTER TABLE "organization_users" ADD CONSTRAINT "org_users_team_leader_dept_chk" CHECK ("organization_users"."position" <> 'TEAM_LEADER' OR "organization_users"."department_id" IS NOT NULL);