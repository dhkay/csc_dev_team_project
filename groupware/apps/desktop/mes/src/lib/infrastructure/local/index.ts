/**
 * 환경별 로컬 저장소 어댑터 선택
 *
 * Tauri 안이면 실제 SQLite, 밖이면 인메모리. 이 분기는 여기 한 곳에만 있어야 하고,
 * features 코드는 어느 쪽인지 몰라야 한다.
 */
import type { LocalStore } from './localStore';
import { createMemoryLocalStore } from './memoryLocalStore';
import { isTauri } from './tauri';
import { tauriLocalStore } from './tauriLocalStore';

let instance: LocalStore | null = null;

export function localStore(): LocalStore {
  if (!instance) {
    instance = isTauri() ? tauriLocalStore : createMemoryLocalStore();
  }
  return instance;
}

export * from './localStore';
export { isTauri } from './tauri';
