import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { NON_TERMINAL_RENDER_STATUSES, VideoFinalEntity } from '../../domain';
import { deriveRenderStatus } from '../../../../../shared/domain/render-status';
import { SagaRunner } from '@csc/saga';
import {
  CreateVideoFinalSaga,
  RerenderVideoFinalSaga,
  SourceMissingError,
  VideoFinalMissingError,
} from '../sagas';
import {
  ActivityLogPort,
  ACTIVITY_LOG_PORT,
} from '../../../../../shared/domain/activity-log';
import type {
  OrgVersionScope,
  OwnerVersionScope,
  WorkspaceScope,
} from '../../../../../shared/domain/workspace-scope';
import { VideoFinalPort } from '../ports/inbound';
import {
  FinalRenderPort,
  FINAL_RENDER_PORT,
  VideoFinalRepositoryPort,
  VIDEO_FINAL_REPOSITORY_PORT,
} from '../ports/outbound';

/**
 * VideoFinalPort 구현: 완성 원천과 세트로 최종 영상을 만들고 video-model 에 FINALIZE 잡 등록
 * 조회 시 렌더 중 최종의 잡 상태를 재조정해 최신 상태 반영
 * 보관함은 조직 공용이라 동작마다 경계가 다름(목록은 조직+버전, 보내기는 내 것만, 꺼내기는 누구 것이든)
 */
@Injectable()
export class VideoFinalService implements VideoFinalPort {
  private readonly logger = new Logger(VideoFinalService.name);

  constructor(
    @Inject(VIDEO_FINAL_REPOSITORY_PORT)
    private readonly repository: VideoFinalRepositoryPort,
    @Inject(FINAL_RENDER_PORT)
    private readonly render: FinalRenderPort,
    @Inject(ACTIVITY_LOG_PORT)
    private readonly activityLog: ActivityLogPort,
    private readonly sagaRunner: SagaRunner,
    private readonly createSaga: CreateVideoFinalSaga,
    private readonly rerenderSaga: RerenderVideoFinalSaga,
  ) {}

  /**
   * 완성 원천과 세트로 최종 영상 생성. 사가 오케스트레이터에 위임
   * 인라인 try/catch 는 단계 사이 크래시에 돌지 않아 잡 없는 예약 행이 '만드는 중'으로 남음
   */
  async createFromSourcePersonal(
    scope: OwnerVersionScope,
    sourceId: number,
    setId: number,
    clientRequestId?: string | null,
  ): Promise<VideoFinalEntity | null> {
    const requestKey = clientRequestId?.trim() || null;
    try {
      const outcome = await this.sagaRunner.run(this.createSaga, {
        organizationId: scope.organizationId,
        ownerUserId: scope.ownerUserId,
        clientRequestId: requestKey,
        // payload 에 버전을 실음. 재개가 요청과 같은 버전으로 이어 가야 함
        payload: {
          organizationId: scope.organizationId,
          ownerUserId: scope.ownerUserId,
          version: scope.version,
          sourceId,
          setId,
          clientRequestId: requestKey,
        },
      });
      return await this.createSaga.result(outcome.context);
    } catch (err) {
      // 원천이 없거나 남의 것이면 만들 대상이 없음. 컨트롤러가 404 로 번역하도록 null 반환
      if (err instanceof SourceMissingError) return null;
      throw err;
    }
  }

  async listPersonal(scope: WorkspaceScope): Promise<VideoFinalEntity[]> {
    // 개인 워크스페이스는 작업자 x 채널 x 버전이고 어느 쪽도 넘어 섞이면 안 됨
    const finals = await this.repository.findRecordsByOwner(scope);
    return Promise.all(finals.map((f) => this.reconcile(f)));
  }

  async getPersonal(
    scope: OwnerVersionScope,
    id: number,
  ): Promise<VideoFinalEntity | null> {
    const final = await this.findPersonalRecord(scope, id);
    if (!final) return null;
    return this.reconcile(final);
  }

  /**
   * 저장된 세트 스냅샷과 원천으로 재합성
   * 원천 재렌더와 같은 이유로 사가에 위임(예약할 행이 없어 잡이 먼저 만들어짐)
   */
  async rerenderPersonal(
    scope: OwnerVersionScope,
    id: number,
  ): Promise<VideoFinalEntity | null> {
    try {
      const outcome = await this.sagaRunner.run(this.rerenderSaga, {
        organizationId: scope.organizationId,
        ownerUserId: scope.ownerUserId,
        // 재렌더는 같은 산출물을 다시 만드는 것이 목적이라 멱등키 없음
        clientRequestId: null,
        payload: {
          organizationId: scope.organizationId,
          ownerUserId: scope.ownerUserId,
          version: scope.version,
          finalId: id,
        },
      });
      return this.rerenderSaga.result(outcome.context);
    } catch (err) {
      if (err instanceof VideoFinalMissingError) return null;
      throw err;
    }
  }

