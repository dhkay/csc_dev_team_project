/**
 * 동기화 포트. 화면은 이 타입만 알고 Rust 워커의 존재를 모른다.
 */

/**
 * 연결 상태
 *
 * navigator.onLine 을 쓰지 않는다. 공장 네트워크는 링크가 살아 있고 게이트웨이만 죽는 상황이
 * 흔해 거짓 양성이 나온다. Rust 가 /health 를 15초 간격으로 능동 프로브하고, 연속 2회 실패에서
 * offline, 1회 성공에서 online 으로 바꾼다(히스테리시스)
 */
export type Connectivity =
  /** 정상 */
  | 'online'
  /** 응답은 오지만 느림. 화면은 "동기화 지연"으로 구분해 보여준다. */
  | 'degraded'
  /** 도달 불가 */
  | 'offline'
  /** 아직 판정 전(앱 기동 직후) */
  | 'unknown';

/** Rust 가 주기적으로 방송하는 동기화 상태 */
export interface SyncStatus {
  connectivity: Connectivity;
  lastPullAt: string | null;
  lastPushAt: string | null;
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
}

export const INITIAL_SYNC_STATUS: SyncStatus = {
  connectivity: 'unknown',
  lastPullAt: null,
  lastPushAt: null,
  pendingCount: 0,
  failedCount: 0,
  conflictCount: 0,
};

/** Rust -> WebView 이벤트 이름. Rust 쪽 emit 과 문자열이 일치해야 한다. */
export const SYNC_STATUS_EVENT = 'sync://status';
/** pull 트랜잭션 커밋 후. 이 이벤트로 로컬 쿼리를 무효화한다. */
export const SYNC_APPLIED_EVENT = 'sync://applied';
/** push ack 후 */
export const SYNC_ACKED_EVENT = 'sync://acked';
