import { OrgPosition } from '../types/entitlement-catalog';
import { OrgStatus, OrgType, PrincipalType, UserRole, UserStatus, UserType } from '../types/user.types';

/**
 * 인증 공통 주체(credential): 2개 정체성 테이블(admin_users / organization_users)의
 * 로그인, 갱신 게이트를 단일 형태로 표현한다. AuthService 가 principalType 분기 없이 이 형태로 동작한다.
 *
 * 도메인 엔티티(UserEntity/PlatformAdminEntity)를 치환하지 않는다. 인증 경로 전용 뷰
 */
export interface CredentialEntity {
  id: number;
  email: string;
  passwordHash: string;
  // 이름: 유일한 이름 필드(표시 이름)
  name: string;
  role: UserRole;
  // 직책: 조직유저만(organization_users.position). 관리자유저는 null. 대표는 토큰 발급 시 hasRootAuthority 근거
  position: OrgPosition | null;
  status: UserStatus;
  // audience: 관리자유저는 항상 ADMIN_USER 로 채운다(테이블에 컬럼 없음)
  userType: UserType;
  tokenVersion: number;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  // 마지막 로그인 시각: 로그인 시 now() 로 갱신. findData 가 표시용으로 노출
  lastLoginAt: Date | null;
  // 유저 본인 프로필 이미지 접근 URL: 조직유저만(환경설정에서 설정). 관리자유저는 null.
  profileImageUrl: string | null;
  // 어느 테이블에서 왔는지: 레지스트리 키이자 토큰 클레임 값
  principalType: PrincipalType;
  // 조직 컨텍스트: 조직유저만 채운다. 관리자유저(플랫폼)는 undefined →
  // org-active 게이트를 스킵하고 토큰을 organizationType=PLATFORM(organizationId 미포함)으로 발급한다.
  org?: {
    id: number;
    slug: string;
    name: string;
    type: OrgType;
    status: OrgStatus;
    // 조직 프로필 로고 접근 URL: 없으면 null.
    profileImageUrl: string | null;
  };
}
