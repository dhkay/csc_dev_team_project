-- 브랜드/컨셉을 버전(UI 모드)별로 가른다. AI 모델과 같은 규칙이다.
-- settings 는 세트 목록 하나가 아니라 '버전 → {sets}' 맵이 된다(스키마 변경 없음: text 안의 형태만 바뀐다).
-- 기존 행은 기본 버전(v1.5) 슬롯으로 감싼다. 이미 맵인 행(? 연산자로 판별)은 건드리지 않아 멱등하다.
UPDATE "marketing_channel_source_settings"
SET "settings" = jsonb_build_object('v1.5', "settings"::jsonb)::text
WHERE "source_key" = 'BRAND_CONCEPT'
  AND "settings" IS NOT NULL
  AND "settings" <> ''
  AND "settings"::jsonb ? 'sets';
