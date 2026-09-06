/**
 * 보조 데이터 조회의 실패를 폴백으로 접되 조용히 넘기지 않는다.
 *
 * 표시용 조인(이름 로스터, 진입 기본값)은 실패해도 화면이 떠야 한다. 호출부마다 손으로
 * `try { ... } catch { return 폴백 }` 을 쓰면 그 침묵이 사고를 키운다. 조회가 깨진 것인지
 * 데이터가 없는 것인지 화면만으로는 구분할 수 없다.
 *
 * 이 헬퍼가 주는 것 셋.
 *   1. 실패가 항상 서버 로그에 남는다(같은 접두사라 컨테이너 로그에서 한 번에 걸린다)
 *   2. `softLoad(` 를 grep 하면 화면이 조용히 나빠질 수 있는 자리 전부가 나온다.
 *   3. 폴백값이 인자로 드러나므로 무엇으로 접는지가 호출부에서 바로 읽힌다.
 *
 * 실패가 곧 오류인 경로에는 쓰지 않는다. 그건 던져서 500 이나 에러 화면이 되어야 한다.
 */

/**
 * 로그에 남길 안전한 요약
 *
 * 에러 객체를 그대로 로그에 넘기면 안 된다. 서버 클라이언트(axios)는 요청 인터셉터로
 * `X-Service-Token` 과 `Authorization: Bearer <액세스 토큰>` 을 주입하고, 응답 에러 정규화가 없어
 * 실패 시 `AxiosError` 가 그대로 올라온다. 그 객체는 `config.headers` 를 enumerable 로 들고 있어
 * `console.warn(err)` 이 두 토큰을 평문으로 출력한다(실측 확인)
 *
 * 그래서 진단에 필요한 것만 뽑는다. 이름, 메시지, 상태코드다. 헤더와 요청 설정은 넣지 않는다.
 * URL 도 넣지 않는다: 어느 조회인지는 호출부가 넘긴 `what` 이 이미 말해 준다.
 */
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const status = (err as { statusCode?: number; response?: { status?: number } }).statusCode ??
    (err as { response?: { status?: number } }).response?.status;
  return status == null ? `${err.name}: ${err.message}` : `${err.name}(${status}): ${err.message}`;
}

export async function softLoad<T>(what: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (err) {
    console.warn(`[soft-load] ${what} 조회 실패, 폴백 사용: ${describeError(err)}`);
    return fallback;
  }
}