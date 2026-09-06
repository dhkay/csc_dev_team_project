// 보관함 조회 레이어: TanStack Query. 작업 공간 목록과 달리 폴링하지 않는다:
// 보관 대상은 완성본뿐이라(백엔드가 렌더 중 보관을 400 으로 막는다) 상태가 더 바뀌지 않는다.
import { queryOptions } from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import type { ArchivedVideo } from '../types';
import * as api from '../apis/videoArchiveApi';

export const videoArchiveKeys = {
  // 버전만 키에 들어간다: 보관함은 조직 공용이라 채널로 갈리지 않는다.
  //
  // 채널을 키에 두면 채널을 바꿀 때마다 같은 목록을 다시 받고, 한 채널에서 꺼낸 항목이 다른 채널
  // 캐시에는 남아 보인다(같은 데이터의 사본이 채널 수만큼 생긴다)
  //
  // 버전은 있어야 한다: 보관물은 그 버전의 산출물이고, 담기는 표까지 버전마다 다르다.
  list: (version: VersionMode) => ['marketing-video-archive', version] as const,
};

export function videoArchiveQueryOptions(version: VersionMode) {
  return queryOptions({
    queryKey: videoArchiveKeys.list(version),
    enabled: browser,
    queryFn: async (): Promise<ArchivedVideo[]> => {
      const res = await api.listArchivedVideos(version);
      if (!res.success) {
        throw new Error(res.error ?? '보관함을 불러오지 못했습니다.');
      }
      return res.data;
    },
  });
}
