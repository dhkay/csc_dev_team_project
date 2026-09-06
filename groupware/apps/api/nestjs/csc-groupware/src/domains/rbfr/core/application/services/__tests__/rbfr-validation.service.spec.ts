import {
  validateBatchTotal,
  validateRegulations,
  validateNoaddConditions,
  validateCertConditions,
  validatePinnedValues,
  validatePhCompatibility,
  validateIncompatibilities,
  calculateHlbJudgement,
  calculateFormulaCost,
  validateFormula,
} from '../rbfr-validation.service';
import type {
  FormulaConditions,
  IngredientCertEligibility,
  IngredientHlbProfile,
  IngredientIncompatEntry,
  IngredientNoaddFlag,
  IngredientPhRange,
  IngredientRegulationEntry,
  IngredientUnitPrice,
  PinnedIngredient,
} from '../../../domain/types';

const NO_CONDITIONS: FormulaConditions = { excludedNoaddCodes: [], requiredCertCodes: [] };

describe('validateBatchTotal', () => {
  it('100% 초과는 block', () => {
    const result = validateBatchTotal([
      { ingredientId: 'a', percent: 60 },
      { ingredientId: 'b', percent: 50 },
    ]);
    expect(result.severity).toBe('block');
  });

  it('100% 미만은 warn(잔여 배합비 안내)', () => {
    const result = validateBatchTotal([{ ingredientId: 'a', percent: 96 }]);
    expect(result.severity).toBe('warn');
    expect(result.message).toMatch(/4\.00%/);
  });

  it('정확히 100%는 ok', () => {
    const result = validateBatchTotal([
      { ingredientId: 'a', percent: 60 },
      { ingredientId: 'b', percent: 40 },
    ]);
    expect(result.severity).toBe('ok');
  });
});

describe('validateRegulations', () => {
  it('BAN(확정)은 block', () => {
    const regulations: IngredientRegulationEntry[] = [
      { ingredientId: 'a', countryCode: 'KR', regType: 'BAN', status: 'CONFIRMED' },
    ];
    const issues = validateRegulations([{ ingredientId: 'a', percent: 10 }], regulations, ['KR']);
    expect(issues.some((i) => i.code === 'REG_BAN' && i.severity === 'block')).toBe(true);
  });

  it('PROPOSED(AI 제안)만 있으면 확정 데이터 없음(NODATA)으로 취급한다', () => {
    const regulations: IngredientRegulationEntry[] = [
      { ingredientId: 'a', countryCode: 'KR', regType: 'BAN', status: 'PROPOSED' },
    ];
    const issues = validateRegulations([{ ingredientId: 'a', percent: 10 }], regulations, ['KR']);
    expect(issues.some((i) => i.code === 'REG_NODATA')).toBe(true);
    expect(issues.some((i) => i.code === 'REG_BAN')).toBe(false);
  });

  it('LIMIT 한도 초과는 block, 한도 이내는 이슈 없음', () => {
    const regulations: IngredientRegulationEntry[] = [
      { ingredientId: 'a', countryCode: 'KR', regType: 'LIMIT', limitPercent: 0.5, status: 'CONFIRMED' },
    ];
    const over = validateRegulations([{ ingredientId: 'a', percent: 1 }], regulations, ['KR']);
    expect(over.some((i) => i.code === 'REG_LIMIT_EXCEEDED' && i.severity === 'block')).toBe(true);

    const within = validateRegulations([{ ingredientId: 'a', percent: 0.3 }], regulations, ['KR']);
    expect(within).toHaveLength(0);
  });
});

describe('validateNoaddConditions', () => {
  it('처방이 배제한 분류를 가진 원료가 있으면 block', () => {
    const flags: IngredientNoaddFlag[] = [{ ingredientId: 'a', noaddCode: 'PARABEN' }];
    const conditions: FormulaConditions = { excludedNoaddCodes: ['PARABEN'], requiredCertCodes: [] };
    const issues = validateNoaddConditions([{ ingredientId: 'a', percent: 1 }], flags, conditions);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('block');
  });
});

describe('validateCertConditions', () => {
  it('요구 인증을 못 채우는 원료가 있으면 block', () => {
    const certs: IngredientCertEligibility[] = [{ ingredientId: 'a', certCode: 'VEGAN', isEligible: false }];
    const conditions: FormulaConditions = { excludedNoaddCodes: [], requiredCertCodes: ['VEGAN'] };
    const issues = validateCertConditions([{ ingredientId: 'a', percent: 1 }], certs, conditions);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('block');
  });
});

describe('validatePinnedValues', () => {
  it('고정 배합량과 실제 값이 다르면 block', () => {
    const pinned: PinnedIngredient[] = [{ ingredientId: 'a', isPinned: true, pinnedPercent: 5 }];
    const issues = validatePinnedValues([{ ingredientId: 'a', percent: 6 }], pinned);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('block');
  });

  it('일치하면 이슈 없음', () => {
    const pinned: PinnedIngredient[] = [{ ingredientId: 'a', isPinned: true, pinnedPercent: 5 }];
    const issues = validatePinnedValues([{ ingredientId: 'a', percent: 5 }], pinned);
    expect(issues).toHaveLength(0);
  });
});

