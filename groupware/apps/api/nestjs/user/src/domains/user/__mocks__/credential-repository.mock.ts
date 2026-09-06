import type {
  CredentialRegistry,
  CredentialRepositoryPort,
} from '../core/application/ports/outbound';
import type { PrincipalType } from '../core/domain/types/user.types';

/** CredentialRepositoryPort Mock 팩토리 (principalType 별) */
export const createCredentialRepositoryMock = (
  principalType: PrincipalType,
): jest.Mocked<CredentialRepositoryPort> => ({
  principalType,
  findOneByEmail: jest.fn(),
  findOneById: jest.fn(),
  updateLoginSecurity: jest.fn(),
  updateLastLogin: jest.fn(),
  incrementTokenVersion: jest.fn(),
});

/** CredentialRegistry Mock: principalType → 어댑터 Map 으로 조회 */
export const createCredentialRegistryMock = (
  adapters: CredentialRepositoryPort[],
): CredentialRegistry => {
  const map = new Map<PrincipalType, CredentialRepositoryPort>(
    adapters.map((a) => [a.principalType, a]),
  );
  return {
    get: (pt) => {
      const a = map.get(pt);
      if (!a) throw new Error(`no credential adapter for ${pt}`);
      return a;
    },
  };
};
