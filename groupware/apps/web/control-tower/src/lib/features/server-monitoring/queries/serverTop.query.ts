// 리소스 점유 상위 프로세스: on-demand(모달). 짧은 staleTime 으로 재오픈 시 최신화
import { queryOptions } from '@tanstack/svelte-query';
import { fetchServerTop } from '../apis/serversApi';
import { serverKeys } from './keys';
import type { ResourceKey } from '../types';

export function serverTopQueryOptions(
  serverId: string,
  resource: ResourceKey,
  enabled = true,
) {
  return queryOptions({
    queryKey: serverKeys.top(serverId, resource),
    queryFn: () => fetchServerTop(serverId, resource, 8),
    staleTime: 5_000,
    enabled, // disk 등 프로세스 목록이 없는 리소스는 false 로 비활성
  });
}
