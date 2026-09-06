import { Inject, Injectable } from '@nestjs/common';
import { CredentialEntity } from '../../domain/entities/credential.entity';
import { AccessTokenPayload, OrgStatus, OrgType, PrincipalType, UserRole, UserStatus } from '../../domain/types/user.types';
import { OrgPosition } from '../../domain/types/entitlement-catalog';
import {
  AccountInactiveError,
  AccountLockedError,
  InvalidCredentialsError,
  TokenInvalidError,
} from '../../domain/errors/auth.errors';
import { AuthPort, LoginResult, RefreshResult, UserDataResult } from '../ports/inbound/auth.port';
import {
  CREDENTIAL_REGISTRY,
  CredentialRegistry,
} from '../ports/outbound/credential-repository.port';
import {
  ENTITLEMENT_REPOSITORY_PORT,
  EntitlementRepositoryPort,
} from '../ports/outbound/entitlement-repository.port';
import {
  PLATFORM_ADMIN_REPOSITORY_PORT,
  PlatformAdminRepositoryPort,
} from '../ports/outbound/platform-admin-repository.port';
import { TOKEN_SERVICE_PORT, TokenServicePort } from '../ports/outbound/token-service.port';
import { PASSWORD_HASHER_PORT, PasswordHasherPort } from '../ports/outbound/password-hasher.port';

