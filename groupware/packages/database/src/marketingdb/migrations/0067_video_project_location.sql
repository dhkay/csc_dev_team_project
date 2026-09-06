-- 원천 영상에 위치(개인 작업 공간 / 보관함)를 준다.
--
-- 원천과 최종을 가르지 않는 버전(v1.5)에서는 이 표의 행이 곧 그 버전의 완성본이라, 보관함에 담길
-- 물건도 이 표에 있다. 최종 표에 사본을 만들어 담으면 한 영상이 두 표에 생겨, 그 버전이 산출물을
-- 하나로 두기로 한 결정이 무너진다.
--
-- 기존 행은 전부 'personal' 이다(default). 보관함은 이 마이그레이션 뒤에 처음 채워진다.
--
-- 개인 목록 인덱스는 location 을 채널 앞에 끼워 다시 만든다: 개인 목록 질의에
-- location='personal' 이 들어가기 때문이다(최종 표의 인덱스와 동형).
--
-- placed_at 은 0066 이 이미 추가했다. 그 마이그레이션을 --custom 으로 만들면서 스냅샷에 그 컬럼이
-- 들어가지 않아 자동 생성이 여기에 다시 넣으려 했고, 그 줄은 걷어냈다(적용된 환경에서 실패한다).
ALTER TABLE "marketing_video_projects" ADD COLUMN "location" varchar(16) DEFAULT 'personal' NOT NULL;--> statement-breakpoint
DROP INDEX "marketing_video_projects_owner_channel_idx";--> statement-breakpoint
CREATE INDEX "marketing_video_projects_owner_channel_idx" ON "marketing_video_projects" USING btree ("organization_id","owner_user_id","location","channel_id");--> statement-breakpoint
CREATE INDEX "marketing_video_projects_org_location_version_idx" ON "marketing_video_projects" USING btree ("organization_id","location","version_mode");
