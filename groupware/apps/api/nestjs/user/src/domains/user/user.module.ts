import { Module } from '@nestjs/common';
import { AuthController } from './adapters/inbound/http/controllers/auth.controller';
import { AccountController } from './adapters/inbound/http/controllers/account.controller';
import { InternalController } from './adapters/inbound/http/controllers/internal.controller';
import { OrgMemberController } from './adapters/inbound/http/controllers/org-member.controller';
import { OrgDirectoryController } from './adapters/inbound/http/controllers/org-directory.controller';
import { DepartmentController } from './adapters/inbound/http/controllers/department.controller';
import { JwtAuthGuard } from './adapters/inbound/http/guards/jwt-auth.guard';
import { AuthService } from './core/application/services/auth.service';
import { OrganizationService } from './core/application/services/organization.service';
import { AdminManagementService } from './core/application/services/admin-management.service';
import { OrgMemberManagementService } from './core/application/services/org-member-management.service';
import { OrgDirectoryService } from './core/application/services/org-directory.service';
import { DepartmentManagementService } from './core/application/services/department-management.service';
import { PermissionManagementService } from './core/application/services/permission-management.service';
import { PositionManagementService } from './core/application/services/position-management.service';
import { AiToolDistributionService } from './core/application/services/ai-tool-distribution.service';
import { AiToolCatalogService } from './core/application/services/ai-tool-catalog.service';
import { PlatformAssistantSettingsService } from './core/application/services/platform-assistant-settings.service';
import { AccountService } from './core/application/services/account.service';
import { UserRepositoryAdapter } from './adapters/outbound/db/userdb/user.adapter';
import { DepartmentRepositoryAdapter } from './adapters/outbound/db/userdb/department.adapter';
import { PlatformAdminRepositoryAdapter } from './adapters/outbound/db/userdb/platform-admin.adapter';
import { OrganizationUserCredentialAdapter } from './adapters/outbound/db/userdb/credentials/organization-user-credential.adapter';
import { AdminUserCredentialAdapter } from './adapters/outbound/db/userdb/credentials/admin-user-credential.adapter';
import { EntitlementRepositoryAdapter } from './adapters/outbound/db/userdb/entitlement.adapter';
import { PermissionGrantRepositoryAdapter } from './adapters/outbound/db/userdb/permission-grant.adapter';
import { AiToolDistributionRepositoryAdapter } from './adapters/outbound/db/userdb/ai-tool-distribution.adapter';
import { CatalogSeedRepositoryAdapter } from './adapters/outbound/db/userdb/catalog-seed.adapter';
import { JwtTokenService } from './adapters/outbound/security/jwt-token.service';
import { BcryptPasswordHasher } from './adapters/outbound/security/bcrypt-password-hasher';
import { AdminSeederService } from './bootstrap/admin-seeder.service';
import { CatalogSeederService } from './bootstrap/catalog-seeder.service';
import { AUTH_PORT } from './core/application/ports/inbound/auth.port';
import { ORGANIZATION_PORT } from './core/application/ports/inbound/organization.port';
import { ADMIN_MANAGEMENT_PORT } from './core/application/ports/inbound/admin-management.port';
import { ORG_MEMBER_MANAGEMENT_PORT } from './core/application/ports/inbound/org-member-management.port';
import { ORG_DIRECTORY_PORT } from './core/application/ports/inbound/org-directory.port';
import { DEPARTMENT_MANAGEMENT_PORT } from './core/application/ports/inbound/department-management.port';
import { DEPARTMENT_REPOSITORY_PORT } from './core/application/ports/outbound/department-repository.port';
import { PERMISSION_MANAGEMENT_PORT } from './core/application/ports/inbound/permission-management.port';
import { POSITION_MANAGEMENT_PORT } from './core/application/ports/inbound/position-management.port';
import { PERMISSION_GRANT_REPOSITORY_PORT } from './core/application/ports/outbound/permission-grant-repository.port';
import { AI_TOOL_DISTRIBUTION_PORT } from './core/application/ports/inbound/ai-tool-distribution.port';
import { AI_TOOL_DISTRIBUTION_REPOSITORY_PORT } from './core/application/ports/outbound/ai-tool-distribution-repository.port';
import { AI_TOOL_CATALOG_PORT } from './core/application/ports/inbound/ai-tool-catalog.port';
import { PLATFORM_ASSISTANT_SETTINGS_PORT } from './core/application/ports/inbound/platform-assistant-settings.port';
import { ACCOUNT_PORT } from './core/application/ports/inbound/account.port';
import { USER_REPOSITORY_PORT } from './core/application/ports/outbound/user-repository.port';
import { PLATFORM_ADMIN_REPOSITORY_PORT } from './core/application/ports/outbound/platform-admin-repository.port';
import { ENTITLEMENT_REPOSITORY_PORT } from './core/application/ports/outbound/entitlement-repository.port';
import { CATALOG_SEED_REPOSITORY_PORT } from './core/application/ports/outbound/catalog-seed-repository.port';
import {
  CREDENTIAL_REGISTRY,
  CredentialRegistry,
  CredentialRepositoryPort,
} from './core/application/ports/outbound/credential-repository.port';
import { PrincipalType } from './core/domain/types/user.types';
import { TOKEN_SERVICE_PORT } from './core/application/ports/outbound/token-service.port';
import { PASSWORD_HASHER_PORT } from './core/application/ports/outbound/password-hasher.port';

