import { describe, expect, it } from 'vitest';
import { createMemoryLocalStore } from '../../../src/lib/infrastructure/local/memoryLocalStore';

/**
 * 인메모리 어댑터는 브라우저 단독 개발과 테스트의 전제다.
 * 이게 없으면 모든 UI 작업이 Rust 진척을 기다린다.
 */
describe('memoryLocalStore', () => {
  it('빈 상태에서는 미전송이 0 이어야 한다', async () => {
    const store = createMemoryLocalStore();
    const summary = await store.outboxSummary();
    expect(summary.pending).toBe(0);
    expect(summary.oldestPendingAt).toBeNull();
  });

  it('최근 실패가 비어 있어야 한다', async () => {
    const store = createMemoryLocalStore();
    expect(await store.recentFailures(5)).toEqual([]);
  });

  it('스키마 버전이 기대치와 같아 읽기 전용이 아니어야 한다', async () => {
    // readOnly 는 "DB 가 앱보다 최신" 일 때만 켜진다. 정상 상태에서 켜져 있으면
    // 화면이 이유 없이 입력을 막는다.
    const store = createMemoryLocalStore();
    const info = await store.info();
    expect(info.readOnly).toBe(false);
    expect(info.schemaVersion).toBe(info.expectedSchemaVersion);
  });
});
