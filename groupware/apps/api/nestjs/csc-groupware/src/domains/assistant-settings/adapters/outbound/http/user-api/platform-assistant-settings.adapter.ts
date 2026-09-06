import { Injectable } from '@nestjs/common';
import { UserApiClientService } from '../../../../../../shared/adapters/outbound/user-api';
import { PlatformAssistantSettings } from '../../../../core/domain/types/assistant-settings.types';
import { PlatformAssistantSettingsGatewayPort } from '../../../../core/application/ports/outbound/platform-assistant-settings-gateway.port';

/**
 * 플랫폼 전역 AI 어시스턴트 설정 게이트웨이 구현: user `/internal/platform-assistant-settings` 조회
 * userdb 소유(user 서버)라 위임. 공유 UserApiClientService(X-Service-Token 자동 주입) 사용
 */
@Injectable()
export class PlatformAssistantSettingsUserApiAdapter
  implements PlatformAssistantSettingsGatewayPort
{
  constructor(private readonly client: UserApiClientService) {}

  getPlatformSettings(): Promise<PlatformAssistantSettings> {
    return this.client.get<PlatformAssistantSettings>('/internal/platform-assistant-settings');
  }
}
