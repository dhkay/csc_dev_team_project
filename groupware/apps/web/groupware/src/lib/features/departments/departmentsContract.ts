// 부서(departments) BFF 엔드포인트 타입 계약: client api 와 +server.ts 공유 단일 출처
import { defineRoute } from '$lib/infrastructure/http/bffClient';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type { Department } from './types';

export const departmentsContract = {
  create: defineRoute<{ parentId: number | null; name: string }, Department>(
    'POST',
    ROUTES.ADMIN.DEPARTMENTS
  ),
  update: defineRoute<{ id: number; name?: string; parentId?: number | null }, Department>(
    'PATCH',
    ROUTES.ADMIN.DEPARTMENTS
  ),
  remove: defineRoute<{ id: number }, void>('DELETE', ROUTES.ADMIN.DEPARTMENTS)
};
