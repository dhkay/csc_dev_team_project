/** 유저 권한(조직 내 역할) */
export type UserRole = 'ROOT' | 'ADMIN' | 'EMPLOYEE';

/** 조직 타입: 멀티테넌시 (.claude/rules/multi-tenancy.md) */
export type OrgType = 'PLATFORM' | 'TENANT';

/** 조직(테넌트) 정보 */
export interface Organization {
  id: number;
  slug: string;
  name: string;
  type: OrgType;
}

/** 현재 로그인 유저: `locals.getUser()` 반환 타입 */
export interface CurrentUser {
  id: number;
  name: string;
  role?: UserRole;
  organization?: Organization;
  // 플랫폼 관리자 옵션(관리 영역 접근권) key 목록: groupware 엔타이틀먼트와 분리된 admin 전용
  // ROOT 는 전체 보유(목록 비어 있어도 코드 규칙으로 전부 허용). ADMIN 은 부여된 것만
  adminFeatures?: string[];
}

/** 로그인 요청 */
export interface LoginRequest {
  email: string;
  password: string;
}

/** 로그인 응답 (user 서버) */
export interface LoginResponse {
  token: string;
  refreshToken: string;
  name: string;
  role: UserRole;
}

/** 리프레시 토큰 응답 */
export interface RefreshTokenResponse {
  token: string;
  refreshToken: string;
}

/** 로그인 BFF 결과 (클라이언트가 받는 형태) */
export interface LoginResult {
  success: boolean;
  data?: { name: string; role?: UserRole };
  errorCode?: string;
  error?: string;
}
