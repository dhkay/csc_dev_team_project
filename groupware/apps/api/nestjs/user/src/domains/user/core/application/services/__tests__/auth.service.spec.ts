import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import {
  CREDENTIAL_REGISTRY,
  CredentialRepositoryPort,
  ENTITLEMENT_REPOSITORY_PORT,
  EntitlementRepositoryPort,
  PLATFORM_ADMIN_REPOSITORY_PORT,
  TOKEN_SERVICE_PORT,
  PASSWORD_HASHER_PORT,
  TokenServicePort,
  PasswordHasherPort,
} from '../../ports/outbound';
import { CredentialEntity } from '../../../domain/entities';
import {
  OrgStatus,
  OrgType,
  PrincipalType,
  UserRole,
  UserStatus,
  UserType,
} from '../../../domain/types';
import {
  AccountLockedError,
  InvalidCredentialsError,
  TokenInvalidError,
} from '../../../domain/errors';
import {
  createCredentialRepositoryMock,
  createCredentialRegistryMock,
  createTokenServiceMock,
  createPasswordHasherMock,
  createPlatformAdminRepositoryMock,
} from '../../../../__mocks__';

describe('AuthService', () => {
  let service: AuthService;
  /** 조직유저(ORGANIZATION_USER) 자격 어댑터 mock: 구 `repository` 역할 */
  let orgCred: jest.Mocked<CredentialRepositoryPort>;
  /** 관리자유저(ADMIN_USER) 자격 어댑터 mock: 구 `platformRepository` 역할 */
  let adminCred: jest.Mocked<CredentialRepositoryPort>;
  let tokenService: jest.Mocked<TokenServicePort>;
  let passwordHasher: jest.Mocked<PasswordHasherPort>;

  /** 테스트용 관리자유저 자격 팩토리 (조직 없음, ADMIN_USER) */
  const makeAdmin = (overrides: Partial<CredentialEntity> = {}): CredentialEntity => ({
    id: 1,
    email: 'csc@csc.kr',
    passwordHash: 'hashed',
    name: '플랫폼 루트관리자',
    role: UserRole.ROOT,
    // 직책은 엔티티 필수 필드다. 빠뜨리면 스프레드로만 채워져 optional 로 좁혀지고 타입이 어긋난다.
    position: null,
    status: UserStatus.ACTIVE,
    userType: UserType.ADMIN_USER,
    tokenVersion: 0,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    profileImageUrl: null,
    principalType: PrincipalType.ADMIN_USER,
    ...overrides,
  });

  /** 테스트용 조직유저 자격 팩토리 (조직 컨텍스트 포함, ORGANIZATION_USER) */
  const makeUser = (overrides: Partial<CredentialEntity> = {}): CredentialEntity => ({
    id: 1,
    email: 'csc@csc.kr',
    passwordHash: 'hashed',
    name: '루트관리자',
    role: UserRole.ROOT,
    position: null,
    status: UserStatus.ACTIVE,
    userType: UserType.WEB_USER,
    tokenVersion: 0,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    profileImageUrl: null,
    principalType: PrincipalType.ORGANIZATION_USER,
    org: {
      id: 2,
      slug: 'default',
      name: '비즈오피스 데모',
      type: OrgType.TENANT,
      status: OrgStatus.ACTIVE,
      profileImageUrl: null,
    },
    ...overrides,
  });

  beforeEach(async () => {
    orgCred = createCredentialRepositoryMock(PrincipalType.ORGANIZATION_USER);
    adminCred = createCredentialRepositoryMock(PrincipalType.ADMIN_USER);
    tokenService = createTokenServiceMock();
    passwordHasher = createPasswordHasherMock();
    const entitlements: EntitlementRepositoryPort = {
      resolveEffectiveForUser: jest.fn().mockResolvedValue({ features: [], aiTools: [] }),
    };
    const platformAdmins = createPlatformAdminRepositoryMock();
    platformAdmins.resolveAdminFeatures.mockResolvedValue([]);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: CREDENTIAL_REGISTRY,
          useValue: createCredentialRegistryMock([orgCred, adminCred]),
        },
        { provide: ENTITLEMENT_REPOSITORY_PORT, useValue: entitlements },
        { provide: PLATFORM_ADMIN_REPOSITORY_PORT, useValue: platformAdmins },
        { provide: TOKEN_SERVICE_PORT, useValue: tokenService },
        { provide: PASSWORD_HASHER_PORT, useValue: passwordHasher },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('loginEmail', () => {
    it('정상 자격증명이면 토큰과 role 을 반환하고 lastLogin 을 갱신한다', async () => {
      orgCred.findOneByEmail.mockResolvedValueOnce(makeUser());
      passwordHasher.compare.mockResolvedValueOnce(true);
      tokenService.signAccessToken.mockReturnValueOnce('atk');
      tokenService.signRefreshToken.mockReturnValueOnce('rtk');

      const result = await service.loginEmail('csc@csc.kr', 'any-password');

      expect(result).toEqual({
        token: 'atk',
        refreshToken: 'rtk',
        name: '루트관리자',
        role: UserRole.ROOT,
      });
      expect(orgCred.updateLastLogin).toHaveBeenCalledWith(1);
    });

    it('존재하지 않는 이메일이면 InvalidCredentialsError 를 던진다', async () => {
      orgCred.findOneByEmail.mockResolvedValueOnce(null);
      await expect(service.loginEmail('x@x.kr', 'pw')).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
    });

    it('비밀번호가 틀리면 InvalidCredentialsError 를 던진다', async () => {
      orgCred.findOneByEmail.mockResolvedValueOnce(makeUser());
      passwordHasher.compare.mockResolvedValueOnce(false);
      await expect(service.loginEmail('csc@csc.kr', 'wrong')).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
    });

    it('계정이 잠겨있으면 AccountLockedError 를 던진다', async () => {
      orgCred.findOneByEmail.mockResolvedValueOnce(makeUser({ status: UserStatus.LOCKED }));
      await expect(service.loginEmail('csc@csc.kr', 'pw')).rejects.toBeInstanceOf(
        AccountLockedError,
      );
    });

    it('비밀번호가 틀리면 실패 횟수를 누적한다', async () => {
      orgCred.findOneByEmail.mockResolvedValueOnce(makeUser({ failedLoginAttempts: 1 }));
      passwordHasher.compare.mockResolvedValueOnce(false);

      await expect(service.loginEmail('csc@csc.kr', 'wrong')).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
      // 누적: (id, attempts=2, lockedUntil=null): 아직 임계치 미만
      expect(orgCred.updateLoginSecurity).toHaveBeenCalledWith(1, 2, null);
    });

    it('연속 실패가 임계치(5)에 도달하면 임시 잠금한다', async () => {
      orgCred.findOneByEmail.mockResolvedValueOnce(makeUser({ failedLoginAttempts: 4 }));
      passwordHasher.compare.mockResolvedValueOnce(false);

      await expect(service.loginEmail('csc@csc.kr', 'wrong')).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
      // 임계치 도달: 카운터 리셋 + 미래 시각으로 임시 잠금
      expect(orgCred.updateLoginSecurity).toHaveBeenCalledWith(1, 0, expect.any(Date));
      const lockedUntil = orgCred.updateLoginSecurity.mock.calls[0][2] as Date;
      expect(lockedUntil.getTime()).toBeGreaterThan(Date.now());
    });

    it('임시 잠금 중이면 비밀번호 비교 없이 AccountLockedError 를 던진다', async () => {
      orgCred.findOneByEmail.mockResolvedValueOnce(
        makeUser({ lockedUntil: new Date(Date.now() + 60_000) }),
      );
      await expect(service.loginEmail('csc@csc.kr', 'pw')).rejects.toBeInstanceOf(
        AccountLockedError,
      );
      expect(passwordHasher.compare).not.toHaveBeenCalled();
    });

    it('로그인 성공 시 실패 카운터를 리셋한다', async () => {
      orgCred.findOneByEmail.mockResolvedValueOnce(makeUser({ failedLoginAttempts: 2 }));
      passwordHasher.compare.mockResolvedValueOnce(true);
      tokenService.signAccessToken.mockReturnValueOnce('atk');
      tokenService.signRefreshToken.mockReturnValueOnce('rtk');

      await service.loginEmail('csc@csc.kr', 'correct');

      expect(orgCred.updateLoginSecurity).toHaveBeenCalledWith(1, 0, null);
      expect(orgCred.updateLastLogin).toHaveBeenCalledWith(1);
    });
  });

  describe('loginPlatformEmail', () => {
    it('정상 자격증명이면 플랫폼 토큰을 발급한다(organizationId 없음, PLATFORM 클레임)', async () => {
      adminCred.findOneByEmail.mockResolvedValueOnce(makeAdmin());
      passwordHasher.compare.mockResolvedValueOnce(true);
      tokenService.signAccessToken.mockReturnValueOnce('atk');
      tokenService.signRefreshToken.mockReturnValueOnce('rtk');

      const result = await service.loginPlatformEmail('csc@csc.kr', 'pw');

      expect(result).toEqual({
        token: 'atk',
        refreshToken: 'rtk',
        name: '플랫폼 루트관리자',
        role: UserRole.ROOT,
      });
      expect(adminCred.updateLastLogin).toHaveBeenCalledWith(1);
      // 액세스 토큰: ADMIN_USER principal + PLATFORM, organizationId 미포함
      const accessClaims = tokenService.signAccessToken.mock.calls[0][0];
      expect(accessClaims.principalType).toBe(PrincipalType.ADMIN_USER);
      expect(accessClaims.organizationType).toBe(OrgType.PLATFORM);
      expect(accessClaims.userType).toBe(UserType.ADMIN_USER);
      expect(accessClaims.organizationId).toBeUndefined();
    });

    it('존재하지 않는 이메일이면 InvalidCredentialsError 를 던진다', async () => {
      adminCred.findOneByEmail.mockResolvedValueOnce(null);
      await expect(service.loginPlatformEmail('x@x.kr', 'pw')).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
    });
  });

  describe('refresh', () => {
    it('조직유저 토큰 버전이 일치하면 새 토큰을 발급한다', async () => {
      tokenService.verifyRefreshToken.mockReturnValueOnce({
        id: 1,
        tokenVersion: 3,
        principalType: PrincipalType.ORGANIZATION_USER,
      });
      orgCred.findOneById.mockResolvedValueOnce(makeUser({ tokenVersion: 3 }));
      tokenService.signAccessToken.mockReturnValueOnce('atk');
      tokenService.signRefreshToken.mockReturnValueOnce('rtk');

      const result = await service.refresh('rtk-in');

      expect(result).toEqual({ token: 'atk', refreshToken: 'rtk' });
      expect(tokenService.signRefreshToken).toHaveBeenCalledWith({
        id: 1,
        tokenVersion: 3,
        principalType: PrincipalType.ORGANIZATION_USER,
      });
    });

    it('ADMIN_USER principal 이면 admin_users 에서 조회해 발급한다', async () => {
      tokenService.verifyRefreshToken.mockReturnValueOnce({
        id: 1,
        tokenVersion: 2,
        principalType: PrincipalType.ADMIN_USER,
      });
      adminCred.findOneById.mockResolvedValueOnce(makeAdmin({ tokenVersion: 2 }));
      tokenService.signAccessToken.mockReturnValueOnce('atk');
      tokenService.signRefreshToken.mockReturnValueOnce('rtk');

      const result = await service.refresh('rtk-in');

      expect(result).toEqual({ token: 'atk', refreshToken: 'rtk' });
      expect(adminCred.findOneById).toHaveBeenCalledWith(1);
      expect(orgCred.findOneById).not.toHaveBeenCalled();
    });

    it('토큰 버전이 다르면(로그아웃됨) TokenInvalidError 를 던진다', async () => {
      tokenService.verifyRefreshToken.mockReturnValueOnce({
        id: 1,
        tokenVersion: 2,
        principalType: PrincipalType.ORGANIZATION_USER,
      });
      orgCred.findOneById.mockResolvedValueOnce(makeUser({ tokenVersion: 3 }));

      await expect(service.refresh('stale-rtk')).rejects.toBeInstanceOf(TokenInvalidError);
      expect(tokenService.signAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('조직유저 refresh 토큰이면 organization_users token_version 을 올린다', async () => {
      tokenService.verifyRefreshToken.mockReturnValueOnce({
        id: 7,
        tokenVersion: 1,
        principalType: PrincipalType.ORGANIZATION_USER,
      });

      await service.logout('rtk');

      expect(orgCred.incrementTokenVersion).toHaveBeenCalledWith(7);
      expect(adminCred.incrementTokenVersion).not.toHaveBeenCalled();
    });

    it('ADMIN_USER refresh 토큰이면 admin_users token_version 을 올린다', async () => {
      tokenService.verifyRefreshToken.mockReturnValueOnce({
        id: 3,
        tokenVersion: 1,
        principalType: PrincipalType.ADMIN_USER,
      });

      await service.logout('rtk');

      expect(adminCred.incrementTokenVersion).toHaveBeenCalledWith(3);
      expect(orgCred.incrementTokenVersion).not.toHaveBeenCalled();
    });

    it('refresh 토큰이 무효면 멱등하게 통과한다(무효화 없음)', async () => {
      tokenService.verifyRefreshToken.mockImplementationOnce(() => {
        throw new Error('invalid');
      });

      await expect(service.logout('garbage')).resolves.toBeUndefined();
      expect(orgCred.incrementTokenVersion).not.toHaveBeenCalled();
    });
  });
});
