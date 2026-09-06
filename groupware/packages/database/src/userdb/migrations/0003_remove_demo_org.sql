-- Custom SQL migration file, put your code below! --

-- 데모/기본 TENANT 조직(slug='default', '비즈오피스 데모') 제거.
-- 멀티테넌시 도입(0001)에서 백필 무결성·데모 용도로 만들었으나, 이제 테넌트 목록은 실데이터만 노출하고
-- 비어 있으면 UI 가 데모 placeholder 를 보여준다(시더의 default 조직 시드도 함께 제거됨).
-- 안전장치: 유저가 한 명도 없을 때만 삭제한다 — 과거 단일테넌트에서 백필된 실유저가 붙어 있으면 보존.
DELETE FROM "organizations"
WHERE "slug" = 'default'
  AND "type" = 'TENANT'
  AND NOT EXISTS (
    SELECT 1 FROM "users" WHERE "users"."organization_id" = "organizations"."id"
  );
