// 조직 AI 어시스턴트 설정 BFF: csc-groupware `/assistant-settings` 중계 (루트 권한자 전용)
// GET: 조직 설정 조회. PATCH: 수정. organizationId 는 세션에서 도출해 BFF 가 주입(브라우저 비신뢰)
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverMainClient } from '$lib/infrastructure/http/serverClientInstances';
import {
  requireAssistantSettingsManager,
  mapAssistantSettingsError,
} from '$lib/server/assistant-settings/bff';

interface OrganizationAssistantSettings {
  defaultModel: string | null;
  promptAddition: string | null;
}

/** 조회: GET /api/assistant-settings */
export async function GET(event: RequestEvent) {
  const auth = await requireAssistantSettingsManager(event);
  if ('error' in auth) return auth.error;
  try {
    const res = await serverMainClient().GET<OrganizationAssistantSettings>(
      `/assistant-settings?organizationId=${auth.orgId}`,
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapAssistantSettingsError(error, '설정을 불러오지 못했습니다.');
  }
}

/** 수정: PATCH /api/assistant-settings { defaultModel?, promptAddition? } */
export async function PATCH(event: RequestEvent) {
  const auth = await requireAssistantSettingsManager(event);
  if ('error' in auth) return auth.error;
  const body = (await event.request.json().catch(() => null)) as {
    defaultModel?: string | null;
    promptAddition?: string | null;
  } | null;
  if (!body || typeof body !== 'object') {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }
  try {
    const res = await serverMainClient().PATCH<OrganizationAssistantSettings>(
      '/assistant-settings',
      { organizationId: auth.orgId, ...body },
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapAssistantSettingsError(error, '설정을 저장하지 못했습니다.');
  }
}
