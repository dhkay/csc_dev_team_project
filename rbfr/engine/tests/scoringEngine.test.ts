/**
 * scoringEngine.ts 단위 테스트. `node --test`로 실행한다(의존성 없이 Node 내장 테스트러너 사용).
 * 실행: node --test rbfr/engine/tests/scoringEngine.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateBaseEfficacy,
  calculateCombinationCoefficient,
  calculateConcentrationFactor,
  calculateDirectRoleEfficacy,
  calculateAllDirectRoleEfficacies,
  calculateRatioValues,
} from '../src/scoringEngine.ts';
import type {
  FormulaIngredientInput,
  IngredientRoleContribution,
  InteractionCoefficient,
  ConcentrationLimit,
} from '../src/types.ts';

const DOMAIN_SOOTHING = 'SOOTHING'; // 진정(잠정 코드, 05번 문서 참고)
const DOMAIN_MOISTURE = 'MOISTURE'; // 보습(잠정 코드)

test('가산 방식: 원료를 추가해도 기존 원료의 기여분은 줄지 않는다(희석 버그 회귀 방지)', () => {
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

  // 기존 가중평균 방식이었다면 after < before가 됐을 것(비율로 나눠 희석). 가산 방식에서는
  // 원료를 추가하면 값이 늘어나거나 최소한 줄지 않는다.
  assert.ok(afterValue >= beforeValue, `after(${afterValue})가 before(${beforeValue})보다 작아지면 안 된다`);
  assert.equal(beforeValue, (40 / 100) * 90);
  assert.equal(afterValue, (40 / 100) * 90 + (26 / 100) * 50);
});

test('확정 데이터 없는 원료는 그 역할 계산에서 조용히 제외된다', () => {
  const contributions: IngredientRoleContribution[] = [
    { ingredientId: 'a', domainCode: DOMAIN_SOOTHING, contribution: 80 },
  ];
  const formula: FormulaIngredientInput[] = [
    { ingredientId: 'a', percent: 50 },
    { ingredientId: 'ceramide3-nodata', percent: 10 }, // 이 역할에 대한 contribution 행이 없음
  ];
  const value = calculateBaseEfficacy(DOMAIN_SOOTHING, formula, contributions);
  assert.equal(value, (50 / 100) * 80);
});

test('조합계수: 처방에 같이 들어간 원료쌍의 계수를 곱한다', () => {
  const formula: FormulaIngredientInput[] = [
    { ingredientId: 'green-tea-water', percent: 40 },
    { ingredientId: 'centella-exosome', percent: 12 },
  ];
  const interactions: InteractionCoefficient[] = [
    { ingredientAId: 'green-tea-water', ingredientBId: 'centella-exosome', domainCode: DOMAIN_SOOTHING, coefficient: 1.1 },
    { ingredientAId: 'jojoba-oil', ingredientBId: 'centella-exosome', domainCode: DOMAIN_SOOTHING, coefficient: 0.8 }, // 처방에 jojoba-oil 없음 → 미적용
  ];
  const coefficient = calculateCombinationCoefficient(DOMAIN_SOOTHING, formula, interactions);
  assert.equal(coefficient, 1.1);
});

test('조합계수: 데이터가 없으면 1.0(변화 없음)', () => {
  const formula: FormulaIngredientInput[] = [{ ingredientId: 'a', percent: 10 }];
  const coefficient = calculateCombinationCoefficient(DOMAIN_SOOTHING, formula, []);
  assert.equal(coefficient, 1);
});

test('유효농도계수: 권장 최소치 미만으로 배합하면 1.0 미만으로 감쇠한다', () => {
  const contributions: IngredientRoleContribution[] = [
    { ingredientId: 'centella-exosome', domainCode: DOMAIN_SOOTHING, contribution: 70 },
  ];
  const formula: FormulaIngredientInput[] = [{ ingredientId: 'centella-exosome', percent: 1 }];
  const limits: ConcentrationLimit[] = [{ ingredientId: 'centella-exosome', recommendedMinPercent: 2 }];

  const factor = calculateConcentrationFactor(DOMAIN_SOOTHING, formula, contributions, limits);
  assert.equal(factor, 0.5); // 1% / 2% = 0.5
});

test('유효농도계수: 권장 최소치 정보가 없으면 1.0(감쇠 없음)', () => {
  const contributions: IngredientRoleContribution[] = [
    { ingredientId: 'a', domainCode: DOMAIN_SOOTHING, contribution: 70 },
  ];
  const formula: FormulaIngredientInput[] = [{ ingredientId: 'a', percent: 1 }];
  const factor = calculateConcentrationFactor(DOMAIN_SOOTHING, formula, contributions, []);
  assert.equal(factor, 1);
});

test('직접역할 최종값: 4단계를 순서대로 곱하고 0~100으로 clamp한다', () => {
  const contributions: IngredientRoleContribution[] = [
    { ingredientId: 'a', domainCode: DOMAIN_SOOTHING, contribution: 100 },
  ];
  const formula: FormulaIngredientInput[] = [{ ingredientId: 'a', percent: 100 }];
  // baseValue = 100, combinationCoefficient = 1.2, concentrationFactor = 1, stabilityFactor = 1
  // → 100 * 1.2 = 120 → clamp 100
  const result = calculateDirectRoleEfficacy(
    DOMAIN_SOOTHING,
    formula,
    contributions,
    [{ ingredientAId: 'a', ingredientBId: 'b', domainCode: DOMAIN_SOOTHING, coefficient: 1.2 }],
    [],
    1,
  );
  assert.equal(result.baseValue, 100);
  assert.equal(result.finalValue, 100); // clamp 확인
});

test('재현성: 같은 입력이면 항상 같은 결과(05번 절대 원칙 6, 무작위 없음)', () => {
  const contributions: IngredientRoleContribution[] = [
    { ingredientId: 'a', domainCode: DOMAIN_SOOTHING, contribution: 55 },
  ];
  const formula: FormulaIngredientInput[] = [{ ingredientId: 'a', percent: 33 }];
  const r1 = calculateDirectRoleEfficacy(DOMAIN_SOOTHING, formula, contributions, [], []);
  const r2 = calculateDirectRoleEfficacy(DOMAIN_SOOTHING, formula, contributions, [], []);
  assert.deepEqual(r1, r2);
});

test('비중값: 통합역할(균형)에 근거가 없으면 분모·결과 어디에도 포함되지 않는다', () => {
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
    value: 999, // 근거 없으니 이 값은 완전히 무시돼야 한다
  });

  assert.equal(ratios.length, 2); // BALANCE가 결과에 아예 없어야 한다(미입력)
  assert.ok(!ratios.some((r) => r.domainCode === 'BALANCE'));
  const total = ratios.reduce((s, r) => s + r.ratioPercent, 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
});

test('비중값: 통합역할(균형)에 근거가 있으면 다른 직접역할과 동일하게 분모에 포함된다', () => {
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

  assert.equal(ratios.length, 3);
  const balance = ratios.find((r) => r.domainCode === 'BALANCE');
  assert.ok(balance);
  assert.equal(balance!.efficacy, 65);
  const total = ratios.reduce((s, r) => s + r.ratioPercent, 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
});
