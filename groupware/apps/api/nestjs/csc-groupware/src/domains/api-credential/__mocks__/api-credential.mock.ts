import type {
  ApiCredentialRepositoryPort,
  ApiKeyValidatorPort,
  SecretCipherPort,
} from '../core/application/ports/outbound';

/** 자격증명 레포지토리 Mock 팩토리 */
export const createApiCredentialRepositoryMock =
  (): jest.Mocked<ApiCredentialRepositoryPort> => ({
    findManyRecordsByOrg: jest.fn(),
    findOneRecord: jest.fn(),
    upsertRecord: jest.fn(),
    deleteRecord: jest.fn(),
  });

/**
 * 암호화 Mock: 실제 AES 대신 그대로 통과시킨다.
 * 서비스가 확인하는 것은 "무엇이 암호화되어 저장되는가" 이지 암호 알고리즘이 아니다.
 */
export const createSecretCipherMock = (): jest.Mocked<SecretCipherPort> => ({
  encrypt: jest.fn((plain: string) => plain),
  decrypt: jest.fn((cipher: string) => cipher),
});

/** 실검증 Mock: 기본은 통과. 실패 경로를 볼 때만 개별 테스트에서 바꾼다. */
export const createApiKeyValidatorMock = (): jest.Mocked<ApiKeyValidatorPort> => ({
  validate: jest.fn().mockResolvedValue({ valid: true }),
});
