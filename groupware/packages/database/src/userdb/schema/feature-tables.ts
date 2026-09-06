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
 * 기능 카탈로그 (user 서버 소유, userdb): 플랫폼/시스템 정의(글로벌 공유)
 * 그룹웨어 내 개별 기능(공지/통계/설정 등)의 마스터. 여러 조직이 같은 카탈로그를 공유한다.
 * AI 도구(ai_tools)와는 별개 구조. 엔타이틀먼트 설계: .claude/rules/multi-tenancy.md
 */
export const features = pgTable('features', {
  id: serial('id').primaryKey(),
  // 안정 식별자: 코드/시드/토큰이 참조(예: 'notice','stats'). 표시명 변경과 무관
  key: varchar('key', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
