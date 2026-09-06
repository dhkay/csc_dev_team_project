// 채널 조회 레이어: TanStack Query. apis(frontClient→BFF) 를 queryFn 으로 감싼다.
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/channelsApi';
import type { Channel } from '../types';

/** 쿼리 키 팩토리: 채널 목록은 조직 스코프(BFF 주입)라 단일 키 */
export const channelsKeys = {
  list: () => ['marketing-channels'] as const
};

export function channelsQueryOptions() {
  return queryOptions({
    queryKey: channelsKeys.list(),
    queryFn: async (): Promise<Channel[]> => {
      const res = await api.listChannels();
      if (!res.success) {
        throw new Error(res.error ?? '채널 목록을 불러오지 못했습니다.');
      }
      return res.data;
    }
  });
}
