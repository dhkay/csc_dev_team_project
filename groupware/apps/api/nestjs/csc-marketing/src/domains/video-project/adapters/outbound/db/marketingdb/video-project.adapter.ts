import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { marketingDb, marketingVideoProjects } from '@csc/database/marketingdb';
import {
  orgVersionWhere,
  ownerVersionWhere,
  workspaceWhere,
} from '../../../../../../shared/adapters/outbound/db/workspace-where';
import {
  NON_TERMINAL_RENDER_STATUSES,
  ROLLED_BACK_RENDER_STATUSES,
} from '../../../../../../shared/domain/render-status';
import type {
  OrgVersionScope,
  OwnerVersionScope,
  WorkspaceScope,
} from '../../../../../../shared/domain/workspace-scope';
import {
  CreatePlacedVideoProjectRecord,
  CreateVideoProjectRecord,
  RenderStateUpdate,
  VideoProjectRepositoryPort,
} from '../../../../core/application/ports/outbound';
import { VideoProjectEntity } from '../../../../core/domain';
import { toVideoProjectEntity } from './mappers';
import { reserveOnce } from '../../../../../../shared/adapters/outbound/db/reserve-once';

/** VideoProjectRepositoryPort 구현: marketingdb marketing_video_projects */
@Injectable()
export class VideoProjectRepositoryAdapter implements VideoProjectRepositoryPort {
  async createRecord(
    scope: OwnerVersionScope,
    record: CreateVideoProjectRecord,
  ): Promise<VideoProjectEntity> {
    const row = await reserveOnce(
      () =>
        marketingDb
          .insert(marketingVideoProjects)
          .values({
            organizationId: scope.organizationId,
            ownerUserId: scope.ownerUserId,
            // 요청이 말한 버전을 굳힘. 이 행이 어느 워크스페이스 것인지가 여기서 정해짐
            version: scope.version,
            channelId: record.channelId,
            savedPlanId: record.savedPlanId,
            title: record.title,
            aspectRatio: record.aspectRatio,
            resolution: record.resolution,
            videoModel: record.videoModel,
            videoMode: record.videoMode,
            ttsModel: record.ttsModel,
            segmentMode: record.segmentMode,
            ttsVoice: record.ttsVoice,
            ttsPitch: record.ttsPitch,
            scenes: record.scenes,
            background: record.background,
            clientRequestId: record.clientRequestId,
            renderJobId: record.renderJobId,
            renderStatus: record.renderStatus,
          })
          // 같은 멱등키로 두 번 들어오면(사가 단계 재실행) 새 행을 만들지 않음
          .onConflictDoNothing()
          .returning(),
      () => this.findRecordByRequestKey(scope, record.clientRequestId),
      '원천 영상',
    );
    return toVideoProjectEntity(row);
  }

  async createPlacedRecord(
    scope: OwnerVersionScope,
    record: CreatePlacedVideoProjectRecord,
  ): Promise<VideoProjectEntity> {
    const row = await reserveOnce(
      () =>
        marketingDb
          .insert(marketingVideoProjects)
          .values({
            organizationId: scope.organizationId,
            ownerUserId: scope.ownerUserId,
            version: scope.version,
            channelId: record.channelId,
            // 렌더를 거치지 않았으므로 스냅샷할 저장본도 없음
            savedPlanId: null,
            title: record.title,
            aspectRatio: record.aspectRatio,
            resolution: record.resolution,
            videoModel: record.videoModel,
            // 씬은 렌더 스펙 조립 재료인데 나갈 렌더가 없어 비어 있는 것이 사실
            scenes: [],
            clientRequestId: record.clientRequestId,
            // 잡이 없고 상태는 처음부터 완성. 이 조합이 "렌더를 거치지 않은 완성본"
            renderJobId: null,
            renderStatus: 'COMPLETED',
            resultUploadId: record.resultUploadId,
            thumbnailUploadId: record.thumbnailUploadId,
            // 만든 그 순간이 배치 시각(사람이 '영상 생성'을 눌러 확정한 결과)
            placedAt: new Date(),
          })
          .onConflictDoNothing()
          .returning(),
      () => this.findRecordByRequestKey(scope, record.clientRequestId),
      '원천 영상',
    );
    return toVideoProjectEntity(row);
  }

