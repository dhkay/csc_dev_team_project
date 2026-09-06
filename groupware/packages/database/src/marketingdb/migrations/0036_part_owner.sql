-- 단어관리 개인화: 파트(그리고 그 아래 키워드 링크)를 개인 소유로.
--
-- owner_user_id 는 userdb organization_users.id 값이다. 크로스-DB FK 는 걸지 않는다
-- (saved_plans/video_projects/video_finals 의 owner_user_id 와 같은 관례).
--
-- **nullable 로 두는 이유**: "기존 파트를 조직 루트에게 귀속"하려면 조직별 ROOT 유저 id 가 필요한데
-- 그건 userdb 에 있고 여기서 조회할 수 없다(DB 소유권 경계). NULL = 레거시 조직 공용으로 정의해
-- 운영자가 아래 귀속 문을 돌리기 전까지는 지금과 똑같이 전원이 보고 편집한다. 잊어도 데이터가
-- 사라지지 않는 방향으로 degrade 한다. NOT NULL 승격은 전 조직 귀속이 끝난 뒤 후속 마이그레이션에서.
--
-- **배포 후 1회, 조직마다** (org 의 개발관리자 organization_users.id 를 userdb 에서 확인해 넣는다):
--   UPDATE marketing_channel_parts SET owner_user_id = <root_user_id>
--    WHERE organization_id = <org_id> AND owner_user_id IS NULL;
-- 이 문을 돌리면 그 조직의 다른 구성원에게는 레거시 파트가 안 보인다(의도된 결과).
-- 각자는 단어관리에 처음 들어갈 때 자기 '기본' 파트를 자동으로 받는다.
--
-- 유니크를 부분 인덱스 둘로 가르는 이유: 하나로 (channel_id, owner_user_id, name) 을 걸면
-- Postgres 가 NULL 을 서로 다른 값으로 봐서 레거시끼리 이름 중복이 뚫린다.
ALTER TABLE "marketing_channel_parts" DROP CONSTRAINT "marketing_channel_parts_channel_name_uq";--> statement-breakpoint
ALTER TABLE "marketing_channel_parts" ADD COLUMN "owner_user_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_channel_parts_legacy_name_uq" ON "marketing_channel_parts" USING btree ("channel_id","name") WHERE "marketing_channel_parts"."owner_user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_channel_parts_owner_name_uq" ON "marketing_channel_parts" USING btree ("channel_id","owner_user_id","name") WHERE "marketing_channel_parts"."owner_user_id" is not null;--> statement-breakpoint
CREATE INDEX "marketing_channel_parts_owner_channel_idx" ON "marketing_channel_parts" USING btree ("organization_id","owner_user_id","channel_id");