import { PlatformAdminEntity } from '../../../domain/entities/user.entity';
import { AdminFeatureCatalogItem } from '../outbound/platform-admin-repository.port';

/** 플랫폼 관리자 생성 입력 (ROOT 가 ADMIN 추가) */
export interface CreateAdminInput {
  email: string;
  password: string;
  name: string;
  // 초기 부여 옵션 key (생략 시 없음)
  features?: string[];
}

/** 플랫폼 관리자 수정 입력: 제공된 필드만(name, email. 추후 profileImage 확장) */
export interface UpdateAdminInput {
  name?: string;
  // 로그인 ID. 전역 유일이며 ROOT 는 변경할 수 없다.
  email?: string;
}

/**
 * 플랫폼 관리자 관리 Inbound Port: 다중 관리자 + 옵션(admin_features)
 * ROOT 한정 호출은 상위(control-tower PlatformRootGuard)가 강제한다.
 */
export interface AdminManagementPort {
  listAdmins(): Promise<PlatformAdminEntity[]>;
  createAdmin(input: CreateAdminInput): Promise<PlatformAdminEntity>;
  /** 관리자 프로필 수정(name, email): 수정된 엔티티 반환 */
  updateAdmin(id: number, patch: UpdateAdminInput): Promise<PlatformAdminEntity>;
  /**
   * 이 이메일을 쓸 수 있는지(저장 전 사전 확인용). excludeId 는 자기 자신(수정 대상)을 제외한다.
   * 판정만 돌려주는 조회라 Record 접미사를 쓰지 않는다.
   */
  isAdminEmailAvailable(email: string, excludeId?: number): Promise<boolean>;
  /** 관리자 삭제: ROOT 는 삭제 불가 */
  deleteAdmin(id: number): Promise<void>;
  /** 관리자에게 부여된 옵션 key */
  getAdminFeatures(id: number): Promise<string[]>;
  /** 관리자 옵션 일괄 동기화(원하는 key 전체 집합) */
  setAdminFeatures(id: number, featureKeys: string[]): Promise<void>;
  /** 옵션 카탈로그(부여 UI 용) */
  listAdminFeatureCatalog(): Promise<AdminFeatureCatalogItem[]>;
}

export const ADMIN_MANAGEMENT_PORT = Symbol('ADMIN_MANAGEMENT_PORT');
