import { Inject, Injectable, Logger } from '@nestjs/common';
import { SavedPlanEntity, SavedPlanSceneImage } from '../../domain';
import { SavedPlanPort, SavePlanInput, UpdateSceneInput } from '../ports/inbound';
import {
  SavedPlanRepositoryPort,
  SAVED_PLAN_REPOSITORY_PORT,
} from '../ports/outbound';
import {
  FileUploadStoragePort,
  FILE_UPLOAD_STORAGE_PORT,
} from '../../../../../shared/domain/storage';
import {
  ActivityLogPort,
  ACTIVITY_LOG_PORT,
} from '../../../../../shared/domain/activity-log';
import type {
  OwnerVersionScope,
  WorkspaceScope,
} from '../../../../../shared/domain/workspace-scope';
import { SagaRunner } from '@csc/saga';
import { SavePlanSaga } from '../sagas';

/**
 * SavedPlanPort 구현: 개인 워크스페이스(작업자 x 채널 x 버전)의 기획안 저장, 목록, 삭제
 * 스코프가 객체인 이유는 버전 누락 질의의 컴파일 차단이고, 단건에 채널이 없는 이유는 소유가 보안 경계라서
 */
@Injectable()
export class SavedPlanService implements SavedPlanPort {
  private readonly logger = new Logger(SavedPlanService.name);

  constructor(
    @Inject(SAVED_PLAN_REPOSITORY_PORT)
    private readonly repository: SavedPlanRepositoryPort,
    @Inject(FILE_UPLOAD_STORAGE_PORT)
    private readonly imageStorage: FileUploadStoragePort,
    @Inject(ACTIVITY_LOG_PORT)
    private readonly activityLog: ActivityLogPort,
    private readonly sagaRunner: SagaRunner,
    private readonly saveSaga: SavePlanSaga,
  ) {}

  /**
   * 기획안 저장. 사가 오케스트레이터에 위임
   * 인라인 try/catch 는 단계 사이 크래시에 돌지 않아 중단 지점부터 이어 가는 일을 러너가 맡음
   * 멱등키가 있으면 러너가 같은 사가를 다시 시작하지 않고 완료된 결과를 그대로 반환
   */
  async savePersonal(
    scope: OwnerVersionScope,
    input: SavePlanInput,
  ): Promise<SavedPlanEntity> {
    const outcome = await this.sagaRunner.run(this.saveSaga, {
      organizationId: scope.organizationId,
      ownerUserId: scope.ownerUserId,
      clientRequestId: input.clientRequestId?.trim() || null,
      // payload 에 버전을 실음. 재개가 요청과 같은 버전으로 이어 가야 함
      payload: {
        organizationId: scope.organizationId,
        ownerUserId: scope.ownerUserId,
        version: scope.version,
        input,
      },
    });
    const saved = await this.saveSaga.result(outcome.context);
    if (!saved) {
      // 사가는 성공했는데 행이 없으면 다른 경로에서 삭제된 것. 성공 오해를 막으려 실패로 만듦
      throw new Error('저장된 기획안을 찾을 수 없습니다.');
    }
    return saved;
  }

  async listPersonal(scope: WorkspaceScope): Promise<SavedPlanEntity[]> {
    // 개인 워크스페이스는 작업자 x 채널 x 버전이고 어느 쪽도 넘어 섞이면 안 됨
    return this.repository.findRecordsByOwner(scope, 'personal');
  }

  async getPersonal(
    scope: OwnerVersionScope,
    id: number,
  ): Promise<SavedPlanEntity | null> {
    return this.findPersonalRecord(scope, id);
  }

  async deletePersonal(scope: OwnerVersionScope, id: number): Promise<boolean> {
    const record = await this.findPersonalRecord(scope, id);
    if (!record) return false;
    const removed = await this.repository.deleteRecordById(scope.organizationId, id);
    if (!removed) return false;
    // 삭제 후엔 행이 없어 로그가 유일한 흔적. 제목과 채널을 여기서 남겨야 재구성이 됨
    this.activityLog.log({
      organizationId: scope.organizationId,
      actorUserId: scope.ownerUserId,
      channelId: record.channelId,
      version: scope.version,
      action: 'saved_plan.deleted',
      message: `기획안 삭제: ${record.title}`,
      target: { kind: 'saved_plan', id: record.id },
      detail: { scene_image_count: record.sceneImages.length },
    });
    if (record.sceneImages.length > 0) {
      // 참조 씬 이미지를 file-upload 에서 정리(best-effort). 실패는 삭제를 막지 않고 흔적만 남김
      const { failed } = await this.imageStorage.deleteAssets(
        record.sceneImages.map((img) => img.uploadId),
      );
      if (failed.length > 0) {
        this.logAssetCleanupFailure(record, scope.ownerUserId, failed.length);
      }
    }
    return true;
  }

