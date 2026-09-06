// 채널 변경 레이어: 생성/편집(이름)/삭제. 성공 시 채널 목록 invalidate.
import type { QueryClient } from '@tanstack/svelte-query';
import * as api from '../apis/channelsApi';
import type { Channel } from '../types';
import { channelsKeys } from '../queries/channels.query';

interface CreateChannelVars {
  name: string;
}
interface UpdateChannelVars {
  id: number;
  name: string;
}

export function createChannelMutationOptions(queryClient: QueryClient) {
  return {
    // 이 화면은 자체 에러 배너를 띄운다. 전역 알림까지 뜨면 같은 말이 두 번
    meta: { silentError: true },
    mutationFn: async (vars: CreateChannelVars): Promise<Channel> => {
      const res = await api.addChannel(vars.name);
      if (!res.success) throw new Error(res.error ?? '채널 추가에 실패했습니다.');
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelsKeys.list() });
    }
  };
}

export function updateChannelMutationOptions(queryClient: QueryClient) {
  return {
    // 이 화면은 자체 에러 배너를 띄운다. 전역 알림까지 뜨면 같은 말이 두 번
    meta: { silentError: true },
    mutationFn: async (vars: UpdateChannelVars): Promise<Channel> => {
      const res = await api.updateChannel(vars.id, vars.name);
      if (!res.success) throw new Error(res.error ?? '채널 편집에 실패했습니다.');
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelsKeys.list() });
    }
  };
}

export function reorderChannelMutationOptions(queryClient: QueryClient) {
  return {
    // 이 화면은 자체 에러 배너를 띄운다. 전역 알림까지 뜨면 같은 말이 두 번
    meta: { silentError: true },
    mutationFn: async (orderedIds: number[]): Promise<void> => {
      const res = await api.reorderChannels(orderedIds);
      if (!res.success) throw new Error(res.error ?? '채널 순서 변경에 실패했습니다.');
    },
    // 드래그 중 캐시를 낙관적으로 재정렬해 두므로, 정산 시 서버와 재동기화(성공=확정, 실패=롤백)
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: channelsKeys.list() });
    }
  };
}


export function deleteChannelMutationOptions(queryClient: QueryClient) {
  return {
    // 이 화면은 자체 에러 배너를 띄운다. 전역 알림까지 뜨면 같은 말이 두 번
    meta: { silentError: true },
    mutationFn: async (id: number): Promise<void> => {
      const res = await api.removeChannel(id);
      if (!res.success) throw new Error(res.error ?? '채널 삭제에 실패했습니다.');
    },
    onSuccess: () => {
      // 채널 목록 갱신(서버가 대표 폴백을 자동 승격)
      void queryClient.invalidateQueries({ queryKey: channelsKeys.list() });
    }
  };
}
