/**
 * 비용 계산: 사용량 + 이벤트 시각 → 그 시점 단가로 계산한 정수 마이크로USD.
 *
 * 계약 두 개.
 *
 * 1. 절대 예외를 던지지 않는다. 단가표에 없는 모델은 `status:'rate-unknown'` 으로 degrade 한다.
 *    비용은 부가 정보이고 생성이 본질이라, 카탈로그와 단가표가 어긋나도 기획서 생성이 죽으면
 *    안 된다. 불일치는 CI 검사(check-pricing-coverage)가 잡는다.
 *
 * 2. 0 을 두 가지로 쓰지 않는다. 무료라서 0(`free`)과 사용량을 못 받아서 모름(`usage-missing`)은
 *    다른 사실이다. 후자는 금액을 null 로 비워 화면이 0원이라고 거짓말하지 못하게 한다.
 *    계량 과금(`metered`)도 같은 이유로 금액을 비운다. 단가가 없는 것은 무료라는 뜻이 아니다.
 */

import { findRateCard, resolveRateVersion, type BillingMode } from './rates';
import { BillingUnit } from './units';

/** 단위별 수량. 없는 단위는 0 으로 본다. */
export type UsageUnits = Partial<Record<BillingUnit, number>>;

export type CostStatus =
  /** 정상 계산 */
  | 'computed'
  /** 사내 모델/무료 서비스: 0 이 맞는 값이다. */
  | 'free'
  /**
   * 계량 과금(크레딧/플랜): 유료이지만 정액 단가가 없어 우리가 계산하지 않는다.
   * 'usage-missing'(받아야 할 사용량을 못 받았다)과 다르다. 이쪽은 결함이 아니라 그 벤더의
   * 과금 방식이고, 금액의 근거는 벤더 청구서다.
   */
  | 'metered'
  /** 유료 모델인데 사용량을 못 받았다. 0 이 아니라 '모름' */
  | 'usage-missing'
  /** 단가표에 없는 모델: 계산 근거가 없다. */
  | 'rate-unknown';

export interface CostBreakdownLine {
  unit: BillingUnit;
  units: number;
  microUsd: number;
}

export interface CostResult {
  status: CostStatus;
  // computed/free 일 때만 값이 있다. 그 외 null: '모름' 을 0 으로 위장하지 않는다.
  costMicroUsd: number | null;
  // 적용된 단가 버전 id: 동결 비용을 나중에 재계산/감사할 유일한 근거
  rateVersionId: string | null;
  billing: BillingMode | null;
  // 실제로 곱해진 수량 그대로. 원시 사용량을 남겨 재계산이 가능하게 한다.
  units: UsageUnits;
  breakdown: CostBreakdownLine[];
}

export interface ComputeCostInput {
  // 실제로 쓰인 모델 key(요청값이 아니다). 폴백이 일어났다면 폴백된 쪽
  modelKey: string;
  units: UsageUnits;
  // 이벤트 시각: 이 시점의 단가로 계산해 굳힌다.
  at: Date;
}

/** 유효한 양수 수량만 남긴다. NaN/음수/0 은 계산에서 뺀다(NaN 이 들어오면 금액이 NaN 이 된다) */
function sanitize(units: UsageUnits): UsageUnits {
  const out: UsageUnits = {};
  for (const [unit, value] of Object.entries(units) as [BillingUnit, unknown][]) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      out[unit] = value;
    }
  }
  return out;
}

export function computeCost(input: ComputeCostInput): CostResult {
  const clean = sanitize(input.units);
  const card = findRateCard(input.modelKey);

  if (!card) {
    return {
      status: 'rate-unknown',
      costMicroUsd: null,
      rateVersionId: null,
      billing: null,
      units: clean,
      breakdown: [],
    };
  }

  // 무료는 units 를 보기 전에 단락시킨다. 사내 모델은 사용량이 없어도 0 이 정답이다.
  // (이 순서가 '무료라서 0' 과 '모름' 을 구조적으로 갈라 준다.)
  if (card.billing === 'none') {
    return {
      status: 'free',
      costMicroUsd: 0,
      rateVersionId: resolveRateVersion(input.modelKey, input.at)?.id ?? null,
      billing: 'none',
      units: clean,
      breakdown: [],
    };
  }

  // 계량 과금도 units 를 보기 전에 단락시킨다. 곱할 단가가 없으므로 사용량이 있든 없든 결과가
  // 같고, 그 사실("계산하지 않는다")이 곧 답이다. 원시 사용량은 남겨 감사에 쓴다.
  if (card.billing === 'metered') {
    return {
      status: 'metered',
      costMicroUsd: null,
      rateVersionId: resolveRateVersion(input.modelKey, input.at)?.id ?? null,
      billing: 'metered',
      units: clean,
      breakdown: [],
    };
  }

  const version = resolveRateVersion(input.modelKey, input.at);
  if (!version) {
    // 카드는 있는데 그 시점에 유효한 창이 없다(단가 이력이 이벤트 시각을 못 덮는다)
    return {
      status: 'rate-unknown',
      costMicroUsd: null,
      rateVersionId: null,
      billing: card.billing,
      units: clean,
      breakdown: [],
    };
  }

  const breakdown: CostBreakdownLine[] = [];
  for (const rate of version.rates) {
    const quantity = clean[rate.unit];
    if (quantity === undefined) continue;
    // 정수 단가 × 정수 수량이라 일반 경로에선 반올림이 일어나지 않는다.
    // 소수 수량이 들어오는 경우만 µUSD 경계에서 반올림한다(줄 단위 half-up)
    breakdown.push({
      unit: rate.unit,
      units: quantity,
      microUsd: Math.round(quantity * rate.microUsdPerUnit),
    });
  }

  if (breakdown.length === 0) {
    // 유료 모델인데 청구 가능한 수량이 하나도 없다 = 사용량을 못 받았다.
    return {
      status: 'usage-missing',
      costMicroUsd: null,
      rateVersionId: version.id,
      billing: card.billing,
      units: clean,
      breakdown: [],
    };
  }

  return {
    status: 'computed',
    costMicroUsd: breakdown.reduce((sum, line) => sum + line.microUsd, 0),
    rateVersionId: version.id,
    billing: card.billing,
    units: clean,
    breakdown,
  };
}

/**
 * 마이크로USD → 표시 문자열
 *
 * $1 미만은 4자리를 쓴다. 이 도구의 단계별 비용은 이미지 1장 약 $0.03, 기획서 1건 약 $0.11 처럼
 * 센트 미만 자리에 의미가 실려 있어서, 2자리로 자르면 $0.0318 이 $0.03 이 되어 6% 가 사라진다.
 * 저장값은 정수 µUSD 로 정확하므로 이건 표시 정밀도 문제이고, 여러 행을 눈으로 더할 때
 * 표시 합계가 실제와 눈에 띄게 어긋나는 것을 막는다.
 */
export function formatMicroUsd(microUsd: number): string {
  const usd = microUsd / 1_000_000;
  if (usd === 0) return '$0';
  return usd < 1 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}
