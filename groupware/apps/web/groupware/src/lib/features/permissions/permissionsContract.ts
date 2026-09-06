// 권한 부여(permissions) BFF 엔드포인트 타입 계약: 부서/멤버 대상에 desired key 집합 설정
import { defineRoute } from '$lib/infrastructure/http/bffClient';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type { PermissionKey } from './types';

export const permissionsContract = {
  set: defineRoute<{ target: 'department' | 'member'; id: number; permissionKeys: PermissionKey[] }, void>(
    'POST',
    ROUTES.ADMIN.PERMISSIONS
  )
};
