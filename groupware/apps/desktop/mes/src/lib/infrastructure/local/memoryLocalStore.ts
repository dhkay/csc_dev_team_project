import type { LocalStore, LocalStoreInfo, OutboxFailure, OutboxSummary } from './localStore';

/**
 * 인메모리 로컬 저장소. 브라우저 단독 개발(`pnpm dev:web`)과 단위 테스트에서 쓴다.
 *
 * 이 어댑터가 필요한 이유: 이게 없으면 모든 UI 작업이 Rust 진척을 기다린다.
 * Rust 선례가 0건인 팀에서 그 결합은 그대로 일정 리스크가 된다.
 *
 * Phase 0 은 읽기 전용이라 상태를 갖지 않는다. Phase 1 에서 쓰기가 들어오면 여기에도
 * 인메모리 구현을 함께 넣는다. 빠뜨리면 브라우저 개발 경로가 그때 깨진다.
 */
export function createMemoryLocalStore(): LocalStore {
  return {
    async info(): Promise<LocalStoreInfo> {
      return {
        schemaVersion: 1,
        expectedSchemaVersion: 1,
        readOnly: false,
        path: '(memory)',
      };
    },

    async outboxSummary(): Promise<OutboxSummary> {
      return {
        pending: 0,
        sending: 0,
        failed: 0,
        conflict: 0,
        dead: 0,
        oldestPendingAt: null,
      };
    },

    async recentFailures(): Promise<OutboxFailure[]> {
      return [];
    },
  };
}
