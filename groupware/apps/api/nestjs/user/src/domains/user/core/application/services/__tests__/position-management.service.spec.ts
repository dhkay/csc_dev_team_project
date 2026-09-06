import { Test, TestingModule } from '@nestjs/testing';
import { PositionManagementService } from '../position-management.service';
import {
  USER_REPOSITORY_PORT,
  UserRepositoryPort,
} from '../../ports/outbound/user-repository.port';
import { createUserRepositoryMock } from '../../../../__mocks__';
import { DepartmentActor } from '../../ports/inbound/department-management.port';
import { UserEntity } from '../../../domain/entities/user.entity';
import {
  PositionForbiddenError,
  PositionInvalidError,
  PositionTargetNotFoundError,
  TeamLeaderAlreadyExistsError,
} from '../../../domain/errors';
import {
  OrgStatus,
  OrgType,
  PrincipalType,
  UserRole,
  UserStatus,
  UserType,
} from '../../../domain/types/user.types';
import { OrgPosition, PermissionKey } from '@csc/entitlements';

describe('PositionManagementService', () => {
  let service: PositionManagementService;
  let users: jest.Mocked<UserRepositoryPort>;

  const ORG_ID = 1;
  const DEPT_ID = 7;
  const TARGET_ID = 100;

  /** 조직 ROOT(개발관리자) 호출자: 대표 임명/해임 가능 */
  const rootActor: DepartmentActor = {
    id: 10,
    role: UserRole.ROOT,
    principalType: PrincipalType.ORGANIZATION_USER,
    organizationId: ORG_ID,
  };

  /** 시스템관리 보유 비-ROOT 호출자: 조직 관리(팀장 임명)는 가능하나 대표 임명/해임은 불가 */
  const systemManager: DepartmentActor = {
    id: 11,
    role: UserRole.ADMIN,
    principalType: PrincipalType.ORGANIZATION_USER,
    organizationId: ORG_ID,
    permissions: [PermissionKey.SystemManagement],
  };

  /** 조직 관리 권한이 없는 일반 호출자: 어떤 직책도 지정 불가 */
  const outsider: DepartmentActor = {
    id: 12,
    role: UserRole.ADMIN,
    principalType: PrincipalType.ORGANIZATION_USER,
    organizationId: ORG_ID,
  };

  const makeUser = (overrides: Partial<UserEntity> = {}): UserEntity => ({
    id: TARGET_ID,
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
    departmentId: DEPT_ID,
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
    users = createUserRepositoryMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PositionManagementService,
        { provide: USER_REPOSITORY_PORT, useValue: users },
      ],
    }).compile();
    service = module.get(PositionManagementService);
  });

  afterEach(() => jest.clearAllMocks());

  it('조직 관리 권한이 없으면 거부해야 한다', async () => {
    await expect(
      service.setMemberPosition(outsider, TARGET_ID, OrgPosition.TeamLeader),
    ).rejects.toThrow(PositionForbiddenError);
    expect(users.updateMemberPositionRecord).not.toHaveBeenCalled();
  });

  it('다른 조직 멤버 대상은 찾을 수 없음으로 거부해야 한다', async () => {
    users.findOneRecordById.mockResolvedValueOnce(makeUser({ organizationId: 999 }));
    await expect(
      service.setMemberPosition(rootActor, TARGET_ID, OrgPosition.TeamLeader),
    ).rejects.toThrow(PositionTargetNotFoundError);
  });

  it('대상이 슈퍼관리자(ROOT)면 직책을 지정할 수 없어야 한다', async () => {
    users.findOneRecordById.mockResolvedValueOnce(makeUser({ role: UserRole.ROOT }));
    await expect(
      service.setMemberPosition(rootActor, TARGET_ID, OrgPosition.TeamLeader),
    ).rejects.toThrow(PositionForbiddenError);
  });

  describe('대표(REPRESENTATIVE)', () => {
    it('ROOT(개발관리자)는 대표를 임명할 수 있어야 한다', async () => {
      users.findOneRecordById.mockResolvedValueOnce(makeUser());
      await service.setMemberPosition(rootActor, TARGET_ID, OrgPosition.Representative);
      expect(users.updateMemberPositionRecord).toHaveBeenCalledWith(
        TARGET_ID,
        OrgPosition.Representative,
      );
    });

    it('비-ROOT(시스템관리)는 대표를 임명할 수 없어야 한다', async () => {
      users.findOneRecordById.mockResolvedValueOnce(makeUser());
      await expect(
        service.setMemberPosition(systemManager, TARGET_ID, OrgPosition.Representative),
      ).rejects.toThrow(PositionForbiddenError);
      expect(users.updateMemberPositionRecord).not.toHaveBeenCalled();
    });

    it('비-ROOT는 기존 대표를 해임(변경)할 수 없어야 한다', async () => {
      users.findOneRecordById.mockResolvedValueOnce(
        makeUser({ position: OrgPosition.Representative }),
      );
      await expect(service.setMemberPosition(systemManager, TARGET_ID, null)).rejects.toThrow(
        PositionForbiddenError,
      );
      expect(users.updateMemberPositionRecord).not.toHaveBeenCalled();
    });
  });

  describe('팀장(TEAM_LEADER)', () => {
    it('부서 미배치 멤버는 팀장으로 지정할 수 없어야 한다', async () => {
      users.findOneRecordById.mockResolvedValueOnce(makeUser({ departmentId: null }));
      await expect(
        service.setMemberPosition(rootActor, TARGET_ID, OrgPosition.TeamLeader),
      ).rejects.toThrow(PositionInvalidError);
      expect(users.updateMemberPositionRecord).not.toHaveBeenCalled();
    });

    it('부서에 이미 다른 팀장이 있으면 거부해야 한다', async () => {
      users.findOneRecordById.mockResolvedValueOnce(makeUser());
      users.findTeamLeaderRecordByDepartment.mockResolvedValueOnce(
        makeUser({ id: 200, position: OrgPosition.TeamLeader }),
      );
      await expect(
        service.setMemberPosition(rootActor, TARGET_ID, OrgPosition.TeamLeader),
      ).rejects.toThrow(TeamLeaderAlreadyExistsError);
      expect(users.updateMemberPositionRecord).not.toHaveBeenCalled();
    });

    it('시스템관리 보유자는 부서 배치된 멤버를 팀장으로 지정할 수 있어야 한다(대표와 달리 ROOT 불필요)', async () => {
      users.findOneRecordById.mockResolvedValueOnce(makeUser());
      users.findTeamLeaderRecordByDepartment.mockResolvedValueOnce(null);
      await service.setMemberPosition(systemManager, TARGET_ID, OrgPosition.TeamLeader);
      expect(users.updateMemberPositionRecord).toHaveBeenCalledWith(
        TARGET_ID,
        OrgPosition.TeamLeader,
      );
    });

    it('본인이 이미 그 부서 팀장이면(동일인) 재지정 가능해야 한다', async () => {
      users.findOneRecordById.mockResolvedValueOnce(
        makeUser({ position: OrgPosition.TeamLeader }),
      );
      users.findTeamLeaderRecordByDepartment.mockResolvedValueOnce(
        makeUser({ position: OrgPosition.TeamLeader }),
      );
      await service.setMemberPosition(rootActor, TARGET_ID, OrgPosition.TeamLeader);
      expect(users.updateMemberPositionRecord).toHaveBeenCalledWith(
        TARGET_ID,
        OrgPosition.TeamLeader,
      );
    });
  });

  it('직책 해제(null)는 대표가 아니면 조직 관리자가 수행할 수 있어야 한다', async () => {
    users.findOneRecordById.mockResolvedValueOnce(makeUser({ position: OrgPosition.TeamLeader }));
    await service.setMemberPosition(systemManager, TARGET_ID, null);
    expect(users.updateMemberPositionRecord).toHaveBeenCalledWith(TARGET_ID, null);
  });
});
