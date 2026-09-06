import { Inject, Injectable } from '@nestjs/common';
import { PlatformAdminEntity } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/types/user.types';
import {
  AdminEmailAlreadyExistsError,
  AdminNotFoundError,
  CannotChangeRootAdminEmailError,
  CannotDeleteRootAdminError,
} from '../../domain/errors';
import {
  AdminManagementPort,
  CreateAdminInput,
  UpdateAdminInput,
} from '../ports/inbound/admin-management.port';
import {
  AdminFeatureCatalogItem,
  PLATFORM_ADMIN_REPOSITORY_PORT,
  PlatformAdminRepositoryPort,
} from '../ports/outbound/platform-admin-repository.port';
import { PASSWORD_HASHER_PORT, PasswordHasherPort } from '../ports/outbound/password-hasher.port';

/**
 * 플랫폼 관리자 관리: ROOT 가 일반관리자(ADMIN)를 추가/삭제하고 옵션(admin_features)을 부여한다.
 * ROOT 한정 호출 강제는 상위(control-tower PlatformRootGuard) 책임. 여기선 도메인 규칙만(ROOT 삭제 금지 등)
 */
@Injectable()
export class AdminManagementService implements AdminManagementPort {
  constructor(
    @Inject(PLATFORM_ADMIN_REPOSITORY_PORT)
    private readonly admins: PlatformAdminRepositoryPort,
    @Inject(PASSWORD_HASHER_PORT)
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  async listAdmins(): Promise<PlatformAdminEntity[]> {
    return this.admins.findManyAdminRecords();
  }

  async createAdmin(input: CreateAdminInput): Promise<PlatformAdminEntity> {
    const exist = await this.admins.findOneRecordByEmail(input.email);
    if (exist) {
      throw new AdminEmailAlreadyExistsError(input.email);
    }
    const passwordHash = await this.passwordHasher.hash(input.password);
    const admin = await this.admins.createRecord({
      email: input.email,
      passwordHash,
      name: input.name,
      role: UserRole.ADMIN, // 추가되는 관리자는 일반관리자(ADMIN). ROOT 는 시더만
    });
    if (input.features?.length) {
      await this.admins.setAdminFeaturesRecord(admin.id, input.features);
    }
    return admin;
  }

  async updateAdmin(id: number, patch: UpdateAdminInput): Promise<PlatformAdminEntity> {
    const admin = await this.assertAdmin(id);
    // 이메일은 로그인 ID 라 실제로 값이 바뀔 때만 검증한다(같은 값 재전송은 통과)
    if (patch.email !== undefined && patch.email !== admin.email) {
      if (admin.role === UserRole.ROOT) {
        throw new CannotChangeRootAdminEmailError();
      }
      const exist = await this.admins.findOneRecordByEmail(patch.email);
      if (exist) {
        throw new AdminEmailAlreadyExistsError(patch.email);
      }
    }
    await this.admins.updateAdminRecord(id, patch);
    return this.assertAdmin(id); // 수정 반영본 재조회
  }

  /**
   * 저장 전 사전 확인용. 화면이 이 결과로 저장 버튼을 열어주지만, 확인과 저장 사이에 다른
   * 관리자가 같은 이메일을 선점할 수 있으므로 updateAdmin/createAdmin 의 검증은 그대로 둔다.
   */
  async isAdminEmailAvailable(email: string, excludeId?: number): Promise<boolean> {
    const exist = await this.admins.findOneRecordByEmail(email);
    return !exist || exist.id === excludeId;
  }

  async deleteAdmin(id: number): Promise<void> {
    const admin = await this.assertAdmin(id);
    if (admin.role === UserRole.ROOT) {
      throw new CannotDeleteRootAdminError();
    }
    await this.admins.deleteAdminRecord(id);
  }

  async getAdminFeatures(id: number): Promise<string[]> {
    await this.assertAdmin(id);
    return this.admins.findAdminFeatureKeys(id);
  }

  async setAdminFeatures(id: number, featureKeys: string[]): Promise<void> {
    await this.assertAdmin(id);
    await this.admins.setAdminFeaturesRecord(id, featureKeys);
  }

  async listAdminFeatureCatalog(): Promise<AdminFeatureCatalogItem[]> {
    return this.admins.findManyAdminFeatureRecords();
  }

  private async assertAdmin(id: number): Promise<PlatformAdminEntity> {
    const admin = await this.admins.findOneRecordById(id);
    if (!admin) {
      throw new AdminNotFoundError(id);
    }
    return admin;
  }
}
