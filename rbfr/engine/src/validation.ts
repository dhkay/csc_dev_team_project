/**
 * RBFR 처방 검증 로직 — 05_스코어링엔진.md "처방 검증 로직"(9단계)을 순수 함수로 구현.
 *
 * 3단계(scoringEngine.ts)의 산출물(효능값/비중값)을 그대로 입력받아 "검증만" 한다. 계산과
 * 검증을 같은 함수에 섞지 않는다(develop_status.md "다음 단계 영향" 참고). 이 파일도 core/
 * application/services로 옮길 예정이라 프레임워크/ORM을 import하지 않는다.
 *
 * 우선순위(05번 절대 원칙3, 절대 바꾸지 않음): 규제 > 무첨가 > 인증 > 고정값 > 역할적합도.
 * `validateFormula`는 이 순서대로 결과를 쌓는다.
 */

import type {
  FormulaConditions,
  FormulaIngredientInput,
  IngredientCertEligibility,
  IngredientHlbProfile,
  IngredientIncompatEntry,
  IngredientNoaddFlag,
  IngredientPhRange,
  IngredientRegulationEntry,
  IngredientUnitPrice,
  PinnedIngredient,
  ValidationIssue,
} from './validationTypes.ts';

const EPSILON = 1e-6;

/** 1단계: 배합비 합계 확인. 100% 초과는 block, 미만은 warn(잔여 배합비 안내), 100%는 ok. */
export function validateBatchTotal(formulaIngredients: FormulaIngredientInput[]): ValidationIssue {
  const total = formulaIngredients.reduce((sum, fi) => sum + fi.percent, 0);
  if (total > 100 + EPSILON) {
    return { code: 'BATCH_TOTAL_OVER', severity: 'block', message: `배합비 합계 ${total}%가 100%를 초과했습니다.` };
  }
  if (total < 100 - EPSILON) {
    return {
      code: 'BATCH_TOTAL_UNDER',
      severity: 'warn',
      message: `배합비 합계 ${total}%. 잔여 배합비 ${(100 - total).toFixed(2)}%가 비어있습니다.`,
    };
  }
  return { code: 'BATCH_TOTAL_OK', severity: 'ok', message: `배합비 합계 ${total}% (100%)` };
}

/**
 * 2단계 중 "규제": 국가별 규제. CONFIRMED 상태만 판정에 쓴다(원칙4/9번 문서 "PROPOSED는 표시만").
 * 확정된 규제 행이 아예 없으면 NODATA로 간주하고, 이를 "사용가능"과 절대 같은 심각도로 두지
 * 않는다(경고, block은 아님 — 미확인일 뿐 금지된 게 아니므로).
 */
