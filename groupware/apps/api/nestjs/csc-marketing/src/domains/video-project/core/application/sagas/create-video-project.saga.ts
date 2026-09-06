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
  SavedPlanPort,
  SAVED_PLAN_PORT,
} from '../../../../saved-plan/core/application/ports/inbound';
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
export const CREATE_VIDEO_PROJECT_SAGA_TYPE = 'video_project.create';

/**
 * 원천 영상 생성 사가의 컨텍스트. JSON 왕복이 안전한 스칼라만 담음
 * 렌더 스펙은 담지 않음(조직 API 자격증명이 들어가 DB 에 남으면 안 됨). 스펙은 예약 행에서 재조립
 */
export interface CreateVideoProjectSagaContext {
  // payload: 조직 + 작업자 + 요청이 말한 버전. 복구가 버전을 다시 읽으면 다른 버전으로 재개됨
  scope: OwnerVersionScope;
  savedPlanId: number;
  requestedResolution: string | null;
  clientRequestId: string | null;
  // 1단계 산출: 예약된 행과 로그에 필요한 스칼라
  projectId?: number;
  projectTitle?: string;
  projectChannelId?: number | null;
  resolution?: string;
  videoModel?: string;
  sceneCount?: number;
  // 2단계 산출: 렌더 잡 id
  renderJobId?: string;
}

/**
 * 원천 영상 생성 사가. 순서는 예약 INSERT(보상 삭제) → 잡 등록(보상 취소) → 잡 부착 → 로그
 * 행을 잡보다 먼저 만드는 것이 핵심(잡 먼저면 멱등키가 돈이 나간 뒤에 중복을 거절)
 * 2단계 재실행은 두 번째 잡을 만들 수 있음(벤더 멱등키 도입까지 남는 쓰기 한 번 폭의 창)
 */
