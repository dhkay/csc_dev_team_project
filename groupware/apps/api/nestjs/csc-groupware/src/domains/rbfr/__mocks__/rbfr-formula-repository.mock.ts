import type { RbfrFormulaRepositoryPort } from '../core/application/ports/outbound';

/** RbfrFormulaRepositoryPort 레포지토리 Mock 팩토리. */
export const createRbfrFormulaRepositoryMock = (): jest.Mocked<RbfrFormulaRepositoryPort> => ({
  findFormulaIngredients: jest.fn(),
  findPinnedIngredients: jest.fn(),
  findFormulaConditions: jest.fn(),
  findFormulaCountryCodes: jest.fn(),
  findDirectDomainCodes: jest.fn(),
  findIntegratedDomainCode: jest.fn(),
  findIntegratedRoleInput: jest.fn(),
  findContributions: jest.fn(),
  findInteractionCoefficients: jest.fn(),
  findConcentrationLimits: jest.fn(),
  findRegulations: jest.fn(),
  findIncompat: jest.fn(),
  findNoaddFlags: jest.fn(),
  findCerts: jest.fn(),
  findPhRanges: jest.fn(),
  findHlbProfiles: jest.fn(),
  findUnitPrices: jest.fn(),
});
