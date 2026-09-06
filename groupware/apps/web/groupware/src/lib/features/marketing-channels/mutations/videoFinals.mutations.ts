// 최종 영상 변경 레이어: 세트 적용(원천+세트 → 합성) / 재렌더 / 삭제(낙관적). 성공 시 목록 invalidate.
import type { QueryClient } from '@tanstack/svelte-query';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import * as api from '../apis/videoFinalApi';
import type { VideoFinal } from '../types';
import { videoFinalsKeys } from '../queries/videoFinals.query';

/** 세트 적용: 완성 원천 + 세트 → 최종 합성 잡 등록. 성공 시 목록 invalidate → 최종 탭에 렌더중으로 등장 */
export function createVideoFinalMutationOptions(queryClient: QueryClient, version: VersionMode,
  channelId: number) {
  return {
    meta: { errorTitle: '최종영상 만들기를 시작하지 못했습니다' },
    mutationFn: async (input: {
      sourceId: number;
      setId: number;
      // 멱등키: 이 클릭 한 번. 재시도가 같은 값을 보내면 합성 잡이 두 번 만들어지지 않는다.
      clientRequestId?: string;
    }): Promise<VideoFinal> => {
      const res = await api.createVideoFinal(version, input);
      if (!res.success) throw new Error(res.error ?? '세트 적용에 실패했습니다.');
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: videoFinalsKeys.list(version, channelId) });
    },
  };
}

/** 재렌더: 저장된 세트 스냅샷 + 원천으로 새 합성 잡. 성공 시 목록 invalidate(다시 렌더중) */
export function rerenderVideoFinalMutationOptions(queryClient: QueryClient, version: VersionMode,
  channelId: number) {
  return {
    meta: { errorTitle: '최종영상 다시 만들기를 시작하지 못했습니다' },
    mutationFn: async (id: number): Promise<VideoFinal> => {
      const res = await api.rerenderVideoFinal(version, id);
      if (!res.success) throw new Error(res.error ?? '다시 만들기에 실패했습니다.');
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: videoFinalsKeys.list(version, channelId) });
    },
  };
}

/** 삭제: 낙관적 제거 후 실패 시 롤백 */
export function deleteVideoFinalMutationOptions(queryClient: QueryClient, version: VersionMode,
  channelId: number) {
  return {
    meta: { errorTitle: '최종영상을 삭제하지 못했습니다' },
    mutationFn: async (id: number): Promise<void> => {
      const res = await api.deleteVideoFinal(version, id);
      if (!res.success) throw new Error(res.error ?? '최종 영상 삭제에 실패했습니다.');
    },
    onMutate: async (id: number): Promise<{ prev?: VideoFinal[] }> => {
      await queryClient.cancelQueries({ queryKey: videoFinalsKeys.list(version, channelId) });
      const prev = queryClient.getQueryData<VideoFinal[]>(videoFinalsKeys.list(version, channelId));
      if (prev) {
        queryClient.setQueryData<VideoFinal[]>(
          videoFinalsKeys.list(version, channelId),
          prev.filter((f) => f.id !== id),
        );
      }
      return { prev };
    },
    onError: (_e: unknown, _id: number, ctx: { prev?: VideoFinal[] } | undefined): void => {
      if (ctx?.prev) queryClient.setQueryData(videoFinalsKeys.list(version, channelId), ctx.prev);
    },
    onSettled: (): void => {
      void queryClient.invalidateQueries({ queryKey: videoFinalsKeys.list(version, channelId) });
    },
  };
}
