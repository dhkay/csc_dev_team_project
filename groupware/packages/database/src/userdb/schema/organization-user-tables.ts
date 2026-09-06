import {
  pgTable,
  serial,
  varchar,
  timestamp,
  integer,
  uniqueIndex,
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { orgPositionEnum, userRoleEnum, userStatusEnum, userTypeEnum } from './enums';
import { organizations } from './org-tables';
import { departments } from './department-tables';

/**
 * 조직유저 테이블 (user 서버 소유, userdb): 구 `users`.
 * 조직(테넌트)의 관리 주체: 조직 루트관리자(ROOT) 1 + 조직 일반관리자(ADMIN) N.
 * 최종 사용자(일반유저)는 여기 두지 않고 서비스 하위 `service_users` 가 담는다(3계층 모델)
 * TS 속성은 camelCase, DB 컬럼은 snake_case 로 명시 매핑
 *
 * 멀티테넌시(.claude/rules/multi-tenancy.md): organization_id 로 조직에 귀속된다.
 * 이메일은 전역 유일이다(UNIQUE email). 로그인 진입점이 테넌트 스코프가 아니라
 * (apex 한 곳, 조직은 인증 이후 토큰으로 정해진다) 이메일 하나가 계정 하나를 가리켜야 한다.
 * 한 사람은 한 조직에만 속한다.
 */
export const organizationUsers = pgTable(
  'organization_users',
  {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    // 표시 이름: 유일한 이름 필드다. 로그(actor 해석)/멤버목록/플랫폼 표기가 모두 이 값을 쓴다.
    //  별도 표시명(구 nickname)은 두지 않는다. 같은 사람이 화면마다 다른 이름으로 보이는 분기 원인이었다.
    //  본인이 환경설정에서, 조직 관리자가 사용자관리에서, 플랫폼이 조직 상세에서 편집한다(동명이인 허용)
    name: varchar('name', { length: 100 }).notNull(),
    // 조직유저 프로필 이미지 접근 URL(file-upload). 본인이 환경설정에서 설정. 없으면 null.
    profileImageUrl: varchar('profile_image_url', { length: 2048 }),
    // 연락처(선택): 사용자관리에서 일반관리자 추가/편집 시 입력. 직원조회에 노출. 공란 가능
    phone: varchar('phone', { length: 30 }), // 전화번호
    extension: varchar('extension', { length: 30 }), // 사내번호
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    // 부서 소속: userdb departments.id 참조. null = 미배치(조직엔 속하나 부서 미지정)
    // 부서 삭제 시 자동 미배치 → ON DELETE SET NULL(어떤 삭제 경로든 고아 참조 방지)
    // 같은 조직의 부서인지(부서.organizationId === 유저.organizationId)는 서비스가 강제
    //  (복합 FK 로 내리면 SET NULL 이 NOT NULL 인 organization_id 까지 null 로 만들어 충돌 → 앱 검증 유지)
    departmentId: integer('department_id').references(() => departments.id, {
      onDelete: 'set null',
    }),
    // 조직유저는 관리 주체: ROOT(조직 루트관리자) / ADMIN(조직 일반관리자). 기본 ADMIN.
    role: userRoleEnum('role').notNull().default('ADMIN'),
    // 직책(권한/AI도구와 분리된 별도 차원): REPRESENTATIVE(대표) / TEAM_LEADER(팀장) / null(없음)
    // 단일 컬럼이라 대표↔팀장 상호배제가 구조적으로 보장된다. 팀장은 부서 리더(부서당 1명, 아래 제약)
    // 대표는 hasRootAuthority 의 근거(권한 카탈로그에서 이전됨). 상세: @csc/entitlements OrgPosition.
    position: orgPositionEnum('position'),
    status: userStatusEnum('status').notNull().default('ACTIVE'),
    userType: userTypeEnum('user_type').notNull().default('WEB_USER'),
    // 서버단 로그아웃용 토큰 버전: 로그아웃 시 +1 하면 해당 유저의 기존 refresh 토큰이 모두 무효화된다.
    tokenVersion: integer('token_version').notNull().default(0),
    // 로그인 무차별 대입 방어: 연속 실패 횟수, 임계치 도달 시 locked_until 까지 임시 잠금
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // 로그인 ID 는 전역 유일이다. 조직 범위 유일(구 organization_users_org_email_uq)은
    //  로그인 전에 조직을 알 수 있는 제품(조직별 서브도메인/조직코드 입력)에서만 성립하는데,
    //  이 제품의 로그인은 이메일과 비밀번호만 받으므로 같은 이메일이 두 조직에 있으면 어느 계정인지 정해지지 않는다.
    emailUq: uniqueIndex('organization_users_email_uq').on(t.email),
    // name 에는 unique 를 두지 않는다. 표시 이름이라 동명이인이 정상이다(구 organization_users_org_name_uq 해제)
    //  로그인 ID 는 email 이고, 로그/필터의 사람 식별은 id 기준이라 이름 중복이 모호함을 만들지 않는다.
    // 엔타이틀먼트 유저 토글의 (user_id, organization_id) 복합 FK 참조 대상
    // 토글 행의 organization_id 가 그 유저의 organization_id 와 항상 일치하도록 DB 가 강제
    idOrgUq: unique('organization_users_id_org_uq').on(t.id, t.organizationId),
    // 팀장은 부서당 1명: 같은 부서(department_id)에 position=TEAM_LEADER 가 둘 이상 존재 못하도록
    //  부분 유니크(TEAM_LEADER 행만). department_id NULL 은 아래 CHECK 로 애초에 차단
    deptTeamLeaderUq: uniqueIndex('org_users_dept_team_leader_uq')
      .on(t.departmentId)
      .where(sql`${t.position} = 'TEAM_LEADER'`),
    // 팀장(부서 리더)은 소속 부서가 반드시 있어야 한다. NULL 부서 팀장(부분유니크 우회) 방지
    teamLeaderDeptChk: check(
      'org_users_team_leader_dept_chk',
      sql`${t.position} <> 'TEAM_LEADER' OR ${t.departmentId} IS NOT NULL`,
    ),
  }),
);
