/**
 * Tauri 브리지 유틸
 *
 * Tauri 의존은 이 파일과 tauriLocalStore.ts 두 곳에만 둔다. features 코드가 invoke 를
 * 직접 부르기 시작하면, 나중에 사무실용 웹 버전이나 태블릿을 붙일 때 기능 코드를 통째로
 * 다시 써야 한다. 포트 뒤에 가둬 두면 어댑터 교체로 끝난다.
 */

/** Tauri 런타임 안에서 실행 중인지. v2 는 __TAURI_INTERNALS__ 를 주입한다. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Tauri 명령을 호출한다. Tauri 밖이거나 명령이 실패하면 null.
 *
 * 던지지 않는 이유: 이 경로의 실패는 대부분 "브라우저 단독 개발 중"이고, 그때마다 예외가
 * 올라오면 화면 개발이 불가능해진다. 진짜 오류는 호출부가 null 을 보고 판단한다.
 */
export async function invokeOrNull<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(command, args);
  } catch (error) {
    console.warn(`[tauri] 명령 실패: ${command}`, error);
    return null;
  }
}

// Phase 1 에서 쓰기 명령을 붙일 때 "실패를 그대로 던지는" 변형이 함께 필요해진다.
// 조회는 null 폴백이 맞지만, 쓰기는 조용한 실패가 곧 데이터 유실이기 때문이다.
// 지금은 쓰기 경로가 없어 두지 않는다.
