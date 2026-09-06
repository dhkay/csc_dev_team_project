/**
 * 복구 러너가 쓸 사가 정의 목록의 주입 토큰
 *
 * 배선 방향이 이 토큰의 존재 이유다. 엔진(SagaModule)은 도메인을 몰라야 하고, 도메인은 러너를 쓴다.
 * 그래서 "정의를 모으는 일" 은 세 번째 모듈(SagaRecoveryModule)이 맡아 도메인 모듈들을 import 하고
 * 이 토큰으로 배열을 만든다. 엔진이 정의를 알면 방향이 뒤집혀 순환이 된다.
 *
 * 새 사가 추가 = 도메인 모듈이 정의를 export + SagaRecoveryModule 의 배열에 한 줄
 */
export const SAGA_DEFINITIONS = Symbol('SAGA_DEFINITIONS');
