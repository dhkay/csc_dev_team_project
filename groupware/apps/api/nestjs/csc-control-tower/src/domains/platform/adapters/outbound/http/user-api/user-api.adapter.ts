import { Injectable } from '@nestjs/common';
import { UserApiClientService } from '../../../../../../shared/adapters/outbound/user-api';
import {
  CreatedCompany,
  OrganizationSummary,
  OrgMemberSummary,
  ReplaceRootAdminInput,
  RootAdminSummary,
} from '../../../../core/domain/organization.types';
import { AiToolCatalogItem } from '../../../../core/domain/ai-tool.types';
import {
  AdminSummary,
  AdminFeatureCatalogItem,
  CreateAdminInput,
} from '../../../../core/domain/admin.types';
import {
  CreateOrganizationViaUserInput,
  UpdateAiToolViaUserInput,
  UpdateOrganizationViaUserInput,
  UserApiPort,
} from '../../../../core/application/ports/outbound/user-api.port';
import {
  PlatformAssistantSettings,
  UpdatePlatformAssistantSettingsInput,
} from '../../../../core/domain/assistant-settings.types';

/** UserApiPort 구현: user 서버 /internal/organizations 호출(서비스토큰) */
@Injectable()
export class UserApiAdapter implements UserApiPort {
  constructor(private readonly client: UserApiClientService) {}

  async createOrganization(input: CreateOrganizationViaUserInput): Promise<CreatedCompany> {
    return this.client.post<CreatedCompany>('/internal/organizations', {
      slug: input.slug,
      name: input.name,
      profileImageUrl: input.profileImageUrl,
      rootAdmin: input.rootAdmin,
    });
  }

  async listOrganizations(): Promise<OrganizationSummary[]> {
    return this.client.get<OrganizationSummary[]>('/internal/organizations');
  }

  async updateOrganization(
    id: number,
    patch: UpdateOrganizationViaUserInput,
  ): Promise<OrganizationSummary> {
    return this.client.patch<OrganizationSummary>(`/internal/organizations/${id}`, patch);
  }

  async withdrawOrganization(id: number): Promise<void> {
    await this.client.delete<{ success: boolean }>(`/internal/organizations/${id}`);
  }

  recoverOrganization(id: number): Promise<OrganizationSummary> {
    return this.client.post<OrganizationSummary>(`/internal/organizations/${id}/recover`);
  }

  async purgeOrganization(id: number): Promise<void> {
    await this.client.delete<{ success: boolean }>(`/internal/organizations/${id}/purge`);
  }

  async getRootAdmin(id: number): Promise<RootAdminSummary> {
    return this.client.get<RootAdminSummary>(`/internal/organizations/${id}/root-admin`);
  }

  updateRootAdmin(
    id: number,
    patch: { name?: string; email?: string },
  ): Promise<RootAdminSummary> {
    return this.client.patch<RootAdminSummary>(`/internal/organizations/${id}/root-admin`, patch);
  }

  listOrganizationMembers(id: number): Promise<OrgMemberSummary[]> {
    return this.client.get<OrgMemberSummary[]>(`/internal/organizations/${id}/members`);
  }

  transferRootAdmin(id: number, userId: number): Promise<RootAdminSummary> {
    return this.client.post<RootAdminSummary>(
      `/internal/organizations/${id}/root-admin/transfer`,
      { userId },
    );
  }

  replaceRootAdmin(id: number, input: ReplaceRootAdminInput): Promise<RootAdminSummary> {
    return this.client.post<RootAdminSummary>(
      `/internal/organizations/${id}/root-admin/replace`,
      input,
    );
  }

  async isRootAdminEmailAvailable(id: number, email: string): Promise<boolean> {
    const query = new URLSearchParams({ email });
    const res = await this.client.get<{ available: boolean }>(
      `/internal/organizations/${id}/root-admin/email-available?${query.toString()}`,
    );
    return res.available;
  }

  async resetRootPassword(id: number, password: string): Promise<void> {
    await this.client.post<{ success: boolean }>(
      `/internal/organizations/${id}/root-admin/reset-password`,
      { password },
    );
  }

  getOrganizationAiTools(id: number): Promise<string[]> {
    return this.client.get<string[]>(`/internal/organizations/${id}/ai-tools`);
  }

  listAiToolCatalog(): Promise<AiToolCatalogItem[]> {
    return this.client.get<AiToolCatalogItem[]>('/internal/ai-tools');
  }

  updateAiTool(key: string, patch: UpdateAiToolViaUserInput): Promise<AiToolCatalogItem> {
    return this.client.patch<AiToolCatalogItem>(
      `/internal/ai-tools/${encodeURIComponent(key)}`,
      patch,
    );
  }

  listAdmins(): Promise<AdminSummary[]> {
    return this.client.get<AdminSummary[]>('/internal/admins');
  }

  createAdmin(input: CreateAdminInput): Promise<AdminSummary> {
    return this.client.post<AdminSummary>('/internal/admins', input);
  }

  updateAdmin(id: number, patch: { name?: string; email?: string }): Promise<AdminSummary> {
    return this.client.patch<AdminSummary>(`/internal/admins/${id}`, patch);
  }

  async isAdminEmailAvailable(email: string, excludeId?: number): Promise<boolean> {
    const query = new URLSearchParams({ email });
    if (excludeId !== undefined) query.set('excludeId', String(excludeId));
    const res = await this.client.get<{ available: boolean }>(
      `/internal/admins/email-available?${query.toString()}`,
    );
    return res.available;
  }

  async deleteAdmin(id: number): Promise<void> {
    await this.client.delete<{ success: boolean }>(`/internal/admins/${id}`);
  }

  getAdminFeatures(id: number): Promise<string[]> {
    return this.client.get<string[]>(`/internal/admins/${id}/features`);
  }

  async setAdminFeatures(id: number, features: string[]): Promise<void> {
    await this.client.patch<{ success: boolean }>(`/internal/admins/${id}/features`, { features });
  }

  listAdminFeatureCatalog(): Promise<AdminFeatureCatalogItem[]> {
    return this.client.get<AdminFeatureCatalogItem[]>('/internal/admin-features');
  }

  getPlatformAssistantSettings(): Promise<PlatformAssistantSettings> {
    return this.client.get<PlatformAssistantSettings>('/internal/platform-assistant-settings');
  }

  updatePlatformAssistantSettings(
    patch: UpdatePlatformAssistantSettingsInput,
  ): Promise<PlatformAssistantSettings> {
    return this.client.patch<PlatformAssistantSettings>(
      '/internal/platform-assistant-settings',
      patch,
    );
  }
}
