-- 목적 키워드 저장을 걷어낸다.
-- 기획서 생성 위저드는 열 때마다 초기화되고, 키워드는 그때 키워드 생성 창에서 골라 생성 요청에
-- 실어 보낸다. 채널에 남겨 둘 이유가 없어졌다(다음에 열면 어차피 다시 고른다).
-- 금지어는 그대로 남는다(채널 설정이라 성격이 다르다).

DROP TABLE "marketing_channel_keyword_links";--> statement-breakpoint
DROP TABLE "marketing_keywords";