  /**
   * 내 워크스페이스 저장본 조회
   * 소유는 레포의 WHERE 가 확인하고 위치는 여기서 봄(소유는 보안 경계, 위치는 제품 규칙)
   */
  private async findPersonalRecord(
    scope: OwnerVersionScope,
    id: number,
  ): Promise<SavedPlanEntity | null> {
    const record = await this.repository.findOneOwned(scope, id);
    return record?.location === 'personal' ? record : null;
  }

  /**
   * 자산 정리 실패를 원장에 기록
   * 새 액션 키를 만들지 않고 기존 항목의 detail 에 얹음(액션을 늘리면 백엔드와 웹 라벨 맵 양쪽 등록 필요)
   */
  private logAssetCleanupFailure(
    record: SavedPlanEntity,
    actorUserId: number,
    failedCount: number,
  ): void {
    this.activityLog.log({
      organizationId: record.organizationId,
      actorUserId,
      channelId: record.channelId,
      version: record.version,
      action: 'saved_plan.deleted',
      message: `기획안 씬 이미지 정리 실패: ${record.title} (${failedCount}건)`,
      target: { kind: 'saved_plan', id: record.id },
      detail: { asset_cleanup_failed: failedCount },
    });
  }

  async updateScenePersonal(
    scope: OwnerVersionScope,
    id: number,
    input: UpdateSceneInput,
  ): Promise<SavedPlanEntity | null> {
    const record = await this.findPersonalRecord(scope, id);
    if (!record) return null;
    const organizationId = scope.organizationId;

    // 브리프 수정은 준 경우만 해당 씬에 반영
    const scenes =
      input.imagePrompt === undefined
        ? record.scenes
        : record.scenes.map((s) =>
            s.index === input.index ? { ...s, imagePrompt: input.imagePrompt } : s,
          );

    // 이미지 교체는 uploadId 를 준 경우만. 이전 uploadId 는 교체 후 정리(best-effort)
    let sceneImages = record.sceneImages;
    let staleUploadId: string | null = null;
    if (input.uploadId !== undefined) {
      const prev = record.sceneImages.find((img) => img.index === input.index);
      if (prev && prev.uploadId !== input.uploadId) staleUploadId = prev.uploadId;
      const next: SavedPlanSceneImage = {
        index: input.index,
        uploadId: input.uploadId,
        ...(input.prompt ? { prompt: input.prompt } : {}),
      };
      sceneImages = prev
        ? record.sceneImages.map((img) => (img.index === input.index ? next : img))
        : [...record.sceneImages, next].sort((a, b) => a.index - b.index);
    }

    const updated = await this.repository.updateScenesRecord(
      organizationId,
      id,
      scenes,
      sceneImages,
    );
    // 새 이미지 확정은 저장 경로와 같은 이유로 브라우저가 아니라 여기서 함
    // 실패 시 이전 배열로 되돌림. 안 되돌리면 저장본이 PENDING 자산을 가리켜 그 씬이 빈 칸이 됨
    if (updated && input.uploadId !== undefined) {
      try {
        await this.imageStorage.confirmAssets([input.uploadId]);
      } catch (err) {
        await this.repository.updateScenesRecord(
          organizationId,
          id,
          record.scenes,
          record.sceneImages,
        );
        this.logger.warn(
          `씬 이미지 확정 실패로 편집을 되돌렸습니다(plan=${id}, scene=${input.index}): ${String(err)}`,
        );
        throw err;
      }
    }
    if (updated) {
      this.activityLog.log({
        organizationId,
        actorUserId: scope.ownerUserId,
        channelId: record.channelId,
        version: record.version,
        action: 'saved_plan.scene_updated',
        message: `기획안 씬 편집: ${record.title} (씬 ${input.index})`,
        target: { kind: 'saved_plan', id: record.id },
        detail: {
          scene_index: input.index,
          // 이미지 교체와 브리프 수정은 다른 행위라 구분해 남김
          image_replaced: staleUploadId !== null,
          prompt_edited: input.imagePrompt !== undefined,
        },
      });
    }
    // 교체된 이전 이미지 정리. 실패해도 편집은 반영됐고 고아만 남으므로 흔적만 남김
    if (updated && staleUploadId) {
      const { failed } = await this.imageStorage.deleteAssets([staleUploadId]);
      if (failed.length > 0) {
        this.logAssetCleanupFailure(record, scope.ownerUserId, failed.length);
      }
    }
    return updated;
  }
}
