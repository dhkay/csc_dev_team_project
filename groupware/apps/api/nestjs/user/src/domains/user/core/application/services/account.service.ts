import { Inject, Injectable } from '@nestjs/common';
import { PrincipalType, UserRole } from '../../domain/types/user.types';
import { InvalidCredentialsError, ProfileUpdateForbiddenError } from '../../domain/errors';
import {
  AccountActor,
  AccountPort,
  UpdateOwnProfileInput,
} from '../ports/inbound/account.port';
import {
  USER_REPOSITORY_PORT,
  UserRepositoryPort,
} from '../ports/outbound/user-repository.port';
import {
  CREDENTIAL_REGISTRY,
  CredentialRegistry,
} from '../ports/outbound/credential-repository.port';
import { PASSWORD_HASHER_PORT, PasswordHasherPort } from '../ports/outbound/password-hasher.port';

/**
 * 조직유저 본인 계정 self-service.
 * - 대상은 ORGANIZATION_USER 만(관리자유저는 control-tower 로 관리) → 아니면 403.
 * - 전 역할 공통: 이름 + 프로필이미지
 * - ADMIN 만 추가로 비밀번호 변경(ROOT 는 플랫폼 관리)
 * 역할 게이팅은 여기(서비스)가 보안 경계로 강제한다(프런트 숨김과 별개)
 */
@Injectable()
export class AccountService implements AccountPort {
  constructor(
    @Inject(USER_REPOSITORY_PORT)
    private readonly userRepository: UserRepositoryPort,
    @Inject(CREDENTIAL_REGISTRY)
    private readonly credentials: CredentialRegistry,
    @Inject(PASSWORD_HASHER_PORT)
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  async updateOwnProfile(actor: AccountActor, patch: UpdateOwnProfileInput): Promise<void> {
    this.assertOrganizationUser(actor);
    // 전 역할 공통: 이름 + 프로필이미지. 이름은 조직 내 중복을 허용한다(표시 이름: 동명이인이 정상)
    await this.userRepository.updateProfileRecord(actor.id, {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.profileImageUrl !== undefined ? { profileImageUrl: patch.profileImageUrl } : {}),
    });
  }

  async changeOwnPassword(
    actor: AccountActor,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    this.assertOrganizationUser(actor);
    // ROOT 비밀번호는 플랫폼(control-tower)이 재설정: 본인 변경 불가
    if (actor.role !== UserRole.ADMIN) {
      throw new ProfileUpdateForbiddenError('비밀번호는 플랫폼에서 관리됩니다.');
    }
    const cred = await this.credentials.get(PrincipalType.ORGANIZATION_USER).findOneById(actor.id);
    if (!cred) {
      throw new InvalidCredentialsError();
    }
    const matched = await this.passwordHasher.compare(currentPassword, cred.passwordHash);
    if (!matched) {
      throw new InvalidCredentialsError();
    }
    const passwordHash = await this.passwordHasher.hash(newPassword);
    await this.userRepository.updatePasswordHashRecord(actor.id, passwordHash);
  }

  /** self-service 는 조직유저 전용: 그 외 주체(관리자유저)는 거부 */
  private assertOrganizationUser(actor: AccountActor): void {
    if (actor.principalType !== PrincipalType.ORGANIZATION_USER) {
      throw new ProfileUpdateForbiddenError('이 계정은 여기서 변경할 수 없습니다.');
    }
  }
}
