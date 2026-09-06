import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { RenderStatus, VideoProjectEntity } from '../../domain';
import {
  VideoProjectRepositoryPort,
  VIDEO_PROJECT_REPOSITORY_PORT,
  VideoRenderPort,
  VIDEO_RENDER_PORT,
} from '../ports/outbound';
import {
  ActivityLogPort,
  ACTIVITY_LOG_PORT,
} from '../../../../../shared/domain/activity-log';
import {
  ownerVersionScope,
  type OwnerVersionScope,
} from '../../../../../shared/domain/workspace-scope';
import { SagaDefinition, SagaStep } from '@csc/saga';
import { VideoProjectMissingError } from './rerender-video-project.saga';

// 이 사가의 종류 key. 저장된 saga_type 이고 복구 러너가 이 값으로 정의를 찾음
export const RERENDER_VIDEO_PROJECT_SEGMENT_SAGA_TYPE = 'video_project.rerender_segment';

/** 세그먼트 재생성 사가의 컨텍스트. 스칼라만 담음(스펙과 자격증명 제외) */
export interface RerenderVideoProjectSegmentSagaContext {
  // payload: 조직 + 작업자 + 요청이 말한 버전(재개도 같은 버전으로 진행)
  scope: OwnerVersionScope;
  projectId: number;
  // 다시 만들 세그먼트의 순번
  order: number;
  // 고친 화면 묘사. 없으면 원래 묘사 그대로 재생성
  visualPrompt?: string | null;
  // 1단계 산출: 원격 호출 실패 시 되돌릴 자리
  renderJobId?: string;
  previousStatus?: RenderStatus;
  previousResultUploadId?: string | null;
  previousCaptionsUploadId?: string | null;
  previousError?: string | null;
  previousErrorCode?: string | null;
  projectTitle?: string;
  projectChannelId?: number | null;
}

/**
 * 세그먼트 하나 다시 만들기 사가. 순서는 행을 RENDERING 으로 예약(보상 복구) → 씬 렌더 요청 → 로그
 *
 * 행 전환이 곧 예약(marketing-write-consistency.md 4.3.1). 이미 있는 잡을 다시 돌리므로
 * 예약할 자리가 행 하나뿐이라 전체 재렌더와 순서가 반대
 * 2단계에 보상이 없는 이유: 되돌리려면 잡 전체를 취소해야 하고 그러면 다른 씬까지 죽음
 * 멱등키 없음. 비용 원장은 종료 전이를 실제로 쓴 reconcile 이 남김
 */
@Injectable()
export class RerenderVideoProjectSegmentSaga
  implements SagaDefinition<RerenderVideoProjectSegmentSagaContext>
{
  readonly type = RERENDER_VIDEO_PROJECT_SEGMENT_SAGA_TYPE;

  constructor(
    @Inject(VIDEO_PROJECT_REPOSITORY_PORT)
    private readonly repository: VideoProjectRepositoryPort,
    @Inject(VIDEO_RENDER_PORT)
    private readonly render: VideoRenderPort,
    @Inject(ACTIVITY_LOG_PORT)
    private readonly activityLog: ActivityLogPort,
  ) {}

  hydrate(
    payload: Record<string, unknown>,
    context: Record<string, unknown>,
  ): RerenderVideoProjectSegmentSagaContext {
    return {
      scope: ownerVersionScope({
        organizationId: Number(payload.organizationId),
        ownerUserId: Number(payload.ownerUserId),
        version: payload.version,
      }),
      projectId: Number(payload.projectId),
      order: Number(payload.order),
      visualPrompt: (payload.visualPrompt as string | null) ?? null,
      ...(context as Partial<RerenderVideoProjectSegmentSagaContext>),
    };
  }

  readonly steps: readonly SagaStep<RerenderVideoProjectSegmentSagaContext>[] = [
    {
      name: 'reserve-render',
      execute: async (ctx) => {
        // 스코프가 소유를 확인. 없거나 남의 것이거나 다른 버전이면 서비스가 null 로 번역
        const project = await this.repository.findOneOwned(ctx.scope, ctx.projectId);
        if (!project) throw new VideoProjectMissingError();
        // 붙어 있는 잡이 없으면 다시 만들 대상 자체가 없어 전체 렌더를 새로 걸어야 함
        if (!project.renderJobId) {
          throw new BadRequestException(
            '아직 만들어진 영상이 없습니다. 영상 만들기를 먼저 실행하세요.',
          );
        }
        const reserved = await this.repository.startRenderRecord(
          project.organizationId,
          project.id,
          project.renderJobId,
        );
        if (!reserved) throw new VideoProjectMissingError();
        return {
          renderJobId: project.renderJobId,
          // 원격 호출 실패 시 화면을 원래대로 돌려놓을 근거
          previousStatus: project.renderStatus,
          previousResultUploadId: project.resultUploadId,
          previousCaptionsUploadId: project.captionsUploadId,
          previousError: project.error,
          previousErrorCode: project.errorCode,
          projectTitle: project.title,
          projectChannelId: project.channelId,
        };
      },
      compensate: async (ctx) => {
        if (!ctx.previousStatus) return;
        // 이 시점의 행은 RENDERING(비종료)이라 레포의 비종료 가드를 통과
        await this.repository.updateRenderStateRecord(ctx.scope.organizationId, ctx.projectId, {
          renderStatus: ctx.previousStatus,
          resultUploadId: ctx.previousResultUploadId ?? null,
          captionsUploadId: ctx.previousCaptionsUploadId ?? null,
          error: ctx.previousError ?? null,
          errorCode: ctx.previousErrorCode ?? null,
        });
      },
    },
    {
      name: 'request-scene-render',
      execute: async (ctx) => {
        if (!ctx.renderJobId) throw new Error('잡 id 가 없습니다(사가 컨텍스트 손상).');
        await this.render.rerenderScene(ctx.renderJobId, ctx.order, ctx.visualPrompt);
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
          message: `세그먼트 다시 만들기(${ctx.order}번): ${ctx.projectTitle ?? ''}`,
          target: { kind: 'source', id: ctx.projectId },
          jobId: ctx.renderJobId,
          detail: {
            segment_order: ctx.order,
            // 묘사 수정 여부. 같은 묘사로 다시 뽑은 것과 고쳐서 뽑은 것은 다른 사건
            prompt_edited: ctx.visualPrompt != null,
          },
        });
        return {};
      },
    },
  ];

  /** 세그먼트를 다시 만들기 시작한 프로젝트 */
  async result(
    ctx: RerenderVideoProjectSegmentSagaContext,
  ): Promise<VideoProjectEntity | null> {
    return this.repository.findOneOwned(ctx.scope, ctx.projectId);
  }
}
