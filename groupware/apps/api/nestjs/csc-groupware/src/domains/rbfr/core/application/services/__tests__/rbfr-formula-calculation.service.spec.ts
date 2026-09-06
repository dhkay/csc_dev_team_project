import { Test, TestingModule } from '@nestjs/testing';
import { RbfrFormulaCalculationService } from '../rbfr-formula-calculation.service';
import { RbfrScoringService } from '../rbfr-scoring.service';
import { RbfrValidationService } from '../rbfr-validation.service';
import { RBFR_FORMULA_REPOSITORY_PORT } from '../../ports/outbound';
import { RBFR_SCORING_PORT } from '../../ports/inbound/rbfr-scoring.port';
import { RBFR_VALIDATION_PORT } from '../../ports/inbound/rbfr-validation.port';
import { createRbfrFormulaRepositoryMock } from '../../../../__mocks__/rbfr-formula-repository.mock';
import type { RbfrFormulaRepositoryPort } from '../../ports/outbound';

describe('RbfrFormulaCalculationService', () => {
  let service: RbfrFormulaCalculationService;
  let repository: jest.Mocked<RbfrFormulaRepositoryPort>;

  beforeEach(async () => {
    repository = createRbfrFormulaRepositoryMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbfrFormulaCalculationService,
        { provide: RBFR_FORMULA_REPOSITORY_PORT, useValue: repository },
        { provide: RBFR_SCORING_PORT, useClass: RbfrScoringService },
        { provide: RBFR_VALIDATION_PORT, useClass: RbfrValidationService },
      ],
    }).compile();

    service = module.get<RbfrFormulaCalculationService>(RbfrFormulaCalculationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('레포지토리에서 모은 데이터로 계산과 검증을 모두 수행한다', async () => {
    repository.findFormulaIngredients.mockResolvedValueOnce([
      { ingredientId: '1', percent: 60 },
      { ingredientId: '2', percent: 40 },
    ]);
    repository.findDirectDomainCodes.mockResolvedValueOnce(['MOISTURE', 'SOOTHING']);
    repository.findIntegratedDomainCode.mockResolvedValueOnce('BALANCE');
    repository.findContributions.mockResolvedValueOnce([
      { ingredientId: '1', domainCode: 'MOISTURE', contribution: 80 },
      { ingredientId: '2', domainCode: 'SOOTHING', contribution: 60 },
    ]);
    repository.findInteractionCoefficients.mockResolvedValueOnce([]);
    repository.findConcentrationLimits.mockResolvedValueOnce([]);
    repository.findIntegratedRoleInput.mockResolvedValueOnce({ domainCode: 'BALANCE', hasEvidence: false, value: 0 });
    repository.findPinnedIngredients.mockResolvedValueOnce([]);
    repository.findFormulaConditions.mockResolvedValueOnce({ excludedNoaddCodes: [], requiredCertCodes: [] });
    repository.findFormulaCountryCodes.mockResolvedValueOnce(['KR']);
    repository.findRegulations.mockResolvedValueOnce([]);
    repository.findIncompat.mockResolvedValueOnce([]);
    repository.findNoaddFlags.mockResolvedValueOnce([]);
    repository.findCerts.mockResolvedValueOnce([]);
    repository.findPhRanges.mockResolvedValueOnce([]);
    repository.findHlbProfiles.mockResolvedValueOnce([]);
    repository.findUnitPrices.mockResolvedValueOnce([]);

    const result = await service.calculateAndValidateFormula(1, 'SKIN');

    expect(result.directResults).toHaveLength(2);
    expect(result.directResults.find((r) => r.domainCode === 'MOISTURE')?.finalValue).toBe(48); // 60% * 80
    // 통합역할(균형)은 근거가 없어 비중값 결과에 포함되지 않아야 한다(05번 원칙5).
    expect(result.ratios.some((r) => r.domainCode === 'BALANCE')).toBe(false);
    // 규제 확정 데이터가 없는 원료 2개 × 대상국 1개 = NODATA 경고 2건, block 없음.
    expect(result.validation.canConfirm).toBe(true);
    expect(result.validation.issues.filter((i) => i.code === 'REG_NODATA')).toHaveLength(2);
  });

  it('통합역할 도메인이 없는 Profile이면 균형 없이 직접역할만 계산한다', async () => {
    repository.findFormulaIngredients.mockResolvedValueOnce([{ ingredientId: '1', percent: 100 }]);
    repository.findDirectDomainCodes.mockResolvedValueOnce(['MOISTURE']);
    repository.findIntegratedDomainCode.mockResolvedValueOnce(null);
    repository.findContributions.mockResolvedValueOnce([{ ingredientId: '1', domainCode: 'MOISTURE', contribution: 50 }]);
    repository.findInteractionCoefficients.mockResolvedValueOnce([]);
    repository.findConcentrationLimits.mockResolvedValueOnce([]);
    repository.findPinnedIngredients.mockResolvedValueOnce([]);
    repository.findFormulaConditions.mockResolvedValueOnce({ excludedNoaddCodes: [], requiredCertCodes: [] });
    repository.findFormulaCountryCodes.mockResolvedValueOnce([]);
    repository.findRegulations.mockResolvedValueOnce([]);
    repository.findIncompat.mockResolvedValueOnce([]);
    repository.findNoaddFlags.mockResolvedValueOnce([]);
    repository.findCerts.mockResolvedValueOnce([]);
    repository.findPhRanges.mockResolvedValueOnce([]);
    repository.findHlbProfiles.mockResolvedValueOnce([]);
    repository.findUnitPrices.mockResolvedValueOnce([]);

    const result = await service.calculateAndValidateFormula(2, 'SKIN');

    expect(repository.findIntegratedRoleInput).not.toHaveBeenCalled();
    expect(result.ratios).toHaveLength(1);
  });
});
