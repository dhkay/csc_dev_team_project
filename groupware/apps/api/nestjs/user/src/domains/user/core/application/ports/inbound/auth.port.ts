import { OrgType, PrincipalType, UserRole } from '../../../domain/types/user.types';

/** 이메일 로그인 결과 (BFF 가 기대하는 형태) */
export interface LoginResult {
  token: string;
  refreshToken: string;
  name: string;
  role: UserRole;
}

/** 토큰 갱신 결과 */
export interface RefreshResult {
  token: string;
  refreshToken: string;
}

/** 현재 유저 조회 결과 */
export interface UserDataResult {
  id: number;
  // 이름: 유일한 이름 필드(표시 이름)
  name: string;
  role: UserRole;
  // 플랫폼 관리자 옵션 key 목록: 관리자유저만(없으면 미포함). 사이드바/페이지 가드용
  adminFeatures?: string[];
  // 유저 본인 프로필 이미지 접근 URL: 조직유저만(환경설정에서 설정). 없으면 null.
  profileImageUrl: string | null;
  // 마지막 로그인 시각: ISO 8601 instant(표시 시 시간대 변환). 미기록 시 null.
  lastLoginAt: string | null;
  // 소속 조직: 멀티테넌시. profileImageUrl = 조직 로고(없으면 null)
  organization: {
    id: number;
    slug: string;
    name: string;
    type: OrgType;
    profileImageUrl: string | null;
  };
}

/** 인증 Inbound Port */
export interface AuthPort {
  /** 테넌트 멤버 로그인(groupware): users 테이블 */
  loginEmail(email: string, password: string): Promise<LoginResult>;
  /** 플랫폼 슈퍼관리자 로그인(control-tower): platform_admins 테이블 */
  loginPlatformEmail(email: string, password: string): Promise<LoginResult>;
  refresh(refreshToken: string): Promise<RefreshResult>;
  /** 서버단 로그아웃: 해당 주체의 token_version 을 올려 기존 refresh 토큰을 모두 무효화. 멱등 */
  logout(refreshToken: string): Promise<void>;
  /** principalType 으로 platform_admins/users 중 올바른 테이블을 조회 */
  findData(userId: number, principalType: PrincipalType): Promise<UserDataResult>;
}

export const AUTH_PORT = Symbol('AUTH_PORT');