  private async cancelRenderIfRunning(final: VideoFinalEntity): Promise<boolean> {
    const running =
      final.renderJobId != null &&
      (NON_TERMINAL_RENDER_STATUSES as readonly string[]).includes(final.renderStatus);
    if (!running || !final.renderJobId) return false;
    try {
      await this.render.cancelJob(final.renderJobId);
      return true;
    } catch (err) {
      this.logger.warn(
        `합성 취소 실패(final=${final.id}, job=${final.renderJobId}): ${String(err)}`,
      );
      return false;
    }
  }

  async deletePersonal(scope: OwnerVersionScope, id: number): Promise<boolean> {
    const final = await this.findPersonalRecord(scope, id);
    if (!final) return false;
    return this.deleteWithCancel(final, scope.ownerUserId);
  }

  /**
   * 보관물 삭제. 만든 사람 또는 관리급(대표, 팀장)이 지움
   *
   * 열람과 갈라 두는 이유: 삭제는 되돌릴 수 없는 손실이라 공용으로 열면 남의 완성본을 누구나 지움
   * 관리급에게 여는 이유: 만든 사람만 지우면 그 사람이 떠난 뒤 손댈 수 없는 항목이 남음
   * 두 경로가 다른 질의를 쓰므로 플래그를 빠뜨리면 더 좁은 쪽으로 동작(안전한 기본값)
   */
  async deleteArchived(
    scope: OwnerVersionScope,
    id: number,
    manageAll = false,
  ): Promise<boolean> {
    const final = manageAll
      ? await this.repository.findOneArchived(
          { organizationId: scope.organizationId, version: scope.version },
          id,
        )
      : await this.repository.findOneOwned(scope, id);
    // 위치 조건은 두 경로 모두 유지. 개인 항목까지 지우면 정리 권한으로 남의 작업 중 항목을 삭제 가능
    if (!final || final.location !== 'archive') return false;
    // 로그 행위자는 지운 사람(소유자가 아님). 남의 것을 정리한 경우 그게 유일한 흔적
    return this.deleteWithCancel(final, scope.ownerUserId);
  }

  async archivePersonal(
    scope: OwnerVersionScope,
    id: number,
  ): Promise<VideoFinalEntity | null> {
    const final = await this.findPersonalRecord(scope, id);
    if (!final) return null;
    // 완성본만 보관. 렌더 중 항목을 옮기면 워크스페이스에서 사라진 채로 폴링이 끊김
    if (final.renderStatus !== 'COMPLETED') {
      throw new BadRequestException('완성된 최종 영상만 보관함에 보낼 수 있습니다.');
    }
    const moved = await this.repository.archiveRecord(scope.organizationId, id);
    if (moved) {
      this.activityLog.log({
        organizationId: scope.organizationId,
        actorUserId: scope.ownerUserId,
        channelId: moved.channelId,
        version: scope.version,
        action: 'final.archived',
        message: `최종영상 보관함 보내기: ${moved.title}`,
        target: { kind: 'final', id: moved.id },
      });
    }
    return moved;
  }

  /**
   * 보관함 목록. 조직 공용이라 작업자도 채널도 조건이 아님
   * reconcile 미실행: 보관 대상은 완성본뿐이고 돌리면 로그 행위자가 조회한 사람이 되어 귀속이 깨짐
   */
  async listArchive(scope: OrgVersionScope): Promise<VideoFinalEntity[]> {
    return this.repository.findRecordsByLocation(scope);
  }

  /**
   * 보관함에서 꺼내기. 누가 만든 것이든 꺼낸 사람의 워크스페이스로 들어옴
   * 소유 검증을 앞세우지 않고 전이 조건(조직 + 버전 + location='archive')이 권한 경계
   * 스코프에 채널이 필요한 이유: 꺼낸 항목이 들어갈 워크스페이스를 정해야 함
   */
  async unarchive(
    scope: WorkspaceScope,
    id: number,
  ): Promise<VideoFinalEntity | null> {
    const moved = await this.repository.moveArchivedToWorkspaceRecord(scope, id);
    if (moved) {
      this.activityLog.log({
        organizationId: scope.organizationId,
        actorUserId: scope.ownerUserId,
        channelId: moved.channelId,
        version: scope.version,
        action: 'final.unarchived',
        message: `최종영상 보관함에서 꺼내기: ${moved.title}`,
        target: { kind: 'final', id: moved.id },
      });
    }
    return moved;
  }

