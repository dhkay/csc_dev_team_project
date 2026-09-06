import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * 플랫폼 AI 어시스턴트 전역 설정 (user 서버 소유, userdb): 싱글톤 1행(id=1 고정)
 * AI 어시스턴트(챗봇)는 AI 도구와 별개인 전 조직 공통 기능이며, 이 테이블이 플랫폼 관리자가 조정하는
 * 전역 기준의 SSOT 다(control-tower → user 위임으로 편집). 조직별 오버라이드는 groupwaredb
 * organization_assistant_settings, 채팅 시점 병합은 csc-groupware resolve. 설계: .claude/rules/multi-tenancy.md
 *
 * 플랫폼이 정하는 건 "쓸 수 있나(킬스위치)"와 "어떤 성격인가(공통 프롬프트)" 둘뿐이다.
 * 어떤 모델을 쓸지는 조직이 정한다(organization_assistant_settings.default_model). 플랫폼 허용 목록
 * (allowed_models)과 전역 기본 모델(default_model)은 마이그레이션 0031 에서 제거했다: 외부 모델은
 * 어차피 조직 자체 API 키가 있어야 동작해 화이트리스트가 실효 없이 설정만 늘렸고, 기본 모델은 조직
 * 미설정 시 내장 Qwen(language-model 카탈로그 기본)으로 떨어지면 충분하다.
 *
 * 단일 행 강제: PK id=1 + CHECK(id=1)(마이그레이션에서 CHECK 부여). 기본 1행은 마이그레이션이 시드
 */
export const platformAssistantSettings = pgTable('platform_assistant_settings', {
  // 싱글톤: 항상 1. (serial 아님: 고정 1행)
  id: integer('id').primaryKey().default(1),
  // 전역 활성화(킬스위치): false 면 조직/유저 무관 AI 어시스턴트 차단(백엔드 집행)
  globalEnabled: boolean('global_enabled').notNull().default(true),
  // 공통 시스템 프롬프트/페르소나: 전 조직 기본. 조직 프롬프트 추가가 이 위에 이어붙는다.
  commonPrompt: text('common_prompt'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
