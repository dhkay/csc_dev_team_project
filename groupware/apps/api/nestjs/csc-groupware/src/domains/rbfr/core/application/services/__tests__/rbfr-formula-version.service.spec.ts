import { Test, TestingModule } from '@nestjs/testing';
import { RbfrFormulaVersionService, cellCountFor } from '../rbfr-formula-version.service';
import { RBFR_FORMULA_CALCULATION_PORT } from '../../ports/inbound';
import type { RbfrFormulaCalculationPort } from '../../ports/inbound';
import { RBFR_FORMULA_VERSION_REPOSITORY_PORT } from '../../ports/outbound';
import type { RbfrFormulaVersionRepositoryPort } from '../../ports/outbound';
import type { FormulaVersionSummary } from '../../../domain/types';

describe('cellCountFor', () => {
  const mapping = [
    { ratioFrom: 0, ratioTo: 20, cellCount: 1 },
    { ratioFrom: 20, ratioTo: 40, cellCount: 2 },
    { ratioFrom: 40, ratioTo: 100, cellCount: 3 },
  ];

  it('구간은 이상~미만이라 경계값은 다음 구간에 속한다', () => {
    expect(cellCountFor(20, mapping)).toBe(2);
    expect(cellCountFor(19.999, mapping)).toBe(1);
  });

  it('어느 구간에도 속하지 않으면 0을 반환한다', () => {
    expect(cellCountFor(150, mapping)).toBe(0);
  });
});

describe('RbfrFormulaVersionService', () => {
  let service: RbfrFormulaVersionService;
  let versionRepository: jest.Mocked<RbfrFormulaVersionRepositoryPort>;
  let calculation: jest.Mocked<RbfrFormulaCalculationPort>;

  beforeEach(async () => {
    versionRepository = {
      findFormulaIngredientLines: jest.fn(),
      findFormulaTargetRatios: jest.fn(),
      findBatchSize: jest.fn(),
      findApprovedCellRule: jest.fn(),
      nextVersionNo: jest.fn(),
      createVersionSnapshot: jest.fn(),
      listVersions: jest.fn(),
    };
    calculation = { calculateAndValidateFormula: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbfrFormulaVersionService,
        { provide: RBFR_FORMULA_VERSION_REPOSITORY_PORT, useValue: versionRepository },
        { provide: RBFR_FORMULA_CALCULATION_PORT, useValue: calculation },
      ],
    }).compile();

    service = module.get(RbfrFormulaVersionService);
  });

  describe('confirmFormula', () => {
    it('승인된 Cell 규칙 판이 없으면 확정을 거부한다', async () => {
      versionRepository.findApprovedCellRule.mockResolvedValueOnce(undefined);
      await expect(service.confirmFormula(10, 'SKIN', 1)).rejects.toThrow();
      expect(calculation.calculateAndValidateFormula).not.toHaveBeenCalled();
      expect(versionRepository.createVersionSnapshot).not.toHaveBeenCalled();
    });

    it('승인된 판이 있으면 계산 결과로 resultRatio/cellCount/totalCost를 채워 스냅샷을 만든다', async () => {
      versionRepository.findApprovedCellRule.mockResolvedValueOnce({
        ruleVersion: 'SKIN-v1',
        mapping: [
          { ratioFrom: 0, ratioTo: 50, cellCount: 2 },
          { ratioFrom: 50, ratioTo: 100, cellCount: 4 },
        ],
      });
      calculation.calculateAndValidateFormula.mockResolvedValueOnce({
        directResults: [],
        ratios: [
          { domainCode: 'MOISTURE', efficacy: 10, ratioPercent: 60 },
          { domainCode: 'SOOTHING', efficacy: 10, ratioPercent: 40 },
        ],
        validation: { issues: [], canConfirm: true, hlb: { status: 'ok', message: '' }, cost: 1234 },
      });
      versionRepository.findFormulaIngredientLines.mockResolvedValueOnce([
        { ingredientId: 1, inciName: 'Water', pct: 50 },
      ]);
      versionRepository.findFormulaTargetRatios.mockResolvedValueOnce([
        { domainCode: 'MOISTURE', targetRatio: 60, isMain: true },
        { domainCode: 'SOOTHING', targetRatio: 40, isMain: false },
      ]);
      versionRepository.findBatchSize.mockResolvedValueOnce(200);
      versionRepository.nextVersionNo.mockResolvedValueOnce(1);
      versionRepository.createVersionSnapshot.mockResolvedValueOnce({
        id: 1,
        formulaId: 10,
        versionNo: 1,
        fixedAt: '2026-09-06T00:00:00.000Z',
        fixedBy: 1,
        appVersion: '0.1.0-draft',
        ruleVersion: 'SKIN-v1',
        batchSize: 200,
        totalCells: 6,
        totalCost: 1234,
      } as FormulaVersionSummary);

      await service.confirmFormula(10, 'SKIN', 1);

      expect(versionRepository.createVersionSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          formulaId: 10,
          versionNo: 1,
          fixedBy: 1,
          ruleVersion: 'SKIN-v1',
          batchSize: 200,
          totalCells: 6, // MOISTURE(60%→4) + SOOTHING(40%→2)
          totalCost: 1234,
          recipeLines: [expect.objectContaining({ ingredientId: 1, pct: 50, grams: 100 })],
          ratioLines: [
            expect.objectContaining({ domainCode: 'MOISTURE', targetRatio: 60, resultRatio: 60, cellCount: 4 }),
            expect.objectContaining({ domainCode: 'SOOTHING', targetRatio: 40, resultRatio: 40, cellCount: 2 }),
          ],
        }),
      );
    });
  });

  describe('listVersions', () => {
    it('repository의 listVersions를 그대로 위임한다', async () => {
      versionRepository.listVersions.mockResolvedValueOnce([]);
      const result = await service.listVersions(10);
      expect(result).toEqual([]);
      expect(versionRepository.listVersions).toHaveBeenCalledWith(10);
    });
  });
});
