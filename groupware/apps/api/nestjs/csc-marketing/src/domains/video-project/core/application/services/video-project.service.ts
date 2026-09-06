import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  NON_TERMINAL_RENDER_STATUSES,
  VideoProjectEntity,
} from '../../domain';
import { VideoProjectPort } from '../ports/inbound';
import {
  RenderJobUsage,
  VideoProjectRepositoryPort,
  VIDEO_PROJECT_REPOSITORY_PORT,
  VideoRenderPort,
  VIDEO_RENDER_PORT,
} from '../ports/outbound';
import { deriveRenderStatus } from '../../../../../shared/domain/render-status';
import {
  FileUploadStoragePort,
  FILE_UPLOAD_STORAGE_PORT,
} from '../../../../../shared/domain/storage';
import {
  ActivityLogPort,
  ACTIVITY_LOG_PORT,
  buildCostSnapshot,
} from '../../../../../shared/domain/activity-log';
import { BillingUnit } from '@csc/pricing';
import { DEFAULT_VIDEO_RESOLUTION } from '@csc/video-capabilities';
import { pipelineFor } from '../../../../../shared/domain/version-pipeline';
import type {
  OrgVersionScope,
  OwnerVersionScope,
  WorkspaceScope,
} from '../../../../../shared/domain/workspace-scope';
import { SagaRunner } from '@csc/saga';
import {
  CreateVideoProjectSaga,
  credentialProviderForModel,
  DEFAULT_VIDEO_PROVIDER,
  RerenderVideoProjectSaga,
  RerenderVideoProjectSegmentSaga,
  SavedPlanMissingError,
  VideoProjectMissingError,
  VIDEO_PROVIDER_BY_MODEL,
} from '../sagas';

/**
 * VideoProjectPort 구현: 저장 기획안을 스냅샷해 프로젝트를 만들고 video-model 에 COMPOSE 잡 등록
 * 조회 시 렌더 중 프로젝트의 잡 상태를 재조정해 최신 상태 반영
 * 스코프가 객체인 이유는 버전 누락 질의의 컴파일 차단. 단건에 채널이 없는 이유는 소유가 보안 경계라서
 */
@Injectable()
export class VideoProjectService implements VideoProjectPort {
  private readonly logger = new Logger(VideoProjectService.name);

  constructor(
    @Inject(VIDEO_PROJECT_REPOSITORY_PORT)
    private readonly repository: VideoProjectRepositoryPort,
    @Inject(VIDEO_RENDER_PORT)
    private readonly render: VideoRenderPort,
    @Inject(ACTIVITY_LOG_PORT)
    private readonly activityLog: ActivityLogPort,
    @Inject(FILE_UPLOAD_STORAGE_PORT)
    private readonly storage: FileUploadStoragePort,
    private readonly sagaRunner: SagaRunner,
    private readonly createSaga: CreateVideoProjectSaga,
    private readonly rerenderSaga: RerenderVideoProjectSaga,
    private readonly rerenderSegmentSaga: RerenderVideoProjectSegmentSaga,
  ) {}

