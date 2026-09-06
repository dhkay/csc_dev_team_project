// 영상 프로젝트 조회 레이어: TanStack Query. 목록(개인 × 채널) + 렌더 중이면 자동 폴링
import { queryOptions } from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import { type VideoProject, isRenderingStatus } from '../types';
import * as api from '../apis/videoProjectApi';

export const videoProjectsKeys = {
  // 버전과 채널이 키에 들어간다: 둘 중 하나만 달라도 다른 워크스페이스다(savedPlansKeys 참고)
  list: (version: VersionMode, channelId: number) =>
    ['marketing-video-projects', version, channelId] as const,
};

/** 렌더 중(PENDING/RENDERING) 프로젝트가 하나라도 있으면 폴링: 완료/실패로 바뀌면 멈춘다. */
function hasRendering(projects: VideoProject[] | undefined): boolean {
  return (projects ?? []).some((p) => isRenderingStatus(p.renderStatus));
}

/**
 * @param enabled 이 화면이 지금 이 목록을 필요로 하는가. 기본은 참
 *
 *   같은 키를 두 곳이 구독해도 요청은 늘지 않지만(캐시 공유), 아무도 보지 않는 화면에서 4초 폴링이
 *   도는 것은 다른 문제다. 켜고 끌 수 있어야 셸이 창이 열렸을 때만 구독한다.
 */
export function videoProjectsQueryOptions(
  version: VersionMode,
  channelId: number,
  enabled = true,
) {
  return queryOptions({
    queryKey: videoProjectsKeys.list(version, channelId),
    enabled: browser && enabled,
    // 렌더 중이면 4초마다 목록 재조회(백엔드가 잡 상태를 재조정해 완료/URL 을 채운다). 아니면 멈춤
    refetchInterval: (query) => (hasRendering(query.state.data) ? 4000 : false),
    queryFn: async (): Promise<VideoProject[]> => {
      const res = await api.listVideoProjects(version, channelId);
      if (!res.success) {
        throw new Error(res.error ?? '영상 프로젝트를 불러오지 못했습니다.');
      }
      return res.data;
    },
  });
}
