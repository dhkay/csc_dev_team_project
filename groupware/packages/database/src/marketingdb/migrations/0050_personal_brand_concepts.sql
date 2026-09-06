-- 브랜드/컨셉 세트를 채널 스코프에서 개인(유저) 스코프로 옮긴다.
-- 채널 단위였을 때는 같은 브랜드를 채널마다 다시 입력해야 했고, 채널을 지우면 cascade 로 세트까지
-- 사라졌다. AI 모델 선택과 진입 채널이 먼저 같은 자리로 옮겨졌다(0044, 0047).
--
-- 함께 하는 이름 정리: settings 컬럼은 AI 모델 버전맵만 담는데 이름이 그것을 말하지 않는다. 두 번째
-- 설정 컬럼(brand_concepts)이 붙는 순간 모호해지므로 지금 ai_models 로 맞춘다. 유니크 제약도 구
-- 테이블명(marketing_user_ai_models) 잔재를 쓰고 있어 함께 고친다.
--
-- 리네임은 재실행에 대비해 존재 여부로 가드한다(drizzle 이 1회만 적용하지만, 부분 적용된 DB 에
-- 손으로 다시 돌리는 상황이 실제로 생긴다).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'marketing_user_tool_settings' AND column_name = 'settings'
  ) THEN
    ALTER TABLE "marketing_user_tool_settings" RENAME COLUMN "settings" TO "ai_models";
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_user_ai_models_org_owner_uq'
  ) THEN
    ALTER TABLE "marketing_user_tool_settings"
      RENAME CONSTRAINT "marketing_user_ai_models_org_owner_uq"
                     TO "marketing_user_tool_settings_org_owner_uq";
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "marketing_user_tool_settings" ADD COLUMN IF NOT EXISTS "brand_concepts" text;
--> statement-breakpoint

-- 채널 행의 세트를 개인 행으로 심는다.
--
-- 대상 유저: marketingdb 안에서 알 수 있는 사람만이다. 조직 구성원 목록은 userdb 가 소유하고
-- 크로스-DB 조회는 DB 소유권 경계 위반이라, 이미 개인 설정 행이 있는 사람과 이 조직에서 산출물을
-- 만든 사람(저장 기획안/영상 프로젝트의 소유자)을 대상으로 한다. 그 밖의 사람은 빈 상태로 시작한다.
--
-- 병합: 조직 x 버전 슬롯 단위로 각각 한다. 버전 슬롯을 섞으면 "버전은 별개 도구"라는 계약이 깨진다.
-- 브랜드명이 세트 식별자라 중복은 최근 편집(updated_at DESC) 쪽을 남기고, 세트 상한 20개에서 컷한다.
-- 구 최상위 sets 형태도 함께 읽는다(0048 이 감쌌지만 그 전 형태가 남아 있어도 잃지 않게).
WITH slots(slot) AS (
  VALUES ('v1.5'), ('v1.0')
),
src AS (
  SELECT s.organization_id,
         v.slot,
         s.updated_at,
         CASE
           WHEN jsonb_typeof(raw.sets) = 'array' THEN raw.sets
           ELSE '[]'::jsonb
         END AS sets
    FROM "marketing_channel_source_settings" s
    CROSS JOIN slots v
    CROSS JOIN LATERAL (
      SELECT COALESCE(
               s."settings"::jsonb -> v.slot -> 'sets',
               CASE
                 WHEN s."settings"::jsonb ? 'sets' THEN s."settings"::jsonb -> 'sets'
                 ELSE '[]'::jsonb
               END
             ) AS sets
    ) raw
   WHERE s."source_key" = 'BRAND_CONCEPT'
     AND s."settings" IS NOT NULL
     AND s."settings" LIKE '{%'
),
flat AS (
  SELECT src.organization_id, src.slot, src.updated_at, e.ord, e.item
    FROM src
    CROSS JOIN LATERAL jsonb_array_elements(src.sets) WITH ORDINALITY AS e(item, ord)
),
picked AS (
  SELECT DISTINCT ON (organization_id, slot, item ->> 'brandName')
         organization_id, slot, updated_at, ord, item
    FROM flat
   WHERE COALESCE(item ->> 'brandName', '') <> ''
   ORDER BY organization_id, slot, item ->> 'brandName', updated_at DESC, ord
),
capped AS (
  SELECT organization_id, slot, item, rn
    FROM (
      SELECT picked.*,
             row_number() OVER (
               PARTITION BY organization_id, slot ORDER BY updated_at DESC, ord
             ) AS rn
        FROM picked
    ) ranked
   WHERE rn <= 20
),
per_slot AS (
  SELECT organization_id, slot, jsonb_build_object('sets', jsonb_agg(item ORDER BY rn)) AS payload
    FROM capped
   GROUP BY organization_id, slot
),
merged AS (
  SELECT organization_id, jsonb_object_agg(slot, payload)::text AS brand_concepts
    FROM per_slot
   GROUP BY organization_id
),
targets AS (
  SELECT "organization_id", "owner_user_id" FROM "marketing_user_tool_settings"
  UNION
  SELECT "organization_id", "owner_user_id" FROM "marketing_saved_plans"
  UNION
  SELECT "organization_id", "owner_user_id" FROM "marketing_video_projects"
)
INSERT INTO "marketing_user_tool_settings" ("organization_id", "owner_user_id", "brand_concepts", "updated_at")
SELECT t."organization_id", t."owner_user_id", m.brand_concepts, now()
  FROM targets t
  JOIN merged m ON m.organization_id = t."organization_id"
ON CONFLICT ("organization_id", "owner_user_id") DO UPDATE
  SET "brand_concepts" = EXCLUDED."brand_concepts",
      "updated_at" = now()
  WHERE "marketing_user_tool_settings"."brand_concepts" IS NULL;
--> statement-breakpoint

-- 원본 제거: 이제 읽는 코드가 없다. 0044 가 AI_MODEL 을 옮길 때와 같다.
-- 이 테이블에는 PLAN_PROMPT 만 남는다(그건 채널의 속성이라 그대로 둔다).
DELETE FROM "marketing_channel_source_settings" WHERE "source_key" = 'BRAND_CONCEPT';
