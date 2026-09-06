import { pgEnum } from 'drizzle-orm/pg-core';

/** 유저 권한(조직 내 역할): ROOT(총관리자) / ADMIN(관리자) / EMPLOYEE(직원) */
export const userRoleEnum = pgEnum('user_role_enum', ['ROOT', 'ADMIN', 'EMPLOYEE']);

/** 계정 상태 */
export const userStatusEnum = pgEnum('user_status_enum', [
  'ACTIVE',
  'INACTIVE',
  'LOCKED',
  'WITHDRAWN',
]);

/** 유저 타입(audience): 토큰 클레임으로 대상 클라이언트 구분 */
export const userTypeEnum = pgEnum('user_type_enum', ['APP_USER', 'WEB_USER', 'ADMIN_USER']);

/**
 * 직책(position): 권한/AI도구와 분리된 조직상 직책. 유저당 하나(organization_users.position, nullable)
 * REPRESENTATIVE(대표) / TEAM_LEADER(팀장). 상세: .claude/rules/multi-tenancy.md, @csc/entitlements OrgPosition
 */
export const orgPositionEnum = pgEnum('org_position_enum', ['REPRESENTATIVE', 'TEAM_LEADER']);

/** 조직 타입: PLATFORM(벤더) / TENANT(납품 조직). 멀티테넌시: multi-tenancy.md */
export const orgTypeEnum = pgEnum('org_type_enum', ['PLATFORM', 'TENANT']);

/** 조직 상태 */
export const orgStatusEnum = pgEnum('org_status_enum', ['ACTIVE', 'SUSPENDED', 'WITHDRAWN']);
