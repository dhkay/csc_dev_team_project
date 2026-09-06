import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { VideoProjectEntity } from '../../domain';
import {
  VideoProjectRepositoryPort,
  VIDEO_PROJECT_REPOSITORY_PORT,
  VideoRenderPort,
  VideoRenderSpecBuilder,
  VIDEO_RENDER_PORT,
  VIDEO_RENDER_SPEC_BUILDERS,
} from '../ports/outbound';
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
import type { VersionRegistry } from '../../../../../shared/domain/version-registry';
import { SagaDefinition, SagaStep } from '@csc/saga';

// 이 사가의 종류 key. 저장된 saga_type 이고 복구 러너가 이 값으로 정의를 찾음
export const RERENDER_VIDEO_PROJECT_SAGA_TYPE = 'video_project.rerender';

/** 원천 영상 재렌더 사가의 컨텍스트. 스칼라만 담음(스펙과 자격증명 제외) */
export interface RerenderVideoProjectSagaContext {
  // payload: 조직 + 작업자 + 요청이 말한 버전(재개도 같은 버전으로 진행)
  scope: OwnerVersionScope;
  projectId: number;
  // 1단계 산출
  renderJobId?: string;
  projectTitle?: string;
  projectChannelId?: number | null;
  resolution?: string;
  videoModel?: string;
}

/**
 * 원천 영상 재렌더 사가. 순서는 잡 등록(보상 취소) → 잡 부착 → 로그
 * 행이 이미 있어 순서를 뒤집을 수 없고, 붙이는 중 크래시면 폴링되지 않는 유료 잡이 남음
 * 그래서 보상이 잡을 취소하고 중단 시 복구 러너가 잡 id 로 붙이기를 이어 감. 멱등키는 없음
 */
@Injectable()
export class RerenderVideoProjectSaga
  implements SagaDefinition<RerenderVideoProjectSagaContext>
{
  readonly type = RERENDER_VIDEO_PROJECT_SAGA_TYPE;

  constructor(
    @Inject(VIDEO_PROJECT_REPOSITORY_PORT)
    private readonly repository: VideoProjectRepositoryPort,
    @Inject(VIDEO_RENDER_PORT)
    private readonly render: VideoRenderPort,
    @Inject(FILE_UPLOAD_STORAGE_PORT)
    private readonly storage: FileUploadStoragePort,
    @Inject(ACTIVITY_LOG_PORT)
    private readonly activityLog: ActivityLogPort,
    // 생성 사가와 같은 표. 두 경로가 다른 스펙을 만들면 그 차이는 렌더 결과에서만 드러남
    @Inject(VIDEO_RENDER_SPEC_BUILDERS)
    private readonly specsByVersion: VersionRegistry<VideoRenderSpecBuilder>,
  ) {}

  hydrate(
    payload: Record<string, unknown>,
    context: Record<string, unknown>,
  ): RerenderVideoProjectSagaContext {
    return {
      scope: ownerVersionScope({
        organizationId: Number(payload.organizationId),
        ownerUserId: Number(payload.ownerUserId),
        version: payload.version,
      }),
      projectId: Number(payload.projectId),
      ...(context as Partial<RerenderVideoProjectSagaContext>),
    };
  }

  readonly steps: readonly SagaStep<RerenderVideoProjectSagaContext>[] = [
    {
      name: 'create-job',
      execute: async (ctx, meta) => {
        // 스코프가 소유를 확인. 없거나 남의 것이거나 다른 버전이면 서비스가 null 로 번역
        const project = await this.repository.findOneOwned(ctx.scope, ctx.projectId);
        if (!project) throw new VideoProjectMissingError();
        // BGM 필수. 스냅샷에 없으면 재렌더도 차단(구 프로젝트 방어)
        if (!project.bgm) {
          throw new BadRequestException(
            'BGM 이 없어 렌더할 수 없습니다. 기획안을 다시 생성해 BGM 을 배정하세요.',
          );
        }
        // 행에 굳은 버전으로 고름. 다른 버전 규칙으로 다시 렌더되면 결과물을 보고서야 알게 됨
        const specs = this.specsByVersion[project.version];
        const spec = await specs.buildSpecFromRow(project);
        await specs.assertSpecAssetsUploaded(this.storage, spec);
        const renderJobId = await this.render.createJob(spec, meta.idempotencyKey);
        return {
          renderJobId,
          projectTitle: project.title,
          projectChannelId: project.channelId,
          resolution: project.resolution,
          videoModel: project.videoModel,
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
          ctx.projectId,
          ctx.renderJobId,
        );
        // 붙일 행이 사라짐. 던져서 1단계 보상이 잡을 취소하게 함(조용히 끝내면 유료 잡이 고아가 됨)
        if (!restarted) {
          throw new VideoProjectMissingError();
        }
        return {};
      },
    },
    {
      name: 'log',
      execute: async (ctx) => {
        this.activityLog.log({
          organizationId: ctx.scope.organizationId,
          actorUserId: ctx.scope.ownerUserId,
          channelId: ctx.projectChannelId ?? null,
          version: ctx.scope.version,
          action: 'source.rerendered',
          message: `원천영상 다시 만들기: ${ctx.projectTitle ?? ''}`,
          target: { kind: 'source', id: ctx.projectId },
          jobId: ctx.renderJobId,
          detail: {
            resolution: ctx.resolution ?? '',
            video_model: ctx.videoModel ?? '',
          },
        });
        return {};
      },
    },
  ];

  /** 재렌더된 프로젝트 */
  async result(
    ctx: RerenderVideoProjectSagaContext,
  ): Promise<VideoProjectEntity | null> {
    return this.repository.findOneOwned(ctx.scope, ctx.projectId);
  }
}

/** 프로젝트가 없거나 남의 것이라 재렌더가 성립하지 않음. 서비스가 null 로 번역해 404 응답 */
export class VideoProjectMissingError extends Error {
  constructor() {
    super('원천 영상을 찾을 수 없습니다.');
    this.name = 'VideoProjectMissingError';
  }
}
