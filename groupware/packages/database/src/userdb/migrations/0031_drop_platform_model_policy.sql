-- 플랫폼 AI 어시스턴트 전역 설정에서 모델 정책(허용 목록/전역 기본 모델)을 제거한다.
--   allowed_models: 외부 모델은 조직이 자기 API 키를 등록해야만 동작하므로 플랫폼 화이트리스트가
--     실효 없이 설정 화면만 늘렸다(내부 모델은 하나뿐이라 좁힐 대상도 없다).
--   default_model: 조직이 안 정했을 때의 기본은 language-model 카탈로그 기본(내장 Qwen)이면 충분하다.
-- 남는 전역 설정은 킬스위치(global_enabled)와 공통 프롬프트(common_prompt) 둘뿐이고,
-- 모델 선택은 조직(organization_assistant_settings.default_model) 몫이 된다.
ALTER TABLE "platform_assistant_settings" DROP COLUMN "default_model";--> statement-breakpoint
ALTER TABLE "platform_assistant_settings" DROP COLUMN "allowed_models";
