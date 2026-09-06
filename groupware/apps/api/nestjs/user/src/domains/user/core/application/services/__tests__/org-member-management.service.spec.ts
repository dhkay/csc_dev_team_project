import { Test, TestingModule } from '@nestjs/testing';
import { OrgMemberManagementService } from '../org-member-management.service';
import {
  USER_REPOSITORY_PORT,
  UserRepositoryPort,
} from '../../ports/outbound/user-repository.port';
import { PASSWORD_HASHER_PORT, PasswordHasherPort } from '../../ports/outbound/password-hasher.port';
import {
  DEPARTMENT_REPOSITORY_PORT,
  DepartmentRepositoryPort,
} from '../../ports/outbound/department-repository.port';
import {
  createUserRepositoryMock,
  createPasswordHasherMock,
  createDepartmentRepositoryMock,
} from '../../../../__mocks__';
import { OrgMemberActor } from '../../ports/inbound/org-member-management.port';
import { UserEntity } from '../../../domain/entities/user.entity';
import {
  OrgStatus,
  OrgType,
  PrincipalType,
  UserRole,
  UserStatus,
  UserType,
} from '../../../domain/types/user.types';
import {
  OrgMemberEmailAlreadyExistsError,
  OrgMemberForbiddenError,
  OrgMemberNotFoundError,
} from '../../../domain/errors';
import { PermissionKey } from '@csc/entitlements';

