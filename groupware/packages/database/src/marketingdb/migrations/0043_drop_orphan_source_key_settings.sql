-- 소스 id 를 key 로 쓰던 구 스키마 잔재 정리.
-- 이 KV 테이블의 key 공간은 설정 섹션 이름(AI_MODEL / BRAND_CONCEPT / PLAN_PROMPT)이고
-- 소스 id 가 아니다. 'NAVER_SHOPPING_INSIGHT' 로 남은 행({"categories":[...]})은
-- 읽는 코드가 없어 다음 사람에게 key 공간을 오해시키는 값만 남는다.
DELETE FROM "marketing_channel_source_settings"
 WHERE "source_key" NOT IN ('AI_MODEL', 'BRAND_CONCEPT', 'PLAN_PROMPT');
