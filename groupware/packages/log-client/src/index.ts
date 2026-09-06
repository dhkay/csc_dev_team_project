/**
 * `@csc/log-client`: 버퍼드 로그 프로듀서(코어)
 *
 * net-utils 가 아닌 별도 패키지인 이유. `@csc/net-utils` 코어는 런타임 의존성 0 이 문서화된
 * 불변식이다. 여기는 `@csc/log-contracts` 에 실제로 의존하므로 net-utils 에 넣으면 그 불변식이
 * 패키지 전체에서 깨진다. 앱별 복제는 더 나쁘다. 버퍼/백프레셔/드레인은 미묘하고 프로듀서가
 * 여럿이라 복붙이 곧 드리프트가 된다.
 *
 * NestJS 바인딩은 `@csc/log-client/nest` 에 있다(net-utils 와 같은 레이어링)
 */

export { LogProducer } from './producer';
export type {
  LogIngestReceipt,
  LogProducerLogger,
  LogProducerOptions,
  LogProducerStats,
  LogTransport,
} from './producer';
export { ACTIVITY_LOG_NAMESPACE, deterministicEventId } from './event-id';
