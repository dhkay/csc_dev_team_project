import { pgTable, serial, varchar, timestamp } from 'drizzle-orm/pg-core';
import { orgTypeEnum, orgStatusEnum } from './enums';

/**
 * 조직(테넌트) 테이블 (user 서버 소유, userdb): 멀티테넌시
 * PLATFORM(벤더) 1행 + 납품 조직마다 TENANT 1행. 자세한 설계: .claude/rules/multi-tenancy.md
 */
export const organizations = pgTable('organizations', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  type: orgTypeEnum('type').notNull().default('TENANT'),
  status: orgStatusEnum('status').notNull().default('ACTIVE'),
  // 조직 프로필 이미지(로고) 접근 URL: file-upload(platform/ 폴더) 저장 후 access_url. nullable.
  profileImageUrl: varchar('profile_image_url', { length: 2048 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
