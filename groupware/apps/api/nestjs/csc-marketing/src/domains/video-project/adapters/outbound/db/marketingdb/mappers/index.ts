import { InferSelectModel } from 'drizzle-orm';
import { marketingVideoProjects } from '@csc/database/marketingdb';
import { toolVersionOrDefault } from '../../../../../../../shared/domain/tool-version';
import {
  RenderStatus,
  VideoProjectBackground,
  VideoProjectEntity,
  VideoProjectScene,
  VideoProjectSegment,
} from '../../../../../core/domain';

type VideoProjectRow = InferSelectModel<typeof marketingVideoProjects>;

/** Drizzle marketing_video_projects → Domain VideoProjectEntity 변환 */
export function toVideoProjectEntity(row: VideoProjectRow): VideoProjectEntity {
  return {
    id: row.id,
    organizationId: row.organizationId,
    ownerUserId: row.ownerUserId,
    channelId: row.channelId ?? null,
    savedPlanId: row.savedPlanId ?? null,
    title: row.title,
    aspectRatio: row.aspectRatio,
    resolution: row.resolution,
    videoModel: row.videoModel,
    videoMode: row.videoMode,
    ttsModel: row.ttsModel,
    segmentMode: row.segmentMode ?? '',
    ttsVoice: row.ttsVoice,
    ttsPitch: row.ttsPitch,
    scenes: (row.scenes ?? []) as VideoProjectScene[],
    background: (row.background ?? null) as VideoProjectBackground | null,
    bgm: row.bgm ?? null,
    clientRequestId: row.clientRequestId ?? null,
    renderJobId: row.renderJobId ?? null,
    version: toolVersionOrDefault(row.version),
    renderStatus: row.renderStatus as RenderStatus,
    progress: null, // 비영속(DB 컬럼 없음): 조회 시 서비스가 잡 상태에서 채운다
    renderStage: null, // 같은 이유로 비영속
    resultUploadId: row.resultUploadId ?? null,
    captionsUploadId: row.captionsUploadId ?? null,
    thumbnailUploadId: row.thumbnailUploadId ?? null,
    placedAt: row.placedAt ?? null,
    location: row.location,
    // 세그먼트는 영속한다: 완료 뒤에는 렌더에 다시 묻지 않으므로 이 값이 유일한 근거다.
    segments: (row.segments ?? null) as VideoProjectSegment[] | null,
    error: row.error ?? null,
    errorCode: row.errorCode ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
