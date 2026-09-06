// AI 어시스턴트 전역 설정 데이터 접근(브라우저): 계약(assistantSettingsContract) 기반 bff() 호출
// 조회는 SSR(+page.server.ts authControlClient)에서 직접. 여기선 수정만
import { bff } from '$lib/infrastructure/http/bffClient';
import type { ApiResult } from '$lib/infrastructure/http/apiResult';
import { assistantSettingsContract } from '../assistantSettingsContract';
import type { PlatformAssistantSettings, UpdatePlatformAssistantSettingsInput } from '../types';

export function updateAssistantSettings(
  patch: UpdatePlatformAssistantSettingsInput,
): Promise<ApiResult<PlatformAssistantSettings>> {
  return bff(assistantSettingsContract.update, patch);
}
