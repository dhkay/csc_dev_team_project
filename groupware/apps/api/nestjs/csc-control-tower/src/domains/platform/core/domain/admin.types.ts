/** 플랫폼 관리자 요약: user 서버 /internal/admins 응답과 동일 형태 */
export interface AdminSummary {
  id: number;
  email: string;
  // 이름: 유일한 이름 필드(표시 이름)
  name: string;
  role: string;
  status: string;
  // ISO 8601 | null
  lastLoginAt: string | null;
  // ISO 8601
  createdAt: string;
}

/** 플랫폼 관리자 옵션 카탈로그 항목 */
export interface AdminFeatureCatalogItem {
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

/** 플랫폼 관리자 추가 입력 */
export interface CreateAdminInput {
  email: string;
  password: string;
  name: string;
  // 초기 부여 옵션 key
  features?: string[];
}

/** 플랫폼 관리자 수정 입력: 제공된 필드만(name, email). 추후 profileImage 확장 */
export interface UpdateAdminInput {
  name?: string;
  // 로그인 ID. 전역 유일이며 ROOT 는 변경할 수 없다.
  email?: string;
}
