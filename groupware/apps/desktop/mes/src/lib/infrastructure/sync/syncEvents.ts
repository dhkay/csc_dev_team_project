/**
 * Rust 동기화 워커의 이벤트를 구독한다.
 *
 * Tauri 밖에서는 아무 일도 하지 않고 해제 함수만 돌려준다. 브라우저 단독 개발에서
 * 화면이 깨지지 않아야 하기 때문이다.
 */
import { isTauri } from '$lib/infrastructure/local/tauri';
import { SYNC_STATUS_EVENT, type SyncStatus } from './syncPort';

type Unsubscribe = () => void;

async function listenTauri<T>(event: string, handler: (payload: T) => void): Promise<Unsubscribe> {
  if (!isTauri()) return () => {};
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen<T>(event, (e) => handler(e.payload));
    return unlisten;
  } catch (error) {
    console.warn(`[sync] 이벤트 구독 실패: ${event}`, error);
    return () => {};
  }
}

/** 동기화 상태 방송 구독(1초 throttle 된 값이 온다) */
export function onSyncStatus(handler: (status: SyncStatus) => void): Promise<Unsubscribe> {
  return listenTauri<SyncStatus>(SYNC_STATUS_EVENT, handler);
}

// pull 적용(SYNC_APPLIED_EVENT)과 push ack(SYNC_ACKED_EVENT) 구독은 Phase 1 이다.
// 그 이벤트로 TanStack Query 의 `['local', entity]` 키를 무효화해 화면을 갱신한다.
// 지금은 방송하는 쪽(Rust 동기화 워커)이 없어 구독자를 두지 않는다.
