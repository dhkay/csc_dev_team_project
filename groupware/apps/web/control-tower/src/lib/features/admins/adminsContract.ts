// 플랫폼 관리자(admins) BFF 엔드포인트 타입 계약: client api 와 +server.ts 공유 단일 출처
import { defineRoute } from '$lib/infrastructure/http/bffClient';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type {
  AdminEmailAvailability,
  AdminSummary,
  CreateAdminInput,
  UpdateAdminInput
} from './types';

export const adminsContract = {
  create: defineRoute<CreateAdminInput, AdminSummary>('POST', ROUTES.PLATFORM.ADMINS),
  // 이메일 중복 확인(읽기): 쿼리로 전달하므로 path 를 파라미터 함수로 둔다.
  checkEmail: defineRoute<void, AdminEmailAvailability, { email: string; excludeId?: number }>(
    'GET',
    ({ email, excludeId }) => ROUTES.PLATFORM.adminEmailCheck(email, excludeId)
  ),
  update: defineRoute<{ id: number } & UpdateAdminInput, void>('PATCH', ROUTES.PLATFORM.ADMINS),
  setFeatures: defineRoute<{ id: number; features: string[] }, void>('PATCH', ROUTES.PLATFORM.ADMINS),
  remove: defineRoute<{ id: number }, void>('DELETE', ROUTES.PLATFORM.ADMINS)
};
