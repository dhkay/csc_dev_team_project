/**
 * 외부 API 프로바이더 카탈로그: SSOT 는 공유 커널 `@csc/api-providers`(zero-dep 순수 TS)
 * 자격증명을 저장/검증하는 이 서버와 등록 화면을 그리는 web-groupware 가 같은 카탈로그를 공유한다.
 * 이 파일은 도메인 경계의 얇은 재노출: 기존 `core/domain` 경로 import 를 유지한다.
 * (user 서버 `core/domain/types/entitlement-catalog.ts` 와 같은 형태다.)
 */
export * from '@csc/api-providers';
