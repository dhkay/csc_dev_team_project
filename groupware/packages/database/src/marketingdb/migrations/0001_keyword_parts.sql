CREATE TABLE "marketing_keyword_part_links" (
	"keyword_id" integer NOT NULL,
	"part_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_keyword_part_links_keyword_id_part_id_pk" PRIMARY KEY("keyword_id","part_id")
);
--> statement-breakpoint
CREATE TABLE "marketing_keyword_parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_keyword_parts_org_name_uq" UNIQUE("organization_id","name")
);
--> statement-breakpoint
ALTER TABLE "marketing_keyword_part_links" ADD CONSTRAINT "marketing_keyword_part_links_keyword_id_marketing_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."marketing_keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_keyword_part_links" ADD CONSTRAINT "marketing_keyword_part_links_part_id_marketing_keyword_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."marketing_keyword_parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_keyword_part_links_part_idx" ON "marketing_keyword_part_links" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "marketing_keyword_part_links_org_idx" ON "marketing_keyword_part_links" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "marketing_keyword_parts_org_idx" ON "marketing_keyword_parts" USING btree ("organization_id");--> statement-breakpoint
-- 백필(무손실): 기존 키워드가 있는 조직마다 기본 파트('기본') 1개 생성 후 그 조직의 전 키워드를 연결.
INSERT INTO "marketing_keyword_parts" ("organization_id", "name")
SELECT DISTINCT "organization_id", '기본'
FROM "marketing_keywords"
ON CONFLICT ("organization_id", "name") DO NOTHING;--> statement-breakpoint
INSERT INTO "marketing_keyword_part_links" ("keyword_id", "part_id", "organization_id")
SELECT k."id", p."id", k."organization_id"
FROM "marketing_keywords" k
JOIN "marketing_keyword_parts" p
  ON p."organization_id" = k."organization_id" AND p."name" = '기본'
ON CONFLICT ("keyword_id", "part_id") DO NOTHING;
