import { Inject, Injectable } from '@nestjs/common';
import { SavedPlanEntity } from '../../domain';
import { SavePlanInput } from '../ports/inbound';
import { SavedPlanRepositoryPort, SAVED_PLAN_REPOSITORY_PORT } from '../ports/outbound';
import {
  FileUploadStoragePort,
  FILE_UPLOAD_STORAGE_PORT,
} from '../../../../../shared/domain/storage';
import {
  ActivityLogPort,
  ACTIVITY_LOG_PORT,
} from '../../../../../shared/domain/activity-log';
import {
  ChannelSettingsPort,
  CHANNEL_SETTINGS_PORT,
} from '../../../../channel-settings/core/application/ports/inbound';
import {
  ownerVersionScope,
  type OwnerVersionScope,
} from '../../../../../shared/domain/workspace-scope';
import { SagaDefinition, SagaStep } from '@csc/saga';
import { planLlmForVersion } from '../../../../../shared/domain/version-pipeline';

// 이 사가의 종류 key. 저장된 saga_type 이고 복구 러너가 이 값으로 정의를 찾음
export const SAVE_PLAN_SAGA_TYPE = 'saved_plan.save';

/**
 * 기획안 저장 사가의 컨텍스트. JSON 으로 왕복 가능한 값만 담음
 * Date 와 클래스 인스턴스, 자격증명은 넣지 않음(전자는 문자열로 돌아오고 후자는 남으면 안 됨)
 */
export interface SavePlanSagaContext {
  // payload: 조직 + 작업자 + 요청이 말한 버전. 복구가 버전을 다시 읽으면 다른 버전으로 재개됨
  scope: OwnerVersionScope;
  // payload: 저장 입력 전부. 재개가 이것만 보고 남은 단계를 실행할 수 있어야 함
  input: SavePlanInput;
  // 1단계 산출: 저장 시점 모델 스냅샷
  llmModel?: string;
  imageModel?: string;
  // 2단계 산출: 만들어진 행과 로그에 필요한 스칼라(로그 단계가 다시 읽지 않게)
  planId?: number;
  planTitle?: string;
  planChannelId?: number | null;
  planSceneCount?: number;
}

/**
 * 기획안 저장 사가. 순서는 모델 스냅샷 → 저장본 INSERT(보상 삭제) → 씬 이미지 확정 → 로그
 *
 * 확정을 3단계에 두는 것이 핵심. 브라우저가 미리 확정하면 INSERT 실패 시 참조 없는 UPLOADED 가
 * 영구히 남고 아무도 거둘 수 없다. 뒤로 미루면 실패분이 PENDING 으로 남아 수거자가 거둔다.
 * 계약: docs/specs/marketing-write-consistency.md
 */
@Injectable()
export class SavePlanSaga implements SagaDefinition<SavePlanSagaContext> {
  readonly type = SAVE_PLAN_SAGA_TYPE;

  constructor(
    @Inject(SAVED_PLAN_REPOSITORY_PORT)
    private readonly repository: SavedPlanRepositoryPort,
    @Inject(FILE_UPLOAD_STORAGE_PORT)
    private readonly imageStorage: FileUploadStoragePort,
    @Inject(CHANNEL_SETTINGS_PORT)
    private readonly channelSettings: ChannelSettingsPort,
    @Inject(ACTIVITY_LOG_PORT)
    private readonly activityLog: ActivityLogPort,
  ) {}

  /**
   * 저장된 payload 와 context 를 단계가 볼 컨텍스트로 복원
   * jsonb 는 형태를 보장하지 않아 캐스팅이며, payload 를 넣는 경로가 DTO 검증 하나뿐이라 안전
   */
  hydrate(
    payload: Record<string, unknown>,
    context: Record<string, unknown>,
  ): SavePlanSagaContext {
    return {
      // 모르는 버전이면 여기서 던짐(조용히 다른 버전으로 재개 방지)
      scope: ownerVersionScope({
        organizationId: Number(payload.organizationId),
        ownerUserId: Number(payload.ownerUserId),
        version: payload.version,
      }),
      input: payload.input as SavePlanInput,
      ...(context as Partial<SavePlanSagaContext>),
    };
  }

  readonly steps: readonly SagaStep<SavePlanSagaContext>[] = [
    {
      name: 'resolve-models',
      execute: async (ctx) => {
        // 기획 LLM 은 요청이 실어 온 값을 그대로 굳힘(생성 응답이 밝힌 실제 모델)
        // 여기서 설정을 다시 읽으면 생성 후 설정을 바꾼 사람의 저장본에 쓰지 않은 모델이 기록됨
        const llmModel = planLlmForVersion(ctx.scope.version, ctx.input.llmModel);
        // 이미지 모델은 아직 저장 시점 설정에서 읽음. 같은 어긋남이 있지만 응답에 실려 오지 않아
        // 고치려면 이미지 생성 경로까지 봉투로 바꿔야 해 범위 밖. 조회 실패는 빈 값으로 진행
        try {
          const models = await this.channelSettings.getAiModels(ctx.scope);
          return { llmModel, imageModel: models.image };
        } catch {
          return { llmModel, imageModel: '' };
        }
      },
    },
    {
      name: 'create-row',
      execute: async (ctx) => {
        const created = await this.repository.createRecord(ctx.scope, {
          location: 'personal',
          channelId: ctx.input.channelId,
          brandName: ctx.input.brandName,
          brandConcepts: ctx.input.brandConcepts,
          videoModel: ctx.input.videoModel ?? '',
          segmentMode: ctx.input.segmentMode ?? '',
          clientRequestId: ctx.input.clientRequestId ?? null,
          title: ctx.input.title,
          summary: ctx.input.summary,
          scenes: ctx.input.scenes,
          sceneImages: ctx.input.sceneImages,
          bgm: ctx.input.bgm,
          llmModel: ctx.llmModel ?? '',
          imageModel: ctx.imageModel ?? '',
        });
        // 로그 단계가 쓸 스칼라를 함께 남김(그 단계가 행을 다시 읽지 않게)
        return {
          planId: created.id,
          planTitle: created.title,
          planChannelId: created.channelId,
          planSceneCount: created.scenes.length,
        };
      },
      compensate: async (ctx) => {
        if (ctx.planId == null) return;
        await this.repository.deleteRecordById(ctx.scope.organizationId, ctx.planId);
      },
    },
    {
      name: 'confirm-assets',
      // 재실행 안전: 이미 UPLOADED 인 자산의 확정은 같은 상태를 다시 씀(멱등)
      execute: async (ctx) => {
        await this.imageStorage.confirmAssets(
          ctx.input.sceneImages.map((img) => img.uploadId),
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
          channelId: ctx.planChannelId ?? null,
          version: ctx.scope.version,
          action: 'saved_plan.created',
          message: `기획안 저장: ${ctx.planTitle ?? ''}`,
          target: { kind: 'saved_plan', id: ctx.planId ?? 0 },
          // 재개로 이 단계가 두 번 불릴 수 있는 창이 있어 dedupeKey 를 부여
          dedupeKey: `saved_plan.created:${ctx.planId}`,
          detail: {
            scene_count: ctx.planSceneCount ?? 0,
            brand_name: ctx.input.brandName,
          },
        });
        return {};
      },
    },
  ];

  /** 사가가 만든 저장본. 컨텍스트는 스칼라만 담으므로 엔티티는 여기서 읽음 */
  async result(ctx: SavePlanSagaContext): Promise<SavedPlanEntity | null> {
    if (ctx.planId == null) return null;
    return this.repository.findOneOwned(ctx.scope, ctx.planId);
  }
}
