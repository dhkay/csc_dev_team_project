import { InferSelectModel } from 'drizzle-orm';
import { marketingSavedPlans } from '@csc/database/marketingdb';
import { toolVersionOrDefault } from '../../../../../../../shared/domain/tool-version';
import {
  SavedPlanEntity,
  WorkspaceLocation,
  SavedPlanScene,
  SavedPlanSceneImage,
} from '../../../../../core/domain';
import type { ConceptChoice } from '../../../../../../channel-settings/core/domain';

type SavedPlanRow = InferSelectModel<typeof marketingSavedPlans>;

/** Drizzle marketing_saved_plans → Domain SavedPlanEntity 변환 */
export function toSavedPlanEntity(row: SavedPlanRow): SavedPlanEntity {
  return {
    id: row.id,
    organizationId: row.organizationId,
    ownerUserId: row.ownerUserId,
    location: row.location as WorkspaceLocation,
    channelId: row.channelId ?? null,
    brandName: row.brandName,
    clientRequestId: row.clientRequestId ?? null,
    brandConcepts: (row.brandConcepts ?? []) as ConceptChoice[],
    videoModel: row.videoModel ?? '',
    segmentMode: row.segmentMode ?? '',
    title: row.title,
    summary: row.summary,
    version: toolVersionOrDefault(row.version),
    scenes: (row.scenes ?? []) as SavedPlanScene[],
    sceneImages: (row.sceneImages ?? []) as SavedPlanSceneImage[],
    bgm: row.bgm ?? null,
    llmModel: row.llmModel ?? '',
    imageModel: row.imageModel ?? '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
