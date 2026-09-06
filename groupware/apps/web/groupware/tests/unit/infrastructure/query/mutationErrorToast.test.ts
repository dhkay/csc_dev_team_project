/**
 * 뮤테이션 실패 기본 통보 테스트
 *
 * 이 핸들러가 없던 동안 배포 재시작 중 '영상 만들기'/기획안 저장이 500 으로 죽어도 화면에 아무 표시가
 * 없었다(콘솔에만): 사용자는 성공한 줄 안다. 그 조용한 실패가 다시 생기지 않게 계약을 고정한다:
 *   - meta 가 없어도 알린다(통보 누락 금지)
 *   - 자체 에러 UI 가 있는 화면은 침묵(중복 금지)
 *   - 재시도 버튼이 붙은 알림은 시도마다 따로 뜬다(합치면 앞의 작업을 되살릴 수단이 사라진다)
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mutationErrorToast } from '$lib/infrastructure/query/mutationErrorToast';
import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';

/** MutationCache 가 넘겨주는 mutation 중 이 핸들러가 쓰는 부분만 */
function fakeMutation(id: number, meta?: Record<string, unknown>) {
  return { mutationId: id, meta, execute: vi.fn(async () => undefined) };
}

const call = (
  error: unknown,
  mutation: ReturnType<typeof fakeMutation>,
  variables: unknown = { id: 1 },
) => mutationErrorToast(error, variables, undefined, mutation);

describe('mutationErrorToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toastStore.clear();
  });

  afterEach(() => {
    toastStore.clear();
    vi.useRealTimers();
  });

  it('meta 가 없어도 알린다. 통보가 빠지는 뮤테이션은 없어야 한다', () => {
    call(new Error('Request failed with status code 500'), fakeMutation(1));

    expect(toastStore.items).toHaveLength(1);
    expect(toastStore.items[0].variant).toBe('error');
    expect(toastStore.items[0].title).toBe('요청을 처리하지 못했습니다');
    expect(toastStore.items[0].detail).toContain('500');
  });

  it('meta.errorTitle 로 어떤 행동이 실패했는지 말한다', () => {
    call(new Error('보관함 항목 삭제에 실패했습니다.'), fakeMutation(1, {
      errorTitle: '보관된 영상을 삭제하지 못했습니다',
    }));
    expect(toastStore.items[0].title).toBe('보관된 영상을 삭제하지 못했습니다');
  });

  it('사유가 없으면 일반 안내로 대체한다', () => {
    call({ weird: true }, fakeMutation(1));
    expect(toastStore.items[0].detail).toContain('다시 시도');
  });

  it('silentError 인 뮤테이션은 알리지 않는다. 그 화면이 직접 표시한다', () => {
    call(new Error('실패'), fakeMutation(1, { silentError: true }));
    expect(toastStore.items).toHaveLength(0);
  });

  it('retryLabel 이 있으면 그 입력으로 다시 실행하는 버튼을 준다', () => {
    const m = fakeMutation(1, { errorTitle: '기획안 저장에 실패했습니다', retryLabel: '다시 저장' });
    const vars = { proposal: 'p1' };
    call(new Error('네트워크'), m, vars);

    const action = toastStore.items[0].action;
    expect(action?.label).toBe('다시 저장');
    action?.run();
    expect(m.execute).toHaveBeenCalledWith(vars);
  });

  it('재시도 알림은 시도마다 따로 뜬다. 합치면 앞 작업의 재시도 수단이 사라진다', () => {
    const a = fakeMutation(1, { errorTitle: '기획안 저장에 실패했습니다', retryLabel: '다시 저장' });
    const b = fakeMutation(2, { errorTitle: '기획안 저장에 실패했습니다', retryLabel: '다시 저장' });
    call(new Error('네트워크'), a, { proposal: 'p1' });
    call(new Error('네트워크'), b, { proposal: 'p2' });

    expect(toastStore.items).toHaveLength(2);
    // 각 알림이 자기 입력을 되살린다.
    toastStore.items[0].action?.run();
    expect(a.execute).toHaveBeenCalledWith({ proposal: 'p1' });
    expect(b.execute).not.toHaveBeenCalled();
  });

  it('버튼 없는 알림은 제목으로 합쳐 도배를 막는다. 장애 중 연타', () => {
    const title = '원천영상 만들기를 시작하지 못했습니다';
    call(new Error('502'), fakeMutation(1, { errorTitle: title }));
    call(new Error('502'), fakeMutation(2, { errorTitle: title }));
    call(new Error('502'), fakeMutation(3, { errorTitle: title }));

    expect(toastStore.items).toHaveLength(1);
    expect(toastStore.items[0].count).toBe(3);
  });
});
