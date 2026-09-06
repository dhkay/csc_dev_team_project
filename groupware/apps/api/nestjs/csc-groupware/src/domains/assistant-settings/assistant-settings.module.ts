import { Module } from '@nestjs/common';
import {
  UserApiClientService,
  UserApiTokenService,
} from '../../shared/adapters/outbound/user-api';
import { LanguageModelApiClientService } from '../../shared/adapters/outbound/language-model-api';
import { AssistantSettingsController } from './adapters/inbound/http/controllers/assistant-settings.controller';
import { InternalAssistantConfigController } from './adapters/inbound/http/controllers/internal-assistant-config.controller';
import { AssistantSettingsRepositoryAdapter } from './adapters/outbound/db/groupwaredb/assistant-settings.adapter';
import { PlatformAssistantSettingsUserApiAdapter } from './adapters/outbound/http/user-api/platform-assistant-settings.adapter';
import { LanguageModelGatewayAdapter } from './adapters/outbound/http/language-model/language-model.adapter';
import { AssistantSettingsService } from './core/application/services/assistant-settings.service';
import { ASSISTANT_SETTINGS_PORT } from './core/application/ports/inbound/assistant-settings.port';
import { ASSISTANT_SETTINGS_REPOSITORY_PORT } from './core/application/ports/outbound/assistant-settings-repository.port';
import { PLATFORM_ASSISTANT_SETTINGS_GATEWAY_PORT } from './core/application/ports/outbound/platform-assistant-settings-gateway.port';
import { LANGUAGE_MODEL_GATEWAY_PORT } from './core/application/ports/outbound/language-model-gateway.port';

/**
 * AI 어시스턴트 설정 도메인: 조직 오버라이드(groupwaredb) + 플랫폼 전역(user fetch) 병합
 * 조직 CRUD(assistant-settings) + 채팅 시점 병합 resolve(internal/assistant-config)
 */
@Module({
  controllers: [AssistantSettingsController, InternalAssistantConfigController],
  providers: [
    { provide: ASSISTANT_SETTINGS_PORT, useClass: AssistantSettingsService },
    { provide: ASSISTANT_SETTINGS_REPOSITORY_PORT, useClass: AssistantSettingsRepositoryAdapter },
    {
      provide: PLATFORM_ASSISTANT_SETTINGS_GATEWAY_PORT,
      useClass: PlatformAssistantSettingsUserApiAdapter,
    },
    { provide: LANGUAGE_MODEL_GATEWAY_PORT, useClass: LanguageModelGatewayAdapter },
    UserApiClientService,
    UserApiTokenService,
    LanguageModelApiClientService,
  ],
})
export class AssistantSettingsModule {}
