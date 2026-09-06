// AI 어시스턴트 전역 설정 BFF 엔드포인트 타입 계약: 수정(PATCH). 조회는 SSR 백엔드 직접
import { defineRoute } from '$lib/infrastructure/http/bffClient';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type { PlatformAssistantSettings, UpdatePlatformAssistantSettingsInput } from './types';

export const assistantSettingsContract = {
  update: defineRoute<UpdatePlatformAssistantSettingsInput, PlatformAssistantSettings>(
    'PATCH',
    () => ROUTES.PLATFORM.ASSISTANT_SETTINGS,
  ),
};
