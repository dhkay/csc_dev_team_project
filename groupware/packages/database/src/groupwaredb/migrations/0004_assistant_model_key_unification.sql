-- Custom SQL migration file, put your code below! --

-- 조직 AI 어시스턴트 설정의 **구 모델 key** → 통일된 key.
-- 사유/배경은 userdb 의 같은 이름 마이그레이션(0029_assistant_model_key_unification) 주석 참고.
-- 여기는 조직별 기본 모델 한 컬럼뿐이다(허용 목록은 플랫폼 레이어가 소유).

UPDATE "organization_assistant_settings"
   SET "default_model" = CASE "default_model"
     WHEN 'claude-opus'   THEN 'claude-opus-4-8'
     WHEN 'claude-sonnet' THEN 'claude-sonnet-5'
     WHEN 'claude-haiku'  THEN 'claude-haiku-4-5-20251001'
     WHEN 'qwen'          THEN 'internal-qwen3'
     ELSE "default_model"
   END
 WHERE "default_model" IN ('claude-opus', 'claude-sonnet', 'claude-haiku', 'qwen');
