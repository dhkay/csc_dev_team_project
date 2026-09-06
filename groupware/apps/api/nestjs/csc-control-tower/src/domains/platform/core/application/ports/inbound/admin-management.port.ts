import {
  AdminSummary,
  AdminFeatureCatalogItem,
  CreateAdminInput,
  UpdateAdminInput,
} from '../../../domain/admin.types';

/**
 * 플랫폼 관리자 관리 Inbound Port (control-tower): ROOT 한정(PlatformRootGuard)
 * 조직 도메인과 동일하게 user 서버에 위임한다(소유권)
 */
export interface AdminManagementPort {
  listAdmins(): Promise<AdminSummary[]>;
  createAdmin(input: CreateAdminInput): Promise<AdminSummary>;
  updateAdmin(id: number, patch: UpdateAdminInput): Promise<AdminSummary>;
  /** 이메일 사용 가능 여부(저장 전 사전 확인). excludeId 는 수정 대상 자신을 제외한다. */
  isAdminEmailAvailable(email: string, excludeId?: number): Promise<boolean>;
  deleteAdmin(id: number): Promise<void>;
  getAdminFeatures(id: number): Promise<string[]>;
  setAdminFeatures(id: number, features: string[]): Promise<void>;
  listAdminFeatureCatalog(): Promise<AdminFeatureCatalogItem[]>;
}

export const ADMIN_MANAGEMENT_PORT = Symbol('PLATFORM_ADMIN_MANAGEMENT_PORT');
