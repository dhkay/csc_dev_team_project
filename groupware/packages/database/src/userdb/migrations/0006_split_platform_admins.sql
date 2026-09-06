-- 플랫폼 슈퍼관리자를 users 에서 platform_admins 로 분리(데이터 이관) — 0005 가 만든 테이블로 이동.
-- 데이터 보존: PLATFORM 조직 소속 유저를 복사한 뒤 원본 유저행/조직행 제거.
-- 주의: 'type=PLATFORM' 데이터 기준으로만 동작한다(하드코딩 id/email 금지) — 모든 환경에서 실행됨.
-- 로컬 테스트 잔재('partners' 등 TENANT 중복) 정리는 이 마이그레이션이 아니라 로컬 데이터 작업으로 처리한다.

INSERT INTO "platform_admins"
	("email", "password_hash", "name", "nickname", "role", "status",
	 "token_version", "failed_login_attempts", "locked_until", "last_login_at", "created_at", "updated_at")
SELECT u."email", u."password_hash", u."name", u."nickname", u."role", u."status",
	   u."token_version", u."failed_login_attempts", u."locked_until", u."last_login_at",
	   u."created_at", u."updated_at"
FROM "users" u
JOIN "organizations" o ON o."id" = u."organization_id"
WHERE o."type" = 'PLATFORM';
--> statement-breakpoint
DELETE FROM "users" u
USING "organizations" o
WHERE u."organization_id" = o."id" AND o."type" = 'PLATFORM';
--> statement-breakpoint
DELETE FROM "organizations" WHERE "type" = 'PLATFORM';
