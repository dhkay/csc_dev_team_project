// RBFR: 공통(감사로그/설정) 테이블. rbfr/개발지침/03 DB스키마.md "공통" 절 참고 — 그룹웨어에
// 재사용할 범용 audit_log/app_settings 인프라가 없음을 확인(2026-09-06)하고 RBFR 전용으로 신규
// 생성하기로 확정.
import { pgTable, bigserial, integer, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';

/** RBFR 도메인 전용 감사 기록. */
export const rbfrAuditLog = pgTable(
  'rbfr_audit_log',
  {
    id: bigserial('log_id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id'),
    action: varchar('action', { length: 48 }).notNull(),
    target: varchar('target', { length: 128 }),
    detail: text('detail'),
    ip: varchar('ip', { length: 45 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('rbfr_audit_log_user_idx').on(t.userId, t.createdAt),
    actionIdx: index('rbfr_audit_log_action_idx').on(t.action, t.createdAt),
  }),
);

/** RBFR 전용 설정(고가 판정 기준액, 기본 Cell 규칙 버전 등). */
export const rbfrAppSettings = pgTable('rbfr_app_settings', {
  settingKey: varchar('setting_key', { length: 64 }).primaryKey(),
  settingVal: text('setting_val'),
  descr: varchar('descr', { length: 255 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
