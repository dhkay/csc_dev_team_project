import { Inject, Injectable } from '@nestjs/common';
import {
  AssistantModelOption,
  EffectiveAssistantConfig,
  OrganizationAssistantSettings,
  UpdateOrganizationAssistantSettingsInput,
} from '../../domain/types/assistant-settings.types';
import { AssistantSettingsPort } from '../ports/inbound/assistant-settings.port';
import {
  ASSISTANT_SETTINGS_REPOSITORY_PORT,
  AssistantSettingsRepositoryPort,
} from '../ports/outbound/assistant-settings-repository.port';
import {
  PLATFORM_ASSISTANT_SETTINGS_GATEWAY_PORT,
  PlatformAssistantSettingsGatewayPort,
} from '../ports/outbound/platform-assistant-settings-gateway.port';
import {
  LANGUAGE_MODEL_GATEWAY_PORT,
  LanguageModelGatewayPort,
} from '../ports/outbound/language-model-gateway.port';

const EMPTY_ORG_SETTINGS: OrganizationAssistantSettings = {
  defaultModel: null,
  promptAddition: null,
};

/**
 * AI 어시스턴트 설정 Service (csc-groupware)
 *  - 조직 오버라이드: groupwaredb 레포(조직당 1행)
 *  - resolveEffective: 조직 오버라이드 + 플랫폼 전역(user fetch)을 병합해 language-model 이 쓸 최종값 산출
 * 병합 규칙(설계: multi-tenancy.md):
 *   enabled = 플랫폼 킬스위치
 *   defaultModel = 조직 기본 모델. null 이면 language-model 이 카탈로그 기본(내장 Qwen)으로 떨어진다.
 *   systemPrompt = 플랫폼 공통 + (조직 추가) 이어붙임
 * 모델 정책(플랫폼 허용 목록/전역 기본 모델)은 없다: 어떤 모델을 쓸지는 조직이 정한다.
 */
@Injectable()
export class AssistantSettingsService implements AssistantSettingsPort {
  constructor(
    @Inject(ASSISTANT_SETTINGS_REPOSITORY_PORT)
    private readonly repository: AssistantSettingsRepositoryPort,
    @Inject(PLATFORM_ASSISTANT_SETTINGS_GATEWAY_PORT)
    private readonly platformGateway: PlatformAssistantSettingsGatewayPort,
    @Inject(LANGUAGE_MODEL_GATEWAY_PORT)
    private readonly languageModelGateway: LanguageModelGatewayPort,
  ) {}

  async listModels(): Promise<AssistantModelOption[]> {
    // 조직 기본 모델 select 후보 = language-model 카탈로그 전체(모델 SSOT). 플랫폼 화이트리스트는 없다.
    // 외부 모델은 조직이 자기 API 키를 등록해야 실제로 동작한다(선택 자체는 막지 않는다)
    return this.languageModelGateway.listModels();
  }

  async getForOrg(organizationId: number): Promise<OrganizationAssistantSettings> {
    return (
      (await this.repository.findRecordByOrganizationId(organizationId)) ?? EMPTY_ORG_SETTINGS
    );
  }

  async updateForOrg(
    organizationId: number,
    patch: UpdateOrganizationAssistantSettingsInput,
  ): Promise<OrganizationAssistantSettings> {
    return this.repository.upsertRecordByOrganizationId(organizationId, patch);
  }

  async resolveEffective(organizationId: number): Promise<EffectiveAssistantConfig> {
    const [platform, org] = await Promise.all([
      this.platformGateway.getPlatformSettings(),
      this.repository.findRecordByOrganizationId(organizationId),
    ]);

    const parts: string[] = [];
    if (platform.commonPrompt && platform.commonPrompt.trim()) parts.push(platform.commonPrompt);
    if (org?.promptAddition && org.promptAddition.trim()) parts.push(org.promptAddition);
    const systemPrompt = parts.length ? parts.join('\n\n') : null;

    return {
      enabled: platform.globalEnabled,
      // 조직이 안 정했으면 null: language-model 이 카탈로그 기본(내장 Qwen)으로 해석한다.
      defaultModel: org?.defaultModel ?? null,
      systemPrompt,
    };
  }
}
