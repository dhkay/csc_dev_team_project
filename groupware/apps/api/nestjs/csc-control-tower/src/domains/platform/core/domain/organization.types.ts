/** 생성된 회사(조직) + 그 회사 ROOT 관리자: user 서버 응답과 동일 형태 */
export interface CreatedCompany {
  organization: {
    id: number;
    slug: string;
    name: string;
    type: string;
    profileImageUrl?: string | null;
  };
  rootAdmin: { id: number; email: string; name: string };
}

/** 조직 목록 요약: user 서버 /internal/organizations 응답과 동일 형태 */
export interface OrganizationSummary {
  id: number;
  slug: string;
  name: string;
  type: string;
  status: string;
  // 조직 프로필 이미지(로고) 접근 URL. 없으면 null.
  profileImageUrl?: string | null;
  // ISO 8601
  createdAt: string;
}

/** 조직 ROOT 관리자 요약: user 서버 /internal/organizations/:id/root-admin 응답과 동일 형태 */
export interface RootAdminSummary {
  id: number;
  email: string;
  name: string;
  status: string;
  // ISO 8601 | null
  lastLoginAt: string | null;
}

/** 조직 멤버 요약: user 서버 /internal/organizations/:id/members 응답과 동일 형태 */
export interface OrgMemberSummary {
  id: number;
  email: string;
  name: string;
  role: string;
  status: string;
  // ISO 8601 | null
  lastLoginAt: string | null;
}

/** 조직 루트 관리자 교체 입력(신규 계정 생성) */
export interface ReplaceRootAdminInput {
  email: string;
  name: string;
  password: string;
}
