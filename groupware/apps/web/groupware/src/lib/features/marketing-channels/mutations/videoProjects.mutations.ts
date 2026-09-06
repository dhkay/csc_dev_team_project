// 영상 프로젝트 변경 레이어: 생성(기획안 스냅샷 → 렌더) / 재렌더 / 삭제(낙관적). 성공 시 목록 invalidate.
import type { QueryClient } from '@tanstack/svelte-query';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import * as api from '../apis/videoProjectApi';
import type { VideoProject } from '../types';
import { videoProjectsKeys } from '../queries/videoProjects.query';

/** 영상 만들기 입력: 저장 기획안 + (모델이 지원하면) 원천 영상 화질 */
export interface CreateVideoProjectInput {
  savedPlanId: number;
  // 미지정이면 서버 기본값(720p). 모델이 화질 조정을 지원하지 않으면 서버가 기본값으로 clamp 한다.
  resolution?: string;
  // 멱등키: 버튼을 누른 그 한 번을 식별한다. 호출부가 클릭 시점에 만들고, 재시도는 같은 값을 쓴다.
  // 같은 기획안으로 다시 만드는 것은 정상이라 저장본 id 로 키를 만들면 안 된다(그건 두 번째를 막는다)
  clientRequestId?: string;
}

/** 저장 기획안 → 영상 프로젝트 생성 + 렌더 잡 등록. 성공 시 목록 invalidate → 영상 탭에 렌더중으로 등장 */
export function createVideoProjectMutationOptions(queryClient: QueryClient, version: VersionMode,
  channelId: number) {
  return {
    meta: { errorTitle: '원천영상 만들기를 시작하지 못했습니다' },
    mutationFn: async ({
      savedPlanId,
      resolution,
      clientRequestId,
    }: CreateVideoProjectInput): Promise<VideoProject> => {
      const res = await api.createVideoProject(version, savedPlanId, resolution, clientRequestId);
      if (!res.success) throw new Error(res.error ?? '영상 만들기에 실패했습니다.');
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: videoProjectsKeys.list(version, channelId) });
    },
  };
}

/** 재렌더: 저장된 조합 스펙으로 새 렌더 잡. 성공 시 목록 invalidate(다시 렌더중) */
export function rerenderVideoProjectMutationOptions(queryClient: QueryClient, version: VersionMode,
  channelId: number) {
  return {
    meta: { errorTitle: '원천영상 다시 만들기를 시작하지 못했습니다' },
    mutationFn: async (id: number): Promise<VideoProject> => {
      const res = await api.rerenderVideoProject(version, id);
      if (!res.success) throw new Error(res.error ?? '다시 만들기에 실패했습니다.');
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: videoProjectsKeys.list(version, channelId) });
    },
  };
}

/** 세그먼트 재생성 입력: 대상 순번 + (고쳤으면) 새 화면 묘사 */
export interface RerenderSegmentInput {
  id: number;
  order: number;
  // 없으면 원래 묘사 그대로 한 번 더 만든다(같은 묘사라도 결과는 매번 다르다)
  visualPrompt?: string | null;
}

/**
 * 세그먼트 재생성: 붙어 있는 렌더 잡을 다시 돌려 그 칸 하나만 만든다.
 *
 * 낙관적 갱신을 하지 않는 이유: 이 요청의 결과는 화면의 한 칸이 아니라 프로젝트 전체 상태
 * (다시 만드는 중으로 되돌아가고 결과 영상이 비워진다)라, 미리 그려 두면 서버가 거절했을 때
 * 되돌릴 것이 한 칸으로 끝나지 않는다. invalidate 로 서버가 말한 상태를 받는다.
 */
export function rerenderVideoProjectSegmentMutationOptions(
  queryClient: QueryClient,
  version: VersionMode,
  channelId: number,
) {
  return {
    meta: { errorTitle: '세그먼트 다시 만들기를 시작하지 못했습니다' },
    mutationFn: async ({
      id,
      order,
      visualPrompt,
    }: RerenderSegmentInput): Promise<VideoProject> => {
      const res = await api.rerenderVideoProjectSegment(version, id, order, visualPrompt);
      if (!res.success) throw new Error(res.error ?? '세그먼트 다시 만들기에 실패했습니다.');
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: videoProjectsKeys.list(version, channelId) });
    },
  };
}

/**
 * 작업 공간에 배치: 생성 창의 마지막 단계. 만든 영상을 그 사람의 작업 공간에 놓는다.
 *
 * 썸네일이 있으면 그림을 먼저 올리고(presign + PUT 까지만) 그 uploadId 를 함께 보낸다. 확정은
 * 행을 고치는 서버가 하므로 배치가 실패하면 그 그림은 PENDING 으로 남아 수거된다. 브라우저가
 * 미리 확정하면 참조 없는 자산이 영구히 남는다(marketing-write-consistency.md 4.2).
 *
 * 그림 업로드가 실패해도 배치는 진행한다. 거기서 멈추면 만들어진 영상이 어느 목록에도 없게 된다.
 */
