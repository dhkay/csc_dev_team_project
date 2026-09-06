import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { VideoFinalService } from '..';
import { VideoFinalEntity } from '../../../domain';
import {
  FinalRenderPort,
  FinalRenderSpecBuilder,
  FINAL_RENDER_PORT,
  FINAL_RENDER_SPEC_BUILDERS,
  VideoFinalRepositoryPort,
  VIDEO_FINAL_REPOSITORY_PORT,
} from '../../ports/outbound';
import { DefaultFinalRenderSpecBuilder } from '../../spec/final-render-spec-builder';
import type { VersionRegistry } from '../../../../../../shared/domain/version-registry';
import {
  VideoProjectPort,
  VIDEO_PROJECT_PORT,
} from '../../../../../video-project/core/application/ports/inbound';
import { VideoProjectEntity } from '../../../../../video-project/core/domain';
import {
  AssetSetPort,
  ASSET_SET_PORT,
} from '../../../../../asset-set/core/application/ports/inbound';
import { AssetSetEntity } from '../../../../../asset-set/core/domain';
import {
  createFinalRenderMock,
  createVideoFinalRepositoryMock,
} from '../../../../__mocks__/video-final.mock';
import {
  AssetUploadStatus,
  FILE_UPLOAD_STORAGE_PORT,
  FileUploadStoragePort,
} from '../../../../../../shared/domain/storage';
import {
  ActivityLogPort,
  ACTIVITY_LOG_PORT,
} from '../../../../../../shared/domain/activity-log';
import { createActivityLogMock } from '../../../../../../shared/domain/activity-log/__mocks__/activity-log.mock';
import { CreateVideoFinalSaga, RerenderVideoFinalSaga } from '../../sagas';
import {
  createInMemorySagaStore,
  InMemorySagaStore,
  sagaTestProviders,
} from '@csc/saga/testing';
import type { ToolVersion } from '../../../../../../shared/domain/tool-version';
import {
  orgVersionScope,
  ownerVersionScope,
  workspaceScope,
} from '../../../../../../shared/domain/workspace-scope';

