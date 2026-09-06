import { pgTable, serial, varchar, integer, timestamp, unique, foreignKey } from 'drizzle-orm/pg-core';
import { organizations } from './org-tables';

/**
 * 부서(하위조직) 트리 테이블 (user 서버 소유, userdb): 조직(테넌트) 내부 조직도
 *
 * - 인접리스트 모델. `parent_id` 자기참조이고 null 은 최상위 부서다. 조직도 UI 의 루트는
 *   organizations(기업)이고 그 아래 부서들이 이 테이블의 트리다.
 * - `organization_id` 로 테넌트 격리. 한 유저는 부서 1개 소속이다(null = 미배치).
 * - 상위 부서는 같은 조직만. parent 를 (parent_id, organization_id) 복합 FK 로 못 박아 다른 조직
 *   부서를 부모로 지정하는 것을 DB 가 거부한다(앱 검증과 이중).
 * - 삭제는 서브트리 cascade. parent FK 가 ON DELETE CASCADE 라 raw SQL 을 포함해 어떤 경로로
 *   부모를 지워도 하위 부서 전체가 자동 삭제된다. 소속 멤버는 SET NULL 로 미배치가 된다.
 * - 조직 하드 삭제도 cascade. organization_id FK 가 ON DELETE CASCADE 라 조직을 지우면 그 조직의
 *   부서가 트리 전체 자동 삭제된다. 이것이 없으면 부서 있는 조직 purge 가 FK 위반으로 실패한다.
 * - 순환 방지는 순수 FK 로 불가하므로 서비스가 강제한다(자기와 자손 하위로 이동 금지).
 */
export const departments = pgTable(
  'departments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // 상위 부서: null 이면 최상위(회사 바로 아래). 같은 조직 강제 + cascade 는 아래 parentFk 참조
    parentId: integer('parent_id'),
    name: varchar('name', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // 자기참조 parent 복합 FK 가 참조하는 후보키: (id, organization_id)
    // (멤버 organization_users.department_id 는 단일 FK→id 라 이 후보키를 쓰지 않는다.)
    idOrgUq: unique('departments_id_org_uq').on(t.id, t.organizationId),
    // 상위 부서 자기참조 복합 FK: 부모는 같은 조직만, 부모 삭제 시 하위 서브트리 cascade.
    parentFk: foreignKey({
      columns: [t.parentId, t.organizationId],
      foreignColumns: [t.id, t.organizationId],
      name: 'departments_parent_org_fk',
    }).onDelete('cascade'),
  }),
);
