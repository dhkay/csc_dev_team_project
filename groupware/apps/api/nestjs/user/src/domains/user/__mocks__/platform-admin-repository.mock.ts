import type { PlatformAdminRepositoryPort } from '../core/application/ports/outbound';

/** PlatformAdminRepositoryPort Mock 팩토리 */
export const createPlatformAdminRepositoryMock = (): jest.Mocked<PlatformAdminRepositoryPort> => ({
  findOneRecordByEmail: jest.fn(),
  findOneRecordById: jest.fn(),
  createRecord: jest.fn(),
  updatePasswordHashRecord: jest.fn(),
  updateLoginSecurityRecord: jest.fn(),
  incrementTokenVersionRecord: jest.fn(),
  findManyAdminRecords: jest.fn(),
  updateAdminRecord: jest.fn(),
  deleteAdminRecord: jest.fn(),
  findManyAdminFeatureRecords: jest.fn(),
  findAdminFeatureKeys: jest.fn(),
  setAdminFeaturesRecord: jest.fn(),
  resolveAdminFeatures: jest.fn(),
});
