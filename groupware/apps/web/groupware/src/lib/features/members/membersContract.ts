// 조직 사용자관리(members) BFF 엔드포인트 타입 계약: client api 와 +server.ts 가 공유하는 단일 출처
// 경로는 ROUTES.ADMIN.MEMBERS(Tier 0 SSOT) 재사용. 쓰기(생성/수정/삭제/영구삭제)만
import { defineRoute } from '$lib/infrastructure/http/bffClient';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type { CreateMemberInput, MemberSummary, UpdateMemberInput } from './types';

export const membersContract = {
  create: defineRoute<CreateMemberInput, MemberSummary>('POST', ROUTES.ADMIN.MEMBERS),
  update: defineRoute<{ id: number } & UpdateMemberInput, void>('PATCH', ROUTES.ADMIN.MEMBERS),
  remove: defineRoute<{ id: number }, void>('DELETE', ROUTES.ADMIN.MEMBERS),
  purge: defineRoute<{ id: number }, void>('DELETE', `${ROUTES.ADMIN.MEMBERS}/purge`)
};
