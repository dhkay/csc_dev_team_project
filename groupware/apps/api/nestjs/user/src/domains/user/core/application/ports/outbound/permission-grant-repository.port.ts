/** 부서/멤버 권한 부여 현황(직접 부여만. 상속 미포함). 편집 UI 용 */
export interface PermissionGrantMatrix {
  // 부서별 직접 부여된 권한 key.
  departments: { departmentId: number; permissionKeys: string[] }[];
  // 멤버별 직접 부여된 권한 key.
  members: { userId: number; permissionKeys: string[] }[];
}

/**
 * 권한 부여 아웃바운드 포트 (userdb): 부서/멤버 권한 부여를 읽고(편집용) 멱등 동기화한다.
 * set* 은 desired key 집합으로 reconcile(없는 건 추가, 빠진 건 삭제). setOrganizationAiToolsRecord 패턴
 */
export interface PermissionGrantRepositoryPort {
  /** 조직 범위 부여 현황(부서 + 멤버 직접 부여): 편집용 derived 조회(findOrganizationAiToolKeys 와 동류, Record 없음) */
  findGrantMatrixByOrganizationId(organizationId: number): Promise<PermissionGrantMatrix>;
  /** 부서 권한을 desired key 집합으로 동기화(활성 카탈로그 key 만 반영) */
  setDepartmentPermissionsRecord(
    departmentId: number,
    permissionKeys: string[],
    grantedBy: number,
  ): Promise<void>;
  /** 멤버 직접 권한을 desired key 집합으로 동기화 */
  setUserPermissionsRecord(
    organizationId: number,
    userId: number,
    permissionKeys: string[],
    assignedBy: number,
  ): Promise<void>;
}

export const PERMISSION_GRANT_REPOSITORY_PORT = Symbol('PERMISSION_GRANT_REPOSITORY_PORT');
