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
 * AI 도구 카탈로그 (user 서버 소유, userdb): 플랫폼/시스템 정의(글로벌 공유)
 * 플랫폼에서 접근하는 AI 도구(현재: 마케팅 영상 제작)의 마스터. 여러 조직이 공유한다.
 * 기능(features)과는 별개 구조. 엔타이틀먼트 설계: .claude/rules/multi-tenancy.md
 */
export const aiTools = pgTable('ai_tools', {
  id: serial('id').primaryKey(),
  // 안정 식별자: 코드/시드/토큰이 참조(예: 'marketing-video'). 표시명 변경과 무관
  key: varchar('key', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  // 라우팅 경로 세그먼트: 플랫폼에서 편집(예: /{orgSlug}/{slug}/...). key 와 별개로 가변
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  description: text('description'),
  // 프로비저닝 모드: 'PER_ORG'(조직 개별 부여) | 'COMMON'(전 조직 공통 제공). 플랫폼 관리자가 토글
  // 값 집합 SSOT = @csc/entitlements ProvisioningMode. 신규 도구 기본 PER_ORG(명시 부여 필요)
  provisioning: varchar('provisioning', { length: 16 }).notNull().default('PER_ORG'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
