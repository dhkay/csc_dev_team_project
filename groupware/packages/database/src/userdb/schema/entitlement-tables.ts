import {
  pgTable,
  integer,
  boolean,
  timestamp,
  primaryKey,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { organizations } from './org-tables';
import { organizationUsers } from './organization-user-tables';
import { departments } from './department-tables';
import { features } from './feature-tables';
import { aiTools } from './ai-tool-tables';

/**
 * 엔타이틀먼트 (user 서버 소유, userdb): "누가 어떤 기능/AI도구에 접근하는가".
 * 설계: .claude/rules/multi-tenancy.md
 *
 * 조직 grant(organization_*): 플랫폼이 조직에 기능/도구를 부여(availability)
 *  - 기능(features): `applies_to_all` 로 부여 방식 선택(true=조직 전원 일괄 / false=유저 토글)
 *  - AI도구(ai_tools): 조직 부여 = 플랫폼이 조직에 사용 인가(availability)만(전원 일괄 개념 없음)
 *    실제 사용 여부는 조직이 내부에서 부서 부여(하위 부서 상속) OR 유저 직접 부여로 정한다.
 *    (권한과는 별개 메커니즘: 자체 테이블/resolve. 부서 상속 계산만 공유). 루트관리자, 대표(representative)는 조직 보유 도구 전부
 *
 * 유효 접근:
 *  - 기능 = 조직 grant 존재 AND (applies_to_all OR 유저 토글 존재)
 *  - AI도구 = 조직 grant 존재 AND (부서 부여 OR 유저 부여). ROOT/대표는 예외(전체)
 */

/** 조직 기능 grant (플랫폼→조직) */
export const organizationFeatures = pgTable(
  'organization_features',
  {
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    featureId: integer('feature_id')
      .notNull()
      .references(() => features.id, { onDelete: 'cascade' }),
    // true=조직 전원 일괄, false=지정 유저만(유저 토글로 선택)
    appliesToAll: boolean('applies_to_all').notNull().default(false),
    // 부여 주체(admin_users.id 값, 감사용): 크로스 DB 라 FK 없음
    grantedBy: integer('granted_by'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.featureId] }),
  }),
);

/**
 * 조직 AI도구 grant (플랫폼→조직) = availability("이 조직이 이 도구를 쓸 수 있다") 만
 * 유저 접근은 부서/유저 부여(department_ai_tools / organization_user_ai_tools)로만 결정된다(applies_to_all 없음)
 */
export const organizationAiTools = pgTable(
  'organization_ai_tools',
  {
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    aiToolId: integer('ai_tool_id')
      .notNull()
      .references(() => aiTools.id, { onDelete: 'cascade' }),
    grantedBy: integer('granted_by'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.aiToolId] }),
  }),
);

/**
 * 유저 기능 토글 (조직→유저, presence=enabled). applies_to_all=false 인 grant 에서 "지정 유저" 선택용
 * 무결성:
 *  - orgGrantFk (organization_id, feature_id)→organization_features : "조직이 부여받은 기능에만 토글"(2단계 불변식). 조직 grant 해제 시 cascade.
 *  - userOrgFk (user_id, organization_id)→organization_users(id, organization_id) : 토글의 organization_id 가 그 유저의 조직과 일치하도록 강제
 */
export const organizationUserFeatures = pgTable(
  'organization_user_features',
  {
    organizationId: integer('organization_id').notNull(),
    userId: integer('user_id').notNull(),
    featureId: integer('feature_id').notNull(),
    // 배정 주체(organization_users.id 값, 감사용)
    assignedBy: integer('assigned_by'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.featureId] }),
    orgGrantFk: foreignKey({
      columns: [t.organizationId, t.featureId],
      foreignColumns: [organizationFeatures.organizationId, organizationFeatures.featureId],
      name: 'org_user_features_org_grant_fk',
    }).onDelete('cascade'),
    userOrgFk: foreignKey({
      columns: [t.userId, t.organizationId],
      foreignColumns: [organizationUsers.id, organizationUsers.organizationId],
      name: 'org_user_features_user_org_fk',
    }).onDelete('cascade'),
  }),
);

/**
 * 팀(부서) AI도구 부여 (조직→부서): 조직이 부서 단위로 사용 부여
 * 그 부서 + 하위 부서 소속 조직원이 상속(토큰 해석이 부서 조상 체인으로 계산)
 * 무결성:
 *  - orgGrantFk (organization_id, ai_tool_id)→organization_ai_tools : "조직이 부여받은 도구에만 팀 부여"(2단계). 조직 grant 해제 시 cascade.
 *  - department_id→departments.id : 부서 삭제 시 cascade. (부서 org 불변이라 organization_id 일관성은 서비스가 보장.)
 */
export const departmentAiTools = pgTable(
  'department_ai_tools',
  {
    organizationId: integer('organization_id').notNull(),
    departmentId: integer('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'cascade' }),
    aiToolId: integer('ai_tool_id').notNull(),
    // 부여 주체(organization_users.id 값, 감사용)
    grantedBy: integer('granted_by'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.departmentId, t.aiToolId] }),
    orgGrantFk: foreignKey({
      columns: [t.organizationId, t.aiToolId],
      foreignColumns: [organizationAiTools.organizationId, organizationAiTools.aiToolId],
      name: 'department_ai_tools_org_grant_fk',
    }).onDelete('cascade'),
  }),
);

/** 유저 AI도구 토글 (조직→유저): organizationUserFeatures 와 동형 */
export const organizationUserAiTools = pgTable(
  'organization_user_ai_tools',
  {
    organizationId: integer('organization_id').notNull(),
    userId: integer('user_id').notNull(),
    aiToolId: integer('ai_tool_id').notNull(),
    assignedBy: integer('assigned_by'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.aiToolId] }),
    orgGrantFk: foreignKey({
      columns: [t.organizationId, t.aiToolId],
      foreignColumns: [organizationAiTools.organizationId, organizationAiTools.aiToolId],
      name: 'org_user_ai_tools_org_grant_fk',
    }).onDelete('cascade'),
    userOrgFk: foreignKey({
      columns: [t.userId, t.organizationId],
      foreignColumns: [organizationUsers.id, organizationUsers.organizationId],
      name: 'org_user_ai_tools_user_org_fk',
    }).onDelete('cascade'),
  }),
);
