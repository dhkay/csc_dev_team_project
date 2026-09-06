// 진입 채널(개인) 지정/해제. 성공 시 조회를 invalidate 해 별 표시가 따라간다.
import type { QueryClient } from '@tanstack/svelte-query';
import * as api from '../apis/defaultChannelApi';
import { defaultChannelKeys } from '../queries/defaultChannel.query';

export function setMyDefaultChannelMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (channelId: number | null): Promise<number | null> => {
      const res = await api.setMyDefaultChannel(channelId);
      if (!res.success) throw new Error(res.error ?? '진입 채널을 저장하지 못했습니다.');
      return res.data.channelId;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: defaultChannelKeys.mine() });
    },
  };
}
