/**
 * 생성 중인 배치의 취소: 워크스페이스 그리드와 생성 진행 화면이 함께 쓰는 단일 진입점
 *
 * 취소는 한 동작으로 보이지만 실제로는 셋이고, 순서가 틀리거나 중간에 멈추면 조용히 돈이 나간다.
 * 멈추기 전에 걷어내면 화면에서는 사라졌는데 LLM 은 끝까지 돌아 조직에 과금되고, 멈추기만 하고
 * 걷어내지 않으면 끝나지 않는 타일이 남는다.
 *
 * 취소가 전부 성공했을 때만 폼으로 돌아간다. 절반만 되고 폼이 다시 눌리면 사용자는 멈춘 줄 알고
 * 다시 누르고, 아직 도는 것과 새로 시작한 것 둘에 과금된다.
 *
 * durable 엔진(`@csc/saga`)이 아니라 브라우저용 러너를 쓴다. 근거는 `shared/lib/saga/clientSaga.ts`.
 * 쿼리 키는 `plans.query.ts` 가 소유하고 그것을 쓰는 취소 경로가 이 함수 하나다. 키를 두 곳에
 * 적으면 사본이 옛 모양으로 남고, 어긋난 키의 취소는 에러 없이 아무 일도 하지 않는다.
 */
import type { QueryClient } from '@tanstack/svelte-query';
import {
  planGenerationStore,
  type GenerationBatch,
} from '$lib/shared/lib/stores/planGenerationStore/planGenerationStore.svelte';
import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';
import { runClientSaga, type ClientSagaStep } from '$lib/shared/lib/saga/clientSaga';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import { planBatchQueryKey } from '../queries/plans.query';

interface CancelCtx {
  readonly queryClient: QueryClient;
  readonly version: VersionMode;
  readonly batchId: number;
  // 취소 대상. 이미 걷힌 배치면 없다(그때 각 단계는 할 일이 없다)
  readonly batch: GenerationBatch | undefined;
  // 걷어낸 배치의 사본. `releaseBatch` 의 산출물이고 그 보상이 이것으로 되돌린다.
  readonly releasedBatch?: GenerationBatch;
}

/** 이 배치가 쓰는 쿼리 키. runId 는 배치 id 다(생성 쿼리와 같은 규칙) */
function keyOf(ctx: CancelCtx) {
  if (!ctx.batch) return null;
  return planBatchQueryKey(ctx.version, ctx.batch.channelId, ctx.batch.req, ctx.batchId);
}

/**
 * 취소 단계
 *
 * 순서가 계약이다. 멈추는 것이 먼저이고 걷어내는 것이 나중이다. 그 사이에 실패하면 러너가 뒤
 * 단계를 실행하지 않으므로, 멈추지 못한 작업이 화면에서 사라지는 상태가 만들어지지 않는다.
 */
const CANCEL_STEPS: readonly ClientSagaStep<CancelCtx>[] = [
  {
    // 진행 중인 생성 요청을 끊는다. 되돌릴 것이 없다(끊긴 요청은 되살릴 수 없고 되살릴 이유도 없다)
    //
    // 한계를 적어 둔다: fetch abort 는 이 서버와의 소켓을 닫을 뿐이고, csc-marketing 이 이미
    // language-model 로 보낸 요청은 계속 돈다. 그것까지 끊으려면 그쪽 취소 엔드포인트가 필요하고
    // 아직 없다(marketing-write-consistency.md 4.1). 그 호출이 생기면 이 배열에 단계로 들어온다:
    // 원격 호출이라 실패할 수 있고 실패하면 뒤 단계로 가면 안 되는데, 그 규칙이 이미 여기 있다.
    name: 'abortGeneration',
    async execute(ctx) {
      const key = keyOf(ctx);
      if (key) await ctx.queryClient.cancelQueries({ queryKey: key });
    },
  },
  {
    // 배치를 워크스페이스 목록에서 걷어낸다.
    //
    // 씬 이미지는 여기서 다루지 않는다. 이 경로가 받는 것은 아직 기획안이 도착하지 않은 배치라
    // 씬 이미지 생성이 시작된 적이 없다(도착하면 기획안 하나하나가 선택 단위가 되고 삭제도 그쪽으로 간다)
    name: 'releaseBatch',
    execute(ctx) {
      planGenerationStore.removeBatch(ctx.batchId);
      return { releasedBatch: ctx.batch };
    },
    compensate(ctx) {
      // 걷어낸 뒤 단계가 실패했다. 아직 도는 작업이 화면에서 사라진 채 남으면 사용자는 멈춘 줄
      //   알지만 과금은 계속된다. 되돌려 놓아 보이게 한다.
      if (ctx.releasedBatch) planGenerationStore.restoreBatch(ctx.releasedBatch);
    },
  },
  {
    // 캐시 항목을 지운다. gcTime 이 Infinity 라 남겨두면 죽은 항목이 탭 수명 동안 쌓인다.
    //
    // 마지막에 두는 이유: 배치가 목록에 있는 동안 캐시를 지우면 그 타일이 읽을 것을 잃는다.
    // (`refetchOnMount: false` 라 다시 받지도 않는다). 되돌릴 것은 없다.
    name: 'dropCachedResult',
    execute(ctx) {
      const key = keyOf(ctx);
      if (key) ctx.queryClient.removeQueries({ queryKey: key });
    },
  },
];

/**
 * 배치 하나를 취소한다. 전부 성공했을 때만 true.
 *
 * 멱등: 이미 걷힌 id 는 각 단계가 할 일이 없어 그대로 성공한다(그리드의 일괄 삭제와 진행 화면의
 * 취소가 같은 배치에 겹칠 수 있다)
 *
 * 실패하면 알린다. 취소는 사용자가 누른 동작이라 조용히 실패하면 멈춘 줄 알고 넘어가는데, 그 오해가
 * 정확히 이 함수가 막으려는 것이다.
 */
export async function cancelGeneratingBatch(
  queryClient: QueryClient,
  version: VersionMode,
  batchId: number,
): Promise<boolean> {
  const outcome = await runClientSaga(CANCEL_STEPS, {
    queryClient,
    version,
    batchId,
    batch: planGenerationStore.batch(batchId),
  });

  if (!outcome.ok) {
    toastStore.error(
      '생성을 취소하지 못했습니다',
      '만들던 작업이 아직 진행 중일 수 있습니다. 잠시 후 다시 시도하세요.',
      { key: `plan-batch-cancel-failed:${batchId}` },
    );
  }
  return outcome.ok;
}
