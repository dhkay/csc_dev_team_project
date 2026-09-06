/**
 * 플랫폼 관리자(admin_users) 관리 타입: csc-control-tower `/platform/admins*` 계약과 일치
 * 플랫폼 옵션(adminFeatures)은 groupware 엔타이틀먼트와 분리된 admin 전용 카탈로그(admin_features)
 */

/** 플랫폼 관리자 역할 */
export type AdminRole = 'ROOT' | 'ADMIN';

/** 목록 화면용 관리자 요약: user 서버 /internal/admins 응답 형태 */
export interface AdminSummary {
  id: number;
  email: string;
  // 이름: 유일한 이름 필드(표시 이름)
  name: string;
  role: AdminRole;
  status: string;
  // ISO 8601 | null
  lastLoginAt: string | null;
  // ISO 8601
  createdAt: string;
}

/** 플랫폼 관리자 옵션 카탈로그 항목(admin_features) */
export interface AdminFeatureCatalogItem {
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

/**
 * 관리자 추가 입력: `POST /platform/admins` 계약과 일치(ROOT 전용)
 * features 는 초기 부여 옵션 key 목록
 */
export interface CreateAdminInput {
  email: string;
  password: string;
  name: string;
  features?: string[];
}

/** 관리자 수정 입력: `PATCH /platform/admins` 계약과 일치. 제공된 필드만(추후 확장) */
export interface UpdateAdminInput {
  name?: string;
  // 로그인 ID. 전역 유일이며 루트관리자는 변경할 수 없다.
  email?: string;
}

/** 이메일 중복 확인 결과: 저장 전 사전 확인용 */
export interface AdminEmailAvailability {
  available: boolean;
}
