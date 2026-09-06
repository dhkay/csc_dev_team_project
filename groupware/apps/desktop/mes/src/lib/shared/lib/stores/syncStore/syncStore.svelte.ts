/**
 * 동기화 상태 스토어 (Svelte 5 runes 싱글톤)
 *
 * 연결 상태, 미전송 건수, 마지막 동기화 시각은 항상 화면에 있어야 한다.
 * 현장에서 가장 나쁜 실패 모드는 조용한 실패다. 작업자가 실적을 넣었는데 서버에 안 간 사실을
 * 아무도 모른 채 교대가 끝나면 그 데이터는 되찾을 방법이 없다.
 */
import { INITIAL_SYNC_STATUS, type Connectivity, type SyncStatus } from '$lib/infrastructure/sync';

class SyncStore {
  private _status = $state<SyncStatus>({ ...INITIAL_SYNC_STATUS });

  get status(): SyncStatus {
    return this._status;
  }

  get connectivity(): Connectivity {
    return this._status.connectivity;
  }

  /** 미전송 총계(대기 + 실패 + 충돌). 앱바 배지에 쓴다. */
  get unsentCount(): number {
    return this._status.pendingCount + this._status.failedCount + this._status.conflictCount;
  }

  /** 사람이 손대야 하는 건수. 0 이 아니면 보류함을 봐야 한다. */
  get needsAttentionCount(): number {
    return this._status.failedCount + this._status.conflictCount;
  }

  apply(status: SyncStatus): void {
    this._status = status;
  }

  reset(): void {
    this._status = { ...INITIAL_SYNC_STATUS };
  }
}

export const syncStore = new SyncStore();
