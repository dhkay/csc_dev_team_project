import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { groupwareDb, organizationAssistantSettings } from '@csc/database/groupwaredb';
import {
  OrganizationAssistantSettings,
  UpdateOrganizationAssistantSettingsInput,
} from '../../../../core/domain/types/assistant-settings.types';
import { AssistantSettingsRepositoryPort } from '../../../../core/application/ports/outbound/assistant-settings-repository.port';

/**
 * 조직별 AI 어시스턴트 설정 레포지토리 (groupwaredb): 조직당 1행 upsert.
 * organization_id 는 userdb 소유라 FK 없이 값만 보관(크로스-DB FK 금지: api_credentials 와 동일)
 */
@Injectable()
export class AssistantSettingsRepositoryAdapter implements AssistantSettingsRepositoryPort {
  async findRecordByOrganizationId(
    organizationId: number,
  ): Promise<OrganizationAssistantSettings | null> {
    const [row] = await groupwareDb
      .select({
        defaultModel: organizationAssistantSettings.defaultModel,
        promptAddition: organizationAssistantSettings.promptAddition,
      })
      .from(organizationAssistantSettings)
      .where(eq(organizationAssistantSettings.organizationId, organizationId))
      .limit(1);
    if (!row) return null;
    return { defaultModel: row.defaultModel ?? null, promptAddition: row.promptAddition ?? null };
  }

  async upsertRecordByOrganizationId(
    organizationId: number,
    patch: UpdateOrganizationAssistantSettingsInput,
  ): Promise<OrganizationAssistantSettings> {
    const set = {
      ...(patch.defaultModel !== undefined ? { defaultModel: patch.defaultModel } : {}),
      ...(patch.promptAddition !== undefined ? { promptAddition: patch.promptAddition } : {}),
      updatedAt: new Date(),
    };
    await groupwareDb
      .insert(organizationAssistantSettings)
      .values({ organizationId, ...set })
      .onConflictDoUpdate({ target: organizationAssistantSettings.organizationId, set });
    return (await this.findRecordByOrganizationId(organizationId)) ?? {
      defaultModel: null,
      promptAddition: null,
    };
  }
}
