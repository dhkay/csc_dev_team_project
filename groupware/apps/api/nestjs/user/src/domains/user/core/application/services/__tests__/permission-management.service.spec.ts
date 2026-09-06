import { Test, TestingModule } from '@nestjs/testing';
import { PermissionManagementService } from '../permission-management.service';
import {
  PERMISSION_GRANT_REPOSITORY_PORT,
  PermissionGrantRepositoryPort,
} from '../../ports/outbound/permission-grant-repository.port';
import {
  DEPARTMENT_REPOSITORY_PORT,
  DepartmentRepositoryPort,
} from '../../ports/outbound/department-repository.port';
import {
  USER_REPOSITORY_PORT,
  UserRepositoryPort,
} from '../../ports/outbound/user-repository.port';
import {
  createPermissionGrantRepositoryMock,
  createDepartmentRepositoryMock,
  createUserRepositoryMock,
} from '../../../../__mocks__';
import { DepartmentActor } from '../../ports/inbound/department-management.port';
import { DepartmentEntity } from '../../../domain/entities/department.entity';
import { UserEntity } from '../../../domain/entities/user.entity';
import { DepartmentForbiddenError } from '../../../domain/errors';
import {
  OrgStatus,
  OrgType,
  PrincipalType,
  UserRole,
  UserStatus,
  UserType,
} from '../../../domain/types/user.types';
import { OrgPosition, PermissionKey } from '@csc/entitlements';

describe('PermissionManagementService', () => {
  let service: PermissionManagementService;
  let grants: jest.Mocked<PermissionGrantRepositoryPort>;
  let departments: jest.Mocked<DepartmentRepositoryPort>;
  let users: jest.Mocked<UserRepositoryPort>;

  const ORG_ID = 1;
  const DEPT_ID = 7;

  /** 슈퍼관리자(조직 ROOT) 호출자 */
  const superAdmin: DepartmentActor = {
    id: 10,
    role: UserRole.ROOT,
    principalType: PrincipalType.ORGANIZATION_USER,
    organizationId: ORG_ID,
  };

  /** 시스템관리 권한 보유 비-ROOT(일반관리자) 호출자: 조직 관리는 가능하나 ROOT 전용 권한 부여는 불가 */
  const systemManager: DepartmentActor = {
    id: 11,
    role: UserRole.ADMIN,
    principalType: PrincipalType.ORGANIZATION_USER,
    organizationId: ORG_ID,
    permissions: [PermissionKey.SystemManagement],
  };

  /** 대표 호출자: 직책(position=REPRESENTATIVE). 사실상 ROOT 와 동등(조직 관리 전권 + 시스템관리 부여 가능) */
  const representative: DepartmentActor = {
    id: 12,
    role: UserRole.ADMIN,
    principalType: PrincipalType.ORGANIZATION_USER,
    organizationId: ORG_ID,
    position: OrgPosition.Representative,
  };

  const makeDept = (overrides: Partial<DepartmentEntity> = {}): DepartmentEntity => ({
    id: DEPT_ID,
    parentId: null,
    name: '개발팀',
    organizationId: ORG_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const makeUser = (overrides: Partial<UserEntity> = {}): UserEntity => ({
    id: 100,
    email: 'admin@demo.co',
    passwordHash: 'hash',
    name: '이관리',
    role: UserRole.ADMIN,
    position: null,
    status: UserStatus.ACTIVE,
    userType: UserType.WEB_USER,
    tokenVersion: 0,
    failedLoginAttempts: 0,
    lockedUntil: null,
    organizationId: ORG_ID,
    departmentId: null,
    phone: null,
    extension: null,
    organizationSlug: 'demo',
    organizationName: '데모',
    organizationType: OrgType.TENANT,
    organizationStatus: OrgStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    grants = createPermissionGrantRepositoryMock();
    departments = createDepartmentRepositoryMock();
    users = createUserRepositoryMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionManagementService,
        { provide: PERMISSION_GRANT_REPOSITORY_PORT, useValue: grants },
        { provide: DEPARTMENT_REPOSITORY_PORT, useValue: departments },
        { provide: USER_REPOSITORY_PORT, useValue: users },
      ],
    }).compile();
    service = module.get(PermissionManagementService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('setDepartmentPermissions', () => {
    it('일반 권한은 부서에 부여할 수 있어야 한다', async () => {
      departments.findOneRecordById.mockResolvedValueOnce(makeDept());

      await service.setDepartmentPermissions(superAdmin, DEPT_ID, [PermissionKey.SystemManagement]);

      expect(grants.setDepartmentPermissionsRecord).toHaveBeenCalledWith(
        DEPT_ID,
        [PermissionKey.SystemManagement],
        superAdmin.id,
      );
    });

    it('비-ROOT(시스템관리 보유자)는 부서에 시스템관리 권한을 부여할 수 없어야 한다', async () => {
      departments.findOneRecordById.mockResolvedValueOnce(makeDept());
      grants.findGrantMatrixByOrganizationId.mockResolvedValueOnce({ departments: [], members: [] });

      await expect(
        service.setDepartmentPermissions(systemManager, DEPT_ID, [PermissionKey.SystemManagement]),
      ).rejects.toThrow(DepartmentForbiddenError);
      expect(grants.setDepartmentPermissionsRecord).not.toHaveBeenCalled();
    });
  });

  describe('setMemberPermissions', () => {
    it('시스템관리 보유자(비-루트권한)는 멤버에게 시스템관리 권한을 부여할 수 없어야 한다', async () => {
      users.findOneRecordById.mockResolvedValueOnce(makeUser());
      grants.findGrantMatrixByOrganizationId.mockResolvedValueOnce({ departments: [], members: [] });

      await expect(
        service.setMemberPermissions(systemManager, 100, [PermissionKey.SystemManagement]),
      ).rejects.toThrow(DepartmentForbiddenError);
      expect(grants.setUserPermissionsRecord).not.toHaveBeenCalled();
    });

    it('대표(직책, 루트 권한자)는 멤버에게 시스템관리 권한을 부여할 수 있어야 한다', async () => {
      users.findOneRecordById.mockResolvedValueOnce(makeUser());
      grants.findGrantMatrixByOrganizationId.mockResolvedValueOnce({ departments: [], members: [] });

      await service.setMemberPermissions(representative, 100, [PermissionKey.SystemManagement]);

      expect(grants.setUserPermissionsRecord).toHaveBeenCalledWith(
        ORG_ID,
        100,
        [PermissionKey.SystemManagement],
        representative.id,
      );
    });

    it('ROOT(개발관리자)는 멤버에게 시스템관리 권한을 부여할 수 있어야 한다', async () => {
      users.findOneRecordById.mockResolvedValueOnce(makeUser());

      await service.setMemberPermissions(superAdmin, 100, [PermissionKey.SystemManagement]);

      expect(grants.setUserPermissionsRecord).toHaveBeenCalledWith(
        ORG_ID,
        100,
        [PermissionKey.SystemManagement],
        superAdmin.id,
      );
    });
  });
});
