import type { LocalStore, LocalStoreInfo, OutboxFailure, OutboxSummary } from './localStore';
import { invokeOrNull } from './tauri';

/**
 * 실제 로컬 저장소 어댑터. SQLite 는 Rust 가 소유하고 여기서는 명령만 부른다.
 *
 * JS 에서 SQL 문자열을 실행하지 않는 이유 셋:
 *   1. 단일 writer 라 SQLITE_BUSY 경합이 원천 소멸한다.
 *   2. outbox flush 가 WebView 재로드와 라우트 이동을 넘어 살아남는다.
 *   3. 저사양 PC 에서는 화면당 굵은 명령 한 번이 잦은 SQL 왕복보다 싸다.
 */
export const tauriLocalStore: LocalStore = {
  async info(): Promise<LocalStoreInfo> {
    const value = await invokeOrNull<LocalStoreInfo>('local_store_info');
    // 진단 화면은 DB 가 안 열려도 떠야 한다. 못 열린 사실 자체가 진단 결과다.
    return (
      value ?? {
        schemaVersion: 0,
        expectedSchemaVersion: 0,
        readOnly: true,
        path: null,
      }
    );
  },

  async outboxSummary(): Promise<OutboxSummary> {
    const value = await invokeOrNull<OutboxSummary>('outbox_summary');
    return (
      value ?? {
        pending: 0,
        sending: 0,
        failed: 0,
        conflict: 0,
        dead: 0,
        oldestPendingAt: null,
      }
    );
  },

  async recentFailures(limit: number): Promise<OutboxFailure[]> {
    return (await invokeOrNull<OutboxFailure[]>('outbox_recent_failures', { limit })) ?? [];
  },
};
