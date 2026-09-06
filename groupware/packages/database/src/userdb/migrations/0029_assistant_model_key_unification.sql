-- Custom SQL migration file, put your code below! --

-- AI 어시스턴트 설정에 저장된 **구 모델 key** 를 통일된 key 로 옮긴다.
--
-- 배경: language-model 카탈로그는 짧은 내부 key('claude-opus')를 쓰고, 프론트 옵션(aiModelOptions.ts)
-- 과 단가표(@csc/pricing)는 전체 id('claude-opus-4-8')를 썼다. 두 네임스페이스가 공존해 (a) 응답의
-- 모델 신원이 단가표와 안 맞아 비용이 rate-unknown 으로 새고(실측: 기획서 생성 1건의 금액 미기록),
-- (b) 저장된 선택이 어느 옵션과도 매칭되지 않는 문제가 있었다. 카탈로그 key 를 프론트/단가표 쪽으로
-- 통일했으므로 이미 저장된 값도 함께 옮긴다.
--
-- 옮기지 않으면: 모델 드롭다운이 저장값을 못 찾아 '미선택' 으로 보이고, 관리자가 다시 고르지 않으면
-- 계속 기본 모델로 응답한다(런타임은 구 key 호환 표가 받아주지만 화면과 저장값이 어긋난 채 남는다).
--
-- 데이터 변환이라 schema-only 가 아니라 custom 마이그레이션이다(스키마 변경 없음 → snapshot 영향 없음).

-- 기본 모델(단일 값).
UPDATE "platform_assistant_settings"
   SET "default_model" = CASE "default_model"
     WHEN 'claude-opus'   THEN 'claude-opus-4-8'
     WHEN 'claude-sonnet' THEN 'claude-sonnet-5'
     WHEN 'claude-haiku'  THEN 'claude-haiku-4-5-20251001'
     WHEN 'qwen'          THEN 'internal-qwen3'
     ELSE "default_model"
   END
 WHERE "default_model" IN ('claude-opus', 'claude-sonnet', 'claude-haiku', 'qwen');

-- 허용 모델(jsonb 문자열 배열) — 원소별로 치환한다. 배열 순서는 보존한다(관리자가 정한 표시 순서).
UPDATE "platform_assistant_settings"
   SET "allowed_models" = (
     SELECT jsonb_agg(
              CASE elem #>> '{}'
                WHEN 'claude-opus'   THEN '"claude-opus-4-8"'::jsonb
                WHEN 'claude-sonnet' THEN '"claude-sonnet-5"'::jsonb
                WHEN 'claude-haiku'  THEN '"claude-haiku-4-5-20251001"'::jsonb
                WHEN 'qwen'          THEN '"internal-qwen3"'::jsonb
                ELSE elem
              END
              ORDER BY ord
            )
       FROM jsonb_array_elements("allowed_models") WITH ORDINALITY AS t(elem, ord)
   )
 WHERE "allowed_models" IS NOT NULL
   AND jsonb_typeof("allowed_models") = 'array'
   AND EXISTS (
     SELECT 1
       FROM jsonb_array_elements("allowed_models") AS e(elem)
      WHERE elem #>> '{}' IN ('claude-opus', 'claude-sonnet', 'claude-haiku', 'qwen')
   );
