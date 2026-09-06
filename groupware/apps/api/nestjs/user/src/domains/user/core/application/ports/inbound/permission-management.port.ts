import { DepartmentActor } from './department-management.port';
import { PermissionGrantMatrix } from '../outbound/permission-grant-repository.port';

/**
 * 권한 부여 관리 Inbound Port: 슈퍼관리자(조직 ROOT)가 부서/일반관리자에 권한을 부여
 * 테넌트 격리, ROOT 강제, 대상(부서/멤버) 검증은 서비스가 보안 경계로 강제한다.
 */
export interface PermissionManagementPort {
  /** 조직 범위 부여 현황(편집 UI 용: 부서/멤버 직접 부여, 상속 미포함) */
  getGrantMatrix(actor: DepartmentActor): Promise<PermissionGrantMatrix>;
  /** 부서 권한을 desired key 집합으로 설정(부서는 actor 조직 소속이어야 함) */
  setDepartmentPermissions(
    actor: DepartmentActor,
    departmentId: number,
    permissionKeys: string[],
  ): Promise<void>;
  /** 멤버(일반관리자) 직접 권한을 desired key 집합으로 설정(같은 조직 ADMIN 만) */
  setMemberPermissions(
    actor: DepartmentActor,
    memberId: number,
    permissionKeys: string[],
  ): Promise<void>;
}

export const PERMISSION_MANAGEMENT_PORT = Symbol('PERMISSION_MANAGEMENT_PORT');