describe('OrgMemberManagementService', () => {
  let service: OrgMemberManagementService;
  let users: jest.Mocked<UserRepositoryPort>;
  let departments: jest.Mocked<DepartmentRepositoryPort>;
  let hasher: jest.Mocked<PasswordHasherPort>;

  const ORG_ID = 1;

  /** 슈퍼관리자(조직 ROOT) 호출자 */
  const superAdmin: OrgMemberActor = {
    id: 10,
    role: UserRole.ROOT,
    principalType: PrincipalType.ORGANIZATION_USER,
    organizationId: ORG_ID,
  };

  /** 테스트용 조직유저 엔티티 팩토리 */
  const makeUser = (overrides: Partial<UserEntity> = {}): UserEntity => ({
    id: 100,
    email: 'admin@demo.co',
    passwordHash: 'hash',
    name: '이관리',
    role: UserRole.ADMIN,
    // 직책은 엔티티 필수 필드다. 빠뜨리면 스프레드로만 채워져 optional 로 좁혀지고 타입이 어긋난다.
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
    users = createUserRepositoryMock();
    departments = createDepartmentRepositoryMock();
    hasher = createPasswordHasherMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrgMemberManagementService,
        { provide: USER_REPOSITORY_PORT, useValue: users },
        { provide: DEPARTMENT_REPOSITORY_PORT, useValue: departments },
        { provide: PASSWORD_HASHER_PORT, useValue: hasher },
      ],
    }).compile();
    service = module.get(OrgMemberManagementService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createAdmin', () => {
    it('일반관리자(ADMIN)를 생성해야 한다. role=ADMIN', async () => {
      users.findOneRecordByEmail.mockResolvedValueOnce(null);
      hasher.hash.mockResolvedValueOnce('hashed');
      const created = makeUser();
      users.createRecord.mockResolvedValueOnce(created);

      const result = await service.createAdmin(superAdmin, {
        email: 'admin@demo.co',
        password: 'password1',
        name: '이관리',
      });

      expect(result).toBe(created);
      expect(users.createRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'admin@demo.co',
          passwordHash: 'hashed',
          name: '이관리',
          organizationId: ORG_ID,
          role: UserRole.ADMIN,
        }),
      );
    });

    it('이미 쓰는 이메일이면 에러를 던져야 한다(전역 유일)', async () => {
      users.findOneRecordByEmail.mockResolvedValueOnce(makeUser());
      await expect(
        service.createAdmin(superAdmin, { email: 'admin@demo.co', password: 'password1', name: '새이름' }),
      ).rejects.toThrow(OrgMemberEmailAlreadyExistsError);
      expect(users.createRecord).not.toHaveBeenCalled();
    });

    it('같은 조직에 같은 이름이 있어도 생성해야 한다(동명이인 허용)', async () => {
      users.findOneRecordByEmail.mockResolvedValueOnce(null);
      hasher.hash.mockResolvedValueOnce('hashed');
      const created = makeUser();
      users.createRecord.mockResolvedValueOnce(created);

      const result = await service.createAdmin(superAdmin, {
        email: 'new@demo.co',
        password: 'password1',
        name: '이관리', // 기존 멤버와 동일한 이름
      });

      expect(result).toBe(created);
    });

    it('권한 없는 ADMIN(ROOT 아님 + 시스템관리 미보유)은 거부해야 한다', async () => {
      const adminActor: OrgMemberActor = { ...superAdmin, role: UserRole.ADMIN };
      await expect(
        service.createAdmin(adminActor, { email: 'a@demo.co', password: 'password1', name: 'x' }),
      ).rejects.toThrow(OrgMemberForbiddenError);
    });

    it('시스템관리 권한 보유 ADMIN 은 허용해야 한다', async () => {
      const sysAdmin: OrgMemberActor = {
        ...superAdmin,
        role: UserRole.ADMIN,
        permissions: [PermissionKey.SystemManagement],
      };
      users.findOneRecordByEmail.mockResolvedValueOnce(null);
      hasher.hash.mockResolvedValueOnce('hashed');
      const created = makeUser();
      users.createRecord.mockResolvedValueOnce(created);

      const result = await service.createAdmin(sysAdmin, {
        email: 'a@demo.co',
        password: 'password1',
        name: 'x',
      });

      expect(result).toBe(created);
    });

    it('호출자에 organizationId 가 없으면 거부해야 한다', async () => {
      const noOrg: OrgMemberActor = { ...superAdmin, organizationId: undefined };
      await expect(
        service.createAdmin(noOrg, { email: 'a@demo.co', password: 'password1', name: 'x' }),
      ).rejects.toThrow(OrgMemberForbiddenError);
    });
  });

  describe('updateMember', () => {
    it('대상이 ROOT 면 거부해야 한다(슈퍼관리자 보호)', async () => {
      users.findOneRecordById.mockResolvedValueOnce(makeUser({ id: 200, role: UserRole.ROOT }));
      await expect(service.updateMember(superAdmin, 200, { name: '변경' })).rejects.toThrow(
        OrgMemberForbiddenError,
      );
    });

    it('이메일을 바꾸면 중복 검사 후 갱신해야 한다', async () => {
      users.findOneRecordById
        .mockResolvedValueOnce(makeUser({ id: 200 })) // 대상 조회
        .mockResolvedValueOnce(makeUser({ id: 200, email: 'new@demo.co' })); // 반영본 재조회
      users.findOneRecordByEmail.mockResolvedValueOnce(null); // 중복 없음

      const result = await service.updateMember(superAdmin, 200, { email: 'new@demo.co' });

      expect(users.findOneRecordByEmail).toHaveBeenCalledWith('new@demo.co');
      expect(users.updateEmailRecord).toHaveBeenCalledWith(200, 'new@demo.co');
      expect(result.email).toBe('new@demo.co');
    });

    it('다른 계정이 쓰는 이메일이면 거부해야 한다', async () => {
      // 로그인 ID 라 중복을 허용하면 두 계정이 같은 주소로 로그인 시도를 하게 된다(DB UNIQUE 도 막는다)
      users.findOneRecordById.mockResolvedValueOnce(makeUser({ id: 200 }));
      users.findOneRecordByEmail.mockResolvedValueOnce(makeUser({ id: 201, email: 'taken@demo.co' }));

      await expect(
        service.updateMember(superAdmin, 200, { email: 'taken@demo.co' }),
      ).rejects.toThrow(OrgMemberEmailAlreadyExistsError);
      expect(users.updateEmailRecord).not.toHaveBeenCalled();
    });

    it('중복 검사에서 자기 자신은 제외해야 한다', async () => {
      // 대소문자/표기만 바꾸는 변경이 자기 행 때문에 막히면 안 된다.
      users.findOneRecordById
        .mockResolvedValueOnce(makeUser({ id: 200, email: 'me@demo.co' }))
        .mockResolvedValueOnce(makeUser({ id: 200, email: 'Me@demo.co' }));
      users.findOneRecordByEmail.mockResolvedValueOnce(makeUser({ id: 200, email: 'me@demo.co' }));

      await service.updateMember(superAdmin, 200, { email: 'Me@demo.co' });

      expect(users.updateEmailRecord).toHaveBeenCalledWith(200, 'Me@demo.co');
    });

    it('이메일이 그대로면 중복 검사도 갱신도 하지 않는다', async () => {
      users.findOneRecordById
        .mockResolvedValueOnce(makeUser({ id: 200, email: 'same@demo.co' }))
        .mockResolvedValueOnce(makeUser({ id: 200, email: 'same@demo.co' }));

      await service.updateMember(superAdmin, 200, { email: 'same@demo.co', name: '이름만' });

      expect(users.findOneRecordByEmail).not.toHaveBeenCalled();
      expect(users.updateEmailRecord).not.toHaveBeenCalled();
    });

    it('대상이 다른 조직이면 없음으로 거부해야 한다(테넌트 격리)', async () => {
      users.findOneRecordById.mockResolvedValueOnce(makeUser({ id: 300, organizationId: 999 }));
      await expect(service.updateMember(superAdmin, 300, { name: '변경' })).rejects.toThrow(
        OrgMemberNotFoundError,
      );
    });
  });

  describe('resetMemberPassword', () => {
    it('해시 저장 + 잠금해제 + 토큰 bump 를 수행해야 한다', async () => {
      users.findOneRecordById.mockResolvedValueOnce(makeUser({ id: 100 }));
      hasher.hash.mockResolvedValueOnce('newhash');

      await service.resetMemberPassword(superAdmin, 100, 'password2');

      expect(users.updatePasswordHashRecord).toHaveBeenCalledWith(100, 'newhash');
      expect(users.updateLoginSecurityRecord).toHaveBeenCalledWith(100, 0, null);
      expect(users.incrementTokenVersionRecord).toHaveBeenCalledWith(100);
    });
  });

  describe('deleteMember', () => {
    it('soft-delete(WITHDRAWN) + 토큰 bump 를 수행해야 한다', async () => {
      users.findOneRecordById.mockResolvedValueOnce(makeUser({ id: 100 }));

      await service.deleteMember(superAdmin, 100);

      expect(users.updateMemberStatusRecord).toHaveBeenCalledWith(100, UserStatus.WITHDRAWN);
      expect(users.incrementTokenVersionRecord).toHaveBeenCalledWith(100);
    });
  });

  describe('listMembers', () => {
    it('호출자 조직의 멤버 목록을 반환해야 한다', async () => {
      const members = [makeUser({ id: 10, role: UserRole.ROOT }), makeUser({ id: 100 })];
      users.findManyRecordsByOrganizationId.mockResolvedValueOnce(members);

      const result = await service.listMembers(superAdmin);

      expect(result).toBe(members);
      expect(users.findManyRecordsByOrganizationId).toHaveBeenCalledWith(ORG_ID);
    });
  });
});
