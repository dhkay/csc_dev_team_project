import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CreatedCompany,
  OrganizationSummary,
  OrgMemberSummary,
  ReplaceRootAdminInput,
  RootAdminSummary,
} from '../../domain/organization.types';
import {
  CreateCompanyInput,
  OrganizationPort,
  UpdateCompanyInput,
  UpdateRootAdminInput,
} from '../ports/inbound/organization.port';
import { USER_API_PORT, UserApiPort } from '../ports/outbound/user-api.port';
import {
  FILE_UPLOAD_API_PORT,
  FileUploadApiPort,
} from '../ports/outbound/file-upload-api.port';

/**
 * 플랫폼 조직 관리 Service: 신규 회사 생성
 * 조직/유저는 userdb(user 서버 소유)라 직접 쓰지 않고 user 서버에 위임한다(크로스-DB 소유권 규칙)
 * 스토리지(파일)는 file-upload 소유라 하드 삭제 정리도 그 서버에 위임한다.
 */
@Injectable()
export class OrganizationService implements OrganizationPort {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    @Inject(USER_API_PORT)
    private readonly userApi: UserApiPort,
    @Inject(FILE_UPLOAD_API_PORT)
    private readonly fileUploadApi: FileUploadApiPort,
  ) {}

  async createCompany(input: CreateCompanyInput): Promise<CreatedCompany> {
    return this.userApi.createOrganization({
      slug: input.slug,
      name: input.companyName,
      profileImageUrl: input.profileImageUrl,
      rootAdmin: input.admin,
    });
  }

  async listOrganizations(): Promise<OrganizationSummary[]> {
    return this.userApi.listOrganizations();
  }

  async updateCompany(id: number, patch: UpdateCompanyInput): Promise<OrganizationSummary> {
    return this.userApi.updateOrganization(id, patch);
  }

  async withdrawCompany(id: number): Promise<void> {
    return this.userApi.withdrawOrganization(id);
  }

  /** 복구: WITHDRAWN 조직을 ACTIVE 로 되돌린다(user 위임). 소프트 삭제는 스토리지를 보존하므로 상태만 복원 */
  async recoverCompany(id: number): Promise<OrganizationSummary> {
    return this.userApi.recoverOrganization(id);
  }

  /**
   * 하드 삭제: 조직/유저 영구 제거(user 위임) 후, 그 조직 소유 파일을 2차 아카이브로 옮기고
   * 1차에서 삭제(file-upload 위임)한다. 스토리지 정리는 best-effort: 실패해도 조직 삭제는
   * 이미 확정이라 예외를 던지지 않고 경고만 남긴다(고아 파일은 재호출/후속 정리로 회수)
   */
  async purgeCompany(id: number): Promise<void> {
    await this.userApi.purgeOrganization(id);
    try {
      const { archived } = await this.fileUploadApi.archiveAndDeleteOrganization(id);
      this.logger.log(`조직 ${id} 하드 삭제: 스토리지 자산 ${archived}건 아카이브 후 삭제`);
    } catch (err) {
      this.logger.error(
        `조직 ${id} 하드 삭제. 스토리지 정리 실패(고아 가능, 재정리 필요): ${String(err)}`,
      );
    }
  }

  async getRootAdmin(id: number): Promise<RootAdminSummary> {
    return this.userApi.getRootAdmin(id);
  }

  async updateRootAdmin(id: number, patch: UpdateRootAdminInput): Promise<RootAdminSummary> {
    return this.userApi.updateRootAdmin(id, patch);
  }

  async isRootAdminEmailAvailable(id: number, email: string): Promise<boolean> {
    return this.userApi.isRootAdminEmailAvailable(id, email);
  }

  async listOrganizationMembers(id: number): Promise<OrgMemberSummary[]> {
    return this.userApi.listOrganizationMembers(id);
  }

  async transferRootAdmin(id: number, userId: number): Promise<RootAdminSummary> {
    return this.userApi.transferRootAdmin(id, userId);
  }

  async replaceRootAdmin(id: number, input: ReplaceRootAdminInput): Promise<RootAdminSummary> {
    return this.userApi.replaceRootAdmin(id, input);
  }

  async resetRootPassword(id: number, password: string): Promise<void> {
    return this.userApi.resetRootPassword(id, password);
  }

  async getOrganizationAiTools(id: number): Promise<string[]> {
    return this.userApi.getOrganizationAiTools(id);
  }
}
