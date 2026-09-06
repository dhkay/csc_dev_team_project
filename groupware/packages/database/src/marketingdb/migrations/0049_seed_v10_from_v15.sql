-- 버전 도입 전 설정을 v1.0 슬롯에도 심는다.
--
-- 0048 이 기존 브랜드/컨셉을 v1.5 슬롯으로만 감쌌는데, 그 데이터는 애초에 'v1.5 의 설정'이 아니라
-- 버전 구분이 없던 시절의 '그 채널의 설정'이었다. 한쪽에만 두면 v1.0 으로 바꾼 사람에게는
-- 설정이 사라진 것으로 보인다(실제로 그렇게 보였다). 두 슬롯에 같은 값을 두어 두 모드 모두
-- 이전과 같이 동작하게 한다. 이후 각 슬롯은 독립적으로 편집된다.
--
-- v1.0 슬롯이 이미 있으면 건드리지 않는다(멱등, 사람이 편집한 값을 덮지 않는다).
UPDATE "marketing_channel_source_settings"
SET "settings" = jsonb_set("settings"::jsonb, '{v1.0}', "settings"::jsonb -> 'v1.5')::text
WHERE "source_key" = 'BRAND_CONCEPT'
  AND "settings" IS NOT NULL
  AND "settings" <> ''
  AND "settings"::jsonb ? 'v1.5'
  AND NOT ("settings"::jsonb ? 'v1.0');

-- 개인 AI 모델 선택도 같은 이유로 맞춘다(버전 도입 전 값이 있었다면 두 슬롯에).
UPDATE "marketing_user_tool_settings"
SET "settings" = jsonb_set("settings"::jsonb, '{v1.0}', "settings"::jsonb -> 'v1.5')::text
WHERE "settings" IS NOT NULL
  AND "settings" <> ''
  AND "settings"::jsonb ? 'v1.5'
  AND NOT ("settings"::jsonb ? 'v1.0');
