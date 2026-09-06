import { Test, TestingModule } from '@nestjs/testing';
import { AdminManagementService } from '../admin-management.service';
import {
  PLATFORM_ADMIN_REPOSITORY_PORT,
  PlatformAdminRepositoryPort,
  PASSWORD_HASHER_PORT,
  PasswordHasherPort,
} from '../../ports/outbound';
import { PlatformAdminEntity } from '../../../domain/entities';
import { UserRole, UserStatus } from '../../../domain/types';
import {
  AdminEmailAlreadyExistsError,
  CannotChangeRootAdminEmailError,
} from '../../../domain/errors';
import {
  createPlatformAdminRepositoryMock,
  createPasswordHasherMock,
} from '../../../../__mocks__';

describe('AdminManagementService', () => {
  let service: AdminManagementService;
  let admins: jest.Mocked<PlatformAdminRepositoryPort>;
  let passwordHasher: jest.Mocked<PasswordHasherPort>;

  /** 테스트용 플랫폼 관리자 팩토리 (기본은 일반관리자) */
  const makeAdmin = (overrides: Partial<PlatformAdminEntity> = {}): PlatformAdminEntity => ({
    id: 2,
    email: 'admin@csc.kr',
    passwordHash: 'hashed',
    name: '홍길동',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    tokenVersion: 0,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    admins = createPlatformAdminRepositoryMock();
    passwordHasher = createPasswordHasherMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminManagementService,
        { provide: PLATFORM_ADMIN_REPOSITORY_PORT, useValue: admins },
        { provide: PASSWORD_HASHER_PORT, useValue: passwordHasher },
      ],
    }).compile();

    service = moduleRef.get(AdminManagementService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('updateAdmin', () => {
    it('이메일을 바꾸면 중복이 없을 때 저장한다', async () => {
      admins.findOneRecordById
        .mockResolvedValueOnce(makeAdmin())
        .mockResolvedValueOnce(makeAdmin({ email: 'new@csc.kr' }));
      admins.findOneRecordByEmail.mockResolvedValueOnce(null);

      const result = await service.updateAdmin(2, { email: 'new@csc.kr' });

      expect(admins.updateAdminRecord).toHaveBeenCalledWith(2, { email: 'new@csc.kr' });
      expect(result.email).toBe('new@csc.kr');
    });

    it('이미 쓰는 이메일이면 AdminEmailAlreadyExistsError 를 던진다', async () => {
      admins.findOneRecordById.mockResolvedValueOnce(makeAdmin());
      admins.findOneRecordByEmail.mockResolvedValueOnce(makeAdmin({ id: 3, email: 'new@csc.kr' }));

      await expect(service.updateAdmin(2, { email: 'new@csc.kr' })).rejects.toBeInstanceOf(
        AdminEmailAlreadyExistsError,
      );
      expect(admins.updateAdminRecord).not.toHaveBeenCalled();
    });

    it('루트 관리자의 이메일 변경은 거부한다', async () => {
      admins.findOneRecordById.mockResolvedValueOnce(
        makeAdmin({ id: 1, role: UserRole.ROOT, email: 'root@csc.kr' }),
      );

      await expect(service.updateAdmin(1, { email: 'other@csc.kr' })).rejects.toBeInstanceOf(
        CannotChangeRootAdminEmailError,
      );
      expect(admins.updateAdminRecord).not.toHaveBeenCalled();
    });

    it('루트 관리자도 이름은 수정할 수 있다', async () => {
      const root = makeAdmin({ id: 1, role: UserRole.ROOT, email: 'root@csc.kr' });
      admins.findOneRecordById
        .mockResolvedValueOnce(root)
        .mockResolvedValueOnce({ ...root, name: '새 이름' });

      const result = await service.updateAdmin(1, { name: '새 이름' });

      expect(admins.updateAdminRecord).toHaveBeenCalledWith(1, { name: '새 이름' });
      expect(result.name).toBe('새 이름');
    });

    it('같은 이메일을 다시 보내면 중복 검사 없이 통과한다(루트 포함)', async () => {
      const root = makeAdmin({ id: 1, role: UserRole.ROOT, email: 'root@csc.kr' });
      admins.findOneRecordById.mockResolvedValueOnce(root).mockResolvedValueOnce(root);

      await service.updateAdmin(1, { email: 'root@csc.kr' });

      expect(admins.findOneRecordByEmail).not.toHaveBeenCalled();
      expect(admins.updateAdminRecord).toHaveBeenCalledWith(1, { email: 'root@csc.kr' });
    });
  });

  describe('isAdminEmailAvailable', () => {
    it('쓰는 관리자가 없으면 사용 가능하다', async () => {
      admins.findOneRecordByEmail.mockResolvedValueOnce(null);
      await expect(service.isAdminEmailAvailable('new@csc.kr')).resolves.toBe(true);
    });

    it('다른 관리자가 쓰고 있으면 사용할 수 없다', async () => {
      admins.findOneRecordByEmail.mockResolvedValueOnce(makeAdmin({ id: 3 }));
      await expect(service.isAdminEmailAvailable('admin@csc.kr', 2)).resolves.toBe(false);
    });

    it('자기 자신이 쓰는 이메일은 사용 가능으로 본다(수정 대상 제외)', async () => {
      admins.findOneRecordByEmail.mockResolvedValueOnce(makeAdmin({ id: 2 }));
      await expect(service.isAdminEmailAvailable('admin@csc.kr', 2)).resolves.toBe(true);
    });
  });
});
