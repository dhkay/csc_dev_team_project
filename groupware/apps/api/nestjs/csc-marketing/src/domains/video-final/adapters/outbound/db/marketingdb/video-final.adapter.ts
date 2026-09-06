import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, notInArray } from 'drizzle-orm';
import { marketingDb, marketingVideoFinals } from '@csc/database/marketingdb';
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
  CreateVideoFinalRecord,
  VideoFinalRepositoryPort,
} from '../../../../core/application/ports/outbound';
import { RenderStatus, VideoFinalEntity } from '../../../../core/domain';
import { toVideoFinalEntity } from './mappers';
import { reserveOnce } from '../../../../../../shared/adapters/outbound/db/reserve-once';

/** VideoFinalRepositoryPort 구현: marketingdb marketing_video_finals */
@Injectable()
export class VideoFinalRepositoryAdapter implements VideoFinalRepositoryPort {
  async createRecord(
    scope: OwnerVersionScope,
    record: CreateVideoFinalRecord,
  ): Promise<VideoFinalEntity> {
    const row = await reserveOnce(
      () =>
        marketingDb
          .insert(marketingVideoFinals)
          .values({
            organizationId: scope.organizationId,
            ownerUserId: scope.ownerUserId,
            // 요청이 말한 버전을 굳힘. 이 행이 어느 워크스페이스 것인지가 여기서 정해짐
            version: scope.version,
            channelId: record.channelId,
            parentSourceId: record.parentSourceId,
            frameUploadId: record.frameUploadId,
            outroUploadId: record.outroUploadId,
            title: record.title,
            aspectRatio: record.aspectRatio,
            overlays: record.overlays,
            clientRequestId: record.clientRequestId,
            renderJobId: record.renderJobId,
            renderStatus: record.renderStatus,
          })
          // 같은 멱등키로 두 번 들어오면(사가 단계 재실행) 새 행을 만들지 않음
          .onConflictDoNothing()
          .returning(),
      () => this.findRecordByRequestKey(scope, record.clientRequestId),
      '최종 영상',
    );
    return toVideoFinalEntity(row);
  }

