import {
  pgTable,
  serial,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * 권한 카탈로그 (user 서버 소유, userdb): 플랫폼/시스템 정의(글로벌 공유)
 * features/ai_tools 와 별개 구조의 "권한"(예: 시스템관리). 부서/멤버에 부여한다.
 * key 는 코드(@csc/entitlements PermissionKey)가 진실원, 이 테이블은 런타임 투영(name/active/sort 편집)
 * 엔타이틀먼트 설계: .claude/rules/multi-tenancy.md
 */
export const permissions = pgTable('permissions', {
  id: serial('id').primaryKey(),
  // 안정 식별자: 코드/시드/토큰이 참조(예: 'system-management'). 표시명 변경과 무관
  key: varchar('key', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
