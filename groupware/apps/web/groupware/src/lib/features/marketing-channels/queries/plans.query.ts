// 기획서 생성 조회 레이어: TanStack Query.
// 위저드가 고른 요청(PlanGenerationRequest)으로 기획안을 생성한다. 채널이 정해져야 실행(enabled)
//
// 불변식: '기획서 생성' 1회 = 배치 1개 = LLM 생성 정확히 1회
// LLM 생성은 비싸고 비멱등이라(같은 요청도 매번 다른 기획안 + GPU 시간 소모) 자동 재요청을 전부 끈다.
// 재생성은 오직 사용자의 명시적 액션('다시 생성' / '다시 시도' → refetch)뿐이다.
import { queryOptions } from '@tanstack/svelte-query';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import type { GeneratedPlans, PlanGenerationRequest } from '../types';
import * as api from '../apis/planApi';
import { MarketingApiError } from '../lib/modelSetupError';

/**
 * 배치 하나의 쿼리 키. 키 = (버전, 채널, 요청 전체, runId)
 *  - 버전이 index 1 인 이유: 접두사 `['marketing-plans']` 로 "지금 생성 중인가" 를 보는 소비자가 있다.
 *    (그리드 상단 표시). 버전을 앞에 두면 그 접두사가 깨져 표시가 조용히 사라진다.
 *  - 버전이 키에 있어야 하는 이유: 프롬프트 조립 규칙이 버전마다 갈린다. 이 쿼리는 staleTime/gcTime
 *    이 Infinity 라, 키가 같으면 한 버전에서 만든 배치가 다른 버전에서 영원히 재사용된다.
 *  - req 는 객체째 키에 넣는다(TanStack 이 결정적으로 해시): 노브가 늘어도 키 코드는 그대로
 *  - runId 는 생성마다 증가해 매 '기획서 생성'을 새 요청으로 만든다(같은 요청을 다시 골라도 새로 생성)
 *
 * 함수로 내보내는 이유: 취소 경로(cancelQueries/removeQueries)가 같은 키를 손으로 다시 적고
 * 있었고, 버전 축이 여기 추가될 때 그 사본만 옛 모양으로 남았다. 키가 어긋난 취소는 에러 없이
 * 아무 일도 하지 않는다(타일만 사라지고 LLM 은 끝까지 돌아 조직에 과금된다). 조립을 한 곳에 두면
 * 그 종류의 어긋남이 생길 자리가 없다. 지금 이 함수를 쓰는 곳은 아래 쿼리와 lib/cancelGeneratingBatch 다
 */
export function planBatchQueryKey(
  version: VersionMode,
  channelId: number | null,
  req: PlanGenerationRequest,
  runId: number,
) {
  return ['marketing-plans', version, channelId, req, runId] as const;
}

/** 배치 하나의 기획안 생성 쿼리. 키 규칙은 planBatchQueryKey 가 소유한다. */
export function generatePlansQueryOptions(
  version: VersionMode,
  channelId: number | null,
  req: PlanGenerationRequest,
  runId: number,
) {
  return queryOptions({
    queryKey: planBatchQueryKey(version, channelId, req, runId),
    enabled: channelId != null,
    // runId 가 이미 배치별 고유 키라 신선도 관리가 필요 없다. 한 번 생성한 배치는 영원히 그 결과다.
    // staleTime/gcTime 을 0 으로 두면 배치가 잠시라도 언마운트될 때 캐시가 사라져
    // 돌아올 때 refetchOnMount 가 LLM 생성을 처음부터 다시 돌린다.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // 실패해도 자동 재시도 금지(전역 기본 retry: 1 → 사용자가 요청하지 않은 두 번째 LLM 호출)
    // 배치 UI 의 '다시 시도' 로 사용자가 명시적으로 재요청한다.
    retry: false,
    queryFn: async ({ signal }): Promise<GeneratedPlans> => {
      // signal: 배치를 지우면 cancelQueries 가 이 신호를 끊어 생성이 멈춘다(취소 = 삭제)
      const res = await api.generatePlans(version, channelId as number, req, signal); // enabled 가드로 channelId 는 항상 유효
      if (!res.success) {
        // 사유 코드를 함께 던진다. 설정/과금 실패(재시도 무의미)와 일시적 실패를 배치 UI 가 구분해
        //   전자에는 '다시 시도' 를 권하지 않는다(같은 실패를 반복해서 보게 된다)
        throw new MarketingApiError(res.error ?? '기획서를 생성하지 못했습니다.', res.errorCode);
      }
      return res.data;
    },
  });
}
