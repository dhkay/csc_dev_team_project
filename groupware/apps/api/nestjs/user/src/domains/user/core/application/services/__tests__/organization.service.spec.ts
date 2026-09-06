import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationService } from '../organization.service';
import {
  USER_REPOSITORY_PORT,
  UserRepositoryPort,
} from '../../ports/outbound/user-repository.port';
import {
  PASSWORD_HASHER_PORT,
  PasswordHasherPort,
} from '../../ports/outbound/password-hasher.port';
import { createUserRepositoryMock, createPasswordHasherMock } from '../../../../__mocks__';
import { OrganizationEntity, UserEntity } from '../../../domain/entities/user.entity';
import { OrgStatus, OrgType, UserRole, UserStatus } from '../../../domain/types/user.types';
import { OrgPosition } from '../../../domain/types/entitlement-catalog';
import {
  CannotModifyPlatformOrganizationError,
  RootAdminEmailAlreadyExistsError,
  RootAdminNotFoundError,
  RootAdminTransferTargetInvalidError,
} from '../../../domain/errors';

describe('OrganizationService', () => {
  let service: OrganizationService;
  let users: jest.Mocked<UserRepositoryPort>;

  const ORG_ID = 7;

  const makeOrg = (overrides: Partial<OrganizationEntity> = {}): OrganizationEntity => ({
    id: ORG_ID,
    slug: 'acme',
    name: 'Acme',
    type: OrgType.TENANT,
    status: OrgStatus.ACTIVE,
    profileImageUrl: null,
    createdAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    users = createUserRepositoryMock();
    const hasher: jest.Mocked<PasswordHasherPort> = createPasswordHasherMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationService,
        { provide: USER_REPOSITORY_PORT, useValue: users },
        { provide: PASSWORD_HASHER_PORT, useValue: hasher },
      ],
    }).compile();

    service = moduleRef.get(OrganizationService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('recoverOrganization', () => {
    it('WITHDRAWN 조직을 ACTIVE 로 되돌린다', async () => {
      users.findOrganizationById.mockResolvedValueOnce(
        makeOrg({ status: OrgStatus.WITHDRAWN }),
      );
      users.updateOrganizationRecord.mockResolvedValueOnce(makeOrg({ status: OrgStatus.ACTIVE }));

      const result = await service.recoverOrganization(ORG_ID);

      expect(users.updateOrganizationRecord).toHaveBeenCalledWith(ORG_ID, {
        status: OrgStatus.ACTIVE,
      });
      expect(result.status).toBe(OrgStatus.ACTIVE);
    });

    it('WITHDRAWN 이 아니면 그대로 반환하고 상태를 바꾸지 않는다(멱등)', async () => {
      const active = makeOrg({ status: OrgStatus.ACTIVE });
      users.findOrganizationById.mockResolvedValueOnce(active);

      const result = await service.recoverOrganization(ORG_ID);

      expect(users.updateOrganizationRecord).not.toHaveBeenCalled();
      expect(result).toBe(active);
    });

    it('PLATFORM 조직은 복구 대상이 아니다(에러)', async () => {
      users.findOrganizationById.mockResolvedValueOnce(
        makeOrg({ type: OrgType.PLATFORM, status: OrgStatus.WITHDRAWN }),
      );
      await expect(service.recoverOrganization(ORG_ID)).rejects.toBeInstanceOf(
        CannotModifyPlatformOrganizationError,
      );
      expect(users.updateOrganizationRecord).not.toHaveBeenCalled();
    });
  });

  describe('createOrganization', () => {
    it('ROOT 이메일을 이미 쓰는 계정이 있으면 조직을 만들지 않는다', async () => {
      users.findOrganizationBySlug.mockResolvedValueOnce(null);
      users.findOneRecordByEmail.mockResolvedValueOnce({ id: 1 } as UserEntity);

      await expect(
        service.createOrganization({
          slug: 'acme',
          name: 'Acme',
          rootAdmin: { email: 'taken@acme.co', password: 'pw', name: '루트' },
        }),
      ).rejects.toBeInstanceOf(RootAdminEmailAlreadyExistsError);

      // 조직 행부터 만들면 유저 생성이 DB 제약에 걸렸을 때 조직만 남는다.
      expect(users.createOrganizationRecord).not.toHaveBeenCalled();
    });
  });

  describe('updateOrganization', () => {
    it('WITHDRAWN 조직은 편집 저장으로 status 를 바꾸지 못한다(복구는 recover 전용)', async () => {
      users.findOrganizationById.mockResolvedValueOnce(
        makeOrg({ status: OrgStatus.WITHDRAWN }),
      );
      users.updateOrganizationRecord.mockResolvedValueOnce(
        makeOrg({ status: OrgStatus.WITHDRAWN, name: 'New' }),
      );

      await service.updateOrganization(ORG_ID, { name: 'New', status: OrgStatus.ACTIVE });

      // status 는 patch 에서 제거되어 레포/세션무효화에 전달되지 않는다(소유 도메인이 불변식 강제)
      expect(users.updateOrganizationRecord).toHaveBeenCalledWith(ORG_ID, { name: 'New' });
      expect(users.bumpTokenVersionByOrganizationId).not.toHaveBeenCalled();
    });

    it('활성 조직은 SUSPENDED 전환 시 세션을 무효화한다', async () => {
      users.findOrganizationById.mockResolvedValueOnce(makeOrg({ status: OrgStatus.ACTIVE }));
      users.updateOrganizationRecord.mockResolvedValueOnce(
        makeOrg({ status: OrgStatus.SUSPENDED }),
      );

      await service.updateOrganization(ORG_ID, { status: OrgStatus.SUSPENDED });

      expect(users.updateOrganizationRecord).toHaveBeenCalledWith(ORG_ID, {
        status: OrgStatus.SUSPENDED,
      });
      expect(users.bumpTokenVersionByOrganizationId).toHaveBeenCalledWith(ORG_ID);
    });
  });

  describe('withdrawOrganization', () => {
    it('status 를 WITHDRAWN 으로 + 세션 무효화(token bump)', async () => {
      users.findOrganizationById.mockResolvedValueOnce(makeOrg());

      await service.withdrawOrganization(ORG_ID);

      expect(users.updateOrganizationStatusRecord).toHaveBeenCalledWith(
        ORG_ID,
        OrgStatus.WITHDRAWN,
      );
      expect(users.bumpTokenVersionByOrganizationId).toHaveBeenCalledWith(ORG_ID);
    });
  });

  describe('purgeOrganization', () => {
    it('조직/유저 영구 제거를 레포지토리에 위임한다', async () => {
      users.findOrganizationById.mockResolvedValueOnce(makeOrg());

      await service.purgeOrganization(ORG_ID);

      expect(users.purgeOrganizationRecord).toHaveBeenCalledWith(ORG_ID);
    });
  });

  describe('updateRootAdmin', () => {
    /** 테스트용 조직 ROOT: 이름/이메일 수정 대상 */
    const makeRoot = (overrides: Partial<UserEntity> = {}): UserEntity =>
      ({
        id: 42,
        email: 'root@acme.co',
        name: '김보섭',
        role: UserRole.ROOT,
        organizationId: ORG_ID,
        ...overrides,
      }) as UserEntity;

    it('ROOT 의 이름을 수정하고 반영본을 돌려준다. 세션은 유지(token bump 없음)', async () => {
      users.findOrganizationById.mockResolvedValueOnce(makeOrg());
      users.findRootByOrganizationId.mockResolvedValueOnce(makeRoot());
      users.findOneRecordById.mockResolvedValueOnce(makeRoot({ name: '임단' }));

      const result = await service.updateRootAdmin(ORG_ID, { name: '  임단  ' });

      expect(users.updateProfileRecord).toHaveBeenCalledWith(42, { name: '임단' }); // 공백 정리
      expect(result.name).toBe('임단');
      expect(users.incrementTokenVersionRecord).not.toHaveBeenCalled(); // 표시 이름이라 재로그인 불필요
    });

    it('ROOT 가 없으면 에러를 던진다', async () => {
      users.findOrganizationById.mockResolvedValueOnce(makeOrg());
      users.findRootByOrganizationId.mockResolvedValueOnce(null);

      await expect(service.updateRootAdmin(ORG_ID, { name: '임단' })).rejects.toThrow(
        RootAdminNotFoundError,
      );
      expect(users.updateProfileRecord).not.toHaveBeenCalled();
    });

    it('PLATFORM 조직은 거부한다', async () => {
      users.findOrganizationById.mockResolvedValueOnce(makeOrg({ type: OrgType.PLATFORM }));

      await expect(service.updateRootAdmin(ORG_ID, { name: '임단' })).rejects.toThrow(
        CannotModifyPlatformOrganizationError,
      );
      expect(users.updateProfileRecord).not.toHaveBeenCalled();
    });

    it('이메일을 바꾸면 쓰는 계정이 없을 때 저장한다. 세션은 유지', async () => {
      users.findOrganizationById.mockResolvedValueOnce(makeOrg());
      users.findRootByOrganizationId.mockResolvedValueOnce(makeRoot());
      users.findOneRecordByEmail.mockResolvedValueOnce(null);
      users.findOneRecordById.mockResolvedValueOnce(makeRoot({ email: 'new@acme.co' }));

      const result = await service.updateRootAdmin(ORG_ID, { email: 'new@acme.co' });

      // 중복 검사는 전역이다. 로그인이 조직을 모른 채 이메일로 계정을 찾기 때문
      expect(users.findOneRecordByEmail).toHaveBeenCalledWith('new@acme.co');
      expect(users.updateEmailRecord).toHaveBeenCalledWith(42, 'new@acme.co');
      expect(result.email).toBe('new@acme.co');
      expect(users.incrementTokenVersionRecord).not.toHaveBeenCalled();
    });

    it('다른 계정이 쓰는 이메일이면 거부한다(다른 조직이어도 충돌)', async () => {
      users.findOrganizationById.mockResolvedValueOnce(makeOrg());
      users.findRootByOrganizationId.mockResolvedValueOnce(makeRoot());
      users.findOneRecordByEmail.mockResolvedValueOnce(makeRoot({ id: 99 }));

      await expect(
        service.updateRootAdmin(ORG_ID, { email: 'taken@acme.co' }),
      ).rejects.toThrow(RootAdminEmailAlreadyExistsError);
      expect(users.updateEmailRecord).not.toHaveBeenCalled();
    });

    it('같은 이메일을 다시 보내면 중복 검사 없이 통과한다', async () => {
      users.findOrganizationById.mockResolvedValueOnce(makeOrg());
      users.findRootByOrganizationId.mockResolvedValueOnce(makeRoot());
      users.findOneRecordById.mockResolvedValueOnce(makeRoot());

      await service.updateRootAdmin(ORG_ID, { email: 'root@acme.co' });

      expect(users.findOneRecordByEmail).not.toHaveBeenCalled();
      expect(users.updateEmailRecord).not.toHaveBeenCalled();
    });
  });

  describe('transferRootAdmin', () => {
    const makeRoot = (overrides: Partial<UserEntity> = {}): UserEntity =>
      ({
        id: 42,
        email: 'root@acme.co',
        name: '루트',
        role: UserRole.ROOT,
        status: UserStatus.ACTIVE,
        organizationId: ORG_ID,
        ...overrides,
      }) as UserEntity;

    it('같은 조직의 활성 일반관리자를 루트로 올린다', async () => {
      const target = makeRoot({ id: 43, role: UserRole.ADMIN, email: 'a@acme.co' });
      users.findOrganizationById.mockResolvedValueOnce(makeOrg());
      users.findRootByOrganizationId.mockResolvedValueOnce(makeRoot());
      users.findOneRecordById
        .mockResolvedValueOnce(target) // 대상 확인
        .mockResolvedValueOnce({ ...target, role: UserRole.ROOT }); // 반영본 재조회

      const result = await service.transferRootAdmin(ORG_ID, 43);

      // 강등과 승격은 레포의 한 트랜잭션에서 처리한다(중간 상태로 커밋되면 ROOT 가 둘이 된다)
      expect(users.transferRootRecord).toHaveBeenCalledWith(42, 43, { clearFromPosition: false });
      expect(result.role).toBe(UserRole.ROOT);
    });

    it('대표였던 루트는 직책도 함께 해임한다(강등만으로는 권한이 남는다)', async () => {
      const target = makeRoot({ id: 43, role: UserRole.ADMIN, email: 'a@acme.co' });
      users.findOrganizationById.mockResolvedValueOnce(makeOrg());
      users.findRootByOrganizationId.mockResolvedValueOnce(
        makeRoot({ position: OrgPosition.Representative }),
      );
      users.findOneRecordById
        .mockResolvedValueOnce(target)
        .mockResolvedValueOnce({ ...target, role: UserRole.ROOT });

      await service.transferRootAdmin(ORG_ID, 43);

      expect(users.transferRootRecord).toHaveBeenCalledWith(42, 43, { clearFromPosition: true });
    });

    it('다른 조직 멤버는 거부한다', async () => {
      users.findOrganizationById.mockResolvedValueOnce(makeOrg());
      users.findRootByOrganizationId.mockResolvedValueOnce(makeRoot());
      users.findOneRecordById.mockResolvedValueOnce(
        makeRoot({ id: 43, role: UserRole.ADMIN, organizationId: 999 }),
      );

      await expect(service.transferRootAdmin(ORG_ID, 43)).rejects.toBeInstanceOf(
        RootAdminTransferTargetInvalidError,
      );
      expect(users.transferRootRecord).not.toHaveBeenCalled();
    });

    it('비활성 계정은 거부한다', async () => {
      users.findOrganizationById.mockResolvedValueOnce(makeOrg());
      users.findRootByOrganizationId.mockResolvedValueOnce(makeRoot());
      users.findOneRecordById.mockResolvedValueOnce(
        makeRoot({ id: 43, role: UserRole.ADMIN, status: UserStatus.WITHDRAWN }),
      );

      await expect(service.transferRootAdmin(ORG_ID, 43)).rejects.toBeInstanceOf(
        RootAdminTransferTargetInvalidError,
      );
      expect(users.transferRootRecord).not.toHaveBeenCalled();
    });

    it('현재 루트 자신은 거부한다', async () => {
      users.findOrganizationById.mockResolvedValueOnce(makeOrg());
      users.findRootByOrganizationId.mockResolvedValueOnce(makeRoot());
      users.findOneRecordById.mockResolvedValueOnce(makeRoot());

      await expect(service.transferRootAdmin(ORG_ID, 42)).rejects.toBeInstanceOf(
        RootAdminTransferTargetInvalidError,
      );
    });
  });

  describe('replaceRootAdmin', () => {
    const makeRoot = (overrides: Partial<UserEntity> = {}): UserEntity =>
      ({
        id: 42,
        email: 'root@acme.co',
        role: UserRole.ROOT,
        status: UserStatus.ACTIVE,
        organizationId: ORG_ID,
        ...overrides,
      }) as UserEntity;

    it('계정을 새로 만들어 루트로 세운다(기존 루트 강등은 레포 트랜잭션)', async () => {
      users.findOrganizationById.mockResolvedValueOnce(makeOrg());
      users.findRootByOrganizationId.mockResolvedValueOnce(makeRoot());
      users.findOneRecordByEmail.mockResolvedValueOnce(null);
      users.replaceRootWithNewRecord.mockResolvedValueOnce(
        makeRoot({ id: 50, email: 'new@acme.co' }),
      );

      const result = await service.replaceRootAdmin(ORG_ID, {
        email: 'new@acme.co',
        name: '  새 루트  ',
        password: 'RootPw1!',
      });

      expect(users.replaceRootWithNewRecord).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ email: 'new@acme.co', name: '새 루트', organizationId: ORG_ID }),
        { clearFromPosition: false },
      );
      expect(result.id).toBe(50);
    });

    it('이미 쓰는 이메일이면 계정을 만들지 않는다', async () => {
      users.findOrganizationById.mockResolvedValueOnce(makeOrg());
      users.findRootByOrganizationId.mockResolvedValueOnce(makeRoot());
      users.findOneRecordByEmail.mockResolvedValueOnce(makeRoot({ id: 77 }));

      await expect(
        service.replaceRootAdmin(ORG_ID, {
          email: 'taken@acme.co',
          name: '새 루트',
          password: 'RootPw1!',
        }),
      ).rejects.toBeInstanceOf(RootAdminEmailAlreadyExistsError);
      expect(users.replaceRootWithNewRecord).not.toHaveBeenCalled();
    });
  });

  describe('isRootAdminEmailAvailable', () => {
    const makeRoot = (overrides: Partial<UserEntity> = {}): UserEntity =>
      ({ id: 42, email: 'root@acme.co', role: UserRole.ROOT, organizationId: ORG_ID, ...overrides }) as UserEntity;

    it('쓰는 계정이 없으면 사용 가능하다', async () => {
      users.findOrganizationById.mockResolvedValueOnce(makeOrg());
      users.findRootByOrganizationId.mockResolvedValueOnce(makeRoot());
      users.findOneRecordByEmail.mockResolvedValueOnce(null);

      await expect(service.isRootAdminEmailAvailable(ORG_ID, 'new@acme.co')).resolves.toBe(true);
    });

    it('다른 계정이 쓰고 있으면 사용할 수 없다', async () => {
      users.findOrganizationById.mockResolvedValueOnce(makeOrg());
      users.findRootByOrganizationId.mockResolvedValueOnce(makeRoot());
      users.findOneRecordByEmail.mockResolvedValueOnce(makeRoot({ id: 99 }));

      await expect(service.isRootAdminEmailAvailable(ORG_ID, 'taken@acme.co')).resolves.toBe(
        false,
      );
    });

    it('ROOT 자신이 쓰는 이메일은 사용 가능으로 본다', async () => {
      users.findOrganizationById.mockResolvedValueOnce(makeOrg());
      users.findRootByOrganizationId.mockResolvedValueOnce(makeRoot());
      users.findOneRecordByEmail.mockResolvedValueOnce(makeRoot());

      await expect(service.isRootAdminEmailAvailable(ORG_ID, 'root@acme.co')).resolves.toBe(true);
    });
  });
});
