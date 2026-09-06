-- 0009: org/service 비정규화 무결성 — 복합 FK 강제
-- labels.organization_id / service_users.organization_id 가 그 service 의 org 와 항상 일치하도록,
-- service_user_labels 의 유저·라벨이 동일 service 에 속하도록 DB 레벨에서 못 박는다.
-- 순서: ① 부모 UNIQUE(id, scope) 추가 → ② 자식 단일 FK drop → ③ 자식 복합 FK add.

-- ── ① 부모 후보키 (복합 FK 참조 대상 UNIQUE) ──
ALTER TABLE "services" ADD CONSTRAINT "services_id_org_uq" UNIQUE ("id","organization_id");--> statement-breakpoint
ALTER TABLE "service_users" ADD CONSTRAINT "service_users_id_service_uq" UNIQUE ("id","service_id");--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_id_service_uq" UNIQUE ("id","service_id");--> statement-breakpoint

-- ── ② 0008 의 단일 FK 제거 ──
ALTER TABLE "labels" DROP CONSTRAINT "labels_service_id_services_id_fk";--> statement-breakpoint
ALTER TABLE "labels" DROP CONSTRAINT "labels_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "service_users" DROP CONSTRAINT "service_users_service_id_services_id_fk";--> statement-breakpoint
ALTER TABLE "service_users" DROP CONSTRAINT "service_users_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "service_user_labels" DROP CONSTRAINT "service_user_labels_service_user_id_service_users_id_fk";--> statement-breakpoint
ALTER TABLE "service_user_labels" DROP CONSTRAINT "service_user_labels_label_id_labels_id_fk";--> statement-breakpoint
ALTER TABLE "service_user_labels" DROP CONSTRAINT "service_user_labels_service_id_services_id_fk";--> statement-breakpoint

-- ── ③ 복합 FK 추가 (모두 ON DELETE CASCADE) ──
ALTER TABLE "labels" ADD CONSTRAINT "labels_service_org_services_fk"
  FOREIGN KEY ("service_id","organization_id") REFERENCES "public"."services"("id","organization_id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_users" ADD CONSTRAINT "service_users_service_org_services_fk"
  FOREIGN KEY ("service_id","organization_id") REFERENCES "public"."services"("id","organization_id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_user_labels" ADD CONSTRAINT "service_user_labels_su_service_fk"
  FOREIGN KEY ("service_user_id","service_id") REFERENCES "public"."service_users"("id","service_id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_user_labels" ADD CONSTRAINT "service_user_labels_label_service_fk"
  FOREIGN KEY ("label_id","service_id") REFERENCES "public"."labels"("id","service_id")
  ON DELETE cascade ON UPDATE no action;
