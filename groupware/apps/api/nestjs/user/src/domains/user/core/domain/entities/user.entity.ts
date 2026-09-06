import { OrgPosition } from '../types/entitlement-catalog';
import { OrgStatus, OrgType, UserRole, UserStatus, UserType } from '../types/user.types';

/** 조직(테넌트) 도메인 엔티티: 멀티테넌시 */
export interface OrganizationEntity {
  id: number;
  slug: string;
  name: string;
  type: OrgType;
  status: OrgStatus;
  // 조직 프로필 이미지(로고) 접근 URL: file-upload 저장 후 access_url. 없으면 null.
  profileImageUrl: string | null;
  createdAt: Date;
}

/** 유저 도메인 엔티티 (순수 TypeScript) */
export interface UserEntity {
  id: number;
  email: string;
  passwordHash: string;
  // 이름: 유일한 이름 필드(표시 이름). 조직 내 중복 허용(동명이인)
  name: string;
  role: UserRole;
  // 직책: 권한/AI도구와 분리된 별도 차원(organization_users.position). null = 없음. 대표/팀장 상호배제(단일 컬럼)
  position: OrgPosition | null;
  status: UserStatus;
  userType: UserType;
  // 서버단 로그아웃용 토큰 버전: refresh 토큰 클레임과 대조해 무효화 판별
  tokenVersion: number;
  // 연속 로그인 실패 횟수: 무차별 대입 방어(임계치 도달 시 임시 잠금)
  failedLoginAttempts: number;
  // 임시 잠금 만료 시각: 이 시각 이전이면 로그인 차단(자동 해제)
  lockedUntil: Date | null;
  // 소속 조직: 멀티테넌시
  organizationId: number;
  // 소속 부서 id(userdb departments): null = 미배치(조직엔 속하나 부서 미지정)
  departmentId: number | null;
  // 연락처(선택): 전화번호. 공란이면 null.
  phone: string | null;
  // 연락처(선택): 사내번호. 공란이면 null.
  extension: string | null;
  organizationSlug: string;
  organizationName: string;
  organizationType: OrgType;
  // 소속 조직 상태: 로그인/갱신 게이트(WITHDRAWN/SUSPENDED 차단)에 사용
  organizationStatus: OrgStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 플랫폼 슈퍼관리자 도메인 엔티티 (순수 TypeScript): 벤더 운영자
 * 조직(테넌트) 개념이 없다. userType 은 항상 ADMIN_USER 로 취급(컬럼 없음)
 */
export interface PlatformAdminEntity {
  id: number;
  email: string;
  passwordHash: string;
  // 이름: 유일한 이름 필드(표시 이름)
  name: string;
  role: UserRole;
  status: UserStatus;
  // 서버단 로그아웃용 토큰 버전: refresh 토큰 클레임과 대조해 무효화 판별
  tokenVersion: number;
  // 연속 로그인 실패 횟수: 무차별 대입 방어(임계치 도달 시 임시 잠금)
  failedLoginAttempts: number;
  // 임시 잠금 만료 시각: 이 시각 이전이면 로그인 차단(자동 해제)
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