export function validateRegulations(
  formulaIngredients: FormulaIngredientInput[],
  regulations: IngredientRegulationEntry[],
  targetCountryCodes: string[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const confirmed = regulations.filter((r) => r.status === 'CONFIRMED');

  for (const fi of formulaIngredients) {
    for (const countryCode of targetCountryCodes) {
      const entry = confirmed.find((r) => r.ingredientId === fi.ingredientId && r.countryCode === countryCode);

      if (!entry) {
        issues.push({
          code: 'REG_NODATA',
          severity: 'warn',
          message: `${fi.ingredientId}: ${countryCode} 규제 확정 데이터 없음(NODATA, 사용가능과 다름)`,
        });
        continue;
      }
      if (entry.regType === 'BAN') {
        issues.push({ code: 'REG_BAN', severity: 'block', message: `${fi.ingredientId}: ${countryCode} 규제상 사용 금지(BAN)` });
        continue;
      }
      if (entry.regType === 'LIMIT' && entry.limitPercent !== undefined && fi.percent > entry.limitPercent) {
        issues.push({
          code: 'REG_LIMIT_EXCEEDED',
          severity: 'block',
          message: `${fi.ingredientId}: ${countryCode} 배합한도 ${entry.limitPercent}% 초과(현재 ${fi.percent}%)`,
        });
      }
      // ALLOW, COND, 한도 이내 LIMIT은 이슈 없음(ok는 개별 항목으로 만들지 않는다 — 문제 없는 원료를
      // 전부 나열하면 신호가 흐려진다).
    }
  }
  return issues;
}

/** 2단계 중 "무첨가": 처방이 배제하기로 선택한 무첨가 분류를 가진 원료가 있으면 위반. */
export function validateNoaddConditions(
  formulaIngredients: FormulaIngredientInput[],
  flags: IngredientNoaddFlag[],
  conditions: FormulaConditions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const presentIds = new Set(formulaIngredients.map((fi) => fi.ingredientId));
  for (const flag of flags) {
    if (!presentIds.has(flag.ingredientId)) continue;
    if (conditions.excludedNoaddCodes.includes(flag.noaddCode)) {
      issues.push({
        code: 'NOADD_VIOLATION',
        severity: 'block',
        message: `${flag.ingredientId}: 처방이 배제하기로 한 무첨가 분류(${flag.noaddCode})에 해당`,
      });
    }
  }
  return issues;
}

/** 2단계 중 "인증": 처방이 요구하는 인증 코드를 모든 원료가 충족하지 못하면 위반. */
export function validateCertConditions(
  formulaIngredients: FormulaIngredientInput[],
  certs: IngredientCertEligibility[],
  conditions: FormulaConditions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const certCode of conditions.requiredCertCodes) {
    for (const fi of formulaIngredients) {
      const entry = certs.find((c) => c.ingredientId === fi.ingredientId && c.certCode === certCode);
      if (!entry || !entry.isEligible) {
        issues.push({
          code: 'CERT_NOT_ELIGIBLE',
          severity: 'block',
          message: `${fi.ingredientId}: 처방이 요구하는 인증(${certCode})을 충족하지 못함`,
        });
      }
    }
  }
  return issues;
}

/** 2단계 중 "고정값": 배합량이 고정된 원료의 실제 배합비가 고정값과 다르면 위반(원칙9). */
export function validatePinnedValues(
  formulaIngredients: FormulaIngredientInput[],
  pinned: PinnedIngredient[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const p of pinned) {
    if (!p.isPinned || p.pinnedPercent === undefined) continue;
    const fi = formulaIngredients.find((f) => f.ingredientId === p.ingredientId);
    if (!fi) continue;
    if (Math.abs(fi.percent - p.pinnedPercent) > EPSILON) {
      issues.push({
        code: 'PINNED_VALUE_CHANGED',
        severity: 'block',
        message: `${p.ingredientId}: 고정 배합량(${p.pinnedPercent}%)과 실제 값(${fi.percent}%)이 다릅니다.`,
      });
    }
  }
  return issues;
}

/** 3단계: pH 충돌. 처방 목표 pH가 원료의 안정 범위를 벗어나면 경고(안정성 리스크, block 아님). */
export function validatePhCompatibility(
  formulaIngredients: FormulaIngredientInput[],
  phRanges: IngredientPhRange[],
  conditions: FormulaConditions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (conditions.targetPhMin === undefined && conditions.targetPhMax === undefined) return issues;

  for (const fi of formulaIngredients) {
    const range = phRanges.find((r) => r.ingredientId === fi.ingredientId);
    if (!range || (range.phMin === undefined && range.phMax === undefined)) continue;

    const targetMin = conditions.targetPhMin ?? -Infinity;
    const targetMax = conditions.targetPhMax ?? Infinity;
    const rangeMin = range.phMin ?? -Infinity;
    const rangeMax = range.phMax ?? Infinity;

    const noOverlap = targetMax < rangeMin || targetMin > rangeMax;
    if (noOverlap) {
      issues.push({
        code: 'PH_CONFLICT',
        severity: 'warn',
        message: `${fi.ingredientId}: 안정 pH 범위(${range.phMin ?? '?'}~${range.phMax ?? '?'})가 목표 pH와 겹치지 않습니다.`,
      });
    }
  }
  return issues;
}

