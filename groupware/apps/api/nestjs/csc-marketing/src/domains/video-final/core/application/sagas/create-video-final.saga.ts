import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { VideoFinalEntity } from '../../domain';
import {
  FinalRenderPort,
  FinalRenderSpecBuilder,
  FINAL_RENDER_SPEC_BUILDERS,
  FinalRenderSpec,
  FINAL_RENDER_PORT,
  VideoFinalRepositoryPort,
  VIDEO_FINAL_REPOSITORY_PORT,
} from '../ports/outbound';
import {
  VideoProjectPort,
  VIDEO_PROJECT_PORT,
} from '../../../../video-project/core/application/ports/inbound';
import {
  AssetSetPort,
  ASSET_SET_PORT,
} from '../../../../asset-set/core/application/ports/inbound';
import {
  assertAssetsUploaded,
  FileUploadStoragePort,
  FILE_UPLOAD_STORAGE_PORT,
} from '../../../../../shared/domain/storage';
import {
  ActivityLogPort,
  ACTIVITY_LOG_PORT,
} from '../../../../../shared/domain/activity-log';
import {
  ownerVersionScope,
  type OwnerVersionScope,
} from '../../../../../shared/domain/workspace-scope';
import { overlaysFromSet } from '../../../../../shared/domain/overlay';
import { collectFinalAssetIds } from '../final-render-spec';
import { SagaDefinition, SagaStep } from '@csc/saga';
import type { VersionRegistry } from '../../../../../shared/domain/version-registry';

// 이 사가의 종류 key. 저장된 saga_type 이고 복구 러너가 이 값으로 정의를 찾음
export const CREATE_VIDEO_FINAL_SAGA_TYPE = 'video_final.create';

/**
 * 최종 영상 생성 사가의 컨텍스트. JSON 왕복이 안전한 스칼라만 담음
 * 렌더 스펙은 담지 않고 예약 행과 원천에서 재조립(행이 생성 시점 스냅샷이라 어긋나지 않음)
 */
export interface CreateVideoFinalSagaContext {
  // payload: 조직 + 작업자 + 요청이 말한 버전. 복구가 버전을 다시 읽으면 다른 버전으로 재개됨
  scope: OwnerVersionScope;
  sourceId: number;
  setId: number;
  clientRequestId: string | null;
  // 1단계 산출: 예약된 행과 로그에 필요한 스칼라
  finalId?: number;
  finalTitle?: string;
  finalChannelId?: number | null;
  // 1단계 산출: 원천에서 온 결과물과 자막 트랙 uploadId
  // 여기 담으면 잡 단계가 원천을 다시 읽지 않고 생성 시점 결과물로 고정됨
  sourceUploadId?: string;
  captionsUploadId?: string | null;
  // 2단계 산출: 렌더 잡 id
  renderJobId?: string;
}

/**
 * 최종 영상 생성 사가(세트 적용). 순서는 예약 INSERT(보상 삭제) → 잡 등록(보상 취소) → 부착 → 로그
 * 원천 영상 생성 사가와 같은 규칙이고 근거는 CreateVideoProjectSaga 주석과 동일
 */
@Injectable()
export class CreateVideoFinalSaga implements SagaDefinition<CreateVideoFinalSagaContext> {
  readonly type = CREATE_VIDEO_FINAL_SAGA_TYPE;

  constructor(
    @Inject(VIDEO_FINAL_REPOSITORY_PORT)
    private readonly repository: VideoFinalRepositoryPort,
    @Inject(FINAL_RENDER_PORT)
    private readonly render: FinalRenderPort,
    @Inject(VIDEO_PROJECT_PORT)
    private readonly videoProjects: VideoProjectPort,
    @Inject(ASSET_SET_PORT)
    private readonly assetSets: AssetSetPort,
    @Inject(FILE_UPLOAD_STORAGE_PORT)
    private readonly storage: FileUploadStoragePort,
    // 버전별 최종 합성 스펙 조립(파이프라인 이음새 3/3). 복구 러너가 요청 밖에서 돌아 표에서 고름
    @Inject(FINAL_RENDER_SPEC_BUILDERS)
    private readonly specsByVersion: VersionRegistry<FinalRenderSpecBuilder>,
    @Inject(ACTIVITY_LOG_PORT)
    private readonly activityLog: ActivityLogPort,
  ) {}

