/**
 * RBFR 계산 엔진 — 05_스코어링엔진.md의 직접역할 효능값/비중값 계산식을 순수 함수로 옮긴 것.
 *
 * 이 파일은 core/application/services로 옮길 예정이라 프레임워크/ORM/DB를 import하지 않는다.
 * 원료·처방 데이터는 전부 인자로 받고, 저장소 접근은 이 파일 밖(향후 Outbound Port)이 담당한다.
 *
 * 3단계(계산 엔진 구현) 범위: 직접역할 4개의 가산 계산식 + 2~4단계 보정계수 + 비중값 계산만.
 * 처방 검증(배합비 합계, 규제, 병용금기, HLB 등)은 4단계에서 별도로 다룬다.
 */

import type {
  ConcentrationLimit,
  DirectRoleEfficacyResult,
  FormulaIngredientInput,
  IngredientRoleContribution,
  IntegratedRoleInput,
  InteractionCoefficient,
  RatioResult,
} from './types.ts';

/** 0~100으로 clamp. 05번 "각 역할 값은 0~100으로 clamp"의 방어적 안전장치. */
function clamp0to100(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * 1단계(기본 효능값): Σ(원료별 기여도 × 배합비/100).
 *
 * 가산 방식이다. 원료를 추가해도 기존 원료의 기여분은 줄지 않고 새 원료의 기여분이 더해질
 * 뿐이다(비율로 나눠 평균내지 않는다 — 이전에 발견돼 수정된 "가중평균 희석" 버그와 정확히
 * 반대되는 지점이라 이 계산 방식 자체가 회귀 대상이다).
 */
export function calculateBaseEfficacy(
  domainCode: string,
  formulaIngredients: FormulaIngredientInput[],
  contributions: IngredientRoleContribution[],
): number {
  const contributionMap = new Map<string, number>();
  for (const c of contributions) {
    if (c.domainCode === domainCode) contributionMap.set(c.ingredientId, c.contribution);
  }

  let total = 0;
  for (const fi of formulaIngredients) {
    const contribution = contributionMap.get(fi.ingredientId);
    if (contribution === undefined) continue; // 확정 데이터 없음 — 이 역할 계산에서 제외
    total += (fi.percent / 100) * contribution;
  }
  return total;
}

/**
 * 2단계(조합계수): 이 처방에 실제로 같이 들어간 원료 쌍 중 이 역할에 해당하는 계수를 전부
 * 곱한다. 데이터 없으면 1.0. 원료 3개 이상일 때 여러 쌍을 전부 곱할지는 05번 문서에서도
 * "확인 필요"로 남아 있다 — 지금은 그 잠정 규칙(전부 곱하기)을 그대로 구현한다.
 */
export function calculateCombinationCoefficient(
  domainCode: string,
  formulaIngredients: FormulaIngredientInput[],
  interactions: InteractionCoefficient[],
): number {
  const presentIds = new Set(formulaIngredients.map((fi) => fi.ingredientId));
  let coefficient = 1;
  for (const it of interactions) {
    if (it.domainCode !== domainCode) continue;
    if (!presentIds.has(it.ingredientAId) || !presentIds.has(it.ingredientBId)) continue;
    coefficient *= it.coefficient;
  }
  return coefficient;
}

/**
 * 3단계(유효농도계수): 배합비가 원료의 권장 최소치보다 낮으면 그 원료의 기여분을 선형으로
 * 감쇠시킨 뒤, 감쇠된 기여분 비중으로 가중평균한 전체 계수를 돌려준다(구체 감쇠 곡선은 05번
 * 문서에서도 "확인 필요"로 남아 있다 — 지금은 선형 감쇠 + 기여도 가중평균을 잠정 구현한다).
 * 권장 최소치 정보가 없거나 배합비가 그 이상이면 그 원료의 계수는 1.0으로 취급한다.
 */
export function calculateConcentrationFactor(
  domainCode: string,
  formulaIngredients: FormulaIngredientInput[],
  contributions: IngredientRoleContribution[],
  concentrationLimits: ConcentrationLimit[],
): number {
  const contributionMap = new Map<string, number>();
  for (const c of contributions) {
    if (c.domainCode === domainCode) contributionMap.set(c.ingredientId, c.contribution);
  }
  const limitMap = new Map<string, number>();
  for (const cl of concentrationLimits) {
    if (cl.recommendedMinPercent !== undefined) limitMap.set(cl.ingredientId, cl.recommendedMinPercent);
  }

  let weightedFactorSum = 0;
  let weightSum = 0;
  for (const fi of formulaIngredients) {
    const contribution = contributionMap.get(fi.ingredientId);
    if (contribution === undefined) continue;
    const weight = (fi.percent / 100) * contribution; // 이 원료가 1단계 합계에 기여한 크기
    if (weight <= 0) continue;

    const min = limitMap.get(fi.ingredientId);
    const factor = min !== undefined && min > 0 && fi.percent < min ? clamp0to100((fi.percent / min) * 100) / 100 : 1;

    weightedFactorSum += weight * factor;
    weightSum += weight;
  }
  return weightSum > 0 ? weightedFactorSum / weightSum : 1;
}

/**
 * 직접역할 하나의 최종 효능값. 1~4단계를 순서대로 적용하고 0~100으로 clamp한다.
 * `stabilityFactor`는 처방 단위 실측 안정성 기록에서 오는 값이라 이 함수 밖에서 결정해 넘긴다
 * (기본 1.0 = 미측정).
 */
export function calculateDirectRoleEfficacy(
  domainCode: string,
  formulaIngredients: FormulaIngredientInput[],
  contributions: IngredientRoleContribution[],
  interactions: InteractionCoefficient[],
  concentrationLimits: ConcentrationLimit[],
  stabilityFactor = 1,
): DirectRoleEfficacyResult {
  const baseValue = calculateBaseEfficacy(domainCode, formulaIngredients, contributions);
  const combinationCoefficient = calculateCombinationCoefficient(domainCode, formulaIngredients, interactions);
  const concentrationFactor = calculateConcentrationFactor(
    domainCode,
    formulaIngredients,
    contributions,
    concentrationLimits,
  );
  const finalValue = clamp0to100(baseValue * combinationCoefficient * concentrationFactor * stabilityFactor);

  return { domainCode, baseValue, combinationCoefficient, concentrationFactor, stabilityFactor, finalValue };
}

/**
 * 여러 직접역할을 한 번에 계산한다. `stabilityFactorByDomain`을 안 주면 전부 1.0(미측정)으로
 * 취급한다.
 */
export function calculateAllDirectRoleEfficacies(
  directDomainCodes: string[],
  formulaIngredients: FormulaIngredientInput[],
  contributions: IngredientRoleContribution[],
  interactions: InteractionCoefficient[],
  concentrationLimits: ConcentrationLimit[],
  stabilityFactorByDomain: Record<string, number> = {},
): DirectRoleEfficacyResult[] {
  return directDomainCodes.map((domainCode) =>
    calculateDirectRoleEfficacy(
      domainCode,
      formulaIngredients,
      contributions,
      interactions,
      concentrationLimits,
      stabilityFactorByDomain[domainCode] ?? 1,
    ),
  );
}

/**
 * 비중값 계산: 역할별 효능값 ÷ 전체 효능값 합.
 *
 * 통합역할(균형)에 독립 근거가 없으면(hasEvidence=false) 분모·분자 어디에도 포함하지 않는다.
 * 근거 없는 균형을 0으로 넣어 나머지 역할의 비중을 부풀리는 것도, 남는 비중으로 채우는 것과
 * 실질적으로 같아 05번 원칙5를 어기게 되기 때문이다. 근거가 생기면(hasEvidence=true) 그 순간
 * 부터 다른 직접역할과 동일하게 분모에 포함된다.
 */
export function calculateRatioValues(
  directResults: DirectRoleEfficacyResult[],
  integratedRole?: IntegratedRoleInput,
): RatioResult[] {
  const entries = directResults.map((r) => ({ domainCode: r.domainCode, efficacy: r.finalValue }));
  if (integratedRole?.hasEvidence) {
    entries.push({ domainCode: integratedRole.domainCode, efficacy: clamp0to100(integratedRole.value) });
  }

  const total = entries.reduce((sum, e) => sum + e.efficacy, 0);
  const results: RatioResult[] = entries.map((e) => ({
    domainCode: e.domainCode,
    efficacy: e.efficacy,
    ratioPercent: total > 0 ? (e.efficacy / total) * 100 : 0,
  }));

  if (integratedRole && !integratedRole.hasEvidence) {
    // 미입력 상태를 화면에서 구분 표시할 수 있도록, 효능값 0/비중값 0이 아니라 결과 자체를
    // 만들지 않는다. 호출부가 "이 domainCode는 결과 배열에 없다 = 미입력"으로 판단한다.
  }

  return results;
}
