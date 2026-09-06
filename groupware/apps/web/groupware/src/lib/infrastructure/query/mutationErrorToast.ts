/**
 * 뮤테이션 실패의 기본 통보: QueryClient 의 MutationCache 에 한 번 꽂아 앱 전역에 적용한다.
 *
 * 캐시 레벨에 두는 이유. 뮤테이션은 사용자가 방금 누른 행동이다. 실패했는데 아무 일도 일어나지
 * 않으면 사용자는 성공한 줄 안다. 배포 재시작 중 500 으로 죽으면 화면에 아무 표시도 남지
 * 않는다(콘솔에만). 호출부마다 onError 를 붙이는 방식은
 * 붙이는 걸 잊은 곳이 조용히 남으므로, 기본값을 한 곳에 두고 예외만 meta 로 선언한다.
 *
 * 낙관적 갱신(onMutate/onError 롤백)을 하는 뮤테이션과 충돌하지 않는다. 캐시 핸들러와 각 뮤테이션의
 * onError 는 함께 실행된다(롤백은 그대로, 통보만 추가)
 */
import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';

/**
 * 뮤테이션별 통보 설정: `createMutation({ meta })` 로 선언한다.
 * 아무것도 주지 않으면 일반 문구로 알린다(통보 자체가 빠지는 일은 없게)
 */
// interface 가 아니라 type 이어야 한다. TanStack 의 MutationMeta 는 `extends Record<string, unknown>`
// 을 검사하고, interface 는 (증강 가능성 때문에) 암묵 인덱스 시그니처를 얻지 못해 그 검사에서 탈락한다.
// 탈락하면 meta 가 조용히 Record<string, unknown> 로 되돌아가 오타를 못 잡는다.
export type MutationErrorMeta = {
  // 알림 제목: 실패한 행동의 이름("기획안 저장에 실패했습니다")
  errorTitle?: string;
  // 재시도 버튼 라벨. 입력이 브라우저에만 있는 뮤테이션에만 준다(실패를 넘기면 되돌릴 수 없는 것)
  // 서버에 이미 있는 것을 다루는 행동(삭제/재렌더 등)은 화면의 버튼을 다시 누르면 되고, 재시도가
  // 멱등하지 않으면 중복 생성 위험이 있어 주지 않는다.
  retryLabel?: string;
  // 그 화면이 자체 에러 UI 를 가지고 있어 전역 알림이 중복인 경우
  silentError?: boolean;
};

// 모든 `createMutation({ meta })` 를 이 형태로 검사시킨다. 오타(errorTitel)는 통보를 조용히
// 사라지게 하므로 컴파일이 잡아야 한다.
declare module '@tanstack/svelte-query' {
  interface Register {
    mutationMeta: MutationErrorMeta;
  }
}

/** 실패 사유: 서버가 준 문구를 그대로 쓴다(조치가 그 문구에 있다). 없으면 일반 안내 */
function detailOf(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : '잠시 후 다시 시도하세요. 계속되면 관리자에게 알려주세요.';
}

/** MutationCache 의 onError 로 그대로 넘긴다(시그니처: error, variables, onMutateResult, mutation) */
export function mutationErrorToast(
  error: unknown,
  variables: unknown,
  _onMutateResult: unknown,
  mutation: {
    mutationId: number;
    meta?: MutationErrorMeta;
    execute: (variables: never) => Promise<unknown>;
  },
): void {
  const meta = mutation.meta;
  if (meta?.silentError) return;

  const retry = meta?.retryLabel;
  toastStore.error(meta?.errorTitle ?? '요청을 처리하지 못했습니다', detailOf(error), {
    // 재시도 버튼이 붙는 알림은 시도마다 따로 띄운다. 같은 key 로 합치면 나중 실패가 앞의 것을
    //   덮어써(스토어 병합이 action 을 교체) 앞의 작업은 되살릴 수단이 사라진다.
    //   버튼이 없는 알림은 제목으로 합쳐 도배를 막는다(장애 중 연타 → '3회')
    key: retry ? `mutation-failed:${mutation.mutationId}` : undefined,
    ...(retry
      ? { action: { label: retry, run: () => void mutation.execute(variables as never) } }
      : {}),
  });
}