  hydrate(
    payload: Record<string, unknown>,
    context: Record<string, unknown>,
  ): CreateVideoFinalSagaContext {
    return {
      // 모르는 버전이면 여기서 던짐(조용히 다른 버전으로 재개 방지)
      scope: ownerVersionScope({
        organizationId: Number(payload.organizationId),
        ownerUserId: Number(payload.ownerUserId),
        version: payload.version,
      }),
      sourceId: Number(payload.sourceId),
      setId: Number(payload.setId),
      clientRequestId:
        typeof payload.clientRequestId === 'string' ? payload.clientRequestId : null,
      ...(context as Partial<CreateVideoFinalSagaContext>),
    };
  }

  readonly steps: readonly SagaStep<CreateVideoFinalSagaContext>[] = [
    {
      name: 'reserve-row',
      execute: async (ctx) => {
        // 원천도 같은 스코프로 집음(다른 버전 원천으로는 최종을 만들 수 없음)
        const source = await this.videoProjects.getPersonal(ctx.scope, ctx.sourceId);
        // 원천이 없거나 남의 것이면 사가가 성립하지 않고 서비스가 null 로 번역
        if (!source) throw new SourceMissingError();
        if (source.renderStatus !== 'COMPLETED' || !source.resultUploadId) {
          throw new BadRequestException('완성된 원천 영상만 세트를 적용할 수 있습니다.');
        }
        const set = await this.assetSets.getOneById(ctx.setId, ctx.scope.organizationId);
        if (!set) throw new BadRequestException('세트를 찾을 수 없습니다.');
        if (!set.frameUploadId && !set.outroUploadId) {
          throw new BadRequestException('세트에 배경프레임/아웃트로가 없습니다.');
        }

        // 제목과 자막 오버레이를 세트가 정의한 구역별 스타일로 빌드(없으면 기본값)
        // 자막 트랙은 원천에서 오고, 이 스냅샷은 렌더 잡과 최종 레코드 양쪽에 쓰임
        const overlays = overlaysFromSet(source.title, set.overlays);
        // 사전검증: 원천 영상과 프레임, 아웃트로가 실제 UPLOADED 인지(doomed 잡과 예약 행 차단)
        await assertAssetsUploaded(
          this.storage,
          collectFinalAssetIds({
            sourceUploadId: source.resultUploadId,
            frameUploadId: set.frameUploadId,
            outroUploadId: set.outroUploadId,
            aspectRatio: source.aspectRatio,
            captionsUploadId: source.captionsUploadId,
            overlays,
          }),
        );

        const reserved = await this.repository.createRecord(ctx.scope, {
          // 원천의 채널을 굳힘. 원천이 삭제돼도 최종이 자기 워크스페이스에 남아야 함
          channelId: source.channelId,
          parentSourceId: ctx.sourceId,
          frameUploadId: set.frameUploadId,
          outroUploadId: set.outroUploadId,
          title: source.title,
          aspectRatio: source.aspectRatio,
          overlays,
          clientRequestId: ctx.clientRequestId,
          renderJobId: null,
          renderStatus: 'PENDING',
          // 만든 시점의 버전을 굳힘(보관 시점이 아님). 보관 시점에 태그하면 접근 경로가 사라짐
        });
        return {
          finalId: reserved.id,
          finalTitle: reserved.title,
          finalChannelId: reserved.channelId,
          sourceUploadId: source.resultUploadId,
          captionsUploadId: source.captionsUploadId,
        };
      },
      compensate: async (ctx) => {
        if (ctx.finalId == null) return;
        await this.repository.deleteRecordById(ctx.scope.organizationId, ctx.finalId);
      },
    },
    {
      name: 'create-job',
      execute: async (ctx, meta) => {
        const spec = await this.buildSpec(ctx);
        // 재실행에도 같은 키라 video-model 이 중복을 접음
        const renderJobId = await this.render.createJob(spec, meta.idempotencyKey);
        return { renderJobId };
      },
      compensate: async (ctx) => {
        if (!ctx.renderJobId) return;
        // 되돌릴 때 잡을 남기면 붙일 행이 없어 완료도 관측되지 않고 벤더 요금만 나감
        await this.render.cancelJob(ctx.renderJobId);
      },
    },
    {
      name: 'attach-job',
      execute: async (ctx) => {
        if (ctx.finalId == null || !ctx.renderJobId) {
          throw new Error('예약 행이나 잡 id 가 없습니다(사가 컨텍스트 손상).');
        }
        await this.repository.startRenderRecord(
          ctx.scope.organizationId,
          ctx.finalId,
          ctx.renderJobId,
        );
        return {};
      },
    },
    {
      name: 'log',
      execute: async (ctx) => {
        this.activityLog.log({
          organizationId: ctx.scope.organizationId,
          actorUserId: ctx.scope.ownerUserId,
          channelId: ctx.finalChannelId ?? null,
          version: ctx.scope.version,
          action: 'final.created',
          message: `최종영상 생성: ${ctx.finalTitle ?? ''}`,
          target: { kind: 'final', id: ctx.finalId ?? 0 },
          jobId: ctx.renderJobId,
          dedupeKey: `final.created:${ctx.finalId}`,
          detail: { parent_source_id: ctx.sourceId, asset_set_id: ctx.setId },
        });
        return {};
      },
    },
  ];