export function placeVideoProjectMutationOptions(queryClient: QueryClient, version: VersionMode,
  channelId: number) {
  return {
    meta: { errorTitle: '작업 공간에 배치하지 못했습니다' },
    mutationFn: async (input: { id: number; thumbnail?: Blob | null }): Promise<VideoProject> => {
      let thumbnailUploadId: string | undefined;
      if (input.thumbnail) {
        try {
          thumbnailUploadId = await api.uploadVideoThumbnail(input.thumbnail);
        } catch {
          thumbnailUploadId = undefined;
        }
      }
      const res = await api.placeVideoProject(version, input.id, thumbnailUploadId);
      if (!res.success) throw new Error(res.error ?? '작업 공간에 배치하지 못했습니다.');
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: videoProjectsKeys.list(version, channelId) });
    },
  };
}

/**
 * 진행 화면 미리보기의 '영상 생성'(dev 전용): 영상과 그림을 올리고 실제 행을 만든다.
 *
 * 실제 흐름과 갈리는 지점은 하나다. 그쪽은 렌더가 예약해 둔 행을 배치하지만, 미리보기에는 렌더가
 * 없어 예약된 행도 없다. 그래서 등록과 배치가 한 번에 일어난다(서버의 그 경로가 완성 + 배치 상태로
 * 행을 만든다)
 *
 * 그림 업로드 실패는 삼킨다(배치와 같은 규칙: 그림 없이도 산출물은 남아야 한다). 반면 영상
 * 업로드 실패는 던진다: 결과물 없는 완성본은 목록에서 빈 칸이 되고, 그 카드는 무엇으로도 고칠 수
 * 없다(재렌더할 잡이 없다)
 */
export function createPreviewProjectMutationOptions(queryClient: QueryClient, version: VersionMode,
  channelId: number) {
  return {
    meta: { errorTitle: '미리보기 산출물을 만들지 못했습니다' },
    mutationFn: async (input: {
      video: Blob;
      thumbnail?: Blob | null;
      title: string;
      videoModel: string;
    }): Promise<VideoProject> => {
      const resultUploadId = await api.uploadPreviewVideo(input.video);
      let thumbnailUploadId: string | undefined;
      if (input.thumbnail) {
        try {
          // 썸네일은 실제 흐름과 같은 자산이라 같은 업로더를 쓴다(그 라우트는 dev 전용이 아니다)
          thumbnailUploadId = await api.uploadVideoThumbnail(input.thumbnail);
        } catch {
          thumbnailUploadId = undefined;
        }
      }
      const res = await api.createPreviewProject(version, channelId, {
        title: input.title,
        videoModel: input.videoModel,
        resultUploadId,
        thumbnailUploadId,
        // 멱등키: 이 클릭 한 번. 업로드가 끝난 뒤 등록이 재시도되어도 행이 둘이 되지 않는다.
        clientRequestId: crypto.randomUUID(),
      });
      if (!res.success) throw new Error(res.error ?? '미리보기 산출물 등록에 실패했습니다.');
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: videoProjectsKeys.list(version, channelId) });
    },
  };
}

/** 삭제: 낙관적 제거 후 실패 시 롤백 */
export function deleteVideoProjectMutationOptions(queryClient: QueryClient, version: VersionMode,
  channelId: number) {
  return {
    meta: { errorTitle: '원천영상을 삭제하지 못했습니다' },
    mutationFn: async (id: number): Promise<void> => {
      const res = await api.deleteVideoProject(version, id);
      if (!res.success) throw new Error(res.error ?? '영상 삭제에 실패했습니다.');
    },
    onMutate: async (id: number): Promise<{ prev?: VideoProject[] }> => {
      await queryClient.cancelQueries({ queryKey: videoProjectsKeys.list(version, channelId) });
      const prev = queryClient.getQueryData<VideoProject[]>(videoProjectsKeys.list(version, channelId));
      if (prev) {
        queryClient.setQueryData<VideoProject[]>(
          videoProjectsKeys.list(version, channelId),
          prev.filter((p) => p.id !== id),
        );
      }
      return { prev };
    },
    onError: (_e: unknown, _id: number, ctx: { prev?: VideoProject[] } | undefined): void => {
      if (ctx?.prev) queryClient.setQueryData(videoProjectsKeys.list(version, channelId), ctx.prev);
    },
    onSettled: (): void => {
      void queryClient.invalidateQueries({ queryKey: videoProjectsKeys.list(version, channelId) });
    },
  };
}
