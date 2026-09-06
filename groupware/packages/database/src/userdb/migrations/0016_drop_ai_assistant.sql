-- AI 도구 카탈로그를 '마케팅 영상 제작'(marketing-video) 하나로 축소.
-- 'ai-assistant' 행 삭제 — organization_ai_tools / organization_user_ai_tools 로 FK cascade 정리됨.
DELETE FROM "ai_tools" WHERE "key" = 'ai-assistant';
