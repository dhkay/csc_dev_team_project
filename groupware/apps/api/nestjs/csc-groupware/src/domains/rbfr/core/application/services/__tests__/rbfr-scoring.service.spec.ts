import {
  calculateAllDirectRoleEfficacies,
  calculateBaseEfficacy,
  calculateCombinationCoefficient,
  calculateConcentrationFactor,
  calculateDirectRoleEfficacy,
  calculateRatioValues,
  RbfrScoringService,
} from '../rbfr-scoring.service';
import type {
  FormulaIngredientInput,
  IngredientRoleContribution,
  InteractionCoefficient,
  ConcentrationLimit,
} from '../../../domain/types';

const DOMAIN_SOOTHING = 'SOOTHING'; // 진정(잠정 코드, 05번 문서 참고)
const DOMAIN_MOISTURE = 'MOISTURE'; // 보습(잠정 코드)

describe('calculateBaseEfficacy', () => {
  it('가산 방식: 원료를 추가해도 기존 원료의 기여분은 줄지 않는다(희석 버그 회귀 방지)', () => {
    const contributions: IngredientRoleContribution[] = [
      { ingredientId: 'green-tea-water', domainCode: DOMAIN_SOOTHING, contribution: 90 },
      { ingredientId: 'soapnut-extract', domainCode: DOMAIN_SOOTHING, contribution: 50 },
    ];

    const before: FormulaIngredientInput[] = [{ ingredientId: 'green-tea-water', percent: 40 }];
    const beforeValue = calculateBaseEfficacy(DOMAIN_SOOTHING, before, contributions);

    const after: FormulaIngredientInput[] = [
      { ingredientId: 'green-tea-water', percent: 40 },
      { ingredientId: 'soapnut-extract', percent: 26 },
    ];
    const afterValue = calculateBaseEfficacy(DOMAIN_SOOTHING, after, contributions);

    expect(afterValue).toBeGreaterThanOrEqual(beforeValue);
    expect(beforeValue).toBe((40 / 100) * 90);
    expect(afterValue).toBe((40 / 100) * 90 + (26 / 100) * 50);
  });

  it('확정 데이터 없는 원료는 그 역할 계산에서 조용히 제외된다', () => {
    const contributions: IngredientRoleContribution[] = [
      { ingredientId: 'a', domainCode: DOMAIN_SOOTHING, contribution: 80 },
    ];
    const formula: FormulaIngredientInput[] = [
      { ingredientId: 'a', percent: 50 },
      { ingredientId: 'ceramide3-nodata', percent: 10 },
    ];
    expect(calculateBaseEfficacy(DOMAIN_SOOTHING, formula, contributions)).toBe((50 / 100) * 80);
  });
});

describe('calculateCombinationCoefficient', () => {
  it('처방에 같이 들어간 원료쌍의 계수를 곱한다', () => {
    const formula: FormulaIngredientInput[] = [
      { ingredientId: 'green-tea-water', percent: 40 },
      { ingredientId: 'centella-exosome', percent: 12 },
    ];
    const interactions: InteractionCoefficient[] = [
      { ingredientAId: 'green-tea-water', ingredientBId: 'centella-exosome', domainCode: DOMAIN_SOOTHING, coefficient: 1.1 },
      { ingredientAId: 'jojoba-oil', ingredientBId: 'centella-exosome', domainCode: DOMAIN_SOOTHING, coefficient: 0.8 },
    ];
    expect(calculateCombinationCoefficient(DOMAIN_SOOTHING, formula, interactions)).toBe(1.1);
  });

  it('데이터가 없으면 1.0(변화 없음)', () => {
    const formula: FormulaIngredientInput[] = [{ ingredientId: 'a', percent: 10 }];
    expect(calculateCombinationCoefficient(DOMAIN_SOOTHING, formula, [])).toBe(1);
  });
});

describe('calculateConcentrationFactor', () => {
  it('권장 최소치 미만으로 배합하면 1.0 미만으로 감쇠한다', () => {
    const contributions: IngredientRoleContribution[] = [
      { ingredientId: 'centella-exosome', domainCode: DOMAIN_SOOTHING, contribution: 70 },
    ];
    const formula: FormulaIngredientInput[] = [{ ingredientId: 'centella-exosome', percent: 1 }];
    const limits: ConcentrationLimit[] = [{ ingredientId: 'centella-exosome', recommendedMinPercent: 2 }];
    expect(calculateConcentrationFactor(DOMAIN_SOOTHING, formula, contributions, limits)).toBe(0.5);
  });

  it('권장 최소치 정보가 없으면 1.0(감쇠 없음)', () => {
    const contributions: IngredientRoleContribution[] = [
      { ingredientId: 'a', domainCode: DOMAIN_SOOTHING, contribution: 70 },
    ];
    const formula: FormulaIngredientInput[] = [{ ingredientId: 'a', percent: 1 }];
    expect(calculateConcentrationFactor(DOMAIN_SOOTHING, formula, contributions, [])).toBe(1);
  });
});

