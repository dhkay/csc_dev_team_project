import { integer, pgTable, serial, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/**
 * 조직별 AI 어시스턴트 설정 (그룹웨어 백엔드 csc-groupware 단독 소유, groupwaredb)
 * 플랫폼 전역 설정(userdb platform_assistant_settings) 위에 조직이 얹는 오버라이드: 조직 기본 모델
 * (플랫폼 허용 범위 내)과 조직 프롬프트 추가. 비밀 아님(평문). 채팅 시점 병합은 csc-groupware resolve.
 * 설계: .claude/rules/multi-tenancy.md
 *
 * 한 조직당 최대 1행(organization_id unique). organization_id 는 userdb 소유라 FK 없이 값만 보관
 * (크로스-DB FK 금지: api_credentials 와 동일 원칙)
 */
export const organizationAssistantSettings = pgTable(
  'organization_assistant_settings',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull(),
    // 조직 기본 모델 key: 플랫폼 허용 목록 내여야 유효(리졸버에서 검증). null=미설정(플랫폼 기본 사용)
    defaultModel: varchar('default_model', { length: 64 }),
    // 조직 프롬프트 추가: 플랫폼 공통 프롬프트 뒤에 이어붙는다. null=없음
    promptAddition: text('prompt_addition'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgUq: unique('organization_assistant_settings_org_uq').on(t.organizationId),
  }),
);
