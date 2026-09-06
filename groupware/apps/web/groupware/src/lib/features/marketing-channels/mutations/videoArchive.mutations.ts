// 보관함 변경 레이어: 보내기 / 꺼내기 / 영구삭제
//
// 보내기와 꺼내기는 이동이라 작업 공간 목록과 보관함 목록이 함께 바뀐다 → 양쪽 키를 모두 invalidate.
// 한쪽만 무효화하면 옮긴 항목이 원래 자리에 남아 있는 것처럼 보인다(복사처럼 보이는 버그)
import type { QueryClient } from '@tanstack/svelte-query';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import * as api from '../apis/videoArchiveApi';
import type { ApiResult } from '../apis/result';
import type { ArchivedVideo, VideoCard } from '../types';
import { videoFinalsKeys } from '../queries/videoFinals.query';
import { videoProjectsKeys } from '../queries/videoProjects.query';
import { videoArchiveKeys } from '../queries/videoArchive.query';

/**
 * 이동 mutation 공통: 방향이 달라도 양쪽 키를 함께 무효화한다는 규칙은 같다.
 * 팩토리로 묶어 그 규칙을 구조로 만든다(양쪽에 손으로 적으면 한쪽만 고치는 사고가 난다)
 */
function moveMutationOptions(
  queryClient: QueryClient,
  version: VersionMode,
  channelId: number,
  // 방향마다 다른 호출. 두 방향 모두 채널이 필요하다(보내기는 출처, 꺼내기는 목적지)
  move: (version: VersionMode, id: number, channelId: number) => Promise<ApiResult<VideoCard>>,
  fallbackMessage: string,
  // 실패 알림 제목: 방향(보내기/꺼내기)마다 다르므로 호출부가 준다.
  errorTitle: string,
) {
  return {
    meta: { errorTitle },
    mutationFn: async (id: number): Promise<VideoCard> => {
      const res = await move(version, id, channelId);
      if (!res.success) throw new Error(res.error ?? fallbackMessage);
      return res.data;
    },
    onSettled: (): void => {
      // 작업 공간은 채널별, 보관함은 조직 공용이라 키의 축이 다르다.
      //
      // 작업 공간 목록 둘 다 무효화한다. 옮긴 항목이 어느 표의 것인지는 버전이 정하는데
      //   (versionProfile.archiveSource), 그 판정을 여기서 다시 하면 버전 조건이 흩어진다. 그 버전에
      //   없는 구역의 목록은 애초에 조회되지 않으므로 무효화가 아무 일도 하지 않는다.
      void queryClient.invalidateQueries({ queryKey: videoProjectsKeys.list(version, channelId) });
      void queryClient.invalidateQueries({ queryKey: videoFinalsKeys.list(version, channelId) });
      void queryClient.invalidateQueries({ queryKey: videoArchiveKeys.list(version) });
    },
  };
}

/** 보관함 보내기: 내 작업 공간에서 빠지고 보관함에 나타난다. */
export function archiveVideoMutationOptions(
  queryClient: QueryClient,
  version: VersionMode,
  channelId: number,
) {
  return moveMutationOptions(
    queryClient,
    version,
    channelId,
    api.archiveVideo,
    '보관함 보내기에 실패했습니다.',
    '보관함에 넣지 못했습니다',
  );
}

/** 보관함 꺼내기: 보관함에서 빠지고 꺼낸 사람의 작업 공간에 나타난다. */
export function unarchiveVideoMutationOptions(
  queryClient: QueryClient,
  version: VersionMode,
  channelId: number,
) {
  return moveMutationOptions(
    queryClient,
    version,
    channelId,
    api.unarchiveVideo,
    '보관함에서 꺼내기에 실패했습니다.',
    '보관함에서 꺼내지 못했습니다',
  );
}

/**
 * 보관함 영구 삭제: 낙관적 제거 후 실패 시 롤백
 * 작업 공간 삭제와 엔드포인트가 다르다: 보관함은 열람이 공용이라 위치 조건이 따로 붙고,
 * 만든 사람 외에 관리급(대표/팀장)도 지울 수 있다.
 */
export function deleteArchivedVideoMutationOptions(
  queryClient: QueryClient,
  version: VersionMode,
) {
  const key = videoArchiveKeys.list(version);
  return {
    meta: { errorTitle: '보관된 영상을 삭제하지 못했습니다' },
    mutationFn: async (id: number): Promise<void> => {
      const res = await api.deleteArchivedVideo(version, id);
      if (!res.success) throw new Error(res.error ?? '보관함 항목 삭제에 실패했습니다.');
    },
    onMutate: async (id: number): Promise<{ prev?: ArchivedVideo[] }> => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<ArchivedVideo[]>(key);
      if (prev) {
        queryClient.setQueryData<ArchivedVideo[]>(
          key,
          prev.filter((f) => f.id !== id),
        );
      }
      return { prev };
    },
    onError: (_e: unknown, _id: number, ctx: { prev?: ArchivedVideo[] } | undefined): void => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
    },
    onSettled: (): void => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  };
}
