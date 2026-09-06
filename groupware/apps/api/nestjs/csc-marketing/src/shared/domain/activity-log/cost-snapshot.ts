import { computeCost, type BillingUnit, type UsageUnits } from '@csc/pricing';
import type { ActivityCostSnapshot } from './activity-log.port';

/**
 * 사용량을 활동 로그용 비용 스냅샷으로 변환. 이벤트 시점 단가로 동결
 * 단가는 바뀌지만 청구되었던 금액은 과거 사실이라 단가 버전 id 와 원시 사용량도 함께 남겨 감사 대비
 * CostResult 를 그대로 싣지 않는 이유: 포트가 특정 패키지 타입에 묶이면 계약까지 흔들림
 */
export function buildCostSnapshot(input: {
  // 실제로 쓰인 모델 key(요청값이 아니라 폴백된 쪽)
  modelKey: string;
  units: UsageUnits;
  // 이벤트 시각. 기본값은 지금(동기 생성은 호출 시각이 곧 이벤트 시각)
  at?: Date;
}): ActivityCostSnapshot {
  const result = computeCost({
    modelKey: input.modelKey,
    units: input.units,
    at: input.at ?? new Date(),
  });
  return {
    status: result.status,
    // computed/free 가 아니면 금액 생략('모름'을 0 으로 위장 금지)
    ...(result.costMicroUsd !== null ? { microUsd: result.costMicroUsd } : {}),
    rateVersion: result.rateVersionId,
    model: input.modelKey,
    billing: result.billing,
    units: result.units as Record<string, number>,
    ...(result.breakdown.length > 0
      ? {
          breakdown: result.breakdown.map((line) => ({
            unit: line.unit as string,
            units: line.units,
            microUsd: line.microUsd,
          })),
        }
      : {}),
  };
}

/** 토큰 사용량을 승격 컬럼(token_input/token_output)용 합계로 변환. 집계(usage_daily)가 사용 */
export function tokenTotals(units: UsageUnits, inputs: BillingUnit[], outputs: BillingUnit[]): {
  tokenInput: number;
  tokenOutput: number;
} {
  const sum = (keys: BillingUnit[]): number =>
    keys.reduce((acc, key) => acc + (units[key] ?? 0), 0);
  return { tokenInput: sum(inputs), tokenOutput: sum(outputs) };
}
