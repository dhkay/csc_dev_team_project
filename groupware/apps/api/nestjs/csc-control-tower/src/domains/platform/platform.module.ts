import { Module } from '@nestjs/common';
import {
  UserApiClientService,
  UserApiTokenService,
} from '../../shared/adapters/outbound/user-api';
import { FileUploadApiClientService } from '../../shared/adapters/outbound/file-upload-api';
import { PlatformAdminGuard, PlatformRootGuard } from '../../shared/guards';
import { OrganizationController } from './adapters/inbound/http/controllers/organization.controller';
import { AdminController } from './adapters/inbound/http/controllers/admin.controller';
import { AiToolController } from './adapters/inbound/http/controllers/ai-tool.controller';
import { AssistantSettingsController } from './adapters/inbound/http/controllers/assistant-settings.controller';
import { UserApiAdapter } from './adapters/outbound/http/user-api/user-api.adapter';
import { FileUploadApiAdapter } from './adapters/outbound/http/file-upload-api/file-upload-api.adapter';
import { OrganizationService } from './core/application/services/organization.service';
import { AdminManagementService } from './core/application/services/admin-management.service';
import { AiToolCatalogService } from './core/application/services/ai-tool-catalog.service';
import { AssistantSettingsService } from './core/application/services/assistant-settings.service';
import { ORGANIZATION_PORT } from './core/application/ports/inbound/organization.port';
import { ADMIN_MANAGEMENT_PORT } from './core/application/ports/inbound/admin-management.port';
import { AI_TOOL_CATALOG_PORT } from './core/application/ports/inbound/ai-tool-catalog.port';
import { ASSISTANT_SETTINGS_PORT } from './core/application/ports/inbound/assistant-settings.port';
import { USER_API_PORT } from './core/application/ports/outbound/user-api.port';
import { FILE_UPLOAD_API_PORT } from './core/application/ports/outbound/file-upload-api.port';

/**
 * 플랫폼(벤더 운영사) 도메인: 조직 생성/관리
 * 조직 쓰기는 user 서버에 위임(소유권). control-tower 는 게이트 + 위임만
 */
@Module({
  controllers: [OrganizationController, AdminController, AiToolController, AssistantSettingsController],
  providers: [
    { provide: ORGANIZATION_PORT, useClass: OrganizationService },
    { provide: ADMIN_MANAGEMENT_PORT, useClass: AdminManagementService },
    { provide: AI_TOOL_CATALOG_PORT, useClass: AiToolCatalogService },
    { provide: ASSISTANT_SETTINGS_PORT, useClass: AssistantSettingsService },
    { provide: USER_API_PORT, useClass: UserApiAdapter },
    { provide: FILE_UPLOAD_API_PORT, useClass: FileUploadApiAdapter },
    UserApiClientService,
    UserApiTokenService,
    FileUploadApiClientService,
    PlatformAdminGuard,
    PlatformRootGuard,
  ],
})
export class PlatformModule {}
