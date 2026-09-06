// 그리드 실시간 폴링: TanStack Query(refetchInterval). apis(frontClient→BFF) 를 queryFn 으로
import { queryOptions } from '@tanstack/svelte-query';
import { fetchServersMetrics } from '../apis/serversApi';
import { serverKeys } from './keys';
import type { ServerWithStatus } from '../types';

/** 3초 간격 폴링. SSR 초기 스냅샷을 initialData 로 시드(초기 렌더 공백 방지) */
export function serversMetricsQueryOptions(initialData: ServerWithStatus[]) {
  return queryOptions({
    queryKey: serverKeys.metrics(),
    queryFn: fetchServersMetrics,
    refetchInterval: 3000,
    staleTime: 0,
    initialData,
  });
}
