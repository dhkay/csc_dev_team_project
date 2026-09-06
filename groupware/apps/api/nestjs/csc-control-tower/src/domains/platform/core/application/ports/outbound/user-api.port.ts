import type { ProvisioningMode } from '@csc/entitlements';
import {
  CreatedCompany,
  OrganizationSummary,
  OrgMemberSummary,
  ReplaceRootAdminInput,
  RootAdminSummary,
} from '../../../domain/organization.types';
import { AiToolCatalogItem } from '../../../domain/ai-tool.types';
import {
  PlatformAssistantSettings,
  UpdatePlatformAssistantSettingsInput,
} from '../../../domain/assistant-settings.types';
import {
  AdminSummary,
  AdminFeatureCatalogItem,
  CreateAdminInput,
} from '../../../domain/admin.types';

/** user 서버에 조직+ROOT 생성을 위임하는 입력 */
export interface CreateOrganizationViaUserInput {
  slug: string;
  name: string;
  profileImageUrl?: string | null;
  rootAdmin: { email: string; password: string; name: string };
}

/** 조직 수정 위임 입력: 제공된 필드만 */
export interface UpdateOrganizationViaUserInput {
  name?: string;
  slug?: string;
  status?: 'ACTIVE' | 'SUSPENDED';
  profileImageUrl?: string | null;
  // 부여할 AI도구 key 전체 집합(제공 시 그대로 동기화)
  aiTools?: string[];
}

/** AI 도구 카탈로그 수정 위임 입력: 표시명/slug/프로비저닝 */
export interface UpdateAiToolViaUserInput {
  name?: string;
  slug?: string;
  provisioning?: ProvisioningMode;
}

/** user 서버(userdb 소유) 위임 Outbound Port: 조직 읽기/쓰기는 user 서버만 한다(소유권) */
export interface UserApiPort {
  createOrganization(input: CreateOrganizationViaUserInput): Promise<CreatedCompany>;
  listOrganizations(): Promise<OrganizationSummary[]>;
  /** 조직 수정: 이름/slug/상태 */
  updateOrganization(id: number, patch: UpdateOrganizationViaUserInput): Promise<OrganizationSummary>;
  /** 소프트 삭제(WITHDRAWN) */
  withdrawOrganization(id: number): Promise<void>;
  /** 복구(WITHDRAWN → ACTIVE) */
  recoverOrganization(id: number): Promise<OrganizationSummary>;
  /** 하드 삭제(영구 제거) */
  purgeOrganization(id: number): Promise<void>;
  /** 조직 ROOT 관리자 조회 */
  getRootAdmin(id: number): Promise<RootAdminSummary>;
  /** 조직 ROOT 관리자 프로필 수정(name, email): 세션 무효화 없음 */
  updateRootAdmin(id: number, patch: { name?: string; email?: string }): Promise<RootAdminSummary>;
  /** 조직 ROOT 관리자 이메일 사용 가능 여부(저장 전 사전 확인): 조직유저 전체에서 유일 */
  isRootAdminEmailAvailable(id: number, email: string): Promise<boolean>;
  /** 조직 멤버 목록(활성 ROOT+ADMIN): 루트 이양 대상 선택용 */
  listOrganizationMembers(id: number): Promise<OrgMemberSummary[]>;
  /** 루트 이양: 기존 조직원(활성 ADMIN)을 ROOT 로 승격, 기존 ROOT 는 강등 */
  transferRootAdmin(id: number, userId: number): Promise<RootAdminSummary>;
  /** 루트 교체: 새 계정을 만들어 ROOT 로 세우고 기존 ROOT 는 강등 */
  replaceRootAdmin(id: number, input: ReplaceRootAdminInput): Promise<RootAdminSummary>;
  /** 조직 ROOT 관리자 비밀번호 재설정 */
  resetRootPassword(id: number, password: string): Promise<void>;
  /** 조직에 부여된 AI도구 key 목록 */
  getOrganizationAiTools(id: number): Promise<string[]>;
  /** AI 도구 카탈로그 목록 (표시명/slug) */
  listAiToolCatalog(): Promise<AiToolCatalogItem[]>;
  /** AI 도구 표시명/slug 수정 */
  updateAiTool(key: string, patch: UpdateAiToolViaUserInput): Promise<AiToolCatalogItem>;
  // 플랫폼 관리자 관리(위임): user /internal/admins…
  listAdmins(): Promise<AdminSummary[]>;
  createAdmin(input: CreateAdminInput): Promise<AdminSummary>;
  /** 관리자 프로필 수정(name, email) */
  updateAdmin(id: number, patch: { name?: string; email?: string }): Promise<AdminSummary>;
  /** 관리자 이메일 사용 가능 여부(저장 전 사전 확인) */
  isAdminEmailAvailable(email: string, excludeId?: number): Promise<boolean>;
  deleteAdmin(id: number): Promise<void>;
  getAdminFeatures(id: number): Promise<string[]>;
  setAdminFeatures(id: number, features: string[]): Promise<void>;
  listAdminFeatureCatalog(): Promise<AdminFeatureCatalogItem[]>;
  // 플랫폼 AI 어시스턴트 전역 설정(위임): user /internal/platform-assistant-settings
  getPlatformAssistantSettings(): Promise<PlatformAssistantSettings>;
  updatePlatformAssistantSettings(
    patch: UpdatePlatformAssistantSettingsInput,
  ): Promise<PlatformAssistantSettings>;
}

export const USER_API_PORT = Symbol('PLATFORM_USER_API_PORT');
