/**
 * 엔타이틀먼트 카탈로그: SSOT 는 공유 커널 `@csc/entitlements`(zero-dep 순수 TS, 프레임워크/ORM 없음)
 * 토큰을 발급하는 user 와 소비하는 web(groupware/control-tower)이 같은 enum/카탈로그/라벨을 공유한다.
 * 이 파일은 도메인 경계의 얇은 재노출: 기존 `core/domain/types` 경로 import 를 유지한다.
 * 설계: .claude/rules/multi-tenancy.md
 */
export * from '@csc/entitlements';
