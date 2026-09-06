-- 표시명(nickname) 폐지 — 이름(name) 하나로 통일.
--
-- 배경: nickname 은 생성/사용자관리 편집에서 항상 name 과 동일하게 맞춰지고, 오직 환경설정의
-- 자가 편집으로만 갈라졌다. 그 결과 같은 사람이 로그/멤버목록/플랫폼에서는 name,
-- 워크스페이스 앱바/내정보에서는 nickname 으로 보였다. 이름 필드를 하나로 줄여 분기를 없앤다.
--
-- 순서가 중요하다:
--   1) 이름 유일 인덱스를 먼저 푼다 — 아래 승격 UPDATE 가 동명이인을 만들 수 있고,
--      앞으로 name 은 표시 이름이라 조직 내 중복이 정상이다.
--   2) 갈라진 행은 nickname 을 name 으로 승격한다 — 사용자가 마지막에 고른 표시 이름이
--      그 사람의 이름이다(프로드 csc 루트계정: 김보섭 → 임단).
--   3) 컬럼을 드롭한다.
--
-- 이 리비전의 snapshot 은 0027/0028 이 남긴 snapshot drift(ai_tools.provisioning,
-- platform_assistant_settings 누락)도 함께 흡수했다. 그 두 객체는 이미 적용된 변경이라
-- 자동 생성 SQL 에서 걷어냈고, 아래에는 이번 의도만 남긴다.

DROP INDEX IF EXISTS "organization_users_org_name_uq";--> statement-breakpoint

UPDATE "organization_users"
SET "name" = "nickname"
WHERE "nickname" IS NOT NULL
  AND btrim("nickname") <> ''
  AND "nickname" <> "name";--> statement-breakpoint

UPDATE "admin_users"
SET "name" = "nickname"
WHERE "nickname" IS NOT NULL
  AND btrim("nickname") <> ''
  AND "nickname" <> "name";--> statement-breakpoint

ALTER TABLE "organization_users" DROP COLUMN "nickname";--> statement-breakpoint
ALTER TABLE "admin_users" DROP COLUMN "nickname";