/** 4단계: 병용 금기. BLOCK은 확정을 막고, WARN은 경고만 한다(양방향 조회). */
export function validateIncompatibilities(
  formulaIngredients: FormulaIngredientInput[],
  incompat: IngredientIncompatEntry[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const presentIds = new Set(formulaIngredients.map((fi) => fi.ingredientId));
  const seen = new Set<string>();

  for (const entry of incompat) {
    if (!presentIds.has(entry.ingredientAId) || !presentIds.has(entry.ingredientBId)) continue;
    const key = [entry.ingredientAId, entry.ingredientBId].sort().join('::');
    if (seen.has(key)) continue; // 양방향 저장/조회로 같은 쌍이 두 번 걸려도 한 번만 보고
    seen.add(key);

    issues.push({
      code: entry.severity === 'BLOCK' ? 'INCOMPAT_BLOCK' : 'INCOMPAT_WARN',
      severity: entry.severity === 'BLOCK' ? 'block' : 'warn',
      message: `${entry.ingredientAId} × ${entry.ingredientBId}: 병용 금기(${entry.severity})${entry.reason ? ` - ${entry.reason}` : ''}`,
    });
  }
  return issues;
}

/**
 * 6단계: HLB 판정. Required HLB = Σ(HLBi×%i)/Σ(%i)(유상부 내 정규화), 혼합 HLB = 유화제들의
 * 가중평균. 유상부/HLB 데이터가 없으면 "미확인"으로 두고 경고를 막지 않는다(원칙4와 동일한
 * 종류의 원칙: 데이터 없음을 문제 없음으로 취급하지 않는다).
 */
export interface HlbResult {
  status: 'ok' | 'unstable' | 'unknown';
  requiredHlb?: number;
  mixedHlb?: number;
  message: string;
}

export function calculateHlbJudgement(
  formulaIngredients: FormulaIngredientInput[],
  hlbProfiles: IngredientHlbProfile[],
  tolerance = 1,
): HlbResult {
  const oilPhase = formulaIngredients
    .map((fi) => ({ fi, profile: hlbProfiles.find((h) => h.ingredientId === fi.ingredientId) }))
    .filter((x) => x.profile?.phaseType === 'oil');

  if (oilPhase.length === 0) {
    return { status: 'unknown', message: '유상부 원료가 없거나 물성 데이터가 없어 HLB 판정을 생략합니다.' };
  }
  if (oilPhase.some((x) => x.profile?.hlb === undefined)) {
    return { status: 'unknown', message: '일부 유상부 원료의 HLB 값이 없어 판정할 수 없습니다(미확인).' };
  }

  const oilPercentTotal = oilPhase.reduce((sum, x) => sum + x.fi.percent, 0);
  const requiredHlb =
    oilPercentTotal > 0
      ? oilPhase.reduce((sum, x) => sum + x.profile!.hlb! * x.fi.percent, 0) / oilPercentTotal
      : undefined;

  const emulsifiers = formulaIngredients
    .map((fi) => ({ fi, profile: hlbProfiles.find((h) => h.ingredientId === fi.ingredientId) }))
    .filter((x) => x.profile?.emulsionRole === 'emulsifier' && x.profile?.hlb !== undefined);

  if (emulsifiers.length === 0 || requiredHlb === undefined) {
    return { status: 'unknown', requiredHlb, message: '유화제 HLB 데이터가 없어 혼합 HLB를 계산할 수 없습니다(미확인).' };
  }

  const emulsifierPercentTotal = emulsifiers.reduce((sum, x) => sum + x.fi.percent, 0);
  const mixedHlb =
    emulsifierPercentTotal > 0
      ? emulsifiers.reduce((sum, x) => sum + x.profile!.hlb! * x.fi.percent, 0) / emulsifierPercentTotal
      : undefined;

  if (mixedHlb === undefined) {
    return { status: 'unknown', requiredHlb, message: '유화제 배합비가 0이라 혼합 HLB를 계산할 수 없습니다.' };
  }

  const diff = Math.abs(requiredHlb - mixedHlb);
  if (diff > tolerance) {
    return {
      status: 'unstable',
      requiredHlb,
      mixedHlb,
      message: `Required HLB(${requiredHlb.toFixed(2)})와 혼합 HLB(${mixedHlb.toFixed(2)}) 차이가 허용치(${tolerance})를 넘어 유화 불안정 경고`,
    };
  }
  return { status: 'ok', requiredHlb, mixedHlb, message: '유화 안정성 양호(Required HLB와 혼합 HLB 근접)' };
}

/** 9단계: 원가 = Σ(배합비/100 × 원료 단가). 처방 1g 기준. */
export function calculateFormulaCost(formulaIngredients: FormulaIngredientInput[], unitPrices: IngredientUnitPrice[]): number {
  let cost = 0;
  for (const fi of formulaIngredients) {
    const price = unitPrices.find((p) => p.ingredientId === fi.ingredientId);
    if (!price) continue; // 단가 없는 원료는 원가 계산에서 제외(0으로 취급하지 않고 결과에 "일부 원료 단가 없음"을 별도로 알려야 함, 호출부 책임)
    cost += (fi.percent / 100) * price.pricePerGram;
  }
  return cost;
}

/** 전체 검증 결과. `canConfirm=false`면 이 처방은 FIXED로 전환할 수 없다(block 이슈 존재). */
export interface FormulaValidationResult {
  issues: ValidationIssue[];
  canConfirm: boolean;
  hlb: HlbResult;
  cost: number;
}

/**
 * 처방 전체 검증. 05번 문서의 9단계를 순서대로 실행하고 하나의 결과로 합친다. 우선순위
 * (규제 > 무첨가 > 인증 > 고정값 > 역할적합도, 절대 원칙3)를 그대로 issues 배열의 순서에
 * 반영한다 — 역할적합도(가장 낮은 우선순위) 자체의 구체 판정 로직은 05번 문서에도 없어
 * 이 함수 범위에 포함하지 않는다(확인 필요로 남겨둠).
 */
export function validateFormula(input: {
  formulaIngredients: FormulaIngredientInput[];
  regulations: IngredientRegulationEntry[];
  targetCountryCodes: string[];
  noaddFlags: IngredientNoaddFlag[];
  certs: IngredientCertEligibility[];
  pinned: PinnedIngredient[];
  phRanges: IngredientPhRange[];
  incompat: IngredientIncompatEntry[];
  hlbProfiles: IngredientHlbProfile[];
  unitPrices: IngredientUnitPrice[];
  conditions: FormulaConditions;
}): FormulaValidationResult {
  const issues: ValidationIssue[] = [
    validateBatchTotal(input.formulaIngredients),
    ...validateRegulations(input.formulaIngredients, input.regulations, input.targetCountryCodes),
    ...validateNoaddConditions(input.formulaIngredients, input.noaddFlags, input.conditions),
    ...validateCertConditions(input.formulaIngredients, input.certs, input.conditions),
    ...validatePinnedValues(input.formulaIngredients, input.pinned),
    ...validatePhCompatibility(input.formulaIngredients, input.phRanges, input.conditions),
    ...validateIncompatibilities(input.formulaIngredients, input.incompat),
  ];

  const hlb = calculateHlbJudgement(input.formulaIngredients, input.hlbProfiles);
  const cost = calculateFormulaCost(input.formulaIngredients, input.unitPrices);

  return {
    issues,
    canConfirm: !issues.some((i) => i.severity === 'block'),
    hlb,
    cost,
  };
}
