import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { VideoFinalEntity } from '../../domain';
import {
  FinalRenderPort,
  FinalRenderSpecBuilder,
  FINAL_RENDER_SPEC_BUILDERS,
  FINAL_RENDER_PORT,
  VideoFinalRepositoryPort,
  VIDEO_FINAL_REPOSITORY_PORT,
} from '../ports/outbound';
import {
  VideoProjectPort,
  VIDEO_PROJECT_PORT,
} from '../../../../video-project/core/application/ports/inbound';
import {
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
import { SagaDefinition, SagaStep } from '@csc/saga';
import type { VersionRegistry } from '../../../../../shared/domain/version-registry';

// 이 사가의 종류 key. 저장된 saga_type 이고 복구 러너가 이 값으로 정의를 찾음
export const RERENDER_VIDEO_FINAL_SAGA_TYPE = 'video_final.rerender';

/** 최종 영상 재렌더 사가의 컨텍스트. 스칼라만 담음 */
export interface RerenderVideoFinalSagaContext {
  // payload: 조직 + 작업자 + 요청이 말한 버전(재개도 같은 버전으로 진행)
  scope: OwnerVersionScope;
  finalId: number;
  // 1단계 산출
  renderJobId?: string;
  finalTitle?: string;
  finalChannelId?: number | null;
  parentSourceId?: number;
}

/**
 * 최종 영상 재렌더 사가. 순서는 잡 등록(보상 취소) → 잡 부착 → 로그
 * 예약할 행이 없어 잡이 먼저 만들어지므로 붙이기가 실패하면 폴링되지 않는 유료 잡이 남음
 */
@Injectable()
export class RerenderVideoFinalSaga
  implements SagaDefinition<RerenderVideoFinalSagaContext>
{
  readonly type = RERENDER_VIDEO_FINAL_SAGA_TYPE;

  constructor(
    @Inject(VIDEO_FINAL_REPOSITORY_PORT)
    private readonly repository: VideoFinalRepositoryPort,
    @Inject(FINAL_RENDER_PORT)
    private readonly render: FinalRenderPort,
    @Inject(VIDEO_PROJECT_PORT)
    private readonly videoProjects: VideoProjectPort,
    @Inject(FILE_UPLOAD_STORAGE_PORT)
    private readonly storage: FileUploadStoragePort,
    // 버전별 최종 합성 스펙 조립. 복구 러너가 요청 밖에서 돌아 표에서 고름
    @Inject(FINAL_RENDER_SPEC_BUILDERS)
    private readonly specsByVersion: VersionRegistry<FinalRenderSpecBuilder>,
    @Inject(ACTIVITY_LOG_PORT)
    private readonly activityLog: ActivityLogPort,
  ) {}

  hydrate(
    payload: Record<string, unknown>,
    context: Record<string, unknown>,
  ): RerenderVideoFinalSagaContext {
    return {
      scope: ownerVersionScope({
        organizationId: Number(payload.organizationId),
        ownerUserId: Number(payload.ownerUserId),
        version: payload.version,
      }),
      finalId: Number(payload.finalId),
      ...(context as Partial<RerenderVideoFinalSagaContext>),
    };
  }

  readonly steps: readonly SagaStep<RerenderVideoFinalSagaContext>[] = [
    {
      name: 'create-job',
      execute: async (ctx, meta) => {
        // 소유는 스코프가 확인하고 위치는 여기서 봄(보관물은 이 경로에서 제외)
        const final = await this.repository.findOneOwned(ctx.scope, ctx.finalId);
        if (!final || final.location !== 'personal') {
          throw new VideoFinalMissingError();
        }
        if (final.parentSourceId == null) {
          throw new BadRequestException('원천 영상이 없어 다시 만들 수 없습니다.');
        }
        const source = await this.videoProjects.getPersonal(
          ctx.scope,
          final.parentSourceId,
        );
        if (!source || source.renderStatus !== 'COMPLETED' || !source.resultUploadId) {
          throw new BadRequestException(
            '원천 영상이 완성 상태가 아니라 다시 만들 수 없습니다.',
          );
        }
        // 생성 사가와 같은 빌더가 조립하고 고르는 근거는 행에 굳은 버전
        const specs = this.specsByVersion[final.version];
        const spec = specs.buildSpec({
          final,
          sourceUploadId: source.resultUploadId,
          // 자막 트랙은 원천에서 재취득(오버레이 스타일은 행에 영속된 것)
          captionsUploadId: source.captionsUploadId,
        });
        await specs.assertSpecAssetsUploaded(this.storage, spec);
        const renderJobId = await this.render.createJob(spec, meta.idempotencyKey);
        return {
          renderJobId,
          finalTitle: final.title,
          finalChannelId: final.channelId,
          parentSourceId: final.parentSourceId,
        };
      },
      compensate: async (ctx) => {
        if (!ctx.renderJobId) return;
        await this.render.cancelJob(ctx.renderJobId);
      },
    },
    {
      name: 'attach-job',
      execute: async (ctx) => {
        if (!ctx.renderJobId) throw new Error('잡 id 가 없습니다(사가 컨텍스트 손상).');
        const restarted = await this.repository.startRenderRecord(
          ctx.scope.organizationId,
          ctx.finalId,
          ctx.renderJobId,
        );
        // 붙일 행이 사라짐. 던져서 1단계 보상이 잡을 취소하게 함
        if (!restarted) throw new VideoFinalMissingError();
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
          action: 'final.rerendered',
          message: `최종영상 다시 만들기: ${ctx.finalTitle ?? ''}`,
          target: { kind: 'final', id: ctx.finalId },
          jobId: ctx.renderJobId,
          detail: { parent_source_id: ctx.parentSourceId ?? 0 },
        });
        return {};
      },
    },
  ];

  /** 재렌더된 최종본 */
  async result(ctx: RerenderVideoFinalSagaContext): Promise<VideoFinalEntity | null> {
    return this.repository.findOneOwned(ctx.scope, ctx.finalId);
  }
}

/** 최종본이 없거나 남의 것이거나 보관물이라 재렌더가 성립하지 않음. 서비스가 null 로 번역해 404 */
export class VideoFinalMissingError extends Error {
  constructor() {
    super('최종 영상을 찾을 수 없습니다.');
    this.name = 'VideoFinalMissingError';
  }
}
