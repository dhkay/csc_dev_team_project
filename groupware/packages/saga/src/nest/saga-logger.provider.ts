/**
 * NestJS Logger 를 코어의 `SagaLogger` 로 끼우기 위한 토큰
 *
 * 코어는 로거를 인자로 받는 순수 클래스라(프레임워크 비종속) DI 로 넣을 토큰이 필요하다.
 */
export const NEST_SAGA_LOGGER = Symbol('NEST_SAGA_LOGGER');
