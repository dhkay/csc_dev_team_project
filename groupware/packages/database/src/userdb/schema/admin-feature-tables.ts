import {
  pgTable,
  serial,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { adminUsers } from './admin-user-tables';

/**
 * 플랫폼 관리자 옵션 (user 서버 소유, userdb): admin_users 전용
 * groupware 엔타이틀먼트(features/organization_*)와 완전 분리된 별도 테이블
 * 플랫폼 관리 영역(조직 관리/AI도구 관리 등) 접근권을 관리자별로 부여한다.
 * ROOT 는 옵션 행 없이도 전체 보유(코드 규칙). ADMIN 은 grant 된 것만
 * 설계: .claude/rules/multi-tenancy.md
 */

/** 플랫폼 관리자 옵션 카탈로그 (글로벌: feature-tables 의 features 와 동형, 그러나 별개) */
export const adminFeatures = pgTable('admin_features', {
  id: serial('id').primaryKey(),
  // 안정 식별자: 코드/사이드바/가드가 참조(예: 'org-management','ai-tools-management')
  key: varchar('key', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** 플랫폼 관리자별 옵션 grant (admin_users → admin_features). presence=enabled. */
export const adminUserFeatures = pgTable(
  'admin_user_features',
  {
    adminUserId: integer('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    adminFeatureId: integer('admin_feature_id')
      .notNull()
      .references(() => adminFeatures.id, { onDelete: 'cascade' }),
    // 부여 주체(admin_users.id 값, 감사용)
    grantedBy: integer('granted_by'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.adminUserId, t.adminFeatureId] }),
  }),
);
