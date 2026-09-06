-- 파트 → 채널 리네임(데이터 보존) + 사용자별 활성 채널 테이블.
--   marketing_keyword_parts       → marketing_channels
--   marketing_keyword_part_links  → marketing_channel_keyword_links (part_id → channel_id)
-- RENAME 이라 기존 채널(구 파트)/키워드/링크 데이터가 그대로 보존된다. 제약/인덱스명도 함께 정리.
ALTER TABLE "marketing_keyword_parts" RENAME TO "marketing_channels";--> statement-breakpoint
ALTER TABLE "marketing_channels" RENAME CONSTRAINT "marketing_keyword_parts_org_name_uq" TO "marketing_channels_org_name_uq";--> statement-breakpoint
ALTER INDEX "marketing_keyword_parts_org_idx" RENAME TO "marketing_channels_org_idx";--> statement-breakpoint
ALTER TABLE "marketing_keyword_part_links" RENAME TO "marketing_channel_keyword_links";--> statement-breakpoint
ALTER TABLE "marketing_channel_keyword_links" RENAME COLUMN "part_id" TO "channel_id";--> statement-breakpoint
ALTER TABLE "marketing_channel_keyword_links" RENAME CONSTRAINT "marketing_keyword_part_links_keyword_id_part_id_pk" TO "marketing_channel_keyword_links_keyword_id_channel_id_pk";--> statement-breakpoint
ALTER TABLE "marketing_channel_keyword_links" RENAME CONSTRAINT "marketing_keyword_part_links_keyword_id_marketing_keywords_id_fk" TO "marketing_channel_keyword_links_keyword_id_marketing_keywords_id_fk";--> statement-breakpoint
ALTER TABLE "marketing_channel_keyword_links" RENAME CONSTRAINT "marketing_keyword_part_links_part_id_marketing_keyword_parts_id_fk" TO "marketing_channel_keyword_links_channel_id_marketing_channels_id_fk";--> statement-breakpoint
ALTER INDEX "marketing_keyword_part_links_part_idx" RENAME TO "marketing_channel_keyword_links_channel_idx";--> statement-breakpoint
ALTER INDEX "marketing_keyword_part_links_org_idx" RENAME TO "marketing_channel_keyword_links_org_idx";--> statement-breakpoint
CREATE TABLE "marketing_active_channels" (
	"organization_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"channel_id" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_active_channels_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);--> statement-breakpoint
ALTER TABLE "marketing_active_channels" ADD CONSTRAINT "marketing_active_channels_channel_id_marketing_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."marketing_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_active_channels_channel_idx" ON "marketing_active_channels" USING btree ("channel_id");
