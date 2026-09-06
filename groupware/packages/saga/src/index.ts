/**
 * 사가 오케스트레이션 엔진(코어)
 *
 * 런타임 의존성이 0 이다. 프레임워크도 ORM 도 모른다. 그래서 어느 앱이든 이 패키지를 쓰고 자기
 * DB 어댑터와 자기 프레임워크 배선만 붙인다.
 *
 * | 이 패키지 | 앱 |
 * |---|---|
 * | 단계 실행 순서, 진행 기록 시점, 역순 보상 | 어떤 단계가 무엇을 하는가(정의) |
 * | 실행권, 중단분 복구, 보존기간 정리 | 사가 표를 어느 DB 에 두는가 |
 * | payload/context 저장 규칙 검사 | HTTP 표면(운영 엔드포인트, 상태코드) |
 *
 * 설계 근거와 규칙은 docs/specs/marketing-write-consistency.md 4.5 절이 단일 출처다.
 */
export * from './saga.types';
export * from './saga-context';
export * from './saga-logger';
export * from './saga-store.port';
export * from './saga-runner';
export * from './saga-recovery.service';
export * from './saga-definitions.token';
