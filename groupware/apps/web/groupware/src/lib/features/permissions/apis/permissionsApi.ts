// 권한 부여 데이터 접근(브라우저): 타입 계약(permissionsContract) 기반 bff() 로 BFF 호출
// 쓰기(부서/멤버 권한 설정)만 여기서. 현황(매트릭스)은 SSR(+page.server.ts)에서 authUserClient 로
import { bff } from '$lib/infrastructure/http/bffClient';
import { permissionsContract } from '../permissionsContract';
import type { PermissionKey } from '../types';

export type PermissionResult =
  | { success: true }
  | { success: false; errorCode?: string; error?: string };

/** 부서 권한 설정(desired key 전체 집합) */
export function setDepartmentPermissions(
  departmentId: number,
  permissionKeys: PermissionKey[],
): Promise<PermissionResult> {
  return bff(permissionsContract.set, { target: 'department', id: departmentId, permissionKeys });
}

/** 멤버(일반관리자) 직접 권한 설정(desired key 전체 집합) */
export function setMemberPermissions(
  memberId: number,
  permissionKeys: PermissionKey[],
): Promise<PermissionResult> {
  return bff(permissionsContract.set, { target: 'member', id: memberId, permissionKeys });
}
