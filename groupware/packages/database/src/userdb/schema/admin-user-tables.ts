import { pgTable, serial, varchar, timestamp, integer } from 'drizzle-orm/pg-core';
import { userRoleEnum, userStatusEnum } from './enums';

/**
 * 관리자유저 테이블 (user 서버 소유, userdb): 구 `platform_admins`.
 * 플랫폼(벤더/운영사) 운영자 = control-tower(ADMIN_USER) 정체성. 어떤 조직에도 귀속되지 않는다.
 * 플랫폼 루트관리자(ROOT) 1 + 플랫폼 일반관리자(ADMIN) N.
 *
 * 조직유저(organization_users)와 완전 분리한다. 멀티테넌시(.claude/rules/multi-tenancy.md):
 *  - organization_users 는 조직 내 유일(UNIQUE organization_id, email), 같은 이메일이 조직마다 별개 계정
 *  - admin_users 는 조직 개념이 없으므로 email 이 전역 유일(UNIQUE email)
 * TS 속성은 camelCase, DB 컬럼은 snake_case 로 명시 매핑
 */
export const adminUsers = pgTable('admin_users', {
  id: serial('id').primaryKey(),
  // 전역 유일: 조직 스코프가 없다(organization_users 와 달리 org 복합키 아님)
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  // 표시 이름: 유일한 이름 필드다(조직유저와 동일 모델. 별도 표시명 컬럼은 두지 않는다)
  name: varchar('name', { length: 100 }).notNull(),
  // 플랫폼 운영자는 ROOT/ADMIN 만 의미 있음(userRoleEnum 재사용, 기본 ROOT). userType 은 코드에서 ADMIN_USER 고정
  role: userRoleEnum('role').notNull().default('ROOT'),
  status: userStatusEnum('status').notNull().default('ACTIVE'),
  // 서버단 로그아웃용 토큰 버전: 로그아웃 시 +1 하면 기존 refresh 토큰이 모두 무효화된다.
  tokenVersion: integer('token_version').notNull().default(0),
  // 로그인 무차별 대입 방어: 연속 실패 횟수, 임계치 도달 시 locked_until 까지 임시 잠금
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});