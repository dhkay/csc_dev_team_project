import { Inject, Injectable } from '@nestjs/common';
import {
  PlatformAssistantSettings,
  UpdatePlatformAssistantSettingsInput,
} from '../../domain/assistant-settings.types';
import { AssistantSettingsPort } from '../ports/inbound/assistant-settings.port';
import { USER_API_PORT, UserApiPort } from '../ports/outbound/user-api.port';

/**
 * 플랫폼 AI 어시스턴트 전역 설정 Service (control-tower): 조회, 수정
 * 설정 SSOT = userdb(user 위임). control-tower 는 게이트 + 위임
 */
@Injectable()
export class AssistantSettingsService implements AssistantSettingsPort {
  constructor(
    @Inject(USER_API_PORT)
    private readonly userApi: UserApiPort,
  ) {}

  getSettings(): Promise<PlatformAssistantSettings> {
    return this.userApi.getPlatformAssistantSettings();
  }

  updateSettings(
    patch: UpdatePlatformAssistantSettingsInput,
  ): Promise<PlatformAssistantSettings> {
    return this.userApi.updatePlatformAssistantSettings(patch);
  }
}
