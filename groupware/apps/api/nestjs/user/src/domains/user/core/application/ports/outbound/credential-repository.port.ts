import { CredentialEntity } from '../../../domain/entities/credential.entity';
import { PrincipalType } from '../../../domain/types/user.types';

/**
 * 인증 공통 아웃바운드 포트: 2개 정체성 테이블(admin_users/organization_users)의 로그인/갱신 공통 연산을 단일 인터페이스로 묶는다.
 * principalType 별 어댑터가 구현하고, AuthService 는 레지스트리로 어댑터를 선택해 분기를 제거한다.
 */
export interface CredentialRepositoryPort {
  // 이 어댑터가 담당하는 주체: 레지스트리 키
  readonly principalType: PrincipalType;
  findOneByEmail(email: string): Promise<CredentialEntity | null>;
  findOneById(id: number): Promise<CredentialEntity | null>;
  updateLoginSecurity(
    id: number,
    failedLoginAttempts: number,
    lockedUntil: Date | null,
  ): Promise<void>;
  updateLastLogin(id: number): Promise<void>;
  incrementTokenVersion(id: number): Promise<void>;
}

/** principalType → CredentialRepositoryPort 레지스트리(읽기 전용 조회) */
export interface CredentialRegistry {
  /** 없으면 throw: 어댑터 등록 누락을 fail-fast 로 드러낸다. */
  get(principalType: PrincipalType): CredentialRepositoryPort;
}

export const CREDENTIAL_REGISTRY = Symbol('CREDENTIAL_REGISTRY');
