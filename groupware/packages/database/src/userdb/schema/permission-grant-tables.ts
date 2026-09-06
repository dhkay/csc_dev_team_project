import { pgTable, integer, timestamp, primaryKey, foreignKey } from 'drizzle-orm/pg-core';
import { departments } from './department-tables';
import { organizationUsers } from './organization-user-tables';
import { permissions } from './permission-tables';

/**
 * 권한 부여 (user 서버 소유, userdb): "누가 어떤 권한을 갖는가". 설계: .claude/rules/multi-tenancy.md
 *
 * 2가지 부여 대상:
 *  - 부서 부여(department_permissions): 부서(조직도 노드)에 부여. 그 부서 + 하위 부서 소속 조직원이 상속
 *  - 멤버 직접 부여(organization_user_permissions): 특정 일반관리자에게 직접 부여(부서 무관)
 *
 * 유효 권한 = 멤버 부서 조상 체인의 부서 부여 ∪ 멤버 직접 부여, ∩ permissions.is_active.
 * (features 와 달리 부모 organization_permissions 테이블이 없어 유저 부여는 직접: orgGrantFk 없음.)
 */

/** 부서 권한 부여 */
export const departmentPermissions = pgTable(
  'department_permissions',
  {
    departmentId: integer('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'cascade' }),
    permissionId: integer('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    // 부여 주체(organization_users.id 값, 감사용)
    grantedBy: integer('granted_by'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.departmentId, t.permissionId] }),
  }),
);

/**
 * 멤버 직접 권한 부여 (조직→유저, presence=enabled)
 * organization_id 는 복합 FK 불변식(유저-조직 일치) 충족용: grant 스코프 컬럼 아님
 */
export const organizationUserPermissions = pgTable(
  'organization_user_permissions',
  {
    organizationId: integer('organization_id').notNull(),
    userId: integer('user_id').notNull(),
    permissionId: integer('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    // 배정 주체(organization_users.id 값, 감사용)
    assignedBy: integer('assigned_by'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.permissionId] }),
    // 유저 삭제 cascade + 토글의 organization_id 가 그 유저의 조직과 일치하도록 강제
    userOrgFk: foreignKey({
      columns: [t.userId, t.organizationId],
      foreignColumns: [organizationUsers.id, organizationUsers.organizationId],
      name: 'org_user_permissions_user_org_fk',
    }).onDelete('cascade'),
  }),
);