@Injectable()
export class CreateVideoProjectSaga
  implements SagaDefinition<CreateVideoProjectSagaContext>
{
  readonly type = CREATE_VIDEO_PROJECT_SAGA_TYPE;

  constructor(
    @Inject(VIDEO_PROJECT_REPOSITORY_PORT)
    private readonly repository: VideoProjectRepositoryPort,
    @Inject(VIDEO_RENDER_PORT)
    private readonly render: VideoRenderPort,
    @Inject(SAVED_PLAN_PORT)
    private readonly savedPlans: SavedPlanPort,
    @Inject(FILE_UPLOAD_STORAGE_PORT)
    private readonly storage: FileUploadStoragePort,
    @Inject(ACTIVITY_LOG_PORT)
    private readonly activityLog: ActivityLogPort,
    // 버전별 스펙 조립과 사전검증 규칙. 복구 러너는 요청 스코프 DI 밖이라 payload 버전으로 표에서 고름
    @Inject(VIDEO_RENDER_SPEC_BUILDERS)
    private readonly specsByVersion: VersionRegistry<VideoRenderSpecBuilder>,
  ) {}

  hydrate(
    payload: Record<string, unknown>,
    context: Record<string, unknown>,
  ): CreateVideoProjectSagaContext {
    return {
      // 모르는 버전이면 여기서 던짐(조용히 다른 버전으로 재개 방지)
      scope: ownerVersionScope({
        organizationId: Number(payload.organizationId),
        ownerUserId: Number(payload.ownerUserId),
        version: payload.version,
      }),
      savedPlanId: Number(payload.savedPlanId),
      requestedResolution:
        typeof payload.requestedResolution === 'string' ? payload.requestedResolution : null,
      clientRequestId:
        typeof payload.clientRequestId === 'string' ? payload.clientRequestId : null,
      ...(context as Partial<CreateVideoProjectSagaContext>),
    };
  }

  readonly steps: readonly SagaStep<CreateVideoProjectSagaContext>[] = [
    {
      name: 'reserve-row',
      execute: async (ctx) => {
        // 기획안도 같은 스코프로 집음(다른 버전 기획안으로는 영상을 만들 수 없음)
        const plan = await this.savedPlans.getPersonal(ctx.scope, ctx.savedPlanId);
        // 저장본이 없거나 남의 것이면 사가가 성립하지 않고 서비스가 null 로 번역
        if (!plan) throw new SavedPlanMissingError();
        // BGM 필수. 생성은 허용하되 렌더 경계에서 강제
        if (!plan.bgm) {
          throw new BadRequestException(
            'BGM 이 없어 영상을 만들 수 없습니다. 에셋에서 BGM 을 먼저 등록한 뒤 기획안을 다시 생성하세요.',
          );
        }
        // 이 버전의 조립기. 기획안이 어떤 영상이 될지가 여기서 정해짐
        const specs = this.specsByVersion[ctx.scope.version];
        const prepared = await specs.prepareFromPlan(ctx.scope, plan, ctx.requestedResolution);
        // 사전검증: 자산이 실제 UPLOADED 인지. 예약 전에 doomed 잡과 쓸모없는 예약 행을 차단
        await specs.assertSpecAssetsUploaded(this.storage, prepared.spec);

        const reserved = await this.repository.createRecord(ctx.scope, {
          channelId: plan.channelId,
          savedPlanId: plan.id,
          title: plan.title,
          aspectRatio: prepared.aspectRatio,
          resolution: prepared.resolution,
          videoModel: prepared.aiModels.video,
          videoMode: prepared.aiModels.videoMode,
          // 세그먼트 연결 방식을 행에 굳힘. 이 행에서 스펙이 조립되므로 없으면 렌더에 도달하지 않음
          segmentMode: plan.segmentMode,
          ttsModel: prepared.spec.tts.provider,
          ttsVoice: prepared.spec.tts.voice,
          ttsPitch: prepared.spec.tts.pitch,
          scenes: prepared.scenes,
          background: null,
          bgm: plan.bgm,
          clientRequestId: ctx.clientRequestId,
          renderJobId: null,
          renderStatus: 'PENDING',
        });
        return {
          projectId: reserved.id,
          projectTitle: reserved.title,
          projectChannelId: reserved.channelId,
          resolution: reserved.resolution,
          videoModel: reserved.videoModel,
          sceneCount: reserved.scenes.length,
        };
      },
      compensate: async (ctx) => {
        if (ctx.projectId == null) return;
        await this.repository.deleteRecordById(ctx.scope.organizationId, ctx.projectId);
      },
    },
    {
      name: 'create-job',
      execute: async (ctx, meta) => {
        const project = await this.requireRow(ctx);
        // 스펙을 예약 행에서 재조립. 행이 생성 시점 스냅샷이라 기획안이 바뀌어도 어긋나지 않음
        // 행에 굳은 버전으로 고름(만든 규칙 그대로 렌더돼야 하므로 요청 버전이 아님)
        const spec = await this.specsByVersion[project.version].buildSpecFromRow(project);
        // 재실행에도 같은 키라 video-model 이 중복을 접음(마지막 이중 과금 경로였음)
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
        if (ctx.projectId == null || !ctx.renderJobId) {
          throw new Error('예약 행이나 잡 id 가 없습니다(사가 컨텍스트 손상).');
        }
        await this.repository.startRenderRecord(
          ctx.scope.organizationId,
          ctx.projectId,
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
          channelId: ctx.projectChannelId ?? null,
          version: ctx.scope.version,
          action: 'source.created',
          message: `원천영상 생성: ${ctx.projectTitle ?? ''}`,
          target: { kind: 'source', id: ctx.projectId ?? 0 },
          jobId: ctx.renderJobId,
          dedupeKey: `source.created:${ctx.projectId}`,
          detail: {
            saved_plan_id: ctx.savedPlanId,
            scene_count: ctx.sceneCount ?? 0,
            resolution: ctx.resolution ?? '',
            video_model: ctx.videoModel ?? '',
          },
        });
        return {};
      },
    },
  ];

  /** 사가가 만든 프로젝트. 컨텍스트는 스칼라만 담으므로 엔티티는 여기서 읽음 */
  async result(ctx: CreateVideoProjectSagaContext): Promise<VideoProjectEntity | null> {
    if (ctx.projectId == null) return null;
    return this.repository.findOneOwned(ctx.scope, ctx.projectId);
  }

  private async requireRow(
    ctx: CreateVideoProjectSagaContext,
  ): Promise<VideoProjectEntity> {
    if (ctx.projectId == null) throw new Error('예약 행이 없습니다(사가 컨텍스트 손상).');
    const row = await this.repository.findOneOwned(ctx.scope, ctx.projectId);
    if (!row) throw new Error(`예약 행이 사라졌습니다(project=${ctx.projectId}).`);
    return row;
  }
}

/**
 * 저장본이 없거나 남의 것이라 사가가 성립하지 않음
 * 도메인 예외를 두는 이유: 단계를 그냥 끝내면 사가가 성공으로 기록되고 없는 프로젝트를 성공 응답
 */
export class SavedPlanMissingError extends Error {
  constructor() {
    super('저장본을 찾을 수 없습니다.');
    this.name = 'SavedPlanMissingError';
  }
}
