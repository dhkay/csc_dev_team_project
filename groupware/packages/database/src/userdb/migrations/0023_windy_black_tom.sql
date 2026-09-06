-- 0023: 부서 트리 무결성 — 복합 FK(같은 조직 부모) + cascade/set null 삭제 정합성
-- 앱이 이미 강제하던 불변식을 DB 로 내린다(이중 안전망). 어떤 쓰기 경로든:
--  · parent_id 는 같은 조직 부서만(복합 FK), 부모 삭제 시 하위 서브트리 cascade
--  · 부서 삭제 시 소속 멤버 자동 미배치(department_id ON DELETE SET NULL)
-- 순서: ① 기존 단일 FK drop → ② 부모 후보키 UNIQUE(복합 FK 참조 대상) → ③ 복합/set-null FK add.

-- ── ① 기존 단일 FK 제거 ──
ALTER TABLE "departments" DROP CONSTRAINT "departments_parent_id_departments_id_fk";
--> statement-breakpoint
ALTER TABLE "organization_users" DROP CONSTRAINT "organization_users_department_id_departments_id_fk";
--> statement-breakpoint

-- ── ② 복합 FK 참조 대상 후보키 (반드시 FK 보다 먼저) ──
ALTER TABLE "departments" ADD CONSTRAINT "departments_id_org_uq" UNIQUE("id","organization_id");
--> statement-breakpoint

-- ── ③ 복합/set-null FK 추가 ──
-- 상위 부서: 같은 조직만 + 부모 삭제 시 하위 서브트리 cascade.
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_org_fk" FOREIGN KEY ("parent_id","organization_id") REFERENCES "public"."departments"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- 멤버 소속: 부서 삭제 시 자동 미배치(단일 FK + set null — 같은 조직은 앱이 강제).
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;
