import { Inject, Injectable } from '@nestjs/common';
import {
  AdminSummary,
  AdminFeatureCatalogItem,
  CreateAdminInput,
  UpdateAdminInput,
} from '../../domain/admin.types';
import { AdminManagementPort } from '../ports/inbound/admin-management.port';
import { USER_API_PORT, UserApiPort } from '../ports/outbound/user-api.port';

/**
 * 플랫폼 관리자 관리 Service: ROOT 가 일반관리자(ADMIN)를 추가/삭제하고 옵션을 부여한다.
 * admin_users 는 userdb(user 서버 소유)라 직접 쓰지 않고 user 서버에 위임한다(소유권)
 */
@Injectable()
export class AdminManagementService implements AdminManagementPort {
  constructor(
    @Inject(USER_API_PORT)
    private readonly userApi: UserApiPort,
  ) {}

  listAdmins(): Promise<AdminSummary[]> {
    return this.userApi.listAdmins();
  }

  createAdmin(input: CreateAdminInput): Promise<AdminSummary> {
    return this.userApi.createAdmin(input);
  }

  updateAdmin(id: number, patch: UpdateAdminInput): Promise<AdminSummary> {
    return this.userApi.updateAdmin(id, patch);
  }

  isAdminEmailAvailable(email: string, excludeId?: number): Promise<boolean> {
    return this.userApi.isAdminEmailAvailable(email, excludeId);
  }

  deleteAdmin(id: number): Promise<void> {
    return this.userApi.deleteAdmin(id);
  }

  getAdminFeatures(id: number): Promise<string[]> {
    return this.userApi.getAdminFeatures(id);
  }

  setAdminFeatures(id: number, features: string[]): Promise<void> {
    return this.userApi.setAdminFeatures(id, features);
  }

  listAdminFeatureCatalog(): Promise<AdminFeatureCatalogItem[]> {
    return this.userApi.listAdminFeatureCatalog();
  }
}
