/**
 * 렌더 취소 통보: 서버가 되돌린 작업을 실어 오면 사유를 알린다.
 *
 * 취소된 항목은 산출물이 없어 카드로 그리지 않으므로 화면에서 조용히 사라진다. 그래서 사라진
 * 이유를 전역 알림으로 말해 준다.
 *
 * "한 번만" 은 서버가 보장한다. 목록 쿼리가 이미 취소된 행을 제외하므로 취소된 항목이 응답에
 * 실리는 것은 그 전이를 만든 폴링 한 번뿐이다. 그래서 여기에 이미 알렸는지 기억을 두지 않는다.
 * 클라이언트에 두면 탭 수명에만 유효해서 새로고침하면 과거 취소가 전부 다시 뜬다.
 *
 * 문구는 사유 코드(errorCode)가 정한다(renderFailure). 코드를 모르는 실패만 서버가 준 error 를
 * 그대로 쓴다. 문장으로 사유를 가르면 벤더가 문구를 바꾸는 날 조용히 어긋난다.
 */
import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';
import { isRolledBackStatus, type RenderStatus } from '../types';
import {
  cancellationNotice,
  type FailedRender,
  type RenderFailureActions,
} from './renderFailure';

/** 알림에 필요한 최소 형태: 원천영상/최종영상 둘 다 구조적으로 만족한다. */
export type CancellableRender = FailedRender;

/** 통보 대상 종류: 문구와 알림 병합 키에 쓰인다. */
export type RenderKind = '원천영상' | '최종영상';

/** 빈 결과는 이 상수를 돌려준다. `$derived` 가 참조 동일성으로 전파를 멈출 수 있게 */
const EMPTY: readonly never[] = Object.freeze([]);

/** 되돌려진 항목만 골라낸다. 없으면 매번 같은 빈 배열(전파 차단) */
export function rolledBackRenders<T extends { renderStatus: RenderStatus }>(
  items: readonly T[] | undefined,
): readonly T[] {
  if (!items?.length) return EMPTY;
  const rolled = items.filter((item) => isRolledBackStatus(item.renderStatus));
  return rolled.length > 0 ? rolled : EMPTY;
}

/**
 * 취소된 항목의 사유를 알린다. 호출부는 `rolledBackRenders` 결과를 넘긴다(빈 배열이면 no-op)
 * actions 는 알림 버튼이 부를 동작(설정 열기). 주지 않으면 버튼 없이 문구만 뜬다.
 */
export function notifyRenderCancellations(
  items: readonly CancellableRender[],
  kind: RenderKind,
  actions: RenderFailureActions = {},
): void {
  for (const item of items) {
    const notice = cancellationNotice(item, actions);
    toastStore.error(`${kind} 「${item.title}」 ${notice.reason}`, notice.detail, {
      // 병합 키: 같은 항목이 여러 경로(탭 전환, 재조회)에서 발견돼도 알림은 하나로 합쳐진다.
      key: `render-cancelled:${kind}:${item.id}`,
      ...(notice.action ? { action: notice.action } : {}),
    });
  }
}

/**
 * 화면에 그릴 항목만 남긴다. 되돌려진 작업은 카드로 만들지 않는다.
 * 걸러낼 것이 없으면 입력 배열을 그대로 돌려준다: TanStack 이 유지하는 참조 동일성을 깨지 않아
 * 폴링 틱마다 그리드 재diff 와 파생 재계산이 연쇄하지 않는다(취소는 예외적 사건이라 대부분 이 경로)
 */
export function visibleRenders<T extends { renderStatus: RenderStatus }>(
  items: readonly T[] | undefined,
): readonly T[] {
  if (!items?.length) return EMPTY;
  const kept = items.filter((item) => !isRolledBackStatus(item.renderStatus));
  return kept.length === items.length ? items : kept;
}

/**
 * 워크스페이스 목록에 그릴 항목. `visibleRenders` 에 배치된 것만 조건을 얹는다.
 *
 * `placedOnly` 를 버전이 아니라 불리언으로 받는 이유는 이 파일이 버전 축을 모르기 때문이다.
 * 그 근거는 확정 단계의 유무다. 생성 창이 마지막에 배치를 확정하는 버전에서는 그것을 거친 영상만
 * 이 목록에 선다. 확정 단계가 없는 버전은 만들기가 곧 확정이고 이 목록이 렌더를 지켜보는 유일한
 * 자리라, 걸러 내면 누른 뒤 아무 흔적도 남지 않는다.
 *
 * 완성 여부를 따로 보지 않는다. 배치는 완성본에만 열려 있어(서버가 400 으로 막는다) 배치된 것은
 * 이미 완성본이고, 두 조건을 겹치면 같은 규칙을 두 곳에서 정하게 된다.
 */
export function workspaceRenders<T extends { renderStatus: RenderStatus; placedAt?: string | null }>(
  items: readonly T[] | undefined,
  placedOnly: boolean,
): readonly T[] {
  const visible = visibleRenders(items);
  if (!placedOnly) return visible;
  const placed = visible.filter((item) => item.placedAt != null);
  return placed.length === visible.length ? visible : placed;
}
