// 조직(organizations) BFF 엔드포인트 타입 계약: 생성/수정/삭제 + ROOT 관리자/AI도구 조회
import { defineRoute } from '$lib/infrastructure/http/bffClient';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  OrgMemberSummary,
  ReplaceRootAdminInput,
  RootAdminEmailAvailability,
  RootAdminSummary,
  UpdateRootAdminInput
} from './types';

export const organizationsContract = {
  create: defineRoute<CreateOrganizationInput, unknown>('POST', ROUTES.PLATFORM.ORGANIZATIONS),
  update: defineRoute<{ id: number } & UpdateOrganizationInput, unknown>(
    'PATCH',
    ROUTES.PLATFORM.ORGANIZATIONS
  ),
  remove: defineRoute<{ id: number; mode: 'soft' | 'hard' }, unknown>(
    'DELETE',
    ROUTES.PLATFORM.ORGANIZATIONS
  ),
  recover: defineRoute<void, unknown, { id: number }>('POST', (p) =>
    ROUTES.PLATFORM.recover(p.id)
  ),
  getRootAdmin: defineRoute<void, RootAdminSummary, { id: number }>('GET', (p) =>
    ROUTES.PLATFORM.rootAdmin(p.id)
  ),
  updateRootAdmin: defineRoute<UpdateRootAdminInput, RootAdminSummary, { id: number }>(
    'PATCH',
    (p) => ROUTES.PLATFORM.rootAdmin(p.id)
  ),
  // 이메일 중복 확인(읽기): 쿼리로 전달하므로 path 를 파라미터 함수로 둔다.
  checkRootAdminEmail: defineRoute<
    void,
    RootAdminEmailAvailability,
    { id: number; email: string }
  >('GET', (p) => ROUTES.PLATFORM.rootAdminEmailCheck(p.id, p.email)),
  listMembers: defineRoute<void, OrgMemberSummary[], { id: number }>('GET', (p) =>
    ROUTES.PLATFORM.orgMembers(p.id)
  ),
  transferRootAdmin: defineRoute<{ userId: number }, RootAdminSummary, { id: number }>('POST', (p) =>
    ROUTES.PLATFORM.rootAdminTransfer(p.id)
  ),
  replaceRootAdmin: defineRoute<ReplaceRootAdminInput, RootAdminSummary, { id: number }>(
    'POST',
    (p) => ROUTES.PLATFORM.rootAdminReplace(p.id)
  ),
  getAiTools: defineRoute<void, string[], { id: number }>('GET', (p) =>
    ROUTES.PLATFORM.aiTools(p.id)
  ),
  resetRootPassword: defineRoute<{ password: string }, unknown, { id: number }>('POST', (p) =>
    ROUTES.PLATFORM.rootAdmin(p.id)
  )
};
