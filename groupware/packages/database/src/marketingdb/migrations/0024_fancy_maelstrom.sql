CREATE TABLE "marketing_asset_axes" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" varchar(32) NOT NULL,
	"key" varchar(40) NOT NULL,
	"label" varchar(100) NOT NULL,
	"hint" varchar(200) DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_asset_axes_category_key_uq" UNIQUE("category","key")
);
--> statement-breakpoint
CREATE TABLE "marketing_asset_packs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(300) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" varchar(16) DEFAULT 'DRAFT' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_asset_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"axis_id" integer NOT NULL,
	"value" varchar(60) NOT NULL,
	"label" varchar(100) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_asset_tags_axis_value_uq" UNIQUE("axis_id","value")
);
--> statement-breakpoint
CREATE TABLE "marketing_common_asset_tags" (
	"common_asset_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_common_asset_tags_common_asset_id_tag_id_pk" PRIMARY KEY("common_asset_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "marketing_organization_asset_packs" (
	"organization_id" integer NOT NULL,
	"pack_id" integer NOT NULL,
	"source" varchar(8) DEFAULT 'GRANT' NOT NULL,
	"granted_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_organization_asset_packs_organization_id_pack_id_pk" PRIMARY KEY("organization_id","pack_id")
);
--> statement-breakpoint
ALTER TABLE "marketing_asset_sets" ADD COLUMN "pack_id" integer;--> statement-breakpoint
ALTER TABLE "marketing_common_assets" ADD COLUMN "pack_id" integer;--> statement-breakpoint
ALTER TABLE "marketing_asset_tags" ADD CONSTRAINT "marketing_asset_tags_axis_id_marketing_asset_axes_id_fk" FOREIGN KEY ("axis_id") REFERENCES "public"."marketing_asset_axes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_common_asset_tags" ADD CONSTRAINT "marketing_common_asset_tags_common_asset_id_marketing_common_assets_id_fk" FOREIGN KEY ("common_asset_id") REFERENCES "public"."marketing_common_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_common_asset_tags" ADD CONSTRAINT "marketing_common_asset_tags_tag_id_marketing_asset_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."marketing_asset_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_organization_asset_packs" ADD CONSTRAINT "marketing_organization_asset_packs_pack_id_marketing_asset_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."marketing_asset_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_asset_axes_category_idx" ON "marketing_asset_axes" USING btree ("category","sort_order");--> statement-breakpoint
CREATE INDEX "marketing_asset_tags_axis_idx" ON "marketing_asset_tags" USING btree ("axis_id","sort_order");--> statement-breakpoint
CREATE INDEX "marketing_common_asset_tags_tag_idx" ON "marketing_common_asset_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "marketing_organization_asset_packs_org_idx" ON "marketing_organization_asset_packs" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "marketing_asset_sets" ADD CONSTRAINT "marketing_asset_sets_pack_id_marketing_asset_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."marketing_asset_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_common_assets" ADD CONSTRAINT "marketing_common_assets_pack_id_marketing_asset_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."marketing_asset_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ── 시드: 초기 축(BGM 4, 효과음 3) ── (custom seed, 자동생성 아님)
INSERT INTO "marketing_asset_axes" ("category","key","label","hint","sort_order") VALUES
	('BGM','mood','분위기','예: 잔잔한, 밝은, 웅장한',10),
	('BGM','tempo','템포','예: 느림(~70bpm), 미디엄, 빠름',20),
	('BGM','genre','장르','예: 팝, 인디, EDM, 어쿠스틱',30),
	('BGM','usage','용도','예: 감성 브이로그, 제품 광고',40),
	('SFX','type','유형','예: 클릭, 팝, 딩(알림), 휙(전환), 타이핑, 박수',10),
	('SFX','usage','용도','예: 씬 전환, 자막 강조, 인트로, 아웃트로, 버튼/CTA',20),
	('SFX','mood','분위기','예: 밝은, 코믹, 긴장, 부드러운',30);--> statement-breakpoint
INSERT INTO "marketing_asset_tags" ("axis_id","value","label","sort_order")
SELECT a.id, t.value, t.value, t.sort_order FROM "marketing_asset_axes" a
CROSS JOIN (VALUES ('잔잔한',10),('밝은',20),('웅장한',30),('감성적',40),('신나는',50)) AS t(value, sort_order)
WHERE a.category='BGM' AND a.key='mood';--> statement-breakpoint
INSERT INTO "marketing_asset_tags" ("axis_id","value","label","sort_order")
SELECT a.id, t.value, t.value, t.sort_order FROM "marketing_asset_axes" a
CROSS JOIN (VALUES ('느림',10),('미디엄',20),('빠름',30)) AS t(value, sort_order)
WHERE a.category='BGM' AND a.key='tempo';--> statement-breakpoint
INSERT INTO "marketing_asset_tags" ("axis_id","value","label","sort_order")
SELECT a.id, t.value, t.value, t.sort_order FROM "marketing_asset_axes" a
CROSS JOIN (VALUES ('팝',10),('인디',20),('EDM',30),('어쿠스틱',40),('로파이',50),('힙합',60)) AS t(value, sort_order)
WHERE a.category='BGM' AND a.key='genre';--> statement-breakpoint
INSERT INTO "marketing_asset_tags" ("axis_id","value","label","sort_order")
SELECT a.id, t.value, t.value, t.sort_order FROM "marketing_asset_axes" a
CROSS JOIN (VALUES ('감성 브이로그',10),('제품 광고',20),('인트로',30),('아웃트로',40)) AS t(value, sort_order)
WHERE a.category='BGM' AND a.key='usage';--> statement-breakpoint
INSERT INTO "marketing_asset_tags" ("axis_id","value","label","sort_order")
SELECT a.id, t.value, t.value, t.sort_order FROM "marketing_asset_axes" a
CROSS JOIN (VALUES ('클릭',10),('팝',20),('딩',30),('휙',40),('타이핑',50),('박수',60)) AS t(value, sort_order)
WHERE a.category='SFX' AND a.key='type';--> statement-breakpoint
INSERT INTO "marketing_asset_tags" ("axis_id","value","label","sort_order")
SELECT a.id, t.value, t.value, t.sort_order FROM "marketing_asset_axes" a
CROSS JOIN (VALUES ('씬 전환',10),('자막 강조',20),('인트로',30),('아웃트로',40),('버튼/CTA',50)) AS t(value, sort_order)
WHERE a.category='SFX' AND a.key='usage';--> statement-breakpoint
INSERT INTO "marketing_asset_tags" ("axis_id","value","label","sort_order")
SELECT a.id, t.value, t.value, t.sort_order FROM "marketing_asset_axes" a
CROSS JOIN (VALUES ('밝은',10),('코믹',20),('긴장',30),('부드러운',40)) AS t(value, sort_order)
WHERE a.category='SFX' AND a.key='mood';