@Module({
  controllers: [
    AuthController,
    AccountController,
    InternalController,
    OrgMemberController,
    OrgDirectoryController,
    DepartmentController,
  ],
  providers: [
    // Inbound Port → Service
    { provide: AUTH_PORT, useClass: AuthService },
    { provide: ORGANIZATION_PORT, useClass: OrganizationService },
    { provide: ADMIN_MANAGEMENT_PORT, useClass: AdminManagementService },
    { provide: ORG_MEMBER_MANAGEMENT_PORT, useClass: OrgMemberManagementService },
    { provide: ORG_DIRECTORY_PORT, useClass: OrgDirectoryService },
    { provide: DEPARTMENT_MANAGEMENT_PORT, useClass: DepartmentManagementService },
    { provide: PERMISSION_MANAGEMENT_PORT, useClass: PermissionManagementService },
    { provide: POSITION_MANAGEMENT_PORT, useClass: PositionManagementService },
    { provide: AI_TOOL_DISTRIBUTION_PORT, useClass: AiToolDistributionService },
    { provide: AI_TOOL_CATALOG_PORT, useClass: AiToolCatalogService },
    { provide: PLATFORM_ASSISTANT_SETTINGS_PORT, useClass: PlatformAssistantSettingsService },
    { provide: ACCOUNT_PORT, useClass: AccountService },
    // Outbound Port → Adapter (조직 프로비저닝/시더가 의존: 유지)
    { provide: USER_REPOSITORY_PORT, useClass: UserRepositoryAdapter },
    { provide: DEPARTMENT_REPOSITORY_PORT, useClass: DepartmentRepositoryAdapter },
    { provide: PERMISSION_GRANT_REPOSITORY_PORT, useClass: PermissionGrantRepositoryAdapter },
    { provide: AI_TOOL_DISTRIBUTION_REPOSITORY_PORT, useClass: AiToolDistributionRepositoryAdapter },
    { provide: PLATFORM_ADMIN_REPOSITORY_PORT, useClass: PlatformAdminRepositoryAdapter },
    { provide: TOKEN_SERVICE_PORT, useClass: JwtTokenService },
    { provide: PASSWORD_HASHER_PORT, useClass: BcryptPasswordHasher },
    // 엔타이틀먼트: 조직유저의 유효 접근권(기능/AI도구) 계산(토큰에 실림)
    { provide: ENTITLEMENT_REPOSITORY_PORT, useClass: EntitlementRepositoryAdapter },
    // 카탈로그 시드: 코드 카탈로그(SSOT)를 features/ai_tools 에 부팅 시 멱등 동기화
    { provide: CATALOG_SEED_REPOSITORY_PORT, useClass: CatalogSeedRepositoryAdapter },
    // 인증 공통 추상화: 2개 자격 어댑터(admin/organization) + principalType 레지스트리
    OrganizationUserCredentialAdapter,
    AdminUserCredentialAdapter,
    {
      provide: CREDENTIAL_REGISTRY,
      useFactory: (
        org: OrganizationUserCredentialAdapter,
        admin: AdminUserCredentialAdapter,
      ): CredentialRegistry => {
        const map = new Map<PrincipalType, CredentialRepositoryPort>(
          [org, admin].map((a) => [a.principalType, a]),
        );
        // fail-fast: 모든 principalType 이 어댑터로 채워졌는지 부팅 시 확인
        for (const pt of Object.values(PrincipalType)) {
          if (!map.has(pt)) {
            throw new Error(`CREDENTIAL_REGISTRY: principalType '${pt}' 자격 어댑터 누락`);
          }
        }
        return {
          get: (pt) => {
            const a = map.get(pt);
            if (!a) throw new Error(`CREDENTIAL_REGISTRY: principalType '${pt}' 어댑터 없음`);
            return a;
          },
        };
      },
      inject: [OrganizationUserCredentialAdapter, AdminUserCredentialAdapter],
    },
    // Inbound guard + bootstrap seeders
    JwtAuthGuard,
    AdminSeederService,
    CatalogSeederService,
  ],
})
export class UserModule {}
