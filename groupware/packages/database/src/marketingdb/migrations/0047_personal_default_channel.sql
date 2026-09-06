-- 진입 시 먼저 열릴 채널을 조직 공유(대표 채널)에서 개인 설정으로 옮긴다.
-- 무엇을 먼저 볼지는 각자의 작업 습관이라 팀장이 정할 일이 아니었다.
-- 유니크 제약 이름은 구 테이블명을 유지한다(rename 이 제약명을 바꾸지 않는다): 이름은 식별자일 뿐이고
-- 바꾸려면 DROP/ADD 가 필요해 얻는 것 없이 위험만 는다.
ALTER TABLE "marketing_user_ai_models" RENAME TO "marketing_user_tool_settings";--> statement-breakpoint
ALTER TABLE "marketing_user_tool_settings" ADD COLUMN "default_channel_id" integer;--> statement-breakpoint
ALTER TABLE "marketing_channels" DROP COLUMN "is_default";