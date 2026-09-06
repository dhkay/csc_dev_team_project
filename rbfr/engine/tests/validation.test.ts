/**
 * validation.ts 단위 테스트. 실행: node --test rbfr/engine/tests/validation.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

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
} from '../src/validation.ts';
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
} from '../src/validationTypes.ts';

const NO_CONDITIONS: FormulaConditions = { excludedNoaddCodes: [], requiredCertCodes: [] };

test('배합비 합계: 100% 초과는 block', () => {
  const result = validateBatchTotal([
    { ingredientId: 'a', percent: 60 },
    { ingredientId: 'b', percent: 50 },
  ]);
  assert.equal(result.severity, 'block');
});

test('배합비 합계: 100% 미만은 warn(잔여 배합비 안내)', () => {
  const result = validateBatchTotal([{ ingredientId: 'a', percent: 96 }]);
  assert.equal(result.severity, 'warn');
  assert.match(result.message, /4\.00%/);
});

test('배합비 합계: 정확히 100%는 ok', () => {
  const result = validateBatchTotal([
    { ingredientId: 'a', percent: 60 },
    { ingredientId: 'b', percent: 40 },
  ]);
  assert.equal(result.severity, 'ok');
});

test('규제: BAN(확정)은 block', () => {
  const regulations: IngredientRegulationEntry[] = [
    { ingredientId: 'a', countryCode: 'KR', regType: 'BAN', status: 'CONFIRMED' },
  ];
  const issues = validateRegulations([{ ingredientId: 'a', percent: 10 }], regulations, ['KR']);
  assert.ok(issues.some((i) => i.code === 'REG_BAN' && i.severity === 'block'));
});

test('규제: PROPOSED(AI 제안)만 있으면 확정 데이터 없음(NODATA)으로 취급 — 산출·검증에 안 쓴다', () => {
  const regulations: IngredientRegulationEntry[] = [
    { ingredientId: 'a', countryCode: 'KR', regType: 'BAN', status: 'PROPOSED' },
  ];
  const issues = validateRegulations([{ ingredientId: 'a', percent: 10 }], regulations, ['KR']);
  // BAN이 아니라 NODATA 경고여야 한다 — PROPOSED를 판정에 쓰면 05번 원칙 위반
  assert.ok(issues.some((i) => i.code === 'REG_NODATA'));
  assert.ok(!issues.some((i) => i.code === 'REG_BAN'));
});

test('규제: LIMIT 한도 초과는 block, 한도 이내는 이슈 없음', () => {
  const regulations: IngredientRegulationEntry[] = [
    { ingredientId: 'a', countryCode: 'KR', regType: 'LIMIT', limitPercent: 0.5, status: 'CONFIRMED' },
  ];
  const over = validateRegulations([{ ingredientId: 'a', percent: 1 }], regulations, ['KR']);
  assert.ok(over.some((i) => i.code === 'REG_LIMIT_EXCEEDED' && i.severity === 'block'));

  const within = validateRegulations([{ ingredientId: 'a', percent: 0.3 }], regulations, ['KR']);
  assert.equal(within.length, 0);
});

test('무첨가: 처방이 배제한 분류를 가진 원료가 있으면 block', () => {
  const flags: IngredientNoaddFlag[] = [{ ingredientId: 'a', noaddCode: 'PARABEN' }];
  const conditions: FormulaConditions = { excludedNoaddCodes: ['PARABEN'], requiredCertCodes: [] };
  const issues = validateNoaddConditions([{ ingredientId: 'a', percent: 1 }], flags, conditions);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'block');
});

test('인증: 요구 인증을 못 채우는 원료가 있으면 block', () => {
  const certs: IngredientCertEligibility[] = [{ ingredientId: 'a', certCode: 'VEGAN', isEligible: false }];
  const conditions: FormulaConditions = { excludedNoaddCodes: [], requiredCertCodes: ['VEGAN'] };
  const issues = validateCertConditions([{ ingredientId: 'a', percent: 1 }], certs, conditions);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'block');
});

test('고정값: 고정 배합량과 실제 값이 다르면 block', () => {
  const pinned: PinnedIngredient[] = [{ ingredientId: 'a', isPinned: true, pinnedPercent: 5 }];
  const issues = validatePinnedValues([{ ingredientId: 'a', percent: 6 }], pinned);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'block');
});

test('고정값: 일치하면 이슈 없음', () => {
  const pinned: PinnedIngredient[] = [{ ingredientId: 'a', isPinned: true, pinnedPercent: 5 }];
  const issues = validatePinnedValues([{ ingredientId: 'a', percent: 5 }], pinned);
  assert.equal(issues.length, 0);
});

test('pH: 목표 pH가 원료 안정 범위를 벗어나면 warn(block 아님)', () => {
  const phRanges: IngredientPhRange[] = [{ ingredientId: 'a', phMin: 4, phMax: 5 }];
  const conditions: FormulaConditions = { targetPhMin: 6, targetPhMax: 6.5, excludedNoaddCodes: [], requiredCertCodes: [] };
  const issues = validatePhCompatibility([{ ingredientId: 'a', percent: 1 }], phRanges, conditions);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'warn');
});

test('pH: 목표 pH 범위가 원료 범위와 겹치면 이슈 없음', () => {
  const phRanges: IngredientPhRange[] = [{ ingredientId: 'a', phMin: 4, phMax: 6 }];
  const conditions: FormulaConditions = { targetPhMin: 5, targetPhMax: 5.5, excludedNoaddCodes: [], requiredCertCodes: [] };
  const issues = validatePhCompatibility([{ ingredientId: 'a', percent: 1 }], phRanges, conditions);
  assert.equal(issues.length, 0);
});

test('병용 금기: BLOCK은 block, WARN은 warn, 양방향 중복은 한 번만 보고', () => {
  const incompat: IngredientIncompatEntry[] = [
    { ingredientAId: 'a', ingredientBId: 'b', severity: 'BLOCK' },
    { ingredientBId: 'a', ingredientAId: 'b', severity: 'BLOCK' }, // 같은 쌍의 반대 방향 저장
    { ingredientAId: 'c', ingredientBId: 'd', severity: 'WARN' },
  ];
  const formula = [
    { ingredientId: 'a', percent: 1 },
    { ingredientId: 'b', percent: 1 },
    { ingredientId: 'c', percent: 1 },
    { ingredientId: 'd', percent: 1 },
  ];
  const issues = validateIncompatibilities(formula, incompat);
  assert.equal(issues.filter((i) => i.severity === 'block').length, 1); // 중복 제거 확인
  assert.equal(issues.filter((i) => i.severity === 'warn').length, 1);
});

test('HLB: 유상부/HLB 데이터가 없으면 unknown(경고를 막지 않는다)', () => {
  const result = calculateHlbJudgement([{ ingredientId: 'a', percent: 10 }], []);
  assert.equal(result.status, 'unknown');
});

test('HLB: Required와 혼합 HLB가 허용치 이내면 ok', () => {
  const formula = [
    { ingredientId: 'oil-a', percent: 10 },
    { ingredientId: 'emul-a', percent: 5 },
  ];
  const profiles: IngredientHlbProfile[] = [
    { ingredientId: 'oil-a', phaseType: 'oil', hlb: 8 },
    { ingredientId: 'emul-a', phaseType: 'other', hlb: 8, emulsionRole: 'emulsifier' },
  ];
  const result = calculateHlbJudgement(formula, profiles, 1);
  assert.equal(result.status, 'ok');
});

test('HLB: 차이가 허용치를 넘으면 unstable', () => {
  const formula = [
    { ingredientId: 'oil-a', percent: 10 },
    { ingredientId: 'emul-a', percent: 5 },
  ];
  const profiles: IngredientHlbProfile[] = [
    { ingredientId: 'oil-a', phaseType: 'oil', hlb: 12 },
    { ingredientId: 'emul-a', phaseType: 'other', hlb: 4, emulsionRole: 'emulsifier' },
  ];
  const result = calculateHlbJudgement(formula, profiles, 1);
  assert.equal(result.status, 'unstable');
});

test('원가: 배합비 × 단가 합산, 단가 없는 원료는 제외', () => {
  const unitPrices: IngredientUnitPrice[] = [{ ingredientId: 'a', pricePerGram: 100 }];
  const cost = calculateFormulaCost(
    [
      { ingredientId: 'a', percent: 50 },
      { ingredientId: 'b', percent: 50 }, // 단가 없음
    ],
    unitPrices,
  );
  assert.equal(cost, 50);
});

test('validateFormula: block 이슈가 하나라도 있으면 canConfirm=false', () => {
  const result = validateFormula({
    formulaIngredients: [{ ingredientId: 'a', percent: 60 }, { ingredientId: 'b', percent: 60 }], // 합계 초과
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
  assert.equal(result.canConfirm, false);
});

test('validateFormula: block 이슈가 없으면 canConfirm=true(경고는 있어도 됨)', () => {
  const result = validateFormula({
    formulaIngredients: [{ ingredientId: 'a', percent: 100 }],
    regulations: [], // NODATA warn만 발생
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
  assert.equal(result.canConfirm, true);
  assert.ok(result.issues.some((i) => i.code === 'REG_NODATA'));
});
