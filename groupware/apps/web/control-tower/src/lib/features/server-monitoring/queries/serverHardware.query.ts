// 정적 하드웨어 상세: on-demand(모달). 하드웨어는 안 바뀌므로 staleTime=Infinity(재오픈 시 캐시 재사용)
import { queryOptions } from '@tanstack/svelte-query';
import { fetchServerHardware } from '../apis/serversApi';
import { serverKeys } from './keys';

export function serverHardwareQueryOptions(serverId: string) {
  return queryOptions({
    queryKey: serverKeys.hardware(serverId),
    queryFn: () => fetchServerHardware(serverId),
    staleTime: Infinity,
  });
}
