/**
 * 씬 이미지가 설정이나 과금 사유로 막혔을 때 그 배치를 자동으로 걷어낸다.
 *
 * 사용자가 직접 삭제하는 경로는 취소 사가(`cancelGeneratingBatch.ts`)의 것이다. 같은 일을 하는
 * 길이 둘이면 다음 사람이 아무 쪽에나 붙인다.
 *
 * 씬 하나만 실패로 두지 않는 이유는 키 미등록과 한도 초과가 그 배치의 모든 씬을 같은 이유로
 * 실패시키기 때문이다. 남겨두면 씬마다 헛된 재시도 버튼이 남고 이미지가 빠진 반쪽 기획안 타일이
 * 화면에 남아 사용자가 살릴 수 있다고 오해한다.
 *
 * 상태를 여기서 들지 않는다. 이미 취소했는지는 스토어의 removed 집합이 답한다.
 */
import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';
import { planSceneImagesStore } from '$lib/shared/lib/stores/planSceneImagesStore/planSceneImagesStore.svelte';
import type { PlanProposal } from '../types';

/** 사유가 비어 있을 때의 안내: 빈 알림을 띄우지 않는다. */
const FALLBACK_DETAIL =
  'AI 모델을 호출할 수 없어 기획안 만들기를 취소했습니다. 관리자 시스템 환경설정의 API 키 등록과 설정의 채널 모델 선택을 확인하세요.';

/**
 * 배치를 걷어내고 사유를 알린다. 씬 생성 중단 + 타일 제거 + 알림(1회)
 *
 * 멱등: 이미 전부 제거된 배치는 아무것도 하지 않는다. 같은 사유로 여러 씬이 동시에 실패해도 알림은
 * 하나다(그 상황이 이 함수의 평범한 입력이다)
 *
 * @param detail 사유(알림 본문). 비어 있으면 FALLBACK_DETAIL.
 */
export function cancelPlanBatch(
  batchId: number,
  proposals: readonly PlanProposal[],
  detail?: string,
): void {
  const live = proposals.filter((p) => !planSceneImagesStore.isRemoved(batchId, p.id));
  if (live.length === 0) return;

  planSceneImagesStore.abort(batchId); // 대기/진행 중인 씬 생성 중단(같은 사유로 실패할 호출을 더 보내지 않는다)
  for (const p of live) planSceneImagesStore.remove(batchId, p);

  // 제목은 텍스트 생성 실패 알림과 같은 어휘를 쓴다. 사용자에게는 '기획서 만들기' 한 작업이 취소된 것이다.
  //   (씬 이미지에서 막혔는지 텍스트에서 막혔는지는 사유 문구가 말한다)
  toastStore.error('기획서 만들기가 취소되었습니다', detail?.trim() || FALLBACK_DETAIL, {
    // 배치 단위 키: 씬 여러 개가 같은 사유로 실패해도 알림은 하나로 합쳐진다.
    key: `plan-batch-cancelled:${batchId}`,
  });
}
