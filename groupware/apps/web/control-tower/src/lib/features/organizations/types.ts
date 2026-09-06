import type { OrgType } from '$lib/shared/types/common.types';

/** 조직 상태: 멀티테넌시(.claude/rules/multi-tenancy.md) */
export type OrgStatus = 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN';

/** 목록 화면용 조직 요약 */
export interface OrganizationSummary {
  id: number;
  slug: string;
  name: string;
  type: OrgType;
  status: OrgStatus;
  // 조직 로고 표시용 서명 접근 URL(로드 경계가 uploadId→서명URL 로 변환해 채운 값). 없으면 null.
  // 백엔드 저장값은 uploadId(불변)이며, 이 필드는 렌더용으로 서명해 내려준 것이다(제출엔 profileImageUploadId 사용)
  profileImageUrl?: string | null;
  // 조직 로고 원본 uploadId(제출/폼 baseline 용). 로드 경계가 채운다.
  profileImageUploadId?: string | null;
  // ISO 8601
  createdAt: string;
}

/**
 * 조직 추가 입력: csc-control-tower `POST /platform/organizations` 계약과 일치
 * 조직 생성 시 그 조직의 ROOT 관리자도 함께 만든다.
 */
export interface CreateOrganizationInput {
  companyName: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  // 조직 프로필 이미지(로고) 접근 URL: 업로드 후 채워 보낸다.
  profileImageUrl?: string | null;
}

/** 조직 수정 입력: 제공된 필드만. status 는 활성/정지(삭제는 별도) */
export interface UpdateOrganizationInput {
  name?: string;
  slug?: string;
  status?: 'ACTIVE' | 'SUSPENDED';
  profileImageUrl?: string | null;
  // 부여할 AI도구 key 전체 집합(제공 시 그대로 동기화)
  aiTools?: string[];
}

/** 조직 ROOT 관리자 요약: `/api/platform/organizations/{id}/root-admin` 응답 */
export interface RootAdminSummary {
  id: number;
  email: string;
  name: string;
  status: string;
  // ISO 8601 | null
  lastLoginAt: string | null;
}

/** 조직 ROOT 관리자 수정 입력: 제공된 필드만 */
export interface UpdateRootAdminInput {
  name?: string;
  // 로그인 ID. 조직유저 전체에서 유일하다(다른 조직이 쓰는 이메일도 충돌이다)
  email?: string;
}

/** 이메일 사용 가능 여부: 저장 전 사전 확인용 */
export interface RootAdminEmailAvailability {
  available: boolean;
}

/** 조직 멤버 요약: `/api/platform/organizations/{id}/members` 응답 */
export interface OrgMemberSummary {
  id: number;
  email: string;
  name: string;
  role: 'ROOT' | 'ADMIN';
  status: string;
  // ISO 8601 | null
  lastLoginAt: string | null;
}

/** 루트 교체 입력(신규 계정): 조직에 계정이 없는 사람을 루트로 세울 때 */
export interface ReplaceRootAdminInput {
  email: string;
  name: string;
  password: string;
}
