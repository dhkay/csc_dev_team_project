// 진입 채널(개인) 조회 레이어: TanStack Query. 앱바 드롭다운이 별 표시에 쓴다.
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/defaultChannelApi';

/** 쿼리 키 팩토리: 내 진입 채널(단일) */
export const defaultChannelKeys = {
  mine: () => ['marketing-my-default-channel'] as const,
};

export function myDefaultChannelQueryOptions() {
  return queryOptions({
    queryKey: defaultChannelKeys.mine(),
    queryFn: async (): Promise<number | null> => {
      const res = await api.getMyDefaultChannel();
      if (!res.success) throw new Error(res.error ?? '진입 채널을 불러오지 못했습니다.');
      return res.data.channelId;
    },
  });
}
