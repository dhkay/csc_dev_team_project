// 조직 AI 어시스턴트 설정 데이터 접근(브라우저): BFF(/api/assistant-settings) frontClient 호출
// org 는 BFF 가 세션에서 주입하므로 클라이언트는 patch 필드만 보낸다. 조회는 SSR(+page.server.ts)
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { run, type ApiResult } from '$lib/infrastructure/http/apiResult';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type { OrganizationAssistantSettings, UpdateOrganizationAssistantSettingsInput } from '../types';

/** 조직 설정 수정(제공된 필드만) */
export function updateAssistantSettings(
  patch: UpdateOrganizationAssistantSettingsInput,
): Promise<ApiResult<OrganizationAssistantSettings>> {
  return run<OrganizationAssistantSettings>(() =>
    frontClient().PATCH(ROUTES.ASSISTANT_SETTINGS, patch),
  );
}
