/**
 * 사가 엔진 NestJS 배선
 *
 * 코어는 프레임워크를 모르는 순수 클래스라(데코레이터 없음) 여기서 조립한다. 앱이 하는 일은 셋이다.
 *   1. `SagaModule.forRoot({ store })`: 자기 DB 어댑터를 끼운다.
 *   2. `SagaRecoveryModule.forRoot({ imports, definitions })`: 정의를 모은다(+ `ScheduleModule.forRoot()`)
 *   3. `SagaBusyFilter` 를 전역 필터로 등록: 중복 제출을 409 로 번역한다.
 */
export * from './saga.module';
export * from './saga-recovery.module';
export * from './saga-recovery.scheduler';
export * from './saga-busy.filter';
export * from './saga-logger.provider';
