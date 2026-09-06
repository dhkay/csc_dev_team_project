// 저장된 기획안 조회 레이어: TanStack Query. 개인 워크스페이스 저장본 목록(DB 영구): 채널별로 분리
import { queryOptions } from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import type { SavedPlan } from '../types';
import * as api from '../apis/savedPlanApi';

export const savedPlansKeys = {
  // 버전과 채널이 키에 들어간다. 둘 중 하나만 달라도 다른 워크스페이스이므로 캐시가 섞이면 안 된다.
  //
  // 버전이 키에 있으면 전환 시 무효화가 아예 필요 없다(키가 다르므로 서로를 못 본다)
  // 없으면 전환할 때마다 무효화 목록을 손으로 유지해야 하고 그 목록에서 자원이 빠진다.
  // 버전을 index 1 에 두는 이유: 접두사(`['marketing-saved-plans']`)로 훑는 소비자가 있다.
  list: (version: VersionMode, channelId: number) =>
    ['marketing-saved-plans', version, channelId] as const,
};

/**
 * 저장된 기획안 목록
 *
 * `enabled` 를 소비자가 끌 수 있다. 기획안 구역이 없는 버전(versionProfile.workspaceStages)에서는
 * 그 목록을 아무도 그리지 않는다. 기획안은 만들어지는 도중에 저장되고 곧바로 영상이 되는 중간
 * 산출물이라, 화면에는 그 영상이 선다.
 */
export function savedPlansQueryOptions(version: VersionMode, channelId: number, enabled = true) {
  return queryOptions({
    queryKey: savedPlansKeys.list(version, channelId),
    enabled: browser && enabled,
    queryFn: async (): Promise<SavedPlan[]> => {
      const res = await api.listSavedPlans(version, channelId);
      if (!res.success) {
        throw new Error(res.error ?? '저장된 기획안을 불러오지 못했습니다.');
      }
      return res.data;
    },
  });
}
