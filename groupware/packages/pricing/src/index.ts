/**
 * `@csc/pricing`: 벤더 단가 공유 커널(런타임 의존성 0)
 *
 * 소비자 둘이 같은 숫자를 쓰게 하는 것이 존재 이유다:
 *  - csc-marketing(백엔드): 생성 시점에 비용을 계산해 로그에 굳힌다.
 *  - web-groupware(프론트): 가격표 화면에 단가를 표시한다.
 *
 * `@csc/entitlements` 를 확장하지 않은 이유: entitlements 는 "조직이 무엇에 접근할 수 있는가"
 * 의 카탈로그로 배포 주기에 맞춰 바뀌고 `@csc/log-contracts` 가 이미 의존한다. 벤더 단가는
 * 벤더 일정으로 바뀌므로, 섞으면 AiToolKey 만 필요한 곳까지 단가표를 상속하게 된다.
 */

export { BillingUnit } from './units';
// MODEL_KEY_ALIASES 는 내보내지 않는다. findRateCard 가 내부에서 해석하는 구현 세부이고,
//   소비자가 별칭 표를 직접 읽을 이유가 없다(읽으면 조회 규칙이 두 곳으로 갈린다)
export {
  MODEL_RATE_CARDS,
  findRateCard,
  formatUnitRate,
  pricingAsOf,
  resolveRateVersion,
} from './rates';
export type { BillingMode, ModelRateCard, RateCardVersion, UnitRate } from './rates';
export { computeCost, formatMicroUsd } from './compute';
export type {
  ComputeCostInput,
  CostBreakdownLine,
  CostResult,
  CostStatus,
  UsageUnits,
} from './compute';
