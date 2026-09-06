-- 채널을 조직 공유에서 개인 소유로 내린다.
-- 채널을 만들고 이름을 바꾸고 지우는 것은 본인이고, 남의 채널은 목록에 오지 않는다. 채널이 개인
-- 것이 되면 그 안에 담기는 것(기획안/영상/보관함)도 전부 그 사람 것이 된다.
-- AI 모델(0044), 진입 채널(0047), 브랜드/컨셉(0050), 최종 영상 버전(0051)과 같은 방향이다.

ALTER TABLE "marketing_channels" ADD COLUMN IF NOT EXISTS "owner_user_id" integer;
--> statement-breakpoint

-- 1) 소유자 추론: 그 채널에 실제로 작업물을 남긴 사람이 가장 확실한 소유자다(가장 많이 남긴 사람).
--    marketingdb 안에서만 판단한다: 조직원 목록은 userdb 소유라 조회하지 않는다(DB 소유권 경계).
UPDATE "marketing_channels" c
SET "owner_user_id" = w."owner_user_id"
FROM (
  SELECT channel_id, owner_user_id,
         row_number() OVER (PARTITION BY channel_id ORDER BY count(*) DESC, owner_user_id ASC) AS rn
  FROM (
    SELECT channel_id, owner_user_id FROM "marketing_saved_plans"     WHERE channel_id IS NOT NULL
    UNION ALL
    SELECT channel_id, owner_user_id FROM "marketing_video_projects"  WHERE channel_id IS NOT NULL
    UNION ALL
    SELECT channel_id, owner_user_id FROM "marketing_video_finals"    WHERE channel_id IS NOT NULL
  ) x
  GROUP BY channel_id, owner_user_id
) w
WHERE w.channel_id = c."id" AND w.rn = 1 AND c."owner_user_id" IS NULL;
--> statement-breakpoint

-- 2) 작업물이 없는 채널은 그 조직에서 이 도구를 써 본 사람에게 넘긴다(개인 설정 행이 곧 그 증거).
--    여러 명이면 가장 낮은 id: 임의 규칙이지만 결정적이라 재실행해도 같은 결과가 된다.
UPDATE "marketing_channels" c
SET "owner_user_id" = (
  SELECT u."owner_user_id"
  FROM "marketing_user_tool_settings" u
  WHERE u."organization_id" = c."organization_id"
  ORDER BY u."owner_user_id" ASC
  LIMIT 1
)
WHERE c."owner_user_id" IS NULL;
--> statement-breakpoint

-- 3) 그래도 주인을 못 찾은 채널은 지운다. 소유자 없는 개인 채널은 **누구의 목록에도 오지 않아**
--    화면에서 닿을 수 없고, NOT NULL 도 세울 수 없다. 매달린 설정은 FK cascade 로 함께 정리된다.
DELETE FROM "marketing_channels" WHERE "owner_user_id" IS NULL;
--> statement-breakpoint

ALTER TABLE "marketing_channels" ALTER COLUMN "owner_user_id" SET NOT NULL;
--> statement-breakpoint

-- 4) 유니크 축 교체: 조직 안 유일 → **사람 안** 유일. 남의 목록은 보이지 않으므로 남이 쓴 이름을
--    내가 못 쓰는 제약은 이유를 설명할 수 없다.
ALTER TABLE "marketing_channels" DROP CONSTRAINT IF EXISTS "marketing_channels_org_name_uq";
--> statement-breakpoint
ALTER TABLE "marketing_channels"
  ADD CONSTRAINT "marketing_channels_owner_name_uq"
  UNIQUE ("organization_id", "owner_user_id", "name");
--> statement-breakpoint

DROP INDEX IF EXISTS "marketing_channels_org_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketing_channels_org_owner_idx"
  ON "marketing_channels" ("organization_id", "owner_user_id");