  /**
   * 내 워크스페이스 항목 조회: 소유(레포의 WHERE) + location='personal'
   * 소유는 보안 경계라 질의가 확인하고 위치는 제품 규칙이라 여기서 봄
   */
  private async findPersonalRecord(
    scope: OwnerVersionScope,
    id: number,
  ): Promise<VideoFinalEntity | null> {
    const final = await this.repository.findOneOwned(scope, id);
    return final?.location === 'personal' ? final : null;
  }

  /** 삭제 공통: 진행 중 합성을 먼저 취소하고 삭제. 개인과 보관함 삭제가 같은 절차를 씀 */
  private async deleteWithCancel(
    final: VideoFinalEntity,
    actorUserId: number,
  ): Promise<boolean> {
    // 진행 중 합성은 삭제 전에 취소(행이 사라지면 renderJobId 를 잃음)
    const canceled = await this.cancelRenderIfRunning(final);

    const removed = await this.repository.deleteRecordById(final.organizationId, final.id);
    if (removed) {
      // 삭제 후엔 행이 없어 로그가 유일한 흔적
      this.activityLog.log({
        organizationId: final.organizationId,
        actorUserId,
        channelId: final.channelId,
        version: final.version,
        action: 'final.deleted',
        message: `최종영상 삭제: ${final.title}`,
        target: { kind: 'final', id: final.id },
        jobId: final.renderJobId,
        detail: { render_canceled: canceled, location: final.location },
      });
    }
    return removed;
  }

  /**
   * 렌더 중 최종의 잡 상태를 조회해 반영(변하면 DB 갱신). 완료와 실패는 미변경
   * 잡 조회 실패는 삼켜 이전 상태 유지(video-project.reconcile 과 동형)
   */
  private async reconcile(final: VideoFinalEntity): Promise<VideoFinalEntity> {
    if (!final.renderJobId || !NON_TERMINAL_RENDER_STATUSES.includes(final.renderStatus)) {
      return final;
    }
    try {
      const st = await this.render.getJobStatus(final.renderJobId);
      // 표시 상태 도출(공유 SSOT). 잡의 FAILED 는 커널이 CANCELLED 로 번역
      const effectiveStatus = deriveRenderStatus(st, final.createdAt);
      const statusChanged =
        effectiveStatus !== final.renderStatus ||
        st.resultUploadId !== final.resultUploadId ||
        st.error !== final.error;
      const updated = statusChanged
        ? await this.repository.updateRenderStateRecord(
            final.organizationId,
            final.id,
            effectiveStatus,
            st.resultUploadId,
            st.error,
          )
        : null;
      // 종료 전이를 실제로 기록한 호출자만 로그를 남김(원천영상과 같은 게이트)
      if (updated && (effectiveStatus === 'COMPLETED' || effectiveStatus === 'CANCELLED')) {
        this.logRenderOutcome(updated, effectiveStatus, st.error);
      }
      const base = updated ?? final;
      base.progress = st.progress;
      return base;
    } catch (err) {
      this.logger.warn(
        `최종 렌더 잡 상태 조회 실패(final=${final.id}, job=${final.renderJobId}): ${String(err)}`,
      );
      return final;
    }
  }

  /**
   * 최종 렌더 종료 활동 기록. 행위자는 소유자(reconcile 이 소유자 스코프 조회에서만 돔)
   * durationMs 미포함: 관측 시각은 완료 시각이 아님
   */
  private logRenderOutcome(
    final_: VideoFinalEntity,
    status: 'COMPLETED' | 'CANCELLED',
    error: string | null,
  ): void {
    const failed = status === 'CANCELLED';
    this.activityLog.log({
      organizationId: final_.organizationId,
      actorUserId: final_.ownerUserId,
      channelId: final_.channelId,
      version: final_.version,
      action: failed ? 'final.render_cancelled' : 'final.render_completed',
      message: `최종영상 ${failed ? '취소(생성 불가)' : '렌더 완료'}: ${final_.title}`,
      target: { kind: 'final', id: final_.id },
      jobId: final_.renderJobId,
      failed,
      dedupeKey: `final:${final_.id}:${final_.renderJobId}:${status}`,
      detail: {
        parent_source_id: final_.parentSourceId,
        ...(error ? { error } : {}),
      },
    });
  }
}
