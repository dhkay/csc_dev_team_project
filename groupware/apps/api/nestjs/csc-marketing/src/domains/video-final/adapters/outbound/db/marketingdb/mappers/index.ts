import { InferSelectModel } from 'drizzle-orm';
import { marketingVideoFinals } from '@csc/database/marketingdb';
import { toolVersionOrDefault } from '../../../../../../../shared/domain/tool-version';
import { RenderStatus, VideoFinalEntity, WorkspaceLocation } from '../../../../../core/domain';

type VideoFinalRow = InferSelectModel<typeof marketingVideoFinals>;

/** Drizzle marketing_video_finals → Domain VideoFinalEntity 변환 */
export function toVideoFinalEntity(row: VideoFinalRow): VideoFinalEntity {
  return {
    id: row.id,
    organizationId: row.organizationId,
    ownerUserId: row.ownerUserId,
    location: row.location as WorkspaceLocation,
    channelId: row.channelId ?? null,
    parentSourceId: row.parentSourceId ?? null,
    frameUploadId: row.frameUploadId ?? null,
    outroUploadId: row.outroUploadId ?? null,
    title: row.title,
    aspectRatio: row.aspectRatio,
    version: toolVersionOrDefault(row.version),
    clientRequestId: row.clientRequestId ?? null,
    renderJobId: row.renderJobId ?? null,
    renderStatus: row.renderStatus as RenderStatus,
    overlays: row.overlays ?? null,
    progress: null, // 비영속(DB 컬럼 없음): 조회 시 서비스가 잡 상태에서 채운다
    resultUploadId: row.resultUploadId ?? null,
    error: row.error ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
