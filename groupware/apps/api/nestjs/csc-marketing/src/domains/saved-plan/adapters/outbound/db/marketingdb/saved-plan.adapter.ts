import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { marketingDb, marketingSavedPlans } from '@csc/database/marketingdb';
import {
  ownerVersionWhere,
  workspaceWhere,
} from '../../../../../../shared/adapters/outbound/db/workspace-where';
import type {
  OwnerVersionScope,
  WorkspaceScope,
} from '../../../../../../shared/domain/workspace-scope';
import {
  SavedPlanRepositoryPort,
  CreateSavedPlanRecord,
} from '../../../../core/application/ports/outbound';
import {
  SavedPlanEntity,
  WorkspaceLocation,
  SavedPlanScene,
  SavedPlanSceneImage,
} from '../../../../core/domain';
import { toSavedPlanEntity } from './mappers';
import { reserveOnce } from '../../../../../../shared/adapters/outbound/db/reserve-once';

/** SavedPlanRepositoryPort 구현: marketingdb marketing_saved_plans(개인/보관함 저장본) */
@Injectable()
export class SavedPlanRepositoryAdapter implements SavedPlanRepositoryPort {
  async createRecord(
    scope: OwnerVersionScope,
    record: CreateSavedPlanRecord,
  ): Promise<SavedPlanEntity> {
    const row = await reserveOnce(
      () =>
        marketingDb
          .insert(marketingSavedPlans)
          .values({
        organizationId: scope.organizationId,
        ownerUserId: scope.ownerUserId,
        // 요청이 말한 버전을 굳힌다: 이 행이 어느 워크스페이스 것인지가 여기서 정해진다.
        version: scope.version,
        location: record.location,
        channelId: record.channelId,
        brandName: record.brandName,
        clientRequestId: record.clientRequestId,
        brandConcepts: record.brandConcepts,
        videoModel: record.videoModel,
        segmentMode: record.segmentMode,
        title: record.title,
        summary: record.summary,
        scenes: record.scenes,
        sceneImages: record.sceneImages,
        bgm: record.bgm,
        llmModel: record.llmModel,
        imageModel: record.imageModel,
      })
          // 같은 멱등키로 두 번 들어오면(사가 단계 재실행) 새 행을 만들지 않는다.
          .onConflictDoNothing()
          .returning(),
      () => this.findRecordByRequestKey(scope, record.clientRequestId),
      '기획안',
    );
    return toSavedPlanEntity(row);
  }

  /**
   * 멱등키로 이미 예약된 행을 찾는다. 부분 유니크와 같은 컬럼 조합이어야 한다:
   * 어긋나면 충돌은 났는데 행을 못 찾아 reserveOnce 가 멈춘다(조용한 오작동보다 낫다)
   */
  private async findRecordByRequestKey(
    scope: OwnerVersionScope,
    clientRequestId: string | null,
  ): Promise<typeof marketingSavedPlans.$inferSelect | null> {
    if (!clientRequestId) return null;
    const [row] = await marketingDb
      .select()
      .from(marketingSavedPlans)
      .where(
        and(
          eq(marketingSavedPlans.organizationId, scope.organizationId),
          eq(marketingSavedPlans.ownerUserId, scope.ownerUserId),
          eq(marketingSavedPlans.clientRequestId, clientRequestId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findRecordsByOwner(
    scope: WorkspaceScope,
    location: WorkspaceLocation,
  ): Promise<SavedPlanEntity[]> {
    const rows = await marketingDb
      .select()
      .from(marketingSavedPlans)
      .where(
        and(
          // (조직, 작업자, 채널, 버전): 인덱스 (org, owner, location, channel_id) 를 그대로 탄다.
          workspaceWhere(marketingSavedPlans, scope),
          eq(marketingSavedPlans.location, location),
        ),
      )
      .orderBy(desc(marketingSavedPlans.createdAt));
    return rows.map(toSavedPlanEntity);
  }

  async findOneOwned(
    scope: OwnerVersionScope,
    id: number,
  ): Promise<SavedPlanEntity | null> {
    const [row] = await marketingDb
      .select()
      .from(marketingSavedPlans)
      .where(
        and(
          eq(marketingSavedPlans.id, id),
          // 소유(조직 + 작업자 + 버전)를 WHERE 로 확인한다: 남의 것도 다른 버전 것도 없는 것으로 보인다.
          ownerVersionWhere(marketingSavedPlans, scope),
        ),
      )
      .limit(1);
    return row ? toSavedPlanEntity(row) : null;
  }

  async updateScenesRecord(
    organizationId: number,
    id: number,
    scenes: SavedPlanScene[],
    sceneImages: SavedPlanSceneImage[],
  ): Promise<SavedPlanEntity | null> {
    const [row] = await marketingDb
      .update(marketingSavedPlans)
      .set({ scenes, sceneImages, updatedAt: new Date() })
      .where(
        and(
          eq(marketingSavedPlans.id, id),
          eq(marketingSavedPlans.organizationId, organizationId),
        ),
      )
      .returning();
    return row ? toSavedPlanEntity(row) : null;
  }

  async deleteRecordById(organizationId: number, id: number): Promise<boolean> {
    const deleted = await marketingDb
      .delete(marketingSavedPlans)
      .where(
        and(
          eq(marketingSavedPlans.id, id),
          eq(marketingSavedPlans.organizationId, organizationId),
        ),
      )
      .returning({ id: marketingSavedPlans.id });
    return deleted.length > 0;
  }
}
