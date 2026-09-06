/**
 * @csc/log-contracts: 로그 엔벨로프 계약 (TS 측 단일 구현)
 *
 * Python 측 동일 구현: apps/api/fastapi/log-contracts (csc_log_contracts)
 * AiToolKey 는 @csc/entitlements 를 그대로 쓰고, 두 구현의 일치는 CI 가 강제한다.
 * (scripts/check-log-contracts.mjs)
 *
 * 토픽 네이밍(topics)은 Python 쪽에만 있다.
 * 의도된 비대칭이다. 프로듀서는 전부 HTTP(`POST /logs`)로 보내고 Kafka 를 직접 쓰지 않는다.
 * (Node 에 Kafka 클라이언트를 들이지 않는 것이 설계 결정: docs/specs/service-http-contract.md)
 * 토픽 이름은 log-server 내부에서만 필요하므로 Python 쪽에만 둔다.
 * 여기에 미러를 만들면 아무도 안 쓰는 코드가 CI 검사 대상으로만 남는다.
 */
export * from './types';
export * from './envelope';
