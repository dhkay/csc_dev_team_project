// 권한(시스템관리 등) 도메인 타입: SSOT 는 공유 커널 @csc/entitlements.
// 부서/멤버에 부여하며, 부서 부여는 하위 소속 조직원이 상속(토큰 permissions[])
// 개인 전용 권한(예: 대표)은 부서 부여 불가: 부서 UI 는 DEPARTMENT_ASSIGNABLE_PERMISSION_KEYS 순회
// ROOT 전용 부여 권한(예: 시스템관리)은 비-ROOT 부여 UI 에서 비활성: isRootOnlyGrantPermission.
export {
  PermissionKey,
  PERMISSION_LABELS,
  ALL_PERMISSION_KEYS,
  DEPARTMENT_ASSIGNABLE_PERMISSION_KEYS,
  isIndividualOnlyPermission,
  isRootOnlyGrantPermission,
  isRootRoleOnlyGrantPermission,
} from '@csc/entitlements';
import type { PermissionKey } from '@csc/entitlements';

/** 부서/멤버 권한 부여 현황(직접 부여만. 상속 미포함). user 서버 /user-api/org/permissions/grants 응답과 동형 */
export interface PermissionGrantMatrix {
  departments: { departmentId: number; permissionKeys: PermissionKey[] }[];
  members: { userId: number; permissionKeys: PermissionKey[] }[];
}
