/**
 * 오류 어휘. TS 가 SSOT 이고 Rust(src-tauri/crates/mes-contracts)가 미러를 갖는다.
 * 미러 동기화는 scripts/check-mes-contracts.mjs 가 CI 에서 강제한다.
 */

/**
 * 요청 전체가 실패했을 때의 오류 코드(HTTP 오류 본문의 `code`)
 * op 단위 거부는 이것이 아니라 RejectReason 을 쓴다.
 */
export enum MesErrorCode {
  /** 액세스 토큰 만료. 갱신 후 1회 재시도 */
  TokenExpired = 'TOKEN_EXPIRED',
  /** 단말이 폐기됨. 동기화 영구 중단, outbox 는 보존 */
  DeviceRevoked = 'DEVICE_REVOKED',
  /** 조직에 MES 기능이 부여되지 않음. 재시도 금지 */
  FeatureNotGranted = 'FEATURE_NOT_GRANTED',
  /** 커서의 계약 버전 또는 단말 스코프 버전이 서버와 불일치. 재부트스트랩 */
  CursorVersionMismatch = 'CURSOR_VERSION_MISMATCH',
  /** tombstone 보존기간을 넘긴 커서. 재부트스트랩 */
  CursorTooOld = 'CURSOR_TOO_OLD',
  /** 배치 한도 초과. 클라이언트는 배치 크기를 반으로 줄여 재시도 */
  MaxBatchExceeded = 'MAX_BATCH_EXCEEDED',
  /** 레이트 리밋. Retry-After 존중 */
  RateLimited = 'RATE_LIMITED',
  /** 클라이언트 버전이 최소 지원 미만 */
  ClientUpgradeRequired = 'CLIENT_UPGRADE_REQUIRED',
  /** 서버 내부 오류. 백오프 재시도 */
  InternalError = 'INTERNAL_ERROR',
}

/**
 * op 1건의 거부 사유. 배치 push 응답의 결과 배열에 실린다.
 *
 * 각 코드의 재시도 가능 여부는 REJECT_RETRYABLE 로 정의하고, 응답에도 함께 실어 보낸다.
 * 클라이언트가 분류를 하드코딩하면 서버가 정책을 바꿀 때 전 단말 재배포가 필요해진다.
 */
export enum RejectReason {
  /** DTO 위반. outbox 에서 격리 보관하고 작업자에게 표시 */
  ValidationFailed = 'VALIDATION_FAILED',
  /** 참조 마스터 없음. pull 1회 후 재시도, 그래도 실패면 격리 */
  EntityNotFound = 'ENTITY_NOT_FOUND',
  /** 마스터가 갱신됨. pull 후 재시도 */
  StaleMaster = 'STALE_MASTER',
  /** 낙관적 잠금 실패. 응답의 current 로 리베이스 후 재시도 */
  VersionConflict = 'VERSION_CONFLICT',
  /** 상태기계 위반(완료된 지시에 START). op 폐기 후 pull 로 갱신 */
  InvalidTransition = 'INVALID_TRANSITION',
  /** 이미 같은 내용이 있음. serverId 를 함께 주므로 적용된 것으로 간주한다. */
  DuplicateNaturalKey = 'DUPLICATE_NATURAL_KEY',
  /** 초과 생산. 관리자 승인이 필요하므로 작업자에게 표시 */
  QtyExceedsPlan = 'QTY_EXCEEDS_PLAN',
  /** 단말 배정 라인 밖. 즉시 격리하고 보안 로그를 남긴다. */
  ForbiddenScope = 'FORBIDDEN_SCOPE',
  /** 같은 clientOpId 로 다른 내용이 왔다. 클라이언트 버그이므로 상태를 건드리지 않는다. */
  OpIdReused = 'OP_ID_REUSED',
  /** 승격 권한 필요(초품 승인 등). 감독자 인증 후 재발행 */
  RequiresElevation = 'REQUIRES_ELEVATION',
  /** 일시적 장애. 백오프 재시도 */
  TemporarilyUnavailable = 'TEMPORARILY_UNAVAILABLE',
}

/**
 * 거부 사유별 재시도 가능 여부
 *
 * true 인 것만 outbox 에 남기고, false 는 즉시 격리(dead letter)해 사람이 판단하게 한다.
 * 조용히 버리지 않는 것이 핵심이다. 현장에서 사라진 실적은 되찾을 방법이 없다.
 */
export const REJECT_RETRYABLE: Record<RejectReason, boolean> = {
  [RejectReason.ValidationFailed]: false,
  [RejectReason.EntityNotFound]: true,
  [RejectReason.StaleMaster]: true,
  [RejectReason.VersionConflict]: true,
  [RejectReason.InvalidTransition]: false,
  [RejectReason.DuplicateNaturalKey]: false,
  [RejectReason.QtyExceedsPlan]: false,
  [RejectReason.ForbiddenScope]: false,
  [RejectReason.OpIdReused]: false,
  [RejectReason.RequiresElevation]: false,
  [RejectReason.TemporarilyUnavailable]: true,
};

/** 거부 사유가 재시도 가능한지. 알 수 없는 값은 보수적으로 재시도하지 않는다. */
export function isRetryable(reason: RejectReason): boolean {
  return REJECT_RETRYABLE[reason] ?? false;
}
