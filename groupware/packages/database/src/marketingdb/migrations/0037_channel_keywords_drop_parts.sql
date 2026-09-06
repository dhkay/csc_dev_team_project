-- 파트 제거: 키워드를 채널에 직접 붙인다.
-- 채널 → 파트 → 키워드 였던 계층에서 가운데를 걷어낸다. 키워드를 사람이 손으로 담는 화면이
-- 사라지면서(생성은 인사이트에서 한다) 파트가 남길 이유가 없어졌다.
-- 파트에 달려 있던 소유(owner_user_id)도 함께 사라진다: 키워드는 채널의 것이고 조직이 공유한다.

CREATE TABLE "marketing_channel_keyword_links" (
	"keyword_id" integer NOT NULL,
	"channel_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_channel_keyword_links_keyword_id_channel_id_pk" PRIMARY KEY("keyword_id","channel_id")
);
--> statement-breakpoint
ALTER TABLE "marketing_channel_keyword_links" ADD CONSTRAINT "marketing_channel_keyword_links_keyword_id_marketing_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."marketing_keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_channel_keyword_links" ADD CONSTRAINT "marketing_channel_keyword_links_channel_id_marketing_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."marketing_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_channel_keyword_links_channel_idx" ON "marketing_channel_keyword_links" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "marketing_channel_keyword_links_org_idx" ON "marketing_channel_keyword_links" USING btree ("organization_id");--> statement-breakpoint

-- 기존 링크 이관: 파트가 속한 채널로 옮긴다. 여러 파트가 같은 키워드를 담고 있었으면 한 줄로 합쳐진다.
INSERT INTO "marketing_channel_keyword_links" ("keyword_id", "channel_id", "organization_id", "created_at")
SELECT l."keyword_id", p."channel_id", p."organization_id", MIN(l."created_at")
  FROM "marketing_part_keyword_links" l
  JOIN "marketing_channel_parts" p ON p."id" = l."part_id"
 GROUP BY l."keyword_id", p."channel_id", p."organization_id"
ON CONFLICT DO NOTHING;--> statement-breakpoint

DROP TABLE "marketing_part_keyword_links";--> statement-breakpoint
DROP TABLE "marketing_channel_parts";--> statement-breakpoint

-- 어느 채널에도 안 달린 키워드 값은 정리한다(파트만 있고 링크가 없던 잔여물).
DELETE FROM "marketing_keywords" k
 WHERE NOT EXISTS (
   SELECT 1 FROM "marketing_channel_keyword_links" l WHERE l."keyword_id" = k."id"
 );
