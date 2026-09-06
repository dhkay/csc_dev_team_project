// 직책(positions) BFF 엔드포인트 타입 계약: 멤버 직책 설정/해제(null=해제)
import { defineRoute } from '$lib/infrastructure/http/bffClient';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type { OrgPosition } from './types';

export const positionsContract = {
  set: defineRoute<{ id: number; position: OrgPosition | null }, void>('POST', ROUTES.ADMIN.POSITIONS)
};
