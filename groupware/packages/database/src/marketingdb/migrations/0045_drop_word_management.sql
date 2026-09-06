-- 단어관리(지식백과 + 금지어) 기능 폐기: 읽는 코드가 사라져 테이블만 남으면 죽은 스키마가 된다.
-- 기획서 생성은 이 데이터를 쓰지 않으므로 생성 결과에 영향이 없다.
DROP TABLE "marketing_banned_words" CASCADE;--> statement-breakpoint
DROP TABLE "marketing_channel_banned_word_links" CASCADE;--> statement-breakpoint
DROP TABLE "marketing_knowledge_entries" CASCADE;