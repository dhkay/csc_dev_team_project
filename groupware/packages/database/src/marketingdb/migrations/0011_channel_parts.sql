CREATE TABLE "marketing_channel_parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"channel_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_channel_parts_channel_name_uq" UNIQUE("channel_id","name")
);
--> statement-breakpoint
CREATE TABLE "marketing_part_keyword_links" (
	"keyword_id" integer NOT NULL,
	"part_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_part_keyword_links_keyword_id_part_id_pk" PRIMARY KEY("keyword_id","part_id")
);
--> statement-breakpoint
ALTER TABLE "marketing_channel_parts" ADD CONSTRAINT "marketing_channel_parts_channel_id_marketing_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."marketing_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_part_keyword_links" ADD CONSTRAINT "marketing_part_keyword_links_keyword_id_marketing_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."marketing_keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_part_keyword_links" ADD CONSTRAINT "marketing_part_keyword_links_part_id_marketing_channel_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."marketing_channel_parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_channel_parts_channel_idx" ON "marketing_channel_parts" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "marketing_channel_parts_org_idx" ON "marketing_channel_parts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "marketing_part_keyword_links_part_idx" ON "marketing_part_keyword_links" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "marketing_part_keyword_links_org_idx" ON "marketing_part_keyword_links" USING btree ("organization_id");--> statement-breakpoint
-- 백필(무손실): 모든 채널마다 기본 파트('기본') 1개 생성.
INSERT INTO "marketing_channel_parts" ("organization_id", "channel_id", "name", "sort_order")
SELECT "organization_id", "id", '기본', 0
FROM "marketing_channels"
ON CONFLICT ("channel_id", "name") DO NOTHING;--> statement-breakpoint
-- 기존 채널↔키워드 링크를 그 채널의 '기본' 파트로 이관(무손실).
INSERT INTO "marketing_part_keyword_links" ("keyword_id", "part_id", "organization_id")
SELECT l."keyword_id", p."id", l."organization_id"
FROM "marketing_channel_keyword_links" l
JOIN "marketing_channel_parts" p
  ON p."channel_id" = l."channel_id" AND p."name" = '기본'
ON CONFLICT ("keyword_id", "part_id") DO NOTHING;