describe('validatePhCompatibility', () => {
  it('목표 pH가 원료 안정 범위를 벗어나면 warn(block 아님)', () => {
    const phRanges: IngredientPhRange[] = [{ ingredientId: 'a', phMin: 4, phMax: 5 }];
    const conditions: FormulaConditions = { targetPhMin: 6, targetPhMax: 6.5, excludedNoaddCodes: [], requiredCertCodes: [] };
    const issues = validatePhCompatibility([{ ingredientId: 'a', percent: 1 }], phRanges, conditions);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warn');
  });

  it('목표 pH 범위가 원료 범위와 겹치면 이슈 없음', () => {
    const phRanges: IngredientPhRange[] = [{ ingredientId: 'a', phMin: 4, phMax: 6 }];
    const conditions: FormulaConditions = { targetPhMin: 5, targetPhMax: 5.5, excludedNoaddCodes: [], requiredCertCodes: [] };
    const issues = validatePhCompatibility([{ ingredientId: 'a', percent: 1 }], phRanges, conditions);
    expect(issues).toHaveLength(0);
  });
});

describe('validateIncompatibilities', () => {
  it('BLOCK은 block, WARN은 warn, 양방향 중복은 한 번만 보고한다', () => {
    const incompat: IngredientIncompatEntry[] = [
      { ingredientAId: 'a', ingredientBId: 'b', severity: 'BLOCK' },
      { ingredientBId: 'a', ingredientAId: 'b', severity: 'BLOCK' },
      { ingredientAId: 'c', ingredientBId: 'd', severity: 'WARN' },
    ];
    const formula = [
      { ingredientId: 'a', percent: 1 },
      { ingredientId: 'b', percent: 1 },
      { ingredientId: 'c', percent: 1 },
      { ingredientId: 'd', percent: 1 },
    ];
    const issues = validateIncompatibilities(formula, incompat);
    expect(issues.filter((i) => i.severity === 'block')).toHaveLength(1);
    expect(issues.filter((i) => i.severity === 'warn')).toHaveLength(1);
  });
});

describe('calculateHlbJudgement', () => {
  it('유상부/HLB 데이터가 없으면 unknown(경고를 막지 않는다)', () => {
    const result = calculateHlbJudgement([{ ingredientId: 'a', percent: 10 }], []);
    expect(result.status).toBe('unknown');
  });

  it('Required와 혼합 HLB가 허용치 이내면 ok', () => {
    const formula = [
      { ingredientId: 'oil-a', percent: 10 },
      { ingredientId: 'emul-a', percent: 5 },
    ];
    const profiles: IngredientHlbProfile[] = [
      { ingredientId: 'oil-a', phaseType: 'oil', hlb: 8 },
      { ingredientId: 'emul-a', phaseType: 'other', hlb: 8, emulsionRole: 'emulsifier' },
    ];
    expect(calculateHlbJudgement(formula, profiles, 1).status).toBe('ok');
  });

  it('차이가 허용치를 넘으면 unstable', () => {
    const formula = [
      { ingredientId: 'oil-a', percent: 10 },
      { ingredientId: 'emul-a', percent: 5 },
    ];
    const profiles: IngredientHlbProfile[] = [
      { ingredientId: 'oil-a', phaseType: 'oil', hlb: 12 },
      { ingredientId: 'emul-a', phaseType: 'other', hlb: 4, emulsionRole: 'emulsifier' },
    ];
    expect(calculateHlbJudgement(formula, profiles, 1).status).toBe('unstable');
  });
});

describe('calculateFormulaCost', () => {
  it('배합비 × 단가 합산, 단가 없는 원료는 제외', () => {
    const unitPrices: IngredientUnitPrice[] = [{ ingredientId: 'a', pricePerGram: 100 }];
    const cost = calculateFormulaCost(
      [
        { ingredientId: 'a', percent: 50 },
        { ingredientId: 'b', percent: 50 },
      ],
      unitPrices,
    );
    expect(cost).toBe(50);
  });
});

describe('validateFormula', () => {
  it('block 이슈가 하나라도 있으면 canConfirm=false', () => {
    const result = validateFormula({
      formulaIngredients: [
        { ingredientId: 'a', percent: 60 },
        { ingredientId: 'b', percent: 60 },
      ],
      regulations: [],
      targetCountryCodes: [],
      noaddFlags: [],
      certs: [],
      pinned: [],
      phRanges: [],
      incompat: [],
      hlbProfiles: [],
      unitPrices: [],
      conditions: NO_CONDITIONS,
    });
    expect(result.canConfirm).toBe(false);
  });

  it('block 이슈가 없으면 canConfirm=true(경고는 있어도 됨)', () => {
    const result = validateFormula({
      formulaIngredients: [{ ingredientId: 'a', percent: 100 }],
      regulations: [],
      targetCountryCodes: ['KR'],
      noaddFlags: [],
      certs: [],
      pinned: [],
      phRanges: [],
      incompat: [],
      hlbProfiles: [],
      unitPrices: [],
      conditions: NO_CONDITIONS,
    });
    expect(result.canConfirm).toBe(true);
    expect(result.issues.some((i) => i.code === 'REG_NODATA')).toBe(true);
  });
});
