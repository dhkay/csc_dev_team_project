import { AssistantModelOption } from '../../../domain/types/assistant-settings.types';

/**
 * language-model 모델 카탈로그 게이트웨이: 전체 chat 모델 유니버스 조회(org 무관)
 * 조직 기본 모델 select 후보가 곧 이 유니버스다(플랫폼이 좁히지 않는다)
 */
export interface LanguageModelGatewayPort {
  listModels(): Promise<AssistantModelOption[]>;
}

export const LANGUAGE_MODEL_GATEWAY_PORT = Symbol('LANGUAGE_MODEL_GATEWAY_PORT');