describe('calculateDirectRoleEfficacy', () => {
  it('4단계를 순서대로 곱하고 0~100으로 clamp한다', () => {
    const contributions: IngredientRoleContribution[] = [
      { ingredientId: 'a', domainCode: DOMAIN_SOOTHING, contribution: 100 },
    ];
    const formula: FormulaIngredientInput[] = [{ ingredientId: 'a', percent: 100 }];
    const result = calculateDirectRoleEfficacy(
      DOMAIN_SOOTHING,
      formula,
      contributions,
      [{ ingredientAId: 'a', ingredientBId: 'b', domainCode: DOMAIN_SOOTHING, coefficient: 1.2 }],
      [],
      1,
    );
    expect(result.baseValue).toBe(100);
    expect(result.finalValue).toBe(100);
  });

  it('재현성: 같은 입력이면 항상 같은 결과(05번 절대 원칙6, 무작위 없음)', () => {
    const contributions: IngredientRoleContribution[] = [
      { ingredientId: 'a', domainCode: DOMAIN_SOOTHING, contribution: 55 },
    ];
    const formula: FormulaIngredientInput[] = [{ ingredientId: 'a', percent: 33 }];
    const r1 = calculateDirectRoleEfficacy(DOMAIN_SOOTHING, formula, contributions, [], []);
    const r2 = calculateDirectRoleEfficacy(DOMAIN_SOOTHING, formula, contributions, [], []);
    expect(r1).toEqual(r2);
  });
});

describe('calculateRatioValues', () => {
  it('통합역할(균형)에 근거가 없으면 분모·결과 어디에도 포함되지 않는다', () => {
    const directResults = calculateAllDirectRoleEfficacies(
      [DOMAIN_MOISTURE, DOMAIN_SOOTHING],
      [
        { ingredientId: 'a', percent: 50 },
        { ingredientId: 'b', percent: 50 },
      ],
      [
        { ingredientId: 'a', domainCode: DOMAIN_MOISTURE, contribution: 80 },
        { ingredientId: 'b', domainCode: DOMAIN_SOOTHING, contribution: 60 },
      ],
      [],
      [],
    );

    const ratios = calculateRatioValues(directResults, {
      domainCode: 'BALANCE',
      hasEvidence: false,
      value: 999,
    });

    expect(ratios).toHaveLength(2);
    expect(ratios.some((r) => r.domainCode === 'BALANCE')).toBe(false);
    const total = ratios.reduce((s, r) => s + r.ratioPercent, 0);
    expect(Math.abs(total - 100)).toBeLessThan(1e-9);
  });

  it('통합역할(균형)에 근거가 있으면 다른 직접역할과 동일하게 분모에 포함된다', () => {
    const directResults = calculateAllDirectRoleEfficacies(
      [DOMAIN_MOISTURE, DOMAIN_SOOTHING],
      [
        { ingredientId: 'a', percent: 50 },
        { ingredientId: 'b', percent: 50 },
      ],
      [
        { ingredientId: 'a', domainCode: DOMAIN_MOISTURE, contribution: 80 },
        { ingredientId: 'b', domainCode: DOMAIN_SOOTHING, contribution: 60 },
      ],
      [],
      [],
    );

    const ratios = calculateRatioValues(directResults, {
      domainCode: 'BALANCE',
      hasEvidence: true,
      value: 65,
    });

    expect(ratios).toHaveLength(3);
    const balance = ratios.find((r) => r.domainCode === 'BALANCE');
    expect(balance?.efficacy).toBe(65);
    const total = ratios.reduce((s, r) => s + r.ratioPercent, 0);
    expect(Math.abs(total - 100)).toBeLessThan(1e-9);
  });
});

describe('RbfrScoringService', () => {
  it('Port 메서드가 동일한 순수 함수로 동작한다', () => {
    const service = new RbfrScoringService();
    const result = service.calculateDirectRoleEfficacy(
      DOMAIN_SOOTHING,
      [{ ingredientId: 'a', percent: 50 }],
      [{ ingredientId: 'a', domainCode: DOMAIN_SOOTHING, contribution: 80 }],
      [],
      [],
    );
    expect(result.finalValue).toBe(40);
  });
});
