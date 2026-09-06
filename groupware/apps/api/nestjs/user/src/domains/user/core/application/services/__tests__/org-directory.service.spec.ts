import { Test, TestingModule } from '@nestjs/testing';
import { OrgDirectoryService } from '../org-directory.service';
import {
  USER_REPOSITORY_PORT,
  UserRepositoryPort,
} from '../../ports/outbound/user-repository.port';
import {
  DEPARTMENT_REPOSITORY_PORT,
  DepartmentRepositoryPort,
} from '../../ports/outbound/department-repository.port';
import { createUserRepositoryMock, createDepartmentRepositoryMock } from '../../../../__mocks__';
import { OrgDirectoryActor } from '../../ports/inbound/org-directory.port';
import { UserEntity } from '../../../domain/entities/user.entity';
import { OrgMemberForbiddenError } from '../../../domain/errors';
import {
  OrgStatus,
  OrgType,
  PrincipalType,
  UserRole,
  UserStatus,
  UserType,
} from '../../../domain/types/user.types';

describe('OrgDirectoryService', () => {
  let service: OrgDirectoryService;
  let users: jest.Mocked<UserRepositoryPort>;
  let departments: jest.Mocked<DepartmentRepositoryPort>;

  const ORG_ID = 1;

  const actor: OrgDirectoryActor = {
    id: 10,
    role: UserRole.ADMIN,
    principalType: PrincipalType.ORGANIZATION_USER,
    organizationId: ORG_ID,
  };

  /** 조직 멤버 1명. role 만 바꿔 가며 쓴다. */
  const makeMember = (id: number, role: UserRole): UserEntity =>
    ({
      id,
      email: `member${id}@example.com`,
      passwordHash: 'hash',
      name: `멤버${id}`,
      role,
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
      organizationSlug: 'org',
      organizationName: '조직',
      organizationType: OrgType.TENANT,
      organizationStatus: OrgStatus.ACTIVE,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }) as UserEntity;

  const root = makeMember(1, UserRole.ROOT);
  const admin = makeMember(2, UserRole.ADMIN);

  beforeEach(async () => {
    users = createUserRepositoryMock();
    departments = createDepartmentRepositoryMock();
    users.findManyRecordsByOrganizationId.mockResolvedValue([root, admin]);
    departments.findManyRecordsByOrganizationId.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrgDirectoryService,
        { provide: USER_REPOSITORY_PORT, useValue: users },
        { provide: DEPARTMENT_REPOSITORY_PORT, useValue: departments },
      ],
    }).compile();

    service = module.get(OrgDirectoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('기본 조회는 조직 소유자를 뺀다(직원 목록 화면의 규칙)', async () => {
    const { members } = await service.getDirectory(actor);

    expect(members.map((m) => m.id)).toEqual([admin.id]);
  });

  it('includeRoot 면 조직 소유자까지 담는다', async () => {
    // 이 응답을 id → 이름 해석에 쓰는 곳(스토리지의 "올린 사람")이 필요로 한다.
    // 빠지면 소유자가 올린 파일이 화면에 `알 수 없는 사용자` 로 나온다.
    const { members } = await service.getDirectory(actor, { includeRoot: true });

    expect(members.map((m) => m.id)).toEqual([root.id, admin.id]);
  });

  it('부서 트리는 두 경우 모두 그대로 돌려준다', async () => {
    const tree = [{ id: 5, parentId: null, name: '영업본부', organizationId: ORG_ID }];
    departments.findManyRecordsByOrganizationId.mockResolvedValue(tree as never);

    const plain = await service.getDirectory(actor);
    const withRoot = await service.getDirectory(actor, { includeRoot: true });

    expect(plain.departments).toHaveLength(1);
    expect(withRoot.departments).toHaveLength(1);
  });

  it('조직유저가 아니면 거부한다', async () => {
    const platformAdmin: OrgDirectoryActor = {
      ...actor,
      principalType: PrincipalType.ADMIN_USER,
    };

    await expect(service.getDirectory(platformAdmin)).rejects.toBeInstanceOf(
      OrgMemberForbiddenError,
    );
  });

  it('조직이 없는 호출자는 거부한다', async () => {
    const orphan: OrgDirectoryActor = { ...actor, organizationId: undefined };

    await expect(service.getDirectory(orphan)).rejects.toBeInstanceOf(OrgMemberForbiddenError);
  });
});