describe('VideoFinalService', () => {
  let service: VideoFinalService;
  let repository: jest.Mocked<VideoFinalRepositoryPort>;
  let activityLog: jest.Mocked<ActivityLogPort>;
  let sagaStore: InMemorySagaStore;
  let render: jest.Mocked<FinalRenderPort>;
  let videoProjects: jest.Mocked<Pick<VideoProjectPort, 'getPersonal'>>;
  let assetSets: jest.Mocked<Pick<AssetSetPort, 'getOneById'>>;
  let storage: jest.Mocked<FileUploadStoragePort>;

  const makeSource = (o: Partial<VideoProjectEntity> = {}): VideoProjectEntity => ({
    id: 100,
    organizationId: 10,
    ownerUserId: 7,
    channelId: 3,
    savedPlanId: 5,
    title: '원천 영상',
    aspectRatio: '1:1',
    resolution: '720p',
    videoModel: '',
    videoMode: '',
    segmentMode: '',
    ttsModel: '',
    ttsVoice: '',
    ttsPitch: '',
    scenes: [],
    // BGM 은 엔티티 필수 필드다(미배정이면 null)
    bgm: null,
    background: null,
    clientRequestId: null,
    version: 'v1.5',
    renderJobId: 'src-job',
    renderStatus: 'COMPLETED',
    progress: null,
    renderStage: null,
    segments: null,
    resultUploadId: 'src-result',
    captionsUploadId: 'src-cap',
    thumbnailUploadId: null,
    placedAt: new Date(),
    location: 'personal',
    error: null,
    errorCode: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...o,
  });

  const makeSet = (o: Partial<AssetSetEntity> = {}): AssetSetEntity => ({
    id: 20,
    name: '세트',
    scope: 'organization',
    organizationId: 10,
    packId: null,
    sortOrder: 0,
    frameUploadId: 'frame-1',
    outroUploadId: 'outro-1',
    overlays: null,
    ...o,
  });

  /**
   * 스코프 헬퍼. 예전의 `(10, 7[, channelId])` 인자 나열을 대신한다.
   *
   * 버전이 스코프에 있는 것이 계약이다: 산출물은 버전 소유이고, 빠뜨린 호출은 컴파일되지 않는다.
   */
  const at = (version: ToolVersion = 'v1.5') =>
    ownerVersionScope({ organizationId: 10, ownerUserId: 7, version });
  const ws = (channelId: number, version: ToolVersion = 'v1.5') =>
    workspaceScope({ organizationId: 10, ownerUserId: 7, channelId, version });
  /** 조직 공용 스코프(보관함): 작업자도 채널도 없다. */
  const org = (version: ToolVersion = 'v1.5') =>
    orgVersionScope({ organizationId: 10, version });

  const makeFinal = (o: Partial<VideoFinalEntity> = {}): VideoFinalEntity => ({
    id: 200,
    organizationId: 10,
    ownerUserId: 7,
    location: 'personal',
    channelId: 3,
    parentSourceId: 100,
    frameUploadId: 'frame-1',
    outroUploadId: 'outro-1',
    title: '원천 영상',
    aspectRatio: '1:1',
    version: 'v1.5',
    clientRequestId: null,
    renderJobId: 'fin-job',
    renderStatus: 'RENDERING',
    overlays: null,
    progress: null,
    resultUploadId: null,
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...o,
  });

  beforeEach(async () => {
    repository = createVideoFinalRepositoryMock();
    activityLog = createActivityLogMock();
    render = createFinalRenderMock();
    videoProjects = { getPersonal: jest.fn() };
    assetSets = { getOneById: jest.fn() };
    // 사전검증 기본 mock = 넘긴 id 전부 UPLOADED(정상 경로). 거부 케이스는 per-test override.
    storage = {
      getAssetStatuses: jest.fn(async (ids: string[]) =>
        Object.fromEntries(ids.map((id) => [id, 'UPLOADED' as const])),
      ),
      deleteAsset: jest.fn(),
      deleteAssets: jest.fn(async (_ids: string[]) => ({ failed: [] as string[] })),
      confirmAssets: jest.fn(),
    };
    sagaStore = createInMemorySagaStore();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoFinalService,
        // 생성은 사가에 위임된다. 러너를 mock 하지 않고 진짜 러너 + 인메모리 저장소로 돌린다:
        //   단계 순서와 보상(정의)이 이 테스트의 검증 범위에 들어와야 한다.
        CreateVideoFinalSaga,
        RerenderVideoFinalSaga,
        // 버전별 최종 합성 스펙 조립 표(이음새 3/3): 진짜 구현을 두 슬롯에
        //   이 파일의 단정 다수가 "예약한 내용대로 스펙이 나간다" 라, 가짜로 바꾸면 그게 빠진다.
        DefaultFinalRenderSpecBuilder,
        {
          provide: FINAL_RENDER_SPEC_BUILDERS,
          inject: [DefaultFinalRenderSpecBuilder],
          useFactory: (shared: DefaultFinalRenderSpecBuilder) =>
            ({ 'v1.5': shared, 'v1.0': shared }) satisfies VersionRegistry<FinalRenderSpecBuilder>,
        },
        ...sagaTestProviders(sagaStore),
        { provide: VIDEO_FINAL_REPOSITORY_PORT, useValue: repository },
        { provide: ACTIVITY_LOG_PORT, useValue: activityLog },
        { provide: FINAL_RENDER_PORT, useValue: render },
        { provide: VIDEO_PROJECT_PORT, useValue: videoProjects },
        { provide: ASSET_SET_PORT, useValue: assetSets },
        { provide: FILE_UPLOAD_STORAGE_PORT, useValue: storage },
      ],
    }).compile();
    service = module.get<VideoFinalService>(VideoFinalService);
    repository.createRecord.mockImplementation(async (scope, rec) =>
      makeFinal({ ...rec, ...scope }),
    );
    // 사가의 잡 단계는 예약 행을 다시 읽어 스펙을 조립한다(행이 스냅샷이라 그것이 진실원이다)
    //   기본 mock: 방금 createRecord 가 만든 행을 그대로, 잡이 붙은 뒤에는 RENDERING 으로
    repository.findOneOwned.mockImplementation(async (_scope, id: number) => {
      const results = repository.createRecord.mock.results;
      const last = results[results.length - 1];
      const base =
        last?.type === 'return'
          ? ((await last.value) as VideoFinalEntity)
          : makeFinal({ id });
      const attached = repository.startRenderRecord.mock.calls.at(-1);
      return attached
        ? { ...base, renderJobId: attached[2], renderStatus: 'RENDERING' as const }
        : base;
    });
  });

  afterEach(() => jest.clearAllMocks());

  describe('createFromSourcePersonal', () => {
    it('원천이 없으면(내 것 아님 포함) null 을 반환한다(잡/저장 없음)', async () => {
      videoProjects.getPersonal.mockResolvedValueOnce(null);

      const result = await service.createFromSourcePersonal(at(), 100, 20);

      expect(result).toBeNull();
      expect(render.createJob).not.toHaveBeenCalled();
      expect(repository.createRecord).not.toHaveBeenCalled();
    });

    it('원천이 미완성이면 400(BadRequest)', async () => {
      videoProjects.getPersonal.mockResolvedValueOnce(makeSource({ renderStatus: 'RENDERING', resultUploadId: null }));

      await expect(service.createFromSourcePersonal(at(), 100, 20)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(render.createJob).not.toHaveBeenCalled();
    });

    it('세트가 없으면 400', async () => {
      videoProjects.getPersonal.mockResolvedValueOnce(makeSource());
      assetSets.getOneById.mockResolvedValueOnce(null);

      await expect(service.createFromSourcePersonal(at(), 100, 20)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('세트에 프레임/아웃트로가 둘 다 없으면 400', async () => {
      videoProjects.getPersonal.mockResolvedValueOnce(makeSource());
      assetSets.getOneById.mockResolvedValueOnce(makeSet({ frameUploadId: null, outroUploadId: null }));

      await expect(service.createFromSourcePersonal(at(), 100, 20)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('완성 원천 + 세트 → 행을 먼저 예약한 뒤 잡을 붙인다', async () => {
      videoProjects.getPersonal.mockResolvedValueOnce(makeSource());
      assetSets.getOneById.mockResolvedValueOnce(makeSet());
      render.createJob.mockResolvedValueOnce('fin-xyz');
      repository.createRecord.mockImplementationOnce(async (_scope, rec) =>
        makeFinal({
          renderJobId: rec.renderJobId,
          renderStatus: rec.renderStatus,
          frameUploadId: rec.frameUploadId,
        }),
      );
      repository.startRenderRecord.mockImplementationOnce(async (_org, _id, jobId) =>
        makeFinal({ renderJobId: jobId, renderStatus: 'RENDERING' }),
      );

      const result = await service.createFromSourcePersonal(at(), 100, 20);

      const spec = render.createJob.mock.calls[0][0];
      expect(spec.sourceUploadId).toBe('src-result');
      expect(spec.frameUploadId).toBe('frame-1');
      expect(spec.outroUploadId).toBe('outro-1');
      expect(spec.aspectRatio).toBe('1:1');
      expect(spec.captionsUploadId).toBe('src-cap'); // 원천의 자막 트랙을 최종으로 전달
      expect(spec.overlays.title.text).toBe('원천 영상'); // 제목 = 원천 제목(기본값 seed)
      // 예약 행은 잡 없이 PENDING 이다(유니크가 유료 잡보다 앞에서 중복을 걸러야 한다)
      const record = repository.createRecord.mock.calls[0][1];
      expect(record.parentSourceId).toBe(100);
      expect(record.renderJobId).toBeNull();
      expect(record.renderStatus).toBe('PENDING');
      expect(repository.startRenderRecord).toHaveBeenCalledWith(10, expect.any(Number), 'fin-xyz');
      expect(result?.renderStatus).toBe('RENDERING');
    });

    it('요청이 말한 버전으로 굳힌다(보관 시점이 아니라 생성 시점)', async () => {
      // 보관할 때 태그하면 한 버전에서 보관한 영상이 다른 버전에서는 워크스페이스에도(보관됨)
      //   보관함에도(버전 불일치) 없어 접근 경로가 사라진다. 그래서 생성 시점에 굳힌다.
      // 버전은 개인 설정이 아니라 요청에서 온다: 화면이 말한 버전과 만들어진 버전이 갈릴 수 없다.
      videoProjects.getPersonal.mockResolvedValueOnce(makeSource());
      assetSets.getOneById.mockResolvedValueOnce(makeSet());
      render.createJob.mockResolvedValueOnce('fin-v10');
      repository.createRecord.mockImplementationOnce(async () => makeFinal());

      await service.createFromSourcePersonal(at('v1.0'), 100, 20);

      // 조직/작업자/버전은 첫 인자(스코프)가 소유한다: 레코드에 다시 담지 않는다.
      expect(repository.createRecord.mock.calls[0][0]).toEqual(at('v1.0'));
    });

    it('세트 구역 스타일(글자색+배경색+폰트)이 최종 오버레이로 반영된다', async () => {
      videoProjects.getPersonal.mockResolvedValueOnce(makeSource());
      assetSets.getOneById.mockResolvedValueOnce(
        makeSet({
          overlays: {
            title: { fontUploadId: 'font-title', color: '#ffee00', band: { color: '#223344' } },
            subtitle: { fontUploadId: 'font-sub', color: '#111111', band: { color: '#ccddee' } },
          },
        }),
      );
      render.createJob.mockResolvedValueOnce('fin-styled');
      repository.createRecord.mockImplementationOnce(async (_scope, rec) => makeFinal({ overlays: rec.overlays }));

      const result = await service.createFromSourcePersonal(at(), 100, 20);

      const spec = render.createJob.mock.calls[0][0];
      expect(spec.overlays.title.text).toBe('원천 영상'); // 제목 텍스트는 여전히 원천 제목
      expect(spec.overlays.title.style.fontUploadId).toBe('font-title');
      expect(spec.overlays.title.style.color).toBe('#ffee00'); // 글자색 그대로(자동 대비 제거)
      expect(spec.overlays.title.style.band?.color).toBe('#223344');
      expect(spec.overlays.subtitle.style.fontUploadId).toBe('font-sub');
      expect(spec.overlays.subtitle.style.color).toBe('#111111');
      expect(spec.overlays.subtitle.style.band?.color).toBe('#ccddee');
      // 스냅샷이 최종 레코드에도 동일하게 영속
      expect(result?.overlays?.title.style.band?.color).toBe('#223344');
      expect(result?.overlays?.title.style.color).toBe('#ffee00');
    });

    it('같은 멱등키로 두 번 요청해도 합성 잡은 한 번만 만들어진다', async () => {
      // 사가 인스턴스가 그 클릭 하나를 붙들어, 두 번째 요청은 단계를 하나도 다시 돌리지 않는다.
      //   (판정이 유료 호출보다 앞에 있다)
      videoProjects.getPersonal.mockResolvedValue(makeSource());
      assetSets.getOneById.mockResolvedValue(makeSet());
      render.createJob.mockResolvedValue('fin-once');

      const first = await service.createFromSourcePersonal(at(), 100, 20, 'click-1');
      const second = await service.createFromSourcePersonal(at(), 100, 20, 'click-1');

      expect(second?.id).toBe(first?.id);
      expect(render.createJob).toHaveBeenCalledTimes(1);
      expect(repository.createRecord).toHaveBeenCalledTimes(1);
    });

    it('잡 등록이 실패하면 예약 행을 지운다(아무것도 만들어지지 않는다)', async () => {
      videoProjects.getPersonal.mockResolvedValueOnce(makeSource());
      assetSets.getOneById.mockResolvedValueOnce(makeSet());
      repository.createRecord.mockResolvedValueOnce(makeFinal({ id: 88 }));
      render.createJob.mockRejectedValueOnce(new Error('엔진 도달 불가'));

      await expect(service.createFromSourcePersonal(at(), 100, 20)).rejects.toThrow(
        '엔진 도달 불가',
      );

      expect(repository.deleteRecordById).toHaveBeenCalledWith(10, 88);
    });

  });

  describe('rerenderPersonal', () => {
    it('저장된 세트 스냅샷 + 원천으로 새 잡을 등록하고 RENDERING 으로 재시작한다', async () => {
      repository.findOneOwned.mockResolvedValueOnce(makeFinal());
      videoProjects.getPersonal.mockResolvedValueOnce(makeSource());
      render.createJob.mockResolvedValueOnce('job-9');
      repository.startRenderRecord.mockResolvedValueOnce(
        makeFinal({ renderJobId: 'job-9', renderStatus: 'RENDERING' }),
      );

      await service.rerenderPersonal(at(), 200);

      // 원천에서 오는 두 값(결과물/자막)은 재취득하고, 프레임/아웃트로/오버레이는 저장된 스냅샷이다.
      expect(render.createJob.mock.calls[0][0]).toMatchObject({
        sourceUploadId: 'src-result',
        captionsUploadId: 'src-cap',
        frameUploadId: 'frame-1',
        outroUploadId: 'outro-1',
      });
      expect(repository.startRenderRecord).toHaveBeenCalledWith(10, 200, 'job-9');
    });

    it('원천이 완성 상태가 아니면 400 이고 잡을 만들지 않는다', async () => {
      repository.findOneOwned.mockResolvedValueOnce(makeFinal());
      videoProjects.getPersonal.mockResolvedValueOnce(
        makeSource({ renderStatus: 'RENDERING', resultUploadId: null }),
      );

      await expect(service.rerenderPersonal(at(), 200)).rejects.toThrow(
        BadRequestException,
      );
      expect(render.createJob).not.toHaveBeenCalled();
    });

    it('붙일 행이 사라지면 만든 잡을 취소한다(요금만 나가는 유료 잡을 남기지 않는다)', async () => {
      repository.findOneOwned.mockResolvedValueOnce(makeFinal());
      videoProjects.getPersonal.mockResolvedValueOnce(makeSource());
      render.createJob.mockResolvedValueOnce('job-9');
      repository.startRenderRecord.mockResolvedValueOnce(null); // 그 사이 삭제됐다

      expect(await service.rerenderPersonal(at(), 200)).toBeNull();
      expect(render.cancelJob).toHaveBeenCalledWith('job-9');
      expect(activityLog.log).not.toHaveBeenCalled();
    });
  });

  describe('listPersonal (reconcile)', () => {
    it('워크스페이스 목록도 요청 버전으로 조회한다', async () => {
      // 보관함만 가르고 워크스페이스를 공유하면, 한 버전에서 보관한 영상이 다른 버전에서 어디에도
      //   없어 접근 경로가 사라진다. 그래서 두 목록이 같은 축으로 갈린다.
      repository.findRecordsByOwner.mockResolvedValueOnce([]);

      await service.listPersonal(ws(3, 'v1.0'));

      expect(repository.findRecordsByOwner).toHaveBeenCalledWith(ws(3, 'v1.0'));
    });

    it('렌더 중 최종은 잡 상태를 조회해 완료로 갱신한다', async () => {
      repository.findRecordsByOwner.mockResolvedValueOnce([makeFinal({ renderStatus: 'RENDERING' })]);
      render.getJobStatus.mockResolvedValueOnce({
        status: 'COMPLETED',
        resultUploadId: 'fin-result',
        error: null,
        progress: null,
        workerAlive: null,
      });
      const completed = makeFinal({ renderStatus: 'COMPLETED', resultUploadId: 'fin-result' });
      repository.updateRenderStateRecord.mockResolvedValueOnce(completed);

      const result = await service.listPersonal(ws(3));

      expect(render.getJobStatus).toHaveBeenCalledWith('fin-job');
      expect(repository.updateRenderStateRecord).toHaveBeenCalledWith(10, 200, 'COMPLETED', 'fin-result', null);
      expect(result[0]).toBe(completed);
    });

    it('워커가 없고 유예가 지나면 STALLED 로 갱신한다', async () => {
      repository.findRecordsByOwner.mockResolvedValueOnce([
        makeFinal({ renderStatus: 'RENDERING', createdAt: new Date(Date.now() - 5 * 60_000) }),
      ]);
      render.getJobStatus.mockResolvedValueOnce({
        status: 'RENDERING',
        resultUploadId: null,
        error: null,
        progress: null,
        workerAlive: false,
      });
      const stalled = makeFinal({ renderStatus: 'STALLED' });
      repository.updateRenderStateRecord.mockResolvedValueOnce(stalled);

      const result = await service.listPersonal(ws(3));

      expect(repository.updateRenderStateRecord).toHaveBeenCalledWith(10, 200, 'STALLED', null, null);
      expect(result[0]).toBe(stalled);
    });

    it('완료된 최종은 잡 상태를 조회하지 않는다', async () => {
      repository.findRecordsByOwner.mockResolvedValueOnce([
        makeFinal({ renderStatus: 'COMPLETED', resultUploadId: 'r' }),
      ]);

      await service.listPersonal(ws(3));

      expect(render.getJobStatus).not.toHaveBeenCalled();
    });
  });

  describe('보관함(조직 공용)', () => {
    it('완성본을 보내면 personal→archive 로 전이하고 활동 로그를 남긴다', async () => {
      repository.findOneOwned.mockResolvedValueOnce(
        makeFinal({ renderStatus: 'COMPLETED', resultUploadId: 'r' }),
      );
      repository.archiveRecord.mockResolvedValueOnce(
        makeFinal({ location: 'archive', renderStatus: 'COMPLETED', resultUploadId: 'r' }),
      );

      const moved = await service.archivePersonal(at(), 200);

      expect(repository.archiveRecord).toHaveBeenCalledWith(10, 200);
      expect(moved?.location).toBe('archive');
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'final.archived', actorUserId: 7, channelId: 3 }),
      );
    });

    it('스코프에 없는 항목은 보관할 수 없다(전이/로그 없음)', async () => {
      // 남의 것도 다른 버전 것도 질의가 내주지 않는다(소유가 WHERE 에 있다)
      repository.findOneOwned.mockResolvedValueOnce(null);

      expect(await service.archivePersonal(at(), 200)).toBeNull();
      expect(repository.archiveRecord).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();
      expect(repository.findOneOwned).toHaveBeenCalledWith(at(), 200);
    });

    it('렌더 중 항목은 400: 보관함은 폴링(reconcile)을 돌리지 않으므로 상태가 멈춘다', async () => {
      repository.findOneOwned.mockResolvedValueOnce(makeFinal({ renderStatus: 'RENDERING' }));

      await expect(service.archivePersonal(at(), 200)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.archiveRecord).not.toHaveBeenCalled();
    });

    it('이미 보관된 항목을 다시 보내도 로그가 중복되지 않는다(조건부 갱신)', async () => {
      repository.findOneOwned.mockResolvedValueOnce(
        makeFinal({ renderStatus: 'COMPLETED' }),
      );
      repository.archiveRecord.mockResolvedValueOnce(null); // 이미 archive → 전이 없음

      expect(await service.archivePersonal(at(), 200)).toBeNull();
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('보관물은 워크스페이스 경로(조회/재렌더/삭제)에서 빠진다', async () => {
      repository.findOneOwned.mockResolvedValue(makeFinal({ location: 'archive' }));

      expect(await service.getPersonal(at(), 200)).toBeNull();
      expect(await service.rerenderPersonal(at(), 200)).toBeNull();
      expect(await service.deletePersonal(at(), 200)).toBe(false);
      expect(repository.deleteRecordById).not.toHaveBeenCalled();
      // 보관물 재렌더는 잡을 만들지도 않는다(만들면 취소해야 할 유료 잡이 된다)
      expect(render.createJob).not.toHaveBeenCalled();
    });

    it('보관함 목록은 조직 공용 스코프로 조회하고 reconcile 을 돌리지 않는다', async () => {
      repository.findRecordsByLocation.mockResolvedValueOnce([
        makeFinal({ location: 'archive', renderStatus: 'COMPLETED', ownerUserId: 99 }),
      ]);

      const rows = await service.listArchive(org());

      // 작업자도 채널도 스코프에 없다: 남이 만든 보관물도 같은 목록에 들어온다.
      expect(repository.findRecordsByLocation).toHaveBeenCalledWith(org());
      expect(rows).toHaveLength(1);
      // 만든 사람은 그대로 실려 나온다(화면이 이름 라벨로 바꾼다)
      expect(rows[0].ownerUserId).toBe(99);
      expect(render.getJobStatus).not.toHaveBeenCalled();
    });

    it('보관함은 요청 버전으로 조회한다(v1.0 과 v1.5 가 섞이지 않는다)', async () => {
      // 사람을 넘어 공유되지만 버전은 넘지 않는다. 빠지면 v1.5 화면에 v1.0 구성의 산출물이 섞인다.
      repository.findRecordsByLocation.mockResolvedValueOnce([]);

      await service.listArchive(org('v1.0'));

      expect(repository.findRecordsByLocation).toHaveBeenCalledWith(org('v1.0'));
    });

    it('남이 만든 보관물도 꺼낼 수 있고, 꺼낸 사람의 워크스페이스로 들어온다', async () => {
      // 소유 검증을 앞세우지 않는다(공용이라 "남의 것" 구분이 열람에 없다). 전이 조건이 권한 경계다.
      repository.moveArchivedToWorkspaceRecord.mockResolvedValueOnce(
        makeFinal({ location: 'personal', ownerUserId: 7, channelId: 3 }),
      );

      const moved = await service.unarchive(ws(3), 200);

      // 스코프가 그대로 넘어간다: 소유자/채널을 꺼낸 사람 쪽으로 바꾸는 것은 레포의 일이다.
      expect(repository.moveArchivedToWorkspaceRecord).toHaveBeenCalledWith(ws(3), 200);
      expect(repository.findOneOwned).not.toHaveBeenCalled();
      expect(moved?.location).toBe('personal');
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'final.unarchived', actorUserId: 7 }),
      );
    });

    it('이미 꺼내진 항목은 전이가 없고 로그도 남지 않는다', async () => {
      // 조건부 전이(location='archive')가 null 을 돌려준다. 중복 클릭에도 로그가 한 번만 남는 근거
      repository.moveArchivedToWorkspaceRecord.mockResolvedValueOnce(null);

      expect(await service.unarchive(ws(3), 200)).toBeNull();
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('보관함 삭제: 올린 본인은 지울 수 있다', async () => {
      repository.findOneOwned.mockResolvedValueOnce(makeFinal({ location: 'archive' }));
      repository.deleteRecordById.mockResolvedValueOnce(true);

      expect(await service.deleteArchived(at(), 200)).toBe(true);
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'final.deleted', actorUserId: 7 }),
      );
    });

    it('삭제는 열람과 다르다: 일반 구성원은 남의 보관물을 지울 수 없다', async () => {
      // 열람이 공용이라고 삭제까지 전원에게 열면 남의 완성본을 누구나 지울 수 있다. 소유 질의가
      //   내주지 않는 것으로 막는다(꺼내기와 갈리는 지점: 꺼내기는 원본을 잃지 않는다)
      repository.findOneOwned.mockResolvedValueOnce(null);

      expect(await service.deleteArchived(at(), 200)).toBe(false);
      expect(repository.findOneArchived).not.toHaveBeenCalled();
      expect(repository.deleteRecordById).not.toHaveBeenCalled();
    });

    it('관리급(manageAll)은 남이 만든 보관물도 지운다', async () => {
      // 공용 공간은 누군가 정리해야 한다. 소유 무관 조회로 갈아타는 것이 그 권한의 구현이다.
      repository.findOneArchived.mockResolvedValueOnce(
        makeFinal({ location: 'archive', ownerUserId: 99 }),
      );
      repository.deleteRecordById.mockResolvedValueOnce(true);

      expect(await service.deleteArchived(at(), 200, true)).toBe(true);
      // 조직과 버전만으로 집는다(작업자는 조건이 아니다)
      expect(repository.findOneArchived).toHaveBeenCalledWith(
        { organizationId: 10, version: 'v1.5' },
        200,
      );
      expect(repository.findOneOwned).not.toHaveBeenCalled();
      // 로그 행위자는 지운 사람이다(소유자 99 가 아니라 요청자 7)
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'final.deleted', actorUserId: 7 }),
      );
    });

    it('관리급이어도 개인 워크스페이스 항목은 이 경로로 지워지지 않는다', async () => {
      // 위치 조건이 없으면 "보관함 정리" 권한으로 남의 작업 중 항목까지 없앨 수 있다.
      repository.findOneArchived.mockResolvedValueOnce(makeFinal({ location: 'personal' }));

      expect(await service.deleteArchived(at(), 200, true)).toBe(false);
      expect(repository.deleteRecordById).not.toHaveBeenCalled();
    });

    it('보관함 삭제: 남의 것은 못 지운다', async () => {
      // 채널이 개인 소유라 남의 보관물에 닿을 경로 자체가 없다(관리자 예외도 없다)
      // 소유(조직/작업자/버전)는 질의의 WHERE 가 확인한다. 남의 것은 애초에 내주지 않는다.
      repository.findOneOwned.mockResolvedValueOnce(null);

      expect(await service.deleteArchived(at(), 200)).toBe(false);
      expect(repository.deleteRecordById).not.toHaveBeenCalled();
    });

    it('보관함 삭제 경로로 개인 워크스페이스 항목은 지워지지 않는다', async () => {
      repository.findOneOwned.mockResolvedValueOnce(
        makeFinal({ location: 'personal' }),
      );

      expect(await service.deleteArchived(at(), 200)).toBe(false);
      expect(repository.deleteRecordById).not.toHaveBeenCalled();
    });
  });

  describe('pre-flight 자산 검증', () => {
    it('원천 영상/프레임/아웃트로 중 UPLOADED 가 아닌 게 있으면 잡 등록 없이 400 을 던진다', async () => {
      videoProjects.getPersonal.mockResolvedValueOnce(makeSource());
      assetSets.getOneById.mockResolvedValueOnce(makeSet());
      storage.getAssetStatuses.mockResolvedValueOnce({
        'src-result': 'UPLOADED',
        'frame-1': 'MISSING',
        'outro-1': 'UPLOADED',
      } as Record<string, AssetUploadStatus>);

      await expect(service.createFromSourcePersonal(at(), 100, 20)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(render.createJob).not.toHaveBeenCalled();
      expect(repository.createRecord).not.toHaveBeenCalled();
    });
  });
});
