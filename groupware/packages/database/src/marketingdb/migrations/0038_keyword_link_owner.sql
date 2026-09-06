-- 키워드 소유를 링크로 내린다: 키워드는 사람마다 다르고 채널마다도 따로다.
-- 파트를 없애면서(0037) 소유가 함께 사라졌는데, 스코프 키는 (사람, 채널) 둘이어야 한다.
-- 기존 링크는 파트 시절 주인이 없던 것들이라 owner NULL(조직 공용)로 남는다.

ALTER TABLE "marketing_channel_keyword_links" ADD COLUMN "owner_user_id" integer;--> statement-breakpoint

-- 복합 PK 해제: 같은 채널에 같은 단어를 여러 사람이 각자 담을 수 있어야 한다.
ALTER TABLE "marketing_channel_keyword_links" DROP CONSTRAINT "marketing_channel_keyword_links_keyword_id_channel_id_pk";--> statement-breakpoint

-- 중복 차단은 부분 유니크 둘로 스코프를 갈라 건다.
--   하나로 (keyword_id, channel_id, owner_user_id) 만 걸면 Postgres 가 NULL 을 서로 다른 값으로 봐서
--   레거시(owner NULL) 링크끼리 중복이 뚫린다.
CREATE UNIQUE INDEX "marketing_channel_keyword_links_owner_uq" ON "marketing_channel_keyword_links" USING btree ("keyword_id","channel_id","owner_user_id") WHERE "marketing_channel_keyword_links"."owner_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_channel_keyword_links_legacy_uq" ON "marketing_channel_keyword_links" USING btree ("keyword_id","channel_id") WHERE "marketing_channel_keyword_links"."owner_user_id" is null;--> statement-breakpoint
CREATE INDEX "marketing_channel_keyword_links_owner_channel_idx" ON "marketing_channel_keyword_links" USING btree ("organization_id","owner_user_id","channel_id");