  /** 사가가 만든 최종본. 컨텍스트는 스칼라만 담으므로 엔티티는 여기서 읽음 */
  async result(ctx: CreateVideoFinalSagaContext): Promise<VideoFinalEntity | null> {
    if (ctx.finalId == null) return null;
    return this.repository.findOneOwned(ctx.scope, ctx.finalId);
  }

  /**
   * FINALIZE 스펙을 예약 행과 1단계가 남긴 원천 값에서 조립
   * 원천을 다시 읽지 않으므로 세트가 바뀌거나 원천이 재렌더돼도 재개 시 같은 스펙이 나옴
   */
  private async buildSpec(ctx: CreateVideoFinalSagaContext): Promise<FinalRenderSpec> {
    if (ctx.finalId == null) throw new Error('예약 행이 없습니다(사가 컨텍스트 손상).');
    if (!ctx.sourceUploadId) {
      throw new Error('원천 결과물 uploadId 가 없습니다(사가 컨텍스트 손상).');
    }
    const row = await this.repository.findOneOwned(ctx.scope, ctx.finalId);
    if (!row) throw new Error(`예약 행이 사라졌습니다(final=${ctx.finalId}).`);
    // 행에 굳은 버전으로 고름(만든 규칙 그대로 합성돼야 함). 조립 규칙은 버전별 빌더가 소유
    return this.specsByVersion[row.version].buildSpec({
      final: row,
      sourceUploadId: ctx.sourceUploadId,
      captionsUploadId: ctx.captionsUploadId ?? null,
    });
  }
}

/**
 * 원천이 없거나 남의 것이라 사가가 성립하지 않음
 * 서비스가 null 로 번역해 404 가 되고, 예외 없이 끝내면 없는 최종본을 성공으로 응답
 */
export class SourceMissingError extends Error {
  constructor() {
    super('원천 영상을 찾을 수 없습니다.');
    this.name = 'SourceMissingError';
  }
}
