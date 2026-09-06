import type { TokenServicePort } from '../core/application/ports/outbound';

/** TokenServicePort Mock 팩토리 */
export const createTokenServiceMock = (): jest.Mocked<TokenServicePort> => ({
  signAccessToken: jest.fn(),
  signRefreshToken: jest.fn(),
  verifyAccessToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
});
