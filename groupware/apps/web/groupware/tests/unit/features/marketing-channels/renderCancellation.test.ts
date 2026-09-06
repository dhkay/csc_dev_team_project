/**
 * 렌더 취소 통보 테스트
 *
 * 폴링은 같은 목록을 4초마다 실어 온다. 한 번만 알린다가 깨지면 화면이 도배된다. 그리고 취소된
 * 항목이 목록에서 걷히지 않으면 사용자는 산출물 없는 카드를 보게 된다. 둘 다 여기서 고정한다.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  notifyRenderCancellations,
  rolledBackRenders,
  visibleRenders,
  workspaceRenders,
  type CancellableRender
} from '$lib/features/marketing-channels/lib/renderCancellation';
import {
  cancellationNotice,
  isRenderFailureCode,
  notifyRenderLimits,
  RENDER_FAILURE_CODES,
  resetRenderLimitNotices
} from '$lib/features/marketing-channels/lib/renderFailure';
import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';

type Listed = CancellableRender & { placedAt: string | null };

const item = (over: Partial<Listed> = {}): Listed => ({
  id: 1,
  title: '테스트 영상',
  renderStatus: 'CANCELLED',
  error: '자체 이미지 엔진에 연결할 수 없습니다.',
  placedAt: null,
  ...over
});

describe('renderCancellation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toastStore.clear();
  });

  afterEach(() => {
    toastStore.clear();
    vi.useRealTimers();
  });

  it('취소된 항목의 사유를 알린다. 서버 문구를 그대로 쓴다', () => {
    notifyRenderCancellations([item()], '원천영상');

    expect(toastStore.items).toHaveLength(1);
    expect(toastStore.items[0].variant).toBe('error');
    expect(toastStore.items[0].title).toContain('원천영상');
    // 어떤 작업이 사라졌는지 알 수 있어야 한다(카드가 이미 목록에서 걷혔으므로)
    expect(toastStore.items[0].title).toContain('테스트 영상');
    expect(toastStore.items[0].detail).toBe('자체 이미지 엔진에 연결할 수 없습니다.');
  });

  it('같은 항목이 두 번 발견돼도 알림은 하나로 합쳐진다(스토어 병합 키)', () => {
    // 재알림 방지는 서버가 담당한다(취소된 행은 다음 폴링부터 목록에서 제외). 그래도 탭 전환/재조회로
    //   같은 응답을 두 번 볼 수 있어, 알림이 두 개로 쌓이지 않는 것은 여기서 보장한다.
    const list = [item()];
    notifyRenderCancellations(list, '원천영상');
    notifyRenderCancellations(list, '원천영상');

    expect(toastStore.items).toHaveLength(1);
    expect(toastStore.items[0].count).toBe(2);
  });

  it('rolledBackRenders 는 되돌려진 것만 고르고, 없으면 같은 빈 배열을 준다(전파 차단)', () => {
    const none = rolledBackRenders([item({ renderStatus: 'RENDERING' })]);
    expect(none).toHaveLength(0);
    // 참조가 같아야 $derived 가 전파를 멈춘다. 폴링 틱마다 effect 가 재실행되지 않는 근거
    expect(rolledBackRenders([item({ renderStatus: 'COMPLETED' })])).toBe(none);

    const some = rolledBackRenders([item({ id: 1 }), item({ id: 2, renderStatus: 'COMPLETED' })]);
    expect(some.map((x) => x.id)).toEqual([1]);
  });

  it('원천영상과 최종영상은 id 가 같아도 각각 알린다', () => {
    notifyRenderCancellations([item({ id: 7 })], '원천영상');
    notifyRenderCancellations([item({ id: 7 })], '최종영상');
    expect(toastStore.items).toHaveLength(2);
  });

  it('사유가 비어 있으면 기본 안내로 대체한다. 빈 알림을 띄우지 않는다', () => {
    notifyRenderCancellations([item({ error: '   ' })], '최종영상');
    expect(toastStore.items[0].detail).toContain('작업이 취소되었습니다');
  });

  it('사유 코드가 있으면 사람 말로 알린다. 벤더 원문은 보이지 않는다', () => {
    // 서버 문구가 다듬어져도 제목과 내용은 코드에서 나오므로 흔들리지 않는다.
    notifyRenderCancellations(
      [item({ errorCode: 'quota_exceeded', error: 'Gemini 요청 한도 초과(429): {"error":...}' })],
      '원천영상'
    );
    expect(toastStore.items[0].title).toContain('횟수를 모두 썼어요');
    expect(toastStore.items[0].detail).toContain('다른 영상 모델');
    expect(toastStore.items[0].detail).not.toContain('429');
    // 동작을 주지 않으면 버튼도 없다(주소를 모르는 자리에서 부를 수 있게)
    expect(toastStore.items[0].action).toBeUndefined();
  });

  it('설정 열기 동작을 주면 알림에 버튼이 붙는다', () => {
    const open = vi.fn();
    notifyRenderCancellations([item({ errorCode: 'credit_exhausted' })], '원천영상', {
      openModelSettings: open
    });
    const action = toastStore.items[0].action;
    expect(action?.label).toContain('설정');
    action?.run();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('Gemini 모델의 일일 한도에는 초기화 시각을 덧붙인다. 다른 모델에는 붙이지 않는다', () => {
    const gemini = cancellationNotice({
      errorCode: 'quota_exceeded',
      videoModel: 'gemini/veo-3.1-fast-generate-preview'
    });
    expect(gemini.detail).toContain('태평양');
    const other = cancellationNotice({ errorCode: 'quota_exceeded', videoModel: 'higgsfield/x' });
    expect(other.detail).not.toContain('태평양');
  });

  it('모르는 코드는 사유 없는 기본 제목과 서버 문장으로 접는다. 서버가 사유를 늘려도 화면이 깨지지 않게', () => {
    const unknown = cancellationNotice({ errorCode: 'something_new', error: '서버가 준 문장' });
    expect(unknown.reason).toBe(cancellationNotice({ errorCode: null }).reason);
    expect(unknown.detail).toBe('서버가 준 문장');
    expect(cancellationNotice({ errorCode: 'credit_exhausted' }).reason).toContain('크레딧');
  });

  it('화면이 아는 코드는 전부 사유 있는 문구를 갖는다. 서버 enum 사본이 빠지면 여기서 드러난다', () => {
    const generic = cancellationNotice({ errorCode: null }).reason;
    for (const code of RENDER_FAILURE_CODES) {
      expect(isRenderFailureCode(code)).toBe(true);
      expect(cancellationNotice({ errorCode: code }).reason, code).not.toBe(generic);
    }
    expect(isRenderFailureCode('something_new')).toBe(false);
  });

  it('레거시 FAILED 도 취소로 취급한다(규칙 이전 기록)', () => {
    notifyRenderCancellations([item({ renderStatus: 'FAILED' })], '원천영상');
    expect(toastStore.items).toHaveLength(1);
  });

  it('진행 중/완료 항목은 알리지 않는다', () => {
    notifyRenderCancellations(
      rolledBackRenders([
        item({ id: 1, renderStatus: 'RENDERING' }),
        item({ id: 2, renderStatus: 'COMPLETED' }),
        item({ id: 3, renderStatus: 'STALLED' })
      ]),
      '원천영상'
    );
    expect(toastStore.items).toHaveLength(0);
  });

  it('visibleRenders 는 되돌려진 작업을 걷어낸다. 산출물 없는 카드를 그리지 않게', () => {
    const visible = visibleRenders([
      item({ id: 1, renderStatus: 'COMPLETED' }),
      item({ id: 2, renderStatus: 'CANCELLED' }),
      item({ id: 3, renderStatus: 'FAILED' }),
      item({ id: 4, renderStatus: 'RENDERING' })
    ]);
    expect(visible.map((v) => v.id)).toEqual([1, 4]);
  });

  it('undefined(첫 로드 전)를 안전하게 다룬다', () => {
    expect(() => notifyRenderCancellations(rolledBackRenders(undefined), '원천영상')).not.toThrow();
    expect(visibleRenders(undefined)).toEqual([]);
  });

  it('visibleRenders 는 걸러낼 것이 없으면 입력 배열을 그대로 준다. 참조 동일성 보존', () => {
    // 새 배열을 만들면 폴링 틱마다 그리드 재diff 와 파생 재계산이 연쇄한다(취소는 예외적 사건)
    const items = [item({ id: 1, renderStatus: 'COMPLETED' }), item({ id: 2, renderStatus: 'RENDERING' })];
    expect(visibleRenders(items)).toBe(items);
  });
});

describe('notifyRenderLimits (렌더 중 한도 경고)', () => {
  beforeEach(() => {
    toastStore.clear();
    resetRenderLimitNotices();
  });

  afterEach(() => toastStore.clear());

  it('렌더 중 한도에 걸린 항목을 경고로 알린다. 취소가 아니라 기다리라는 말이다', () => {
    notifyRenderLimits(
      [item({ renderStatus: 'RENDERING', errorCode: 'rate_limited', error: 'Gemini 요청 한도 초과(429)' })],
      '원천영상'
    );
    expect(toastStore.items).toHaveLength(1);
    expect(toastStore.items[0].variant).toBe('warning');
    expect(toastStore.items[0].title).toContain('기다리는 중');
    // 벤더 원문(429 JSON)이 아니라 무엇을 하면 되는지를 말한다
    expect(toastStore.items[0].detail).toContain('그대로 두셔도');
    expect(toastStore.items[0].detail).not.toContain('429');
  });

  it('같은 항목은 폴링이 반복돼도 한 번만 알린다', () => {
    // 경고는 자동 소멸하므로 병합 키만으로는 사라진 뒤 다음 폴링에 다시 뜬다. 기억이 그것을 막는다.
    const list = [item({ renderStatus: 'RENDERING', errorCode: 'rate_limited' })];
    notifyRenderLimits(list, '원천영상');
    toastStore.clear();
    notifyRenderLimits(list, '원천영상');
    expect(toastStore.items).toHaveLength(0);
  });

  it('한도가 아니거나 이미 끝난 항목은 알리지 않는다', () => {
    notifyRenderLimits(
      [
        item({ renderStatus: 'RENDERING', errorCode: null }),
        item({ id: 2, renderStatus: 'RENDERING', errorCode: 'content_rejected' }),
        item({ id: 3, renderStatus: 'CANCELLED', errorCode: 'rate_limited' })
      ],
      '원천영상'
    );
    expect(toastStore.items).toHaveLength(0);
    expect(() => notifyRenderLimits(undefined, '원천영상')).not.toThrow();
  });
});

describe('workspaceRenders (목록에 그릴 렌더)', () => {
  const PLACED = '2026-09-01T00:00:00.000Z';
  const placed = item({ id: 1, renderStatus: 'COMPLETED', placedAt: PLACED });
  // 완성됐지만 아직 창의 마지막 단계를 거치지 않은 것. 확정 단계가 있는 버전에서는 이것이 핵심이다.
  const unplaced = item({ id: 5, renderStatus: 'COMPLETED', placedAt: null });
  const running = item({ id: 2, renderStatus: 'RENDERING' });
  const pending = item({ id: 3, renderStatus: 'PENDING' });
  const cancelled = item({ id: 4, renderStatus: 'CANCELLED' });

  it('확정 단계가 없으면 만들어지는 중인 것도 그린다', () => {
    // 그 버전에서는 만들기가 곧 확정이고, 이 목록이 렌더를 지켜보는 유일한 자리다. 빼면 누른 뒤
    //   아무 흔적도 남지 않는다(배치 여부는 보지 않는다)
    const kept = workspaceRenders([placed, running, pending, cancelled, unplaced], false);
    expect(kept.map((i) => i.id)).toEqual([1, 2, 3, 5]); // 취소만 걷힌다
  });

  it('확정 단계가 있으면 배치된 것만 그린다', () => {
    // 만들어졌다고 그 사람의 것이 되지는 않는다. 창의 마지막 단계('영상 생성')를 거친 것만 선다.
    const kept = workspaceRenders([placed, running, pending, cancelled, unplaced], true);
    expect(kept.map((i) => i.id)).toEqual([1]);
  });

  it('걸러낼 것이 없으면 입력 배열을 그대로 돌려준다', () => {
    // 참조 동일성: 폴링 틱마다 새 배열을 만들면 그리드 재diff 와 파생 재계산이 연쇄한다.
    const all = [placed];
    expect(workspaceRenders(all, true)).toBe(all);
    expect(workspaceRenders(all, false)).toBe(all);
  });

  it('빈 입력에도 안전하다', () => {
    expect(workspaceRenders(undefined, true)).toEqual([]);
    expect(workspaceRenders([], true)).toEqual([]);
  });
});