  /**
   * 저장 기획안으로 원천 영상 생성. 사가 오케스트레이터에 위임
   * 인라인 try/catch 는 단계 사이 크래시에 돌지 않아 잡 없는 예약 행이 '만드는 중'으로 영구히 남음
   */
  async createFromSavedPlanPersonal(
    scope: OwnerVersionScope,
    savedPlanId: number,
    requestedResolution?: string | null,
    clientRequestId?: string | null,
  ): Promise<VideoProjectEntity | null> {
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
          savedPlanId,
          requestedResolution: requestedResolution ?? null,
          clientRequestId: requestKey,
        },
      });
      return await this.createSaga.result(outcome.context);
    } catch (err) {
      // 저장본이 없거나 남의 것이면 만들 대상이 없음. 컨트롤러가 404 로 번역하도록 null 반환
      if (err instanceof SavedPlanMissingError) return null;
      throw err;
    }
  }

  /**
   * 렌더 없이 완성 + 배치된 산출물 생성(진행 화면 미리보기의 '영상 생성')
   *
   * 자산 확정이 행 생성 뒤에 옴(브라우저는 presign + PUT 까지만, 4.2 계약)
   * 확정 실패 시 행을 삭제. 그대로 두면 서빙되지 않는 자산을 가리키는 카드가 목록에 남음
   * 사가가 아닌 이유: 되돌릴 것이 행 하나뿐이고 원격 부수효과가 없음
   */
  async createPreviewPersonal(
    scope: OwnerVersionScope,
    input: {
      channelId: number;
      title: string;
      videoModel: string;
      resultUploadId: string;
      thumbnailUploadId?: string | null;
      clientRequestId?: string | null;
    },
  ): Promise<VideoProjectEntity> {
    const thumbnailUploadId = input.thumbnailUploadId?.trim() || null;
    const created = await this.repository.createPlacedRecord(scope, {
      channelId: input.channelId,
      title: input.title,
      // 화면비는 버전이 정하고 화질은 도구 고정값
      aspectRatio: pipelineFor(scope.version).aspectRatio,
      resolution: DEFAULT_VIDEO_RESOLUTION,
      videoModel: input.videoModel,
      resultUploadId: input.resultUploadId,
      thumbnailUploadId,
      clientRequestId: input.clientRequestId?.trim() || null,
    });

    const assets = thumbnailUploadId
      ? [input.resultUploadId, thumbnailUploadId]
      : [input.resultUploadId];
    try {
      await this.storage.confirmAssets(assets);
    } catch (err) {
      await this.repository.deleteRecordById(scope.organizationId, created.id);
      this.logger.warn(
        `미리보기 산출물의 자산 확정이 실패해 행을 되돌렸습니다(project=${created.id}): ${String(err)}`,
      );
      throw err;
    }

    this.activityLog.log({
      organizationId: scope.organizationId,
      actorUserId: scope.ownerUserId,
      channelId: created.channelId,
      version: scope.version,
      action: 'source.created',
      message: `원천영상 생성(미리보기): ${created.title}`,
      target: { kind: 'source', id: created.id },
      // 렌더가 돌지 않은 사실을 원장에 남김. 없으면 유료 렌더 한 건처럼 읽힘
      detail: { preview: true },
    });
    return created;
  }

  async listPersonal(scope: WorkspaceScope): Promise<VideoProjectEntity[]> {
    // 개인 워크스페이스는 작업자 x 채널 x 버전이고 어느 쪽도 넘어 섞이면 안 됨
    const projects = await this.repository.findRecordsByOwner(scope);
    // 렌더 중 프로젝트만 재조정. 완료와 실패는 확정이라 미변경
    return Promise.all(projects.map((p) => this.reconcile(p)));
  }

  async getPersonal(
    scope: OwnerVersionScope,
    id: number,
  ): Promise<VideoProjectEntity | null> {
    const project = await this.findPersonalRecord(scope, id);
    if (!project) return null;
    return this.reconcile(project);
  }

  /**
   * 작업 공간에 배치(생성 창의 마지막 단계). 함께 온 대표 썸네일이 있으면 그 그림도 부착
   *
   * 만들어진 것과 사람이 확정한 것을 가르는 지점이라 완성본만 배치
   * 썸네일 확정은 갱신 뒤. 실패하면 이전 값으로 되돌려 새 자산이 PENDING 으로 수거되게 함
   * 배치는 되돌리지 않음(그림만 못 붙었을 뿐이고 되돌리면 방금 만든 영상이 어느 목록에도 없음)
   */
  async placeInWorkspacePersonal(
    scope: OwnerVersionScope,
    id: number,
    thumbnailUploadId?: string | null,
  ): Promise<VideoProjectEntity | null> {
    const project = await this.findPersonalRecord(scope, id);
    if (!project) return null;
    if (project.renderStatus !== 'COMPLETED') {
      throw new BadRequestException('완성된 영상만 작업 공간에 배치할 수 있습니다.');
    }
    const previous = project.thumbnailUploadId;
    // 같은 그림이면 붙일 것이 없음(아래 정리가 방금 붙인 자산을 지우는 것도 이 가드가 차단)
    const nextThumbnail = thumbnailUploadId?.trim() || null;
    const replacing = nextThumbnail !== null && nextThumbnail !== previous;

    const placed = await this.repository.placeInWorkspaceRecord(
      scope.organizationId,
      id,
      replacing ? nextThumbnail : previous,
    );
    if (!placed) return null;
    if (replacing) {
      try {
        await this.storage.confirmAssets([nextThumbnail]);
      } catch (err) {
        await this.repository.updateThumbnailRecord(scope.organizationId, id, previous);
        this.logger.warn(`썸네일 확정 실패로 그림을 되돌렸습니다(project=${id}): ${String(err)}`);
        throw err;
      }
      // 교체 후 이전 그림 정리(best-effort, 실패해도 새 그림은 이미 붙음)
      if (previous) await this.storage.deleteAsset(previous);
    }
    return placed;
  }

  /**
   * 저장된 스냅샷으로 재렌더
   * 생성과 달리 예약할 행이 없어 잡이 먼저 만들어지고, 붙이는 중 크래시면 유료 잡이 고아가 됨
   * 그래서 사가에 위임해 붙이기 실패 시 잡을 취소하고 중단 시 복구 러너가 이어 감
   */
  async rerenderPersonal(
    scope: OwnerVersionScope,
    id: number,
  ): Promise<VideoProjectEntity | null> {
    // 보관물은 재렌더 대상이 아님. 보관함은 reconcile 을 돌리지 않아 영구히 '만드는 중'에 멈춤
    // 잡을 만들기 전에 확인(사가에 들어간 뒤 되돌리면 이미 돈이 나감)
    if (!(await this.findPersonalRecord(scope, id))) return null;
    try {
      const outcome = await this.sagaRunner.run(this.rerenderSaga, {
        organizationId: scope.organizationId,
        ownerUserId: scope.ownerUserId,
        // 재렌더는 같은 산출물을 다시 만드는 것이 목적이라 멱등키 없음(클릭마다 새 사가)
        clientRequestId: null,
        payload: {
          organizationId: scope.organizationId,
          ownerUserId: scope.ownerUserId,
          version: scope.version,
          projectId: id,
        },
      });
      return this.rerenderSaga.result(outcome.context);
    } catch (err) {
      // 없거나 남의 것이면 컨트롤러가 null 을 404 로 번역
      if (err instanceof VideoProjectMissingError) return null;
      throw err;
    }
  }

  /**
   * 세그먼트 하나만 다시 만들기. 사가에 위임
   * 새 잡을 만들지 않고 붙어 있는 잡을 다시 돌려 벤더 비용이 그 세그먼트 하나에 그침
   */
  async rerenderSegmentPersonal(
    scope: OwnerVersionScope,
    id: number,
    order: number,
    visualPrompt?: string | null,
  ): Promise<VideoProjectEntity | null> {
    // 보관물은 재렌더 대상이 아님(위 rerenderPersonal 과 같은 이유). 잡을 만들기 전에 확인
    if (!(await this.findPersonalRecord(scope, id))) return null;
    try {
      const outcome = await this.sagaRunner.run(this.rerenderSegmentSaga, {
        organizationId: scope.organizationId,
        ownerUserId: scope.ownerUserId,
        // 같은 세그먼트를 다시 만드는 것이 목적이라 멱등키 없음
        clientRequestId: null,
        payload: {
          organizationId: scope.organizationId,
          ownerUserId: scope.ownerUserId,
          version: scope.version,
          projectId: id,
          order,
          visualPrompt: visualPrompt ?? null,
        },
      });
      return this.rerenderSegmentSaga.result(outcome.context);
    } catch (err) {
      if (err instanceof VideoProjectMissingError) return null;
      throw err;
    }
  }

  async deletePersonal(scope: OwnerVersionScope, id: number): Promise<boolean> {
    const project = await this.findPersonalRecord(scope, id);
    if (!project) return false;
    return this.deleteRow(project, scope.ownerUserId);
  }

  /**
   * 내 작업 공간 항목 조회: 소유(레포의 WHERE) + location='personal'
   * 소유는 보안 경계라 질의가 확인하고 위치는 제품 규칙이라 여기서 봄(보관물은 작업 공간 동작 대상 아님)
   */
  private async findPersonalRecord(
    scope: OwnerVersionScope,
    id: number,
  ): Promise<VideoProjectEntity | null> {
    const project = await this.repository.findOneOwned(scope, id);
    return project?.location === 'personal' ? project : null;
  }

  /**
   * 삭제 공통: 진행 중 렌더를 먼저 취소하고 행과 그 행이 소유한 자산 삭제
   * 행위자를 인자로 받는 이유: 보관물은 관리급이 지울 수 있어 소유자를 적으면 실제 삭제자를 잃음
   */
  private async deleteRow(
    project: VideoProjectEntity,
    actorUserId: number,
  ): Promise<boolean> {
    // 진행 중 렌더는 삭제 전에 취소. 안 하면 벤더 요금만 나가고 완료 로그도 남지 않음
    // 삭제 전에 부르는 이유: 행이 사라지면 renderJobId 를 잃음
    const canceled = await this.cancelRenderIfRunning(project);

    const removed = await this.repository.deleteRecordById(
      project.organizationId,
      project.id,
    );
    // 썸네일은 이 행이 소유한 자산이라 함께 삭제. 결과물과 씬 이미지는 렌더와 저장본의 것이라 유지
    if (removed && project.thumbnailUploadId) {
      await this.storage.deleteAsset(project.thumbnailUploadId);
    }
    if (removed) {
      // 삭제 후엔 행이 없어 로그가 유일한 흔적
      this.activityLog.log({
        organizationId: project.organizationId,
        actorUserId,
        channelId: project.channelId,
        version: project.version,
        action: 'source.deleted',
        message: `원천영상 삭제: ${project.title}`,
        target: { kind: 'source', id: project.id },
        jobId: project.renderJobId,
        // 진행 중 렌더 동반 중단 여부. 벤더 요금이 왜 끊겼는지 추적 근거
        detail: { render_canceled: canceled },
      });
    }
    return removed;
  }

  /**
   * 보관함 목록. 조직 공용이라 작업자도 채널도 조건이 아님
   * reconcile 미실행: 보관 대상은 완성본뿐이고 돌리면 로그 행위자가 조회한 사람이 되어 귀속이 깨짐
   */
  async listArchive(scope: OrgVersionScope): Promise<VideoProjectEntity[]> {
    return this.repository.findRecordsByLocation(scope);
  }

  async archivePersonal(
    scope: OwnerVersionScope,
    id: number,
  ): Promise<VideoProjectEntity | null> {
    const project = await this.repository.findOneOwned(scope, id);
    if (!project || project.location !== 'personal') return null;
    // 완성본만 보관. 렌더 중 항목을 옮기면 작업 공간에서 사라진 채로 폴링이 끊김
    if (project.renderStatus !== 'COMPLETED') {
      throw new BadRequestException('완성된 영상만 보관함에 보낼 수 있습니다.');
    }
    // 미배치 영상은 아직 만든 사람의 것으로 확정되지 않음. 화면에는 없지만 경계는 계약이 지켜야 함
    if (project.placedAt === null) {
      throw new BadRequestException('작업 공간에 배치한 영상만 보관함에 보낼 수 있습니다.');
    }
    const moved = await this.repository.archiveRecord(scope.organizationId, id);
    if (moved) {
      this.activityLog.log({
        organizationId: scope.organizationId,
        actorUserId: scope.ownerUserId,
        channelId: moved.channelId,
        version: scope.version,
        action: 'source.archived',
        message: `영상 보관함 보내기: ${moved.title}`,
        target: { kind: 'source', id: moved.id },
      });
    }
    return moved;
  }

  /**
   * 보관함에서 꺼내기. 누가 만든 것이든 꺼낸 사람의 작업 공간으로 들어옴
   * 소유 검증을 앞세우지 않는 이유: 보관함이 조직 공용이라 열람에 "남의 것" 구분이 없음
   * 전이 조건(조직 + 버전 + location='archive')이 권한 경계이고 중복 클릭은 null 로 로그가 한 번만
   */
  async unarchive(
    scope: WorkspaceScope,
    id: number,
  ): Promise<VideoProjectEntity | null> {
    const moved = await this.repository.moveArchivedToWorkspaceRecord(scope, id);
    if (moved) {
      this.activityLog.log({
        organizationId: scope.organizationId,
        actorUserId: scope.ownerUserId,
        channelId: moved.channelId,
        version: scope.version,
        action: 'source.unarchived',
        message: `영상 보관함에서 꺼내기: ${moved.title}`,
        target: { kind: 'source', id: moved.id },
      });
    }
    return moved;
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
    const project = manageAll
      ? await this.repository.findOneArchived(
          { organizationId: scope.organizationId, version: scope.version },
          id,
        )
      : await this.repository.findOneOwned(scope, id);
    // 위치 조건은 두 경로 모두 유지. 개인 항목까지 지우면 정리 권한으로 남의 작업 중 항목을 삭제 가능
    if (!project || project.location !== 'archive') return false;
    // 로그 행위자는 지운 사람(소유자가 아님). 남의 것을 정리한 경우 그게 유일한 흔적
    return this.deleteRow(project, scope.ownerUserId);
  }

  /**
   * 진행 중 렌더 취소. 취소했으면 true
   * best-effort: 취소 실패에도 삭제는 진행(막으면 화면에서 지워지지 않는 항목이 남음)
   * 실패 시 렌더가 계속 돌아 요금이 나갈 수 있어 경고가 유일한 추적 근거
   */
  private async cancelRenderIfRunning(project: VideoProjectEntity): Promise<boolean> {
    const running =
      project.renderJobId != null &&
      (NON_TERMINAL_RENDER_STATUSES as readonly string[]).includes(project.renderStatus);
    if (!running || !project.renderJobId) return false;
    try {
      await this.render.cancelJob(project.renderJobId);
      return true;
    } catch (err) {
      this.logger.warn(
        `렌더 취소 실패(project=${project.id}, job=${project.renderJobId}): 렌더가 계속 돌아 요금이 나갈 수 있습니다: ${String(err)}`,
      );
      return false;
    }
  }

  /**
   * 렌더 종료(완료, 실패) 활동 기록
   * 행위자는 소유자. reconcile 이 소유자 스코프 조회에서만 돌아 그 귀속이 정직함
   * durationMs 미포함: 관측 시각은 완료 시각이 아니고 재렌더는 createdAt 을 리셋하지 않음
   */
  private logRenderOutcome(
    project: VideoProjectEntity,
    status: 'COMPLETED' | 'CANCELLED',
    error: string | null,
    usage: RenderJobUsage | null = null,
  ): void {
    const failed = status === 'CANCELLED';
    // 청구 단위는 provider 가 벤더에 보낸 값(우리가 결과물을 재면 긴 씬이 과다 청구됨)
    // 비용은 유효 provider 에 귀속. 요청값으로 붙이면 폴백된 무료 렌더가 유료 청구로 보임
    // usage 가 없고 요청 모델이 외부 키 모델이면 빈 units 로 남겨 '모름'이 되게 함(무료 위장 방지)
    const externalModel = credentialProviderForModel(project.videoModel) !== undefined;
    const units = usage
      ? {
          [BillingUnit.OutputVideoSecond]: usage.outputVideoSeconds,
          [BillingUnit.InputImageCount]: usage.inputImageCount,
        }
      : {};
    const costModel =
      usage?.provider ||
      (externalModel
        ? project.videoModel
        : VIDEO_PROVIDER_BY_MODEL[project.videoModel] ?? DEFAULT_VIDEO_PROVIDER);
    this.activityLog.log({
      organizationId: project.organizationId,
      actorUserId: project.ownerUserId,
      channelId: project.channelId,
      version: project.version,
      action: failed ? 'source.render_cancelled' : 'source.render_completed',
      message: `원천영상 ${failed ? '취소(생성 불가)' : '렌더 완료'}: ${project.title}`,
      target: { kind: 'source', id: project.id },
      jobId: project.renderJobId,
      failed,
      // 같은 잡의 같은 종료 상태는 한 사건. 재생과 백필도 멱등해짐
      dedupeKey: `source:${project.id}:${project.renderJobId}:${status}`,
      // 실패한 렌더도 이미 청구됐을 수 있어 usage 가 있으면 그대로 남김
      cost: buildCostSnapshot({ modelKey: costModel, units }),
      detail: {
        video_model: project.videoModel,
        effective_visual_provider: usage?.provider ?? null,
        resolution: project.resolution,
        ...(usage
          ? { scene_count: usage.sceneCount, scene_seconds: usage.sceneSeconds }
          : {}),
        ...(error ? { error } : {}),
        // 사유 코드가 있으면 남긴다. 원장에서 한도 실패만 골라 세는 근거가 문장이 아니라 이 값
        ...(project.errorCode ? { error_code: project.errorCode } : {}),
      },
    });
  }

  /**
   * 렌더 중 프로젝트의 잡 상태를 조회해 반영(변하면 DB 갱신). 완료와 실패는 미변경
   * 잡 조회 실패는 삼켜 이전 상태 유지(목록과 조회가 깨지지 않게)
   */
  private async reconcile(project: VideoProjectEntity): Promise<VideoProjectEntity> {
    if (!project.renderJobId || !NON_TERMINAL_RENDER_STATUSES.includes(project.renderStatus)) {
      return project;
    }
    try {
      const st = await this.render.getJobStatus(project.renderJobId);
      // 표시 상태 도출(공유 SSOT). 잡의 FAILED 는 커널이 CANCELLED 로 번역
      const effectiveStatus = deriveRenderStatus(st, project.createdAt);
      // 상태, 결과, 에러가 바뀌었을 때만 DB 갱신(진행률은 비영속)
      const statusChanged =
        effectiveStatus !== project.renderStatus ||
        st.resultUploadId !== project.resultUploadId ||
        st.error !== project.error ||
        st.errorCode !== project.errorCode;
      // 세그먼트는 종료 전이에서만 저장. 완료 뒤에는 다시 묻지 않고 중간 틱 저장은 쓰기 증폭
      const terminal = effectiveStatus === 'COMPLETED' || effectiveStatus === 'CANCELLED';
      const updated = statusChanged
        ? await this.repository.updateRenderStateRecord(project.organizationId, project.id, {
            renderStatus: effectiveStatus,
            resultUploadId: st.resultUploadId,
            captionsUploadId: st.captionsUploadId,
            error: st.error,
            errorCode: st.errorCode,
            segments: terminal ? st.scenes : null,
          })
        : null;
      // 종료 전이를 실제로 기록한 호출자만 로그를 남김
      // updated 가 null 이면 다른 폴러가 먼저 전이시킨 것이라 완료 로그가 두 건이 되지 않음
      if (updated && (effectiveStatus === 'COMPLETED' || effectiveStatus === 'CANCELLED')) {
        this.logRenderOutcome(updated, effectiveStatus, st.error, st.usage);
      }
      const base = updated ?? project;
      // 진행률과 렌더 구간은 응답에만 실음(DB 저장 안 함)
      base.progress = st.progress;
      base.renderStage = st.renderStage;
      // 세그먼트는 살아 있는 값이 이기고 없으면 행에 저장된 값이 남음(끝난 잡은 렌더가 주지 않음)
      base.segments = st.scenes ?? base.segments;
      return base;
    } catch (err) {
      this.logger.warn(
        `렌더 잡 상태 조회 실패(project=${project.id}, job=${project.renderJobId}): ${String(err)}`,
      );
      return project;
    }
  }
}
