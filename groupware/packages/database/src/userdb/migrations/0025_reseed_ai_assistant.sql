-- AI 도구 카탈로그에 'ai-assistant'(AI 어시스턴트) 재도입 — 0016 에서 드롭했던 행을 되살린다.
-- 챗봇을 marketing-video 와 대칭인 정식 엔타이틀먼트 AI 도구로 승격(조직/유저 단위 인가 대상).
-- 멱등: 이미 있으면 재활성화만(부팅 시 CatalogSeederService 도 동일하게 보강한다).
INSERT INTO "ai_tools" ("key", "name", "slug", "description", "is_active", "sort_order")
VALUES ('ai-assistant', 'AI 어시스턴트', 'ai-assistant', 'AI 챗봇 어시스턴트(대화형 LLM)', true, 20)
ON CONFLICT ("key") DO UPDATE SET "is_active" = true;
