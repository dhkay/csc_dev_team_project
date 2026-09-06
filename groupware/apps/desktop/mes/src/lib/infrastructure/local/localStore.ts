/**
 * 로컬 저장소 포트
 *
 * feature 코드는 서버를 모른다. 로컬 DB 만 안다. 기존 web 앱의 `apis/` 가 `frontClient().GET(...)`
 * 를 부르던 자리에서 이 앱은 `localStore.*` 를 부른다. 네트워크는 feature 의 관심사가 아니라
 * Rust 동기화 워커의 관심사다.
 *
 * 구현은 둘이다. `tauriLocalStore`(실제 SQLite, Rust 소유)와 `memoryLocalStore`(브라우저 단독
 * 개발과 테스트용). 두 번째가 있어야 UI 작업이 Rust 진척을 기다리지 않는다.
 */
import type { SyncEntity } from '@csc/mes-contracts';

/** outbox 한 건의 상태 */
export type OutboxStatus =
  | 'pending'
  | 'sending'
  | 'acked'
  | 'failed'
  | 'conflict'
  | 'dead';

/** 진단 화면과 상태바가 읽는 요약 */
export interface OutboxSummary {
  pending: number;
  sending: number;
  failed: number;
  conflict: number;
  dead: number;
  // 가장 오래된 미전송 항목의 생성 시각. 없으면 null
  oldestPendingAt: string | null;
}

/** 최근 실패 항목(진단 화면에 5건 정도 노출) */
export interface OutboxFailure {
  clientOpId: string;
  entity: SyncEntity;
  status: OutboxStatus;
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  updatedAt: string;
}

/** 로컬 DB 메타. 스키마 불일치 진단의 근거가 된다. */
export interface LocalStoreInfo {
  // PRAGMA user_version. 로컬 스키마 버전의 단일 진실원
  schemaVersion: number;
  // 코드가 기대하는 스키마 버전
  expectedSchemaVersion: number;
  // 읽기 전용 모드 여부. schemaVersion > expected 일 때 true 가 된다.
  // (앱을 롤백했는데 DB 는 신버전인 경우. 그냥 열면 신버전 컬럼의 데이터가 조용히 잘려 나간다)
  readOnly: boolean;
  // DB 파일 경로. 진단 번들과 백업 안내에 쓴다.
  path: string | null;
}

/**
 * Phase 0 은 읽기 전용이다. 쓸 도메인 테이블도, 보낼 동기화 워커도 아직 없다.
 *
 * 쓰기(enqueue)를 추가하는 절차는 docs/architecture/mes-structure.md 2-4 절에 있다.
 * 핵심 제약 하나만 여기 남긴다: 사실 테이블 insert 와 outbox insert 는 한 트랜잭션이어야
 * 한다. 둘이 갈리면 화면에는 보이는데 서버에 영영 안 가는 실적이 생긴다.
 */
export interface LocalStore {
  /** 로컬 DB 메타 조회 */
  info(): Promise<LocalStoreInfo>;
  /** outbox 요약 */
  outboxSummary(): Promise<OutboxSummary>;
  /** 최근 실패 항목 */
  recentFailures(limit: number): Promise<OutboxFailure[]>;
}
