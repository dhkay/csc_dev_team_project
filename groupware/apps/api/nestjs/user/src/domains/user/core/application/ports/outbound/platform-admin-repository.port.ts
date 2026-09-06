import { PlatformAdminEntity } from '../../../domain/entities/user.entity';
import { UserRole, UserStatus } from '../../../domain/types/user.types';

/** 플랫폼 슈퍼관리자 생성 입력 */
export interface CreatePlatformAdminRecord {
  email: string;
  passwordHash: string;
  // 이름: 유일한 이름 필드(표시 이름)
  name: string;
  role?: UserRole;
  status?: UserStatus;
}

/** 플랫폼 관리자 옵션 카탈로그 항목 */
export interface AdminFeatureCatalogItem {
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

/**
 * 플랫폼 슈퍼관리자 레포지토리 아웃바운드 포트
 * users(테넌트)와 분리된 platform_admins 테이블 전용. email 은 전역 유일이라 조회에 org 스코프가 없다.
 */
export interface PlatformAdminRepositoryPort {
  findOneRecordByEmail(email: string): Promise<PlatformAdminEntity | null>;
  findOneRecordById(id: number): Promise<PlatformAdminEntity | null>;
  createRecord(record: CreatePlatformAdminRecord): Promise<PlatformAdminEntity>;
  updatePasswordHashRecord(id: number, passwordHash: string): Promise<void>;
  updateLoginSecurityRecord(
    id: number,
    failedLoginAttempts: number,
    lockedUntil: Date | null,
  ): Promise<void>;
  incrementTokenVersionRecord(id: number): Promise<void>;
  // 플랫폼 관리자 관리(다중) + 옵션(admin_features)
  /** 전체 플랫폼 관리자 목록 */
  findManyAdminRecords(): Promise<PlatformAdminEntity[]>;
  /** 플랫폼 관리자 프로필 수정: 제공된 필드만(name, email. 추후 profileImage 확장) */
  updateAdminRecord(id: number, patch: { name?: string; email?: string }): Promise<void>;
  /** 플랫폼 관리자 삭제(연결된 옵션 grant 는 FK cascade) */
  deleteAdminRecord(id: number): Promise<void>;
  /** 옵션 카탈로그(활성): 부여 UI 용 */
  findManyAdminFeatureRecords(): Promise<AdminFeatureCatalogItem[]>;
  /** 관리자에게 부여된 옵션 key(활성 카탈로그만): key 목록 반환이라 무접미사(UserRepositoryPort 동일 패턴) */
  findAdminFeatureKeys(adminId: number): Promise<string[]>;
  /** 관리자 옵션을 원하는 key 집합으로 일괄 동기화(트랜잭션 reconcile) */
  setAdminFeaturesRecord(adminId: number, featureKeys: string[]): Promise<void>;
  /** 유효 옵션 key: ROOT 는 활성 카탈로그 전체, 그 외는 grant∩active(토큰/가드용). resolve 쿼리라 무접미사 */
  resolveAdminFeatures(adminId: number, role: UserRole): Promise<string[]>;
}

export const PLATFORM_ADMIN_REPOSITORY_PORT = Symbol('PLATFORM_ADMIN_REPOSITORY_PORT');
