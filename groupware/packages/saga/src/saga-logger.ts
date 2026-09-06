/**
 * 사가 엔진이 쓰는 최소 로그 포트
 *
 * 코어가 특정 프레임워크의 Logger 를 import 하면 그 프레임워크에 묶인다. 이 엔진은 NestJS 앱들이
 * 쓰지만 그것이 계약의 일부일 이유가 없다. 그래서 두 메서드만 요구하고, 배선하는 쪽(`@csc/saga/nest`)이
 * 자기 프레임워크의 로거를 끼운다.
 *
 * 로그를 없애지 않고 포트로 남기는 이유: 보상 실패와 복구 결과는 남지 않으면 추적이 불가능한
 * 사건이다. 되돌리지 못한 부수효과의 유일한 흔적이 이 경고다.
 */
export interface SagaLogger {
  log(message: string): void;
  warn(message: string): void;
}

/** 기본 로거: 아무것도 하지 않는다. 테스트가 출력에 파묻히지 않게 기본값을 조용한 쪽으로 둔다. */
export const silentSagaLogger: SagaLogger = {
  log: () => undefined,
  warn: () => undefined,
};
