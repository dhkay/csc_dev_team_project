/**
 * 동기화 전송 봉투. 클라이언트 outbox 한 행이 그대로 이 모양으로 나간다.
 *
 * TS 가 SSOT 이고 Rust(src-tauri/crates/mes-contracts)가 미러를 갖는다.
 * 한쪽에만 있는 필드는 오류 없이 조용히 유실된다. 보낸 줄 알았는데 서버에 값이 안 남는
 * 형태로 망가지므로, scripts/check-mes-contracts.mjs 가 필드 집합 일치를 CI 에서 강제한다.
 */
import type { RejectReason } from '../errors';
import type { SyncEntity } from './entity';

/** 쓰기 종류. INTENT 는 절대값이 아니라 상태 전이 의도를 보내는 경우다. */
export enum MutationOp {
  Create = 'CREATE',
  Update = 'UPDATE',
  Delete = 'DELETE',
  /** 상태 전이 의도(START/PAUSE/COMPLETE). 서버가 상태기계로 판정한다. */
  Intent = 'INTENT',
}

/** op 처리 결과 */
export enum SyncOpStatus {
  /** 새로 적용됨 */
  Applied = 'APPLIED',
  /** 같은 clientOpId 가 이미 처리됨. 저장된 결과를 그대로 반환한다. */
  Duplicate = 'DUPLICATE',
  /** 거부됨. reason 을 함께 반환한다. */
  Rejected = 'REJECTED',
}

/**
 * outbox 한 건. clientOpId 는 작업자가 확인 버튼을 누른 순간 생성한다(전송 시점이 아니다)
 * UUIDv7 을 쓰는 이유: 시간 순 정렬이라 인덱스 지역성이 좋고, 로그에서 사람이 시각을 읽을 수 있어
 * 현장 장애 분석이 쉽다.
 */
export interface MutationEnvelope {
  clientOpId: string;
  clientSeq: number;
  entity: SyncEntity;
  op: MutationOp;
  targetId: number | null;
  baseVersion: number | null;
  intent: string | null;
  workerId: number | null;
  occurredAt: string;
  payload: unknown;
}

/** push 요청 본문 */
export interface PushRequest {
  deviceId: string;
  clientTime: string;
  operations: MutationEnvelope[];
}

/** op 1건의 처리 결과 */
export interface SyncOpResult {
  clientOpId: string;
  status: SyncOpStatus;
  entity: SyncEntity;
  serverId: number | null;
  serverSeq: number | null;
  version: number | null;
  reason: RejectReason | null;
  retryable: boolean;
  message: string | null;
  details: unknown;
}

/**
 * push 응답. HTTP 상태는 항상 200 이고 op별 성패는 results 로 전달한다.
 * 207 을 쓰지 않는 이유: log-server `POST /logs` 의 "항상 202 + 부분 성공 영수증" 선례를 따른다.
 * 기존 HTTP 클라이언트들이 상태코드로 분기하지 않아 207 은 조용히 성공으로 처리될 위험이 있다.
 */
export interface PushResponse {
  serverTime: string;
  clockSkewMs: number;
  cursorHint: string | null;
  results: SyncOpResult[];
}

/** pull 변경 1건. UPSERT 는 data, DELETE 는 deletedAt 을 채운다. */
export interface SyncChange {
  entity: SyncEntity;
  op: 'UPSERT' | 'DELETE';
  seq: number;
  id: number;
  version: number | null;
  data: unknown;
  deletedAt: string | null;
}

/** pull 응답. changes 는 엔티티가 섞여도 seq 오름차순이다(인과 순서 보장) */
export interface PullResponse {
  cursor: string;
  hasMore: boolean;
  serverTime: string;
  bootstrap: boolean;
  windowFrom: string | null;
  changes: SyncChange[];
}

/** 배치 한도. 서버가 manifest 로도 알려주므로 클라이언트는 이 값을 하드코딩하지 않는다. */
export const MAX_OPERATIONS_PER_BATCH = 200;

/** 요청 본문 상한(바이트) */
export const MAX_PUSH_BODY_BYTES = 1_048_576;

/** pull 페이지 기본 크기와 상한 */
export const DEFAULT_PULL_LIMIT = 500;
export const MAX_PULL_LIMIT = 2000;
