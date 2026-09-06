import {
  CreatedCompany,
  OrganizationSummary,
  OrgMemberSummary,
  ReplaceRootAdminInput,
  RootAdminSummary,
} from '../../../domain/organization.types';

/** 조직 ROOT 관리자 수정 입력: 제공된 필드만 */
export interface UpdateRootAdminInput {
  name?: string;
  // 로그인 ID. 조직유저 전체에서 유일하다(UNIQUE email)
  email?: string;
}

/** 신규 회사 생성 입력 (플랫폼 관리자) */
export interface CreateCompanyInput {
  companyName: string;
  slug: string;
  profileImageUrl?: string | null;
  admin: { email: string; password: string; name: string };
}

/** 회사 수정 입력: 제공된 필드만 */
export interface UpdateCompanyInput {
  name?: string;
  slug?: string;
  status?: 'ACTIVE' | 'SUSPENDED';
  profileImageUrl?: string | null;
  // 부여할 AI도구 key 전체 집합(제공 시 그대로 동기화)
  aiTools?: string[];
}

/** 플랫폼 조직 관리 Inbound Port */
export interface OrganizationPort {
  createCompany(input: CreateCompanyInput): Promise<CreatedCompany>;
  listOrganizations(): Promise<OrganizationSummary[]>;
  /** 회사 수정: 이름/slug/상태 */
  updateCompany(id: number, patch: UpdateCompanyInput): Promise<OrganizationSummary>;
  /** 소프트 삭제(WITHDRAWN) */
  withdrawCompany(id: number): Promise<void>;
  /** 복구(WITHDRAWN → ACTIVE) */
  recoverCompany(id: number): Promise<OrganizationSummary>;
  /** 하드 삭제(영구 제거) */
  purgeCompany(id: number): Promise<void>;
  /** 조직 ROOT 관리자 조회 */
  getRootAdmin(id: number): Promise<RootAdminSummary>;
  /** 조직 ROOT 관리자 프로필 수정(name, email): 세션 무효화 없음 */
  updateRootAdmin(id: number, patch: UpdateRootAdminInput): Promise<RootAdminSummary>;
  /** 조직 ROOT 관리자 이메일 사용 가능 여부(저장 전 사전 확인): 조직유저 전체에서 유일 */
  isRootAdminEmailAvailable(id: number, email: string): Promise<boolean>;
  /** 조직 멤버 목록(활성 ROOT+ADMIN): 루트 이양 대상 선택용 */
  listOrganizationMembers(id: number): Promise<OrgMemberSummary[]>;
  /** 루트 이양(기존 조직원 승격): 기존 ROOT 는 일반관리자로 내려간다. */
  transferRootAdmin(id: number, userId: number): Promise<RootAdminSummary>;
  /** 루트 교체(신규 계정): 조직에 계정이 없는 사람을 루트로 세운다. */
  replaceRootAdmin(id: number, input: ReplaceRootAdminInput): Promise<RootAdminSummary>;
  /** 조직 ROOT 관리자 비밀번호 재설정 */
  resetRootPassword(id: number, password: string): Promise<void>;
  /** 조직에 부여된 AI도구 key 목록 */
  getOrganizationAiTools(id: number): Promise<string[]>;
}

export const ORGANIZATION_PORT = Symbol('PLATFORM_ORGANIZATION_PORT');
