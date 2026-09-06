import type { PasswordHasherPort } from '../core/application/ports/outbound';

/** PasswordHasherPort Mock 팩토리 */
export const createPasswordHasherMock = (): jest.Mocked<PasswordHasherPort> => ({
  hash: jest.fn(),
  compare: jest.fn(),
});