  /**
   * 멱등키로 이미 예약된 행 조회. 부분 유니크와 같은 컬럼 조합이어야 함
   * 어긋나면 충돌은 났는데 행을 못 찾아 reserveOnce 가 멈춤(조용한 오작동보다 나음)
   */
  private async findRecordByRequestKey(
    scope: OwnerVersionScope,
    clientRequestId: string | null,
  ): Promise<typeof marketingVideoProjects.$inferSelect | null> {
    if (!clientRequestId) return null;
    const [row] = await marketingDb
      .select()
      .from(marketingVideoProjects)
      .where(
        and(
          eq(marketingVideoProjects.organizationId, scope.organizationId),
          eq(marketingVideoProjects.ownerUserId, scope.ownerUserId),
          eq(marketingVideoProjects.clientRequestId, clientRequestId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findRecordsByOwner(scope: WorkspaceScope): Promise<VideoProjectEntity[]> {
    const rows = await marketingDb
      .select()
      .from(marketingVideoProjects)
      .where(
        and(
          // (조직, 작업자, 채널, 버전). 인덱스 (org, owner, location, channel_id) 를 그대로 탐
          workspaceWhere(marketingVideoProjects, scope),
          // 보관함으로 보낸 항목 제외. 이 조건이 빠지면 '보내기'가 '복사'가 됨
          eq(marketingVideoProjects.location, 'personal'),
          // 이미 되돌려진 작업은 목록에서 제외(보여줄 산출물이 없음)
          // 갓 취소된 건은 비종료라 한 번 실려 나가고 reconcile 이 CANCELLED 로 바꿔 사유를 알림
          notInArray(marketingVideoProjects.renderStatus, [...ROLLED_BACK_RENDER_STATUSES]),
        ),
      )
      .orderBy(desc(marketingVideoProjects.createdAt));
    return rows.map(toVideoProjectEntity);
  }

  async findRecordsByLocation(scope: OrgVersionScope): Promise<VideoProjectEntity[]> {
    const rows = await marketingDb
      .select()
      .from(marketingVideoProjects)
      .where(
        and(
          // 보관함은 조직 공용이라 작업자도 채널도 조건이 아님. 인덱스 (org, location, version_mode)
          orgVersionWhere(marketingVideoProjects, scope),
          eq(marketingVideoProjects.location, 'archive'),
        ),
      )
      .orderBy(desc(marketingVideoProjects.createdAt));
    return rows.map(toVideoProjectEntity);
  }

  async findOneOwned(
    scope: OwnerVersionScope,
    id: number,
  ): Promise<VideoProjectEntity | null> {
    const [row] = await marketingDb
      .select()
      .from(marketingVideoProjects)
      .where(
        and(
          eq(marketingVideoProjects.id, id),
          // 소유를 WHERE 로 확인해 남의 것도 다른 버전 것도 없는 것으로 보이게 함
          ownerVersionWhere(marketingVideoProjects, scope),
        ),
      )
      .limit(1);
    return row ? toVideoProjectEntity(row) : null;
  }

  async findOneArchived(
    scope: OrgVersionScope,
    id: number,
  ): Promise<VideoProjectEntity | null> {
    const [row] = await marketingDb
      .select()
      .from(marketingVideoProjects)
      .where(
        and(
          eq(marketingVideoProjects.id, id),
          // 소유는 조건이 아니고(관리급 정리) 위치가 경계라 개인 항목은 집히지 않음
          orgVersionWhere(marketingVideoProjects, scope),
          eq(marketingVideoProjects.location, 'archive'),
        ),
      )
      .limit(1);
    return row ? toVideoProjectEntity(row) : null;
  }

  async archiveRecord(
    organizationId: number,
    id: number,
  ): Promise<VideoProjectEntity | null> {
    const [row] = await marketingDb
      .update(marketingVideoProjects)
      .set({ location: 'archive', updatedAt: new Date() })
      .where(
        and(
          eq(marketingVideoProjects.id, id),
          eq(marketingVideoProjects.organizationId, organizationId),
          // 개인 항목일 때만 전이. 반환값이 증표라 중복 요청에도 로그가 1건
          eq(marketingVideoProjects.location, 'personal'),
        ),
      )
      .returning();
    return row ? toVideoProjectEntity(row) : null;
  }

  async moveArchivedToWorkspaceRecord(
    scope: WorkspaceScope,
    id: number,
  ): Promise<VideoProjectEntity | null> {
    const [row] = await marketingDb
      .update(marketingVideoProjects)
      .set({
        location: 'personal',
        // 꺼낸 사람의 작업 공간으로 귀속. 원 소유자를 두면 그 행이 어느 목록에도 뜨지 않음
        ownerUserId: scope.ownerUserId,
        channelId: scope.channelId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(marketingVideoProjects.id, id),
          // 전이 조건은 보관함의 열람 범위(조직 + 버전). 위치 조건이 중복 꺼내기를 차단
          orgVersionWhere(marketingVideoProjects, scope),
          eq(marketingVideoProjects.location, 'archive'),
        ),
      )
      .returning();
    return row ? toVideoProjectEntity(row) : null;
  }

  async updateRenderStateRecord(
    organizationId: number,
    id: number,
    update: RenderStateUpdate,
  ): Promise<VideoProjectEntity | null> {
    const { renderStatus, resultUploadId, captionsUploadId, error, errorCode, segments } = update;
    const [row] = await marketingDb
      .update(marketingVideoProjects)
      .set({
        renderStatus,
        resultUploadId,
        captionsUploadId,
        error,
        errorCode,
        // 세그먼트는 줄 때만 씀. null 을 넣으면 이전 전이가 남긴 격자가 지워짐
        ...(segments ? { segments } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(marketingVideoProjects.id, id),
          eq(marketingVideoProjects.organizationId, organizationId),
          // 비종료 상태에서만 갱신. 늦은 폴러의 되돌림 방지 + 종료 전이를 기록한 호출자만 row 수신
          // RENDERING↔STALLED 플래핑은 둘 다 비종료라 그대로 동작
          inArray(marketingVideoProjects.renderStatus, [...NON_TERMINAL_RENDER_STATUSES]),
        ),
      )
      .returning();
    return row ? toVideoProjectEntity(row) : null;
  }

  async placeInWorkspaceRecord(
    organizationId: number,
    id: number,
    thumbnailUploadId: string | null,
  ): Promise<VideoProjectEntity | null> {
    const [row] = await marketingDb
      .update(marketingVideoProjects)
      .set({
        // 이미 배치된 영상을 다시 눌러도(썸네일 교체) 처음 시각 유지
        placedAt: sql`coalesce(${marketingVideoProjects.placedAt}, now())`,
        thumbnailUploadId,
        updatedAt: new Date(),
      })
      // 렌더 상태는 조건에 넣지 않음. 완성본만 배치한다는 판정은 서비스 담당
      .where(
        and(
          eq(marketingVideoProjects.id, id),
          eq(marketingVideoProjects.organizationId, organizationId),
        ),
      )
      .returning();
    return row ? toVideoProjectEntity(row) : null;
  }

  async updateThumbnailRecord(
    organizationId: number,
    id: number,
    thumbnailUploadId: string | null,
  ): Promise<VideoProjectEntity | null> {
    const [row] = await marketingDb
      .update(marketingVideoProjects)
      .set({ thumbnailUploadId, updatedAt: new Date() })
      .where(
        and(
          eq(marketingVideoProjects.id, id),
          eq(marketingVideoProjects.organizationId, organizationId),
        ),
      )
      .returning();
    return row ? toVideoProjectEntity(row) : null;
  }

  async startRenderRecord(
    organizationId: number,
    id: number,
    renderJobId: string,
  ): Promise<VideoProjectEntity | null> {
    const [row] = await marketingDb
      .update(marketingVideoProjects)
      .set({
        renderJobId,
        renderStatus: 'RENDERING',
        resultUploadId: null,
        error: null,
        errorCode: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(marketingVideoProjects.id, id),
          eq(marketingVideoProjects.organizationId, organizationId),
        ),
      )
      .returning();
    return row ? toVideoProjectEntity(row) : null;
  }

  async deleteRecordById(organizationId: number, id: number): Promise<boolean> {
    const deleted = await marketingDb
      .delete(marketingVideoProjects)
      .where(
        and(
          eq(marketingVideoProjects.id, id),
          eq(marketingVideoProjects.organizationId, organizationId),
        ),
      )
      .returning({ id: marketingVideoProjects.id });
    return deleted.length > 0;
  }
}
