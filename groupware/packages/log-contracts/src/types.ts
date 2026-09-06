/**
 * 로그 엔벨로프의 닫힌 집합 타입: kind/level/scope/주체
 *
 * Python 측 동일 구현: apps/api/fastapi/log-contracts (csc_log_contracts.types)
 * 두 목록이 어긋나면 `scripts/check-log-contracts.mjs` 가 CI 에서 실패시킨다.
 *
 * AiToolKey 는 여기서 재정의하지 않고 @csc/entitlements 를 그대로 쓴다. 카탈로그 SSOT 는 하나뿐이다.
 */

/**
 * 로그 종류: 토픽/테이블 분리 축
 * 종류마다 스키마, 보존기간, 볼륨이 근본적으로 달라서 이 축으로만 물리 분리한다.
 * 조직/AI도구는 카디널리티가 높아 토픽이 아니라 컬럼으로 간다.
 */
export enum LogKind {
  /** 도메인 이벤트: 잡 생명주기, LLM 호출, 크롤 결과 */
  Event = 'EVENT',
  /** 에러/예외: 스택 포함 */
  Error = 'ERROR',
  /** 감사: 누가 무엇을 언제 변경했나 (보존 무기한) */
  Audit = 'AUDIT',
  /** HTTP 접근: 볼륨 최대, 샘플링 대상 */
  Access = 'ACCESS',
}

export enum LogLevel {
  Debug = 'DEBUG',
  Info = 'INFO',
  Warn = 'WARN',
  Error = 'ERROR',
  Fatal = 'FATAL',
}

/**
 * 이 로그가 누구의 것인가: 인가와 격리의 기준. kind(종류)와 직교한다.
 * 예: 조직 감사 로그 = scope=Organization + kind=Audit.
 */
export enum LogScope {
  /** 조직 무관: 부팅, 마이그레이션, 크론, 플랫폼 감사 */
  Platform = 'PLATFORM',
  /** 특정 조직: organizationId 필수 */
  Organization = 'ORGANIZATION',
  /** 특정 AI 도구: aiTool 필수 */
  AiTool = 'AI_TOOL',
}

/** 감사 로그 주체의 종류: user 서버 토큰 클레임 principalType 과 같은 어휘 */
export enum PrincipalType {
  /** 벤더 운영자 (admin_users) */
  AdminUser = 'ADMIN_USER',
  /** 조직 유저 (organization_users) */
  OrganizationUser = 'ORGANIZATION_USER',
  /** 서비스 자신 (크론, 마이그레이션 등 무인 주체) */
  Service = 'SERVICE',
}
