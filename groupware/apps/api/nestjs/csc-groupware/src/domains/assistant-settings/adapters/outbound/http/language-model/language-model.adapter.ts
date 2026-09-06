import { Injectable } from '@nestjs/common';
import { LanguageModelApiClientService } from '../../../../../../shared/adapters/outbound/language-model-api';
import { AssistantModelOption } from '../../../../core/domain/types/assistant-settings.types';
import { LanguageModelGatewayPort } from '../../../../core/application/ports/outbound/language-model-gateway.port';

/** LanguageModelGatewayPort 구현: language-model `/inference/models`(서비스토큰) 호출 */
@Injectable()
export class LanguageModelGatewayAdapter implements LanguageModelGatewayPort {
  constructor(private readonly client: LanguageModelApiClientService) {}

  listModels(): Promise<AssistantModelOption[]> {
    return this.client.get<AssistantModelOption[]>('/inference/models');
  }
}