/** 로그인 무차별 대입 방어: 연속 실패 임계치 / 임시 잠금 시간(자동 해제) */
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService implements AuthPort {
  constructor(
    @Inject(CREDENTIAL_REGISTRY)
    private readonly credentials: CredentialRegistry,
    @Inject(ENTITLEMENT_REPOSITORY_PORT)
    private readonly entitlements: EntitlementRepositoryPort,
    @Inject(PLATFORM_ADMIN_REPOSITORY_PORT)
    private readonly platformAdmins: PlatformAdminRepositoryPort,
    @Inject(TOKEN_SERVICE_PORT)
    private readonly tokenService: TokenServicePort,
    @Inject(PASSWORD_HASHER_PORT)
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  /** 조직유저 로그인(groupware): organization_users 테이블 */
  async loginEmail(email: string, password: string): Promise<LoginResult> {
    return this.login(PrincipalType.ORGANIZATION_USER, email, password);
  }

  /** 관리자유저 로그인(control-tower): admin_users 테이블(조직 없음) */
  async loginPlatformEmail(email: string, password: string): Promise<LoginResult> {
    return this.login(PrincipalType.ADMIN_USER, email, password);
  }

  /** 공통 로그인: principalType 으로 자격 어댑터를 선택해 단일 흐름으로 인증한다. */
  private async login(
    principalType: PrincipalType,
    email: string,
    password: string,
  ): Promise<LoginResult> {
    const repo = this.credentials.get(principalType);
    const cred = await repo.findOneByEmail(email);
    if (!cred) {
      throw new InvalidCredentialsError();
    }

    this.assertAccountUsable(cred); // 영구 잠금(LOCKED)/비활성
    if (cred.org) this.assertOrgActive(cred.org.status); // 소속 조직 상태(조직/서비스 주체만)
    this.assertNotLockedOut(cred); // 무차별 대입 임시 잠금(locked_until)

    const matched = await this.passwordHasher.compare(password, cred.passwordHash);
    if (!matched) {
      await this.registerFailedLogin(cred, repo);
      throw new InvalidCredentialsError();
    }

    // 성공: 실패 카운터/임시 잠금 해제(상태가 남아 있을 때만 기록)
    if (cred.failedLoginAttempts > 0 || cred.lockedUntil) {
      await repo.updateLoginSecurity(cred.id, 0, null);
    }
    await repo.updateLastLogin(cred.id);

    return {
      ...(await this.issueTokens(cred)),
      name: cred.name,
      role: cred.role,
    };
  }

  async refresh(refreshToken: string): Promise<RefreshResult> {
    let payload: { id: number; tokenVersion: number; principalType: PrincipalType };
    try {
      payload = this.tokenService.verifyRefreshToken(refreshToken);
    } catch {
      throw new TokenInvalidError();
    }

    const cred = await this.credentials.get(payload.principalType).findOneById(payload.id);
    if (!cred || cred.status === UserStatus.WITHDRAWN) {
      throw new TokenInvalidError();
    }
    // 소속 조직이 비활성(삭제/정지)이면 세션 무효: 조직/서비스 주체만
    if (cred.org && cred.org.status !== OrgStatus.ACTIVE) {
      throw new TokenInvalidError();
    }
    // 서버단 로그아웃 검증: 토큰 발급 이후 로그아웃(token_version 증가)이 있었으면 무효
    if (cred.tokenVersion !== payload.tokenVersion) {
      throw new TokenInvalidError();
    }
    return await this.issueTokens(cred);
  }

  async logout(refreshToken: string): Promise<void> {
    // refresh 토큰에서 주체를 식별해 token_version 을 올린다 → 기존 refresh 토큰 일괄 무효화
    // 토큰이 이미 무효/만료라 식별 불가하면 무효화할 세션이 없으므로 멱등하게 통과한다.
    let payload: { id: number; principalType: PrincipalType };
    try {
      payload = this.tokenService.verifyRefreshToken(refreshToken);
    } catch {
      return;
    }
    await this.credentials.get(payload.principalType).incrementTokenVersion(payload.id);
  }

  async findData(userId: number, principalType: PrincipalType): Promise<UserDataResult> {
    const cred = await this.credentials.get(principalType).findOneById(userId);
    if (!cred) {
      throw new TokenInvalidError();
    }
    // 관리자유저면 플랫폼 옵션(admin_features) 유효 key 를 함께 반환(사이드바/페이지 가드용)
    const adminFeatures =
      cred.principalType === PrincipalType.ADMIN_USER
        ? await this.platformAdmins.resolveAdminFeatures(cred.id, cred.role)
        : undefined;
    // 조직 주체는 그 조직, 관리자유저(조직 없음)는 센티넬 PLATFORM 조직을 반환
    // (프런트 isPlatformAdmin 이 type==='PLATFORM' 만 보므로 유지)
    return {
      id: cred.id,
      name: cred.name,
      role: cred.role,
      ...(adminFeatures ? { adminFeatures } : {}),
      profileImageUrl: cred.profileImageUrl ?? null,
      lastLoginAt: cred.lastLoginAt ? cred.lastLoginAt.toISOString() : null,
      organization: cred.org
        ? {
            id: cred.org.id,
            slug: cred.org.slug,
            name: cred.org.name,
            type: cred.org.type,
            profileImageUrl: cred.org.profileImageUrl,
          }
        : {
            id: 0,
            slug: 'platform',
            name: 'CSC Partners',
            type: OrgType.PLATFORM,
            profileImageUrl: null,
          },
    };
  }

  /**
   * 토큰 발급(일반화): 클레임을 CredentialEntity 에서 생성한다.
   * 조직 주체: organizationId + organizationType. 관리자유저: organizationId 미포함 + organizationType=PLATFORM.
   * 가변값 slug 는 토큰에 넣지 않고 필요 시 findData 로 조회한다(AccessTokenPayload 주석 참고)
   * 조직유저는 유효 엔타이틀먼트(기능/AI도구 key)를 resolve 해 토큰에 싣는다(다운스트림 인가용)
   */
  private async issueTokens(cred: CredentialEntity): Promise<{ token: string; refreshToken: string }> {
    // 루트 권한자(ROOT ∨ 대표)는 조직 보유 AI도구 전부: 대표는 권한이 아닌 직책(position)에서 판정
    const hasRootAuthority =
      cred.role === UserRole.ROOT || cred.position === OrgPosition.Representative;
    const entitlements =
      cred.principalType === PrincipalType.ORGANIZATION_USER && cred.org
        ? await this.entitlements.resolveEffectiveForUser(cred.org.id, cred.id, hasRootAuthority)
        : undefined;
    // 관리자유저(플랫폼)는 admin_features(별도 테이블) 유효 옵션을 토큰에 싣는다(ROOT=전체)
    const adminFeatures =
      cred.principalType === PrincipalType.ADMIN_USER
        ? await this.platformAdmins.resolveAdminFeatures(cred.id, cred.role)
        : undefined;
    const claims: AccessTokenPayload = {
      id: cred.id,
      email: cred.email,
      name: cred.name,
      userType: cred.userType,
      role: cred.role,
      principalType: cred.principalType,
      organizationType: cred.org ? cred.org.type : OrgType.PLATFORM,
      ...(cred.org ? { organizationId: cred.org.id } : {}),
      ...(entitlements
        ? {
            features: entitlements.features,
            aiTools: entitlements.aiTools,
            permissions: entitlements.permissions,
          }
        : {}),
      ...(cred.position ? { position: cred.position } : {}),
      ...(adminFeatures ? { adminFeatures } : {}),
    };
    return {
      token: this.tokenService.signAccessToken(claims),
      refreshToken: this.tokenService.signRefreshToken({
        id: cred.id,
        tokenVersion: cred.tokenVersion,
        principalType: cred.principalType,
      }),
    };
  }

  /** 무차별 대입 임시 잠금 확인: locked_until 이 미래면 차단(시간 경과 시 자동 해제) */
  private assertNotLockedOut(subject: { lockedUntil: Date | null }): void {
    if (subject.lockedUntil && subject.lockedUntil.getTime() > Date.now()) {
      throw new AccountLockedError();
    }
  }

  /** 로그인 실패 누적: 임계치 도달 시 일정 시간 임시 잠금(카운터 리셋). 영속화는 자격 어댑터가 담당 */
  private async registerFailedLogin(
    subject: { id: number; failedLoginAttempts: number },
    repo: { updateLoginSecurity(id: number, attempts: number, lockedUntil: Date | null): Promise<void> },
  ): Promise<void> {
    const attempts = subject.failedLoginAttempts + 1;
    if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      await repo.updateLoginSecurity(subject.id, 0, new Date(Date.now() + LOCKOUT_DURATION_MS));
    } else {
      await repo.updateLoginSecurity(subject.id, attempts, null);
    }
  }

  /** 계정 상태 게이트(공용): 영구 잠금(LOCKED)/비활성 차단 */
  private assertAccountUsable(subject: { status: UserStatus }): void {
    if (subject.status === UserStatus.LOCKED) {
      throw new AccountLockedError();
    }
    if (subject.status !== UserStatus.ACTIVE) {
      throw new AccountInactiveError();
    }
  }

  /** 소속 조직 상태 게이트(조직/서비스 주체 전용): 삭제 WITHDRAWN / 정지 SUSPENDED 시 차단 */
  private assertOrgActive(orgStatus: OrgStatus): void {
    if (orgStatus !== OrgStatus.ACTIVE) {
      throw new AccountInactiveError();
    }
  }
}
