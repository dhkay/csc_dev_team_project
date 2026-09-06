// 조직 공용 외부 API 자격증명: 조직이 등록하는 공용 API 키(예: Claude API)
// 그룹웨어 백엔드(csc-groupware) 단독 소유. credentials 는 AES-256-GCM 암호문(평문 미저장)
import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  unique,
  index,
} from 'drizzle-orm/pg-core';

/**
 * 조직별 외부 API 자격증명. (organization_id, provider) 유니크로 프로바이더당 1행
 * provider 는 프론트/백엔드 공유 식별자(예: 'ANTHROPIC'). credentials 는 { field: value } 맵의
 * 암호문(JSON→AES-256-GCM). 서버 밖(뷰 응답)으로는 값 대신 설정된 필드 목록만 노출한다.
 */
export const organizationApiCredentials = pgTable(
  'organization_api_credentials',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull(),
    provider: varchar('provider', { length: 64 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    credentials: text('credentials'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgProviderUq: unique('organization_api_credentials_org_provider_uq').on(
      t.organizationId,
      t.provider,
    ),
    orgIdx: index('organization_api_credentials_org_idx').on(t.organizationId),
  }),
);
