// 최종 영상 조회 레이어: TanStack Query. 목록(개인) + 렌더 중이면 자동 폴링
import { queryOptions } from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import { type VideoFinal, isRenderingStatus } from '../types';
import * as api from '../apis/videoFinalApi';

export const videoFinalsKeys = {
  // 버전과 채널이 키에 들어간다: 둘 중 하나만 달라도 다른 워크스페이스다(savedPlansKeys 참고)
  list: (version: VersionMode, channelId: number) =>
    ['marketing-video-finals', version, channelId] as const,
};

/** 렌더 중(PENDING/RENDERING) 최종이 하나라도 있으면 폴링: 완료/실패로 바뀌면 멈춘다. */
function hasRendering(finals: VideoFinal[] | undefined): boolean {
  return (finals ?? []).some((f) => isRenderingStatus(f.renderStatus));
}

/**
 * 최종 영상 목록
 *
 * `enabled` 를 소비자가 끌 수 있다. 최종 구역이 없는 버전(versionProfile.workspaceStages)에서는
 * 이 목록이 늘 비어 있고 아무도 그리지 않으므로, 채널을 열 때마다 답이 정해진 조회를 한 번 하는
 * 셈이 된다. 그 버전은 세트를 만들 수 없어 최종본이 생길 방법 자체가 없다.
 */
export function videoFinalsQueryOptions(
  version: VersionMode,
  channelId: number,
  enabled = true,
) {
  return queryOptions({
    queryKey: videoFinalsKeys.list(version, channelId),
    enabled: browser && enabled,
    // 렌더 중이면 4초마다 재조회(백엔드가 잡 상태를 재조정해 완료/URL 을 채운다). 아니면 멈춤
    refetchInterval: (query) => (hasRendering(query.state.data) ? 4000 : false),
    queryFn: async (): Promise<VideoFinal[]> => {
      const res = await api.listVideoFinals(version, channelId);
      if (!res.success) {
        throw new Error(res.error ?? '최종 영상을 불러오지 못했습니다.');
      }
      return res.data;
    },
  });
}
