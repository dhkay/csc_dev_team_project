import { AiToolKey, FeatureKey, OrgPosition, PermissionKey } from './entitlement-catalog';

/** 유저 권한(조직 내 역할) */
export enum UserRole {
  ROOT = 'ROOT',
  ADMIN = 'ADMIN',
  EMPLOYEE = 'EMPLOYEE',
}

/** 계정 상태 */
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  LOCKED = 'LOCKED',
  WITHDRAWN = 'WITHDRAWN',
}

/** 유저 타입(audience): 토큰 클레임으로 대상 클라이언트 구분 */
export enum UserType {
  APP_USER = 'APP_USER',
  WEB_USER = 'WEB_USER',
  ADMIN_USER = 'ADMIN_USER',
}

/** 조직 타입: PLATFORM(벤더) / TENANT(납품 조직). 멀티테넌시: .claude/rules/multi-tenancy.md */
export enum OrgType {
  PLATFORM = 'PLATFORM',
  TENANT = 'TENANT',
}

/** 조직 상태 */
export enum OrgStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  WITHDRAWN = 'WITHDRAWN',
}

/**
 * 토큰 주체(principal): 어느 테이블에서 조회할지 라우팅한다(멀티테넌시 2계층)
 * admin_users.id / organization_users.id 는 독립 시퀀스라 id 만으로는 테이블을 구분할 수 없으므로,
 * refresh/find-data 가 이 값으로 올바른 테이블을 조회한다.
 *
 * 레거시 호환: 구 'PLATFORM_ADMIN'→ADMIN_USER, 'TENANT_USER'/'SERVICE_USER'→ORGANIZATION_USER 로
 * 매핑한다(JwtTokenService.verify* 에서 정규화: 기존 세션 무중단). 일반 사용자(실제 서비스) 계층은
 * 향후 서비스 도입 시 다시 추가한다.
 */
export enum PrincipalType {
  /** admin_users 테이블: 플랫폼(벤더) 운영자 = 관리자유저(control-tower) */
  ADMIN_USER = 'ADMIN_USER',
  /** organization_users 테이블: 조직 유저 = 조직유저(groupware) */
  ORGANIZATION_USER = 'ORGANIZATION_USER',
}

/**
 * Access Token 클레임. organizationId 로 테넌트를 구분(멀티테넌시)
 *
 * 불변(immutable) 조직 식별자만 담는다: organizationId, organizationType.
 * slug 는 가변(이름변경 가능)이라 토큰에 넣지 않는다. 토큰 수명(최대 60일) 동안
 * stale 이 되어 라우팅/인가를 잘못 결합할 위험이 있다. slug 가 필요한 곳(라우팅/표시)은
 * 항상 백엔드(findData)에서 현재 값을 조회한다. 따라서 조직 slug 변경은 세션을
 * 무효화하지 않으며(강제 재로그인 없음), 가드가 다음 네비게이션에서 현재 slug 로 교정한다.
 */
export interface AccessTokenPayload {
  id: number;
  email: string;
  name: string;
  userType: UserType;
  role: UserRole;
  // 주체 구분: refresh/find-data 의 테이블 라우팅 키(ADMIN_USER / ORGANIZATION_USER)
  principalType: PrincipalType;
  // 소속 조직: 조직유저/일반유저만. 관리자유저(플랫폼)는 조직이 없어 미포함(optional)
  organizationId?: number;
  // 조직 타입: PLATFORM 여부로 플랫폼 관리자 판정(스테이트리스 가드). 플랫폼은 조직행 없이 PLATFORM 으로 발급
  organizationType: OrgType;
  // 유효 엔타이틀먼트: 이 유저가 접근 가능한 기능/AI도구의 key 목록(기능: 조직 grant ∩ (applies_to_all OR 유저 토글) / AI도구: 조직 사용 인가 ∩ 팀, 유저 부여)
  // 조직유저만 채운다(관리자유저/플랫폼은 미포함). 로그인/리프레시 시점에 resolve → staleness ≤ 쿠키 maxAge(~1일)
  // 다운스트림 서비스는 토큰에서 바로 읽어 인가(cross-service 호출 불필요). 설계: .claude/rules/multi-tenancy.md
  features?: FeatureKey[];
  aiTools?: AiToolKey[];
  // 보유 권한: 조직유저만. 멤버 부서 조상 체인의 부서 부여 ∪ 멤버 직접 부여(permissions.key)
  // 로그인/리프레시 시 resolve → 다운스트림이 토큰만으로 접근 제어
  permissions?: PermissionKey[];
  // 직책: 조직유저만. 권한/AI도구와 분리된 별도 차원(organization_users.position, 유저당 하나)
  // REPRESENTATIVE(대표) 는 hasRootAuthority 의 근거(ROOT 동등). TEAM_LEADER(팀장) 는 순수 직책
  // 없으면 미포함. 로그인/리프레시 시 유저 행에서 그대로 실음
  position?: OrgPosition;
  // 플랫폼 관리자 옵션: 관리자유저(ADMIN_USER)만 채운다. 접근 가능한 플랫폼 영역 key 목록
  // groupware 엔타이틀먼트(features/aiTools)와 별개 테이블(admin_features) 에서 resolve.
  // ROOT 는 활성 카탈로그 전체. control-tower 사이드바/페이지 가드가 이 값으로 인가
  adminFeatures?: string[];
}

/** Refresh Token 클레임. tokenVersion 으로 서버단 로그아웃(일괄 무효화)을 판별 */
export interface RefreshTokenPayload {
  id: number;
  // 발급 시점 유저의 token_version. 서버 token_version 과 다르면 무효(로그아웃됨)
  tokenVersion: number;
  // 주체 구분: refresh 시 어느 테이블을 조회할지 라우팅
  principalType: PrincipalType;
}