  /**
   * 멱등키로 이미 예약된 행 조회. 부분 유니크와 같은 컬럼 조합이어야 함
   * 어긋나면 충돌은 났는데 행을 못 찾아 reserveOnce 가 멈춤(조용한 오작동보다 나음)
   */
  private async findRecordByRequestKey(
    scope: OwnerVersionScope,
    clientRequestId: string | null,
  ): Promise<typeof marketingVideoFinals.$inferSelect | null> {
    if (!clientRequestId) return null;
    const [row] = await marketingDb
      .select()
      .from(marketingVideoFinals)
      .where(
        and(
          eq(marketingVideoFinals.organizationId, scope.organizationId),
          eq(marketingVideoFinals.ownerUserId, scope.ownerUserId),
          eq(marketingVideoFinals.clientRequestId, clientRequestId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findRecordsByOwner(scope: WorkspaceScope): Promise<VideoFinalEntity[]> {
    const rows = await marketingDb
      .select()
      .from(marketingVideoFinals)
      .where(
        and(
          // (조직, 작업자, 채널, 버전). 인덱스 (org, owner, location, channel_id) 를 그대로 탐
          workspaceWhere(marketingVideoFinals, scope),
          // 보관함으로 보낸 항목 제외. 이 조건이 빠지면 '보내기'가 '복사'가 됨
          eq(marketingVideoFinals.location, 'personal'),
          // 이미 되돌려진 작업 제외(원천영상과 같은 규칙)
          notInArray(marketingVideoFinals.renderStatus, [...ROLLED_BACK_RENDER_STATUSES]),
        ),
      )
      .orderBy(desc(marketingVideoFinals.createdAt));
    return rows.map(toVideoFinalEntity);
  }

  async findRecordsByLocation(scope: OrgVersionScope): Promise<VideoFinalEntity[]> {
    const rows = await marketingDb
      .select()
      .from(marketingVideoFinals)
      .where(
        and(
          // 보관함은 조직 공용이라 작업자도 채널도 조건이 아님. 인덱스 (org, location, version)
          orgVersionWhere(marketingVideoFinals, scope),
          eq(marketingVideoFinals.location, 'archive'),
        ),
      )
      .orderBy(desc(marketingVideoFinals.createdAt));
    return rows.map(toVideoFinalEntity);
  }

  async findOneOwned(
    scope: OwnerVersionScope,
    id: number,
  ): Promise<VideoFinalEntity | null> {
    const [row] = await marketingDb
      .select()
      .from(marketingVideoFinals)
      .where(
        and(
          eq(marketingVideoFinals.id, id),
          // 소유를 WHERE 로 확인해 남의 것도 다른 버전 것도 없는 것으로 보이게 함
          ownerVersionWhere(marketingVideoFinals, scope),
        ),
      )
      .limit(1);
    return row ? toVideoFinalEntity(row) : null;
  }

  async updateRenderStateRecord(
    organizationId: number,
    id: number,
    renderStatus: RenderStatus,
    resultUploadId: string | null,
    error: string | null,
  ): Promise<VideoFinalEntity | null> {
    const [row] = await marketingDb
      .update(marketingVideoFinals)
      .set({ renderStatus, resultUploadId, error, updatedAt: new Date() })
      .where(
        and(
          eq(marketingVideoFinals.id, id),
          eq(marketingVideoFinals.organizationId, organizationId),
          // 비종료 상태에서만 갱신. 늦은 폴러의 되돌림 방지 + 완료 로그 1건 보장
          inArray(marketingVideoFinals.renderStatus, [...NON_TERMINAL_RENDER_STATUSES]),
        ),
      )
      .returning();
    return row ? toVideoFinalEntity(row) : null;
  }

  async archiveRecord(organizationId: number, id: number): Promise<VideoFinalEntity | null> {
    const [row] = await marketingDb
      .update(marketingVideoFinals)
      .set({ location: 'archive', updatedAt: new Date() })
      .where(
        and(
          eq(marketingVideoFinals.id, id),
          eq(marketingVideoFinals.organizationId, organizationId),
          // 개인 항목일 때만 전이. 반환값이 증표라 중복 요청에도 로그가 1건
          eq(marketingVideoFinals.location, 'personal'),
        ),
      )
      .returning();
    return row ? toVideoFinalEntity(row) : null;
  }

  async findOneArchived(
    scope: OrgVersionScope,
    id: number,
  ): Promise<VideoFinalEntity | null> {
    const [row] = await marketingDb
      .select()
      .from(marketingVideoFinals)
      .where(
        and(
          eq(marketingVideoFinals.id, id),
          // 소유는 조건이 아니고(관리급 정리) 위치가 경계라 개인 항목은 집히지 않음
          orgVersionWhere(marketingVideoFinals, scope),
          eq(marketingVideoFinals.location, 'archive'),
        ),
      )
      .limit(1);
    return row ? toVideoFinalEntity(row) : null;
  }

  async moveArchivedToWorkspaceRecord(
    scope: WorkspaceScope,
    id: number,
  ): Promise<VideoFinalEntity | null> {
    const [row] = await marketingDb
      .update(marketingVideoFinals)
      .set({
        location: 'personal',
        // 꺼낸 사람의 워크스페이스로 귀속. 원 소유자를 두면 그 행이 어느 목록에도 뜨지 않음
        ownerUserId: scope.ownerUserId,
        channelId: scope.channelId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(marketingVideoFinals.id, id),
          // 전이 조건은 보관함의 열람 범위(조직 + 버전). 위치 조건이 중복 꺼내기를 차단
          orgVersionWhere(marketingVideoFinals, scope),
          eq(marketingVideoFinals.location, 'archive'),
        ),
      )
      .returning();
    return row ? toVideoFinalEntity(row) : null;
  }

  async startRenderRecord(
    organizationId: number,
    id: number,
    renderJobId: string,
  ): Promise<VideoFinalEntity | null> {
    const [row] = await marketingDb
      .update(marketingVideoFinals)
      .set({
        renderJobId,
        renderStatus: 'RENDERING',
        resultUploadId: null,
        error: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(marketingVideoFinals.id, id),
          eq(marketingVideoFinals.organizationId, organizationId),
        ),
      )
      .returning();
    return row ? toVideoFinalEntity(row) : null;
  }

  async deleteRecordById(organizationId: number, id: number): Promise<boolean> {
    const deleted = await marketingDb
      .delete(marketingVideoFinals)
      .where(
        and(
          eq(marketingVideoFinals.id, id),
          eq(marketingVideoFinals.organizationId, organizationId),
        ),
      )
      .returning({ id: marketingVideoFinals.id });
    return deleted.length > 0;
  }
}
