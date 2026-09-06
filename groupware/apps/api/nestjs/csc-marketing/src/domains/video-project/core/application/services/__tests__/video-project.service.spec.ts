import { BadRequestException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { VideoProjectService } from '..';
import { VideoProjectEntity } from '../../../domain';
import {
  ApiCredentialResolverPort,
  API_CREDENTIAL_RESOLVER_PORT,
  RenderJobStatus,
  VideoProjectRepositoryPort,
  VIDEO_PROJECT_REPOSITORY_PORT,
  VideoRenderPort,
  VideoRenderSpecBuilder,
  VIDEO_RENDER_PORT,
  VIDEO_RENDER_SPEC_BUILDERS,
} from '../../ports/outbound';
import type { VersionRegistry } from '../../../../../../shared/domain/version-registry';
import {
  SavedPlanPort,
  SAVED_PLAN_PORT,
} from '../../../../../saved-plan/core/application/ports/inbound';
import { SavedPlanEntity } from '../../../../../saved-plan/core/domain';
import {
  ChannelSettingsPort,
  CHANNEL_SETTINGS_PORT,
  AiModelSelection,
} from '../../../../../channel-settings/core/application/ports/inbound';
import {
  createApiCredentialResolverMock,
  createVideoProjectRepositoryMock,
  createVideoRenderMock,
} from '../../../../__mocks__/video-project.mock';
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
import {
  CreateVideoProjectSaga,
  RerenderVideoProjectSaga,
  RerenderVideoProjectSegmentSaga,
  VideoProjectSpecBuilder,
} from '../../sagas';
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

describe('VideoProjectService', () => {
  let service: VideoProjectService;
  let repository: jest.Mocked<VideoProjectRepositoryPort>;
  let render: jest.Mocked<VideoRenderPort>;
  let credentials: jest.Mocked<ApiCredentialResolverPort>;
  let savedPlans: jest.Mocked<Pick<SavedPlanPort, 'getPersonal'>>;
  let activityLog: jest.Mocked<ActivityLogPort>;
  let sagaStore: InMemorySagaStore;
  let channels: jest.Mocked<Pick<ChannelSettingsPort, 'getAiModels'>>;
  let storage: jest.Mocked<FileUploadStoragePort>;

  /**
   * 스코프 헬퍼. `(10, 7[, channelId])` 인자 나열을 대체
   *
   * 버전이 스코프에 있는 것이 계약. 산출물은 버전 소유이고 빠뜨린 호출은 컴파일 불가
   */
  /**
   * 예약 행 fake. 행의 버전은 그것을 만든 스코프의 버전이다(실제 INSERT 가 그렇게 넣는다)
   *
   * 고정값으로 두면 v1.0 으로 만든 테스트가 v1.5 행을 받는다. 그러면 행의 버전으로 판정하는
   * 규칙들이 엉뚱한 쪽을 본다(렌더 스펙 조립이 그렇다: 씬 이미지 유무, 소리를 누가 만드는가,
   * 기본 씬 비주얼로 갈 수 있는가). 테스트마다 `version` 을 손으로 덮으면 덮지 않은 곳이 조용히
   * 다른 버전을 돈다.
   */
  const reservedRow = (
    scope: { version: ToolVersion },
    rec: Partial<VideoProjectEntity>,
  ): VideoProjectEntity => makeProject({ ...rec, version: scope.version });

  const at = (version: ToolVersion = 'v1.5') =>
    ownerVersionScope({ organizationId: 10, ownerUserId: 7, version });
  const ws = (channelId: number, version: ToolVersion = 'v1.5') =>
    workspaceScope({ organizationId: 10, ownerUserId: 7, channelId, version });
  /** 조직 공용 스코프(보관함): 작업자도 채널도 없음 */
  const org = (version: ToolVersion = 'v1.5') =>
    orgVersionScope({ organizationId: 10, version });

  const makePlan = (overrides: Partial<SavedPlanEntity> = {}): SavedPlanEntity => ({
    id: 5,
    organizationId: 10,
    ownerUserId: 7,
    location: 'personal',
    channelId: 3,
    brandName: '브랜드',
    clientRequestId: null,
    brandConcepts: [],
    // 생성 시점 모델 스냅샷은 엔티티 필수 필드다(미선택이면 빈 문자열)
    version: 'v1.5',
    llmModel: '',
    imageModel: '',
    videoModel: '',
    segmentMode: '',
    title: '기획안',
    summary: '요약',
    scenes: [
      { index: 1, sourceDirection: '연출1', subtitle: '자막1', narration: '나레이션1', imagePrompt: 'prompt-1' },
      { index: 2, sourceDirection: '연출2', subtitle: '자막2', narration: '나레이션2', imagePrompt: 'prompt-2' },
      { index: 3, sourceDirection: '연출3', subtitle: '자막3', narration: '나레이션3', imagePrompt: 'prompt-3' },
    ],
    // 씬 2 는 이미지가 없음 → 조합 스펙에서 제외 대상
    sceneImages: [
      { index: 1, uploadId: 'u-1' },
      { index: 3, uploadId: 'u-3' },
    ],
    // BGM 은 렌더 필수: 기본 스냅샷을 준다(BGM 없음 케이스는 override 로 null)
    bgm: { assetId: 1, uploadId: 'bgm-up', name: '기본 BGM' },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const makeProject = (overrides: Partial<VideoProjectEntity> = {}): VideoProjectEntity => ({
    id: 100,
    organizationId: 10,
    ownerUserId: 7,
    channelId: 3,
    savedPlanId: 5,
    title: '기획안',
    aspectRatio: '9:16',
    resolution: '720p',
    videoModel: '',
    videoMode: '',
    segmentMode: '',
    ttsModel: 'edge-tts',
    ttsVoice: 'ko-KR-SunHiNeural',
    ttsPitch: '+0Hz',
    scenes: [],
    background: null,
    bgm: { assetId: 1, uploadId: 'bgm-up', name: '기본 BGM' },
    clientRequestId: null,
    version: 'v1.5',
    renderJobId: 'job-1',
    renderStatus: 'RENDERING',
    progress: null,
    renderStage: null,
    segments: null,
    resultUploadId: null,
    captionsUploadId: null,
    thumbnailUploadId: null,
    placedAt: null,
    location: 'personal',
    error: null,
    errorCode: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  /** 렌더 잡 상태 스냅샷 팩토리. 기본은 워커가 살아 있는 렌더 중. 필드가 늘어도 여기 한 곳만 고침 */
  const makeJobStatus = (overrides: Partial<RenderJobStatus> = {}): RenderJobStatus => ({
    status: 'RENDERING',
    resultUploadId: null,
    captionsUploadId: null,
    error: null,
    errorCode: null,
    progress: null,
    workerAlive: true,
    renderStage: null,
    scenes: null,
    usage: null,
    ...overrides,
  });

  /**
   * 키 없이도 도는 영상 모델
   *
   * 씬 이미지를 만들지 않는 버전은 기본 씬 비주얼(slideshow)로 갈 수 없다. 그 provider 는 씬
   * 이미지를 받아 클립을 만들기 때문이다. 그래서 영상 모델이 정해지지 않으면 생성이 402 로
   * 멈춘다(그 검사가 없으면 워커까지 가서 내부 문구로 실패한다)
   *
   * 그 멈춤이 주제가 아닌 테스트는 이 값을 설정에 넣어 렌더 가능한 상태를 만든다. 공용
   * 픽스처의 기본값으로 두지 않는 이유: 영상 모델의 출처가 셋이고(기획안 스냅샷 > 설정 > 없음)
   * 기본값을 두면 그 우선순위를 검사하는 테스트가 조용히 무력화됨
   */
  const RENDERABLE_VIDEO_MODEL = 'wan2.2-ti2v-5b';

  const models = (overrides: Partial<AiModelSelection> = {}): AiModelSelection => ({
    llm: '',
    video: '',
    videoMode: '',
    tts: '',
    ttsVoice: '',
    ttsPitch: '',
    image: '',
    ...overrides,
  });

  beforeEach(async () => {
    repository = createVideoProjectRepositoryMock();
    render = createVideoRenderMock();
    credentials = createApiCredentialResolverMock();
    savedPlans = { getPersonal: jest.fn() };
    channels = { getAiModels: jest.fn() };
    // 사전검증 기본 mock = 넘긴 id 전부 UPLOADED(정상 경로). 거부 케이스는 per-test override.
    storage = {
      getAssetStatuses: jest.fn(async (ids: string[]) =>
        Object.fromEntries(ids.map((id) => [id, 'UPLOADED' as const])),
      ),
      deleteAsset: jest.fn(),
      deleteAssets: jest.fn(async (_ids: string[]) => ({ failed: [] as string[] })),
      confirmAssets: jest.fn(),
    };
    activityLog = createActivityLogMock();
    sagaStore = createInMemorySagaStore();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoProjectService,
        // 생성은 사가에 위임된다. 러너를 mock 하지 않고 진짜 러너 + 인메모리 저장소로 돌린다:
        //   단계 순서와 보상(정의)이 이 테스트의 검증 범위에 들어와야 함
        CreateVideoProjectSaga,
        RerenderVideoProjectSaga,
        RerenderVideoProjectSegmentSaga,
        VideoProjectSpecBuilder,
        // 버전별 스펙 조립 표(파이프라인 이음새 2/3): 진짜 구현을 두 슬롯에 주입
        //   가짜로 바꾸면 "예약 내용대로 렌더된다" 는 이 파일의 단정들이 검증에서 빠진다.
        {
          provide: VIDEO_RENDER_SPEC_BUILDERS,
          inject: [VideoProjectSpecBuilder],
          useFactory: (shared: VideoProjectSpecBuilder) =>
            ({ 'v1.5': shared, 'v1.0': shared }) satisfies VersionRegistry<VideoRenderSpecBuilder>,
        },
        ...sagaTestProviders(sagaStore),
        { provide: VIDEO_PROJECT_REPOSITORY_PORT, useValue: repository },
        { provide: VIDEO_RENDER_PORT, useValue: render },
        { provide: API_CREDENTIAL_RESOLVER_PORT, useValue: credentials },
        { provide: SAVED_PLAN_PORT, useValue: savedPlans },
        { provide: CHANNEL_SETTINGS_PORT, useValue: channels },
        { provide: FILE_UPLOAD_STORAGE_PORT, useValue: storage },
        { provide: ACTIVITY_LOG_PORT, useValue: activityLog },
      ],
    }).compile();
    service = module.get<VideoProjectService>(VideoProjectService);
    // 사가의 잡 단계는 예약 행을 다시 읽어 스펙을 조립한다(행이 생성 시점 스냅샷이라 그것이
    //   진실원이다). 기본 mock 은 방금 createRecord 가 만든 행을 그대로 돌려준다: 그래야 이 파일의
    //   스펙 단정들이 "예약된 내용대로 렌더된다" 를 검증
    //   잡이 붙은 뒤(startRenderRecord)에는 실제 DB 처럼 RENDERING 으로 읽히게 병합
    //   createRecord 기본 mock: 넘긴 레코드를 그대로 저장한 행으로 돌려준다(DB 와 같다). 사가의 잡
    //   단계가 그 행에서 스펙을 다시 조립하므로, 여기서 예약 내용을 잃으면 라우팅이 기본값으로 떨어진다.
    repository.createRecord.mockImplementation(async (scope, rec) =>
      makeProject({ ...rec, ...scope }),
    );
    repository.findOneOwned.mockImplementation(async (_scope, id: number) => {
      const results = repository.createRecord.mock.results;
      const last = results[results.length - 1];
      const base =
        last?.type === 'return'
          ? ((await last.value) as VideoProjectEntity)
          : makeProject({ id });
      const attached = repository.startRenderRecord.mock.calls.at(-1);
      return attached
        ? { ...base, renderJobId: attached[2], renderStatus: 'RENDERING' as const }
        : base;
    });
  });

  afterEach(() => jest.clearAllMocks());

  describe('createFromSavedPlanPersonal', () => {
    it('저장본이 없으면 null 을 반환한다(잡/저장 없음)', async () => {
      savedPlans.getPersonal.mockResolvedValueOnce(null);

      const result = await service.createFromSavedPlanPersonal(at(), 5);

      expect(result).toBeNull();
      expect(render.createJob).not.toHaveBeenCalled();
      expect(repository.createRecord).not.toHaveBeenCalled();
    });

    it('이미지 있는 씬만 조합 스펙에 담고, 행을 먼저 예약한 뒤 잡을 붙인다', async () => {
      // 모델을 비운다: 그 버전의 기본 씬 비주얼(slideshow)로 가는 경로를 보는 자리다.
      savedPlans.getPersonal.mockResolvedValueOnce(makePlan({ videoModel: '' }));
      channels.getAiModels.mockResolvedValueOnce(models()); // 빈 선택 → slideshow/edge-tts 기본
      render.createJob.mockResolvedValueOnce('job-xyz');
      repository.createRecord.mockImplementationOnce(async (scope, rec) =>
        reservedRow(scope, rec),
      );
      repository.startRenderRecord.mockImplementationOnce(async (_org, _id, jobId) =>
        makeProject({ renderJobId: jobId, renderStatus: 'RENDERING' }),
      );

      // 씬 이미지를 쓰는 버전(v1.0)으로 생성. 그 버전에서만 이미지 없는 씬을 걸러내기 때문
      //   (텍스트→영상 버전은 씬 이미지를 아예 만들지 않아, 같은 필터를 걸면 씬이 하나도 안 남는다)
      const result = await service.createFromSavedPlanPersonal(at('v1.0'), 5);

      // 씬 2(이미지 없음)는 제외 → 씬 1,3 만, order 1..2 로 재부여
      const spec = render.createJob.mock.calls[0][0];
      expect(spec.videoProvider).toBe('slideshow');
      expect(spec.tts).toEqual({ provider: 'edge-tts', voice: 'ko-KR-SunHiNeural', pitch: '+0Hz' });
      expect(spec.scenes).toEqual([
        {
          order: 1,
          imageUploadId: 'u-1',
          narration: '나레이션1',
          subtitle: '자막1',
          // 화면 묘사: 버전을 가리지 않고 싣는다. 이 문장을 실제로 쓸지는 렌더가 씬 이미지
          //   유무로 정한다(이미지가 있으면 프롬프트는 움직임 지시라 이 문장을 쓰지 않는다)
          //   여기서 미리 가르지 않는 이유는 그 판정이 렌더의 사정이기 때문
          visualPrompt: 'prompt-1',
        },
        { order: 2, imageUploadId: 'u-3', narration: '나레이션3', subtitle: '자막3', visualPrompt: 'prompt-3' },
      ]);

      // 예약 행은 잡 없이 PENDING. 유니크가 유료 잡보다 앞에서 중복을 걸러야 하기 때문
      const record = repository.createRecord.mock.calls[0][1];
      expect(record.renderJobId).toBeNull();
      expect(record.renderStatus).toBe('PENDING');
      expect(record.savedPlanId).toBe(5);
      // 잡은 그 뒤에 부착
      expect(repository.startRenderRecord).toHaveBeenCalledWith(10, expect.any(Number), 'job-xyz');
      expect(result?.renderStatus).toBe('RENDERING');
    });

    it('알려진 영상 모델(wan)이면 그 provider 로 라우팅한다', async () => {
      savedPlans.getPersonal.mockResolvedValueOnce(makePlan());
      channels.getAiModels.mockResolvedValueOnce(models({ video: 'wan2.2-ti2v-5b' }));
      render.createJob.mockResolvedValueOnce('job-w');
      repository.createRecord.mockImplementationOnce(async (scope, rec) =>
        reservedRow(scope, rec),
      );

      await service.createFromSavedPlanPersonal(at(), 5);

      expect(render.createJob.mock.calls[0][0].videoProvider).toBe('wan2.2-ti2v-5b');
    });

    it('외부모델(Grok) + 조직 XAI 키 등록 → grok provider + 평문 키를 spec 에 싣는다', async () => {
      savedPlans.getPersonal.mockResolvedValueOnce(makePlan());
      channels.getAiModels.mockResolvedValueOnce(models({ video: 'grok-imagine-video' }));
      credentials.resolveCredentials.mockResolvedValueOnce({ apiKey: 'xai-secret-key' });
      render.createJob.mockResolvedValueOnce('job-g');
      repository.createRecord.mockImplementationOnce(async (scope, rec) =>
        reservedRow(scope, rec),
      );

      await service.createFromSavedPlanPersonal(at(), 5);

      expect(credentials.resolveCredentials).toHaveBeenCalledWith(10, 'XAI');
      const spec = render.createJob.mock.calls[0][0];
      expect(spec.videoProvider).toBe('grok-imagine-video');
      expect(spec.sceneVisualApiKey).toBe('xai-secret-key'); // 어댑터가 암호문으로 변환해 전송
    });

    it('세그먼트 연결 방식이 기획안에서 렌더 잡까지 도달한다', async () => {
      // 벤더로 나가는 스펙은 기획안이 아니라 예약 행에서 조립된다. 그래서 이 값이 행에 굳지
      //   않으면 잡 params 에 실리지 않고, 고른 방식과 무관하게 렌더 기본으로 돈다(조용하다)
      savedPlans.getPersonal.mockResolvedValueOnce(makePlan({ segmentMode: 'parallel' }));
      channels.getAiModels.mockResolvedValueOnce(models({ video: RENDERABLE_VIDEO_MODEL }));
      render.createJob.mockResolvedValueOnce('job-s');
      repository.createRecord.mockImplementationOnce(async (scope, rec) =>
        reservedRow(scope, rec),
      );

      await service.createFromSavedPlanPersonal(at(), 5);

      // 예약 행에 굳는다(재렌더도 같은 방식으로 돌아야 한다)
      expect(repository.createRecord.mock.calls[0][1].segmentMode).toBe('parallel');
      // 그 행에서 조립된 스펙이 벤더로 나감
      expect(render.createJob.mock.calls[0][0].segmentMode).toBe('parallel');
    });

    it('소리를 누가 만드는지가 버전에서 렌더 잡까지 도달한다', async () => {
      // 텍스트→영상은 영상 모델이 말까지 만든다. 이 값이 렌더에 닿지 않으면 TTS 가 함께 돌아
      //   목소리가 둘이 되고(모델이 낸 것 + 얹은 것) 겹쳐 들림. 결과물에서만 드러남
      savedPlans.getPersonal.mockResolvedValueOnce(makePlan());
      channels.getAiModels.mockResolvedValueOnce(models({ video: RENDERABLE_VIDEO_MODEL }));
      render.createJob.mockResolvedValueOnce('job-n');
      repository.createRecord.mockImplementationOnce(async (scope, rec) =>
        reservedRow(scope, rec),
      );

      await service.createFromSavedPlanPersonal(at('v1.5'), 5);

      expect(render.createJob.mock.calls[0][0].synthesizeSpeech).toBe(false);
    });

    it('이미지→영상은 여전히 렌더가 소리를 만든다', async () => {
      // 그 버전의 모델은 말을 못 한다. 합성을 끄면 무음 영상이 되고, 그건 고칠 수 있는 선택지가
      //   아니라 그 파이프라인의 유일한 소리를 없애는 것
      savedPlans.getPersonal.mockResolvedValueOnce(makePlan());
      channels.getAiModels.mockResolvedValueOnce(models());
      render.createJob.mockResolvedValueOnce('job-o');
      repository.createRecord.mockImplementationOnce(async (scope, rec) =>
        reservedRow(scope, rec),
      );

      await service.createFromSavedPlanPersonal(at('v1.0'), 5);

      expect(render.createJob.mock.calls[0][0].synthesizeSpeech).toBe(true);
    });

    it('기획안이 들고 있는 영상 모델이 설정보다 우선한다', async () => {
      // 생성 모달에서 설정과 다른 모델을 골라 뽑을 수 있고 그 선택은 설정에 남지 않음
      // 설정을 먼저 보면 고른 것과 다른 모델로 렌더된다(그 사이 설정을 바꿨다면 더 그렇다)
      savedPlans.getPersonal.mockResolvedValueOnce(makePlan({ videoModel: 'grok-imagine-video' }));
      channels.getAiModels.mockResolvedValueOnce(models({ video: 'wan2.2-ti2v-5b' }));
      credentials.resolveCredentials.mockResolvedValueOnce({ apiKey: 'xai-secret-key' });
      render.createJob.mockResolvedValueOnce('job-p');
      repository.createRecord.mockImplementationOnce(async (scope, rec) =>
        reservedRow(scope, rec),
      );

      await service.createFromSavedPlanPersonal(at(), 5);

      const spec = render.createJob.mock.calls[0][0];
      expect(spec.videoProvider).toBe('grok-imagine-video');
      expect(credentials.resolveCredentials).toHaveBeenCalledWith(10, 'XAI');
    });

    it('씬 이미지를 만드는 버전은 외부 키가 없으면 기본 씬 비주얼로 폴백한다(키 미주입)', async () => {
      // v1.0 은 씬 이미지가 있어 슬라이드쇼가 실제로 만들어진다. 외부 모델을 골라 뒀을 뿐이고
      //   만들 수는 있는 상태라, 여기서 막으면 키를 등록하지 않은 조직의 기존 경로가 멈춘다.
      savedPlans.getPersonal.mockResolvedValueOnce(makePlan());
      channels.getAiModels.mockResolvedValueOnce(models({ video: 'grok-imagine-video' }));
      credentials.resolveCredentials.mockResolvedValueOnce(null); // 미등록
      render.createJob.mockResolvedValueOnce('job-gf');
      repository.createRecord.mockImplementationOnce(async (scope, rec) =>
        reservedRow(scope, rec),
      );

      await service.createFromSavedPlanPersonal(at('v1.0'), 5);

      const spec = render.createJob.mock.calls[0][0];
      expect(spec.videoProvider).toBe('slideshow'); // grok 아님: 기본 폴백
      expect(spec.sceneVisualApiKey).toBeUndefined();
    });

    it('씬 이미지를 만들지 않는 버전은 외부 키가 없으면 렌더를 시작하지 않는다', async () => {
      // 기본 씬 비주얼(슬라이드쇼)은 이미지 한 장을 받아 클립을 만든다. v1.5 에는 그 이미지가
      //   없어 폴백이 구조적으로 불가능하고, 막지 않으면 그 잡이 워커까지 가서 내부 메시지로 죽음
      //   (고쳐야 할 것을 알려 주지 않고 그 사이 화면은 '만드는 중' 으로 남는다)
      savedPlans.getPersonal.mockResolvedValueOnce(makePlan());
      channels.getAiModels.mockResolvedValueOnce(
        models({ video: 'higgsfield/veo3.1/text-to-video' }),
      );
      credentials.resolveCredentials.mockResolvedValueOnce(null); // 미등록
      repository.createRecord.mockImplementationOnce(async (scope, rec) =>
        reservedRow(scope, rec),
      );

      // 402 여야 사유 문구가 화면까지 그대로 간다(나레이션 키 검사와 같은 규칙)
      await expect(service.createFromSavedPlanPersonal(at(), 5)).rejects.toMatchObject({
        status: HttpStatus.PAYMENT_REQUIRED,
      });
      // 벤더 호출이 하나도 나가지 않음. 되돌릴 요금이 없기 때문
      expect(render.createJob).not.toHaveBeenCalled();
    });

    it('내부 모델(wan/미선택)이면 자격증명을 조회하지 않는다', async () => {
      savedPlans.getPersonal.mockResolvedValueOnce(makePlan());
      channels.getAiModels.mockResolvedValueOnce(models({ video: 'wan2.2-ti2v-5b' }));
      render.createJob.mockResolvedValueOnce('job-w2');
      repository.createRecord.mockImplementationOnce(async (scope, rec) =>
        reservedRow(scope, rec),
      );

      await service.createFromSavedPlanPersonal(at(), 5);

      expect(credentials.resolveCredentials).not.toHaveBeenCalled();
    });

    it('모델 선택은 채널이 아니라 만든 사람으로 조회한다 [v1.0]', async () => {
      // 채널이 없어도 조회한다: 모델 선택이 개인 스코프라 채널 유무와 무관하다.
      //   기본 폴백까지 함께 보므로 그 폴백이 성립하는 버전으로 못박는다(아래 두 테스트가 그
      //   차이를 다룬다)
      savedPlans.getPersonal.mockResolvedValueOnce(makePlan({ channelId: null, videoModel: '' }));
      channels.getAiModels.mockResolvedValueOnce(models());
      render.createJob.mockResolvedValueOnce('job-n');
      repository.createRecord.mockResolvedValueOnce(
        makeProject({ channelId: null, version: 'v1.0', videoModel: '' }),
      );

      await service.createFromSavedPlanPersonal(at('v1.0'), 5);

      expect(channels.getAiModels).toHaveBeenCalledWith(at('v1.0'));
      expect(render.createJob.mock.calls[0][0].videoProvider).toBe('slideshow');
    });

    it('모델 선택 조회가 실패해도 기본 모델로 렌더를 진행한다 [v1.0]', async () => {
      // 설정 서버가 흔들려도 만들 수 있어야 한다. 그 버전에서는 기본 씬 비주얼이 실제로
      //   영상을 만들기 때문이다(씬 이미지가 있다)
      savedPlans.getPersonal.mockResolvedValueOnce(makePlan({ channelId: null, videoModel: '' }));
      channels.getAiModels.mockRejectedValueOnce(new Error('down'));
      render.createJob.mockResolvedValueOnce('job-n');
      repository.createRecord.mockResolvedValueOnce(
        makeProject({ channelId: null, version: 'v1.0', videoModel: '' }),
      );

      await service.createFromSavedPlanPersonal(at('v1.0'), 5);

      expect(render.createJob.mock.calls[0][0].videoProvider).toBe('slideshow');
    });

    it('폴백이 성립하지 않는 버전은 설정 조회가 실패하면 만들지 않는다 [v1.5]', async () => {
      // 같은 장애, 다른 결론. 그 버전은 씬 이미지가 없어 기본 씬 비주얼이 받을 재료가 없음
      //   그대로 진행하면 워커까지 가서 "slideshow: 씬 이미지가 필요합니다" 로 죽고(실제로 그런
      //   렌더가 있었다), 사용자에게는 고칠 것을 알려 주지 않는 내부 문구만 남음
      savedPlans.getPersonal.mockResolvedValueOnce(makePlan({ channelId: null, videoModel: '' }));
      channels.getAiModels.mockRejectedValueOnce(new Error('down'));
      repository.createRecord.mockImplementationOnce(async (scope, rec) =>
        reservedRow(scope, { ...rec, videoModel: '' }),
      );

      await expect(service.createFromSavedPlanPersonal(at('v1.5'), 5)).rejects.toThrow(/영상 모델/);
      // 벤더 잡은 하나도 만들어지지 않는다: 되돌릴 요금이 없는 지점에서 멈춘다.
      expect(render.createJob).not.toHaveBeenCalled();
    });

    it('BGM 을 렌더 스펙(fileId)과 프로젝트 레코드에 싣는다', async () => {
      savedPlans.getPersonal.mockResolvedValueOnce(
        makePlan({ bgm: { assetId: 42, uploadId: 'bgm-42', name: '잔잔한 피아노' } }),
      );
      channels.getAiModels.mockResolvedValueOnce(models({ video: RENDERABLE_VIDEO_MODEL }));
      render.createJob.mockResolvedValueOnce('job-b');
      repository.createRecord.mockImplementationOnce(async (scope, rec) =>
        reservedRow(scope, rec),
      );

      await service.createFromSavedPlanPersonal(at(), 5);

      expect(render.createJob.mock.calls[0][0].bgm).toEqual({ fileId: 'bgm-42' });
      expect(repository.createRecord.mock.calls[0][1].bgm).toEqual({
        assetId: 42,
        uploadId: 'bgm-42',
        name: '잔잔한 피아노',
      });
    });

    it('BGM 이 없으면(BGM_REQUIRED) 잡 등록/저장 없이 400 을 던진다', async () => {
      savedPlans.getPersonal.mockResolvedValueOnce(makePlan({ bgm: null }));

      await expect(service.createFromSavedPlanPersonal(at(), 5)).rejects.toThrow(
        BadRequestException,
      );
      expect(render.createJob).not.toHaveBeenCalled();
      expect(repository.createRecord).not.toHaveBeenCalled();
    });

    it('씬 효과음 배열을 스펙 씬에 fileId/offsetSec 으로 싣는다(이미지 필터/재정렬 후에도 씬에 동반)', async () => {
      savedPlans.getPersonal.mockResolvedValueOnce(
        makePlan({
          scenes: [
            { index: 1, sourceDirection: 'd1', subtitle: 's1', narration: 'n1', sfx: [{ assetId: 9, uploadId: 'sfx-9', name: '휙', offsetSec: 0.5 }] },
            { index: 3, sourceDirection: 'd3', subtitle: 's3', narration: 'n3' },
          ],
          sceneImages: [
            { index: 1, uploadId: 'u-1' },
            { index: 3, uploadId: 'u-3' },
          ],
        }),
      );
      channels.getAiModels.mockResolvedValueOnce(models({ video: RENDERABLE_VIDEO_MODEL }));
      render.createJob.mockResolvedValueOnce('job-s');
      repository.createRecord.mockImplementationOnce(async (scope, rec) =>
        reservedRow(scope, rec),
      );

      await service.createFromSavedPlanPersonal(at(), 5);

      const spec = render.createJob.mock.calls[0][0];
      expect(spec.scenes[0].sfx).toEqual([{ fileId: 'sfx-9', offsetSec: 0.5 }]);
      expect(spec.scenes[1].sfx).toBeUndefined();
    });

    it('같은 멱등키로 두 번 요청해도 렌더 잡은 한 번만 만들어진다', async () => {
      // 더블클릭 = 중복 유료 잡이었다. 사가 인스턴스가 그 클릭 하나를 붙들어 두 번째 요청은
      //   단계를 하나도 다시 돌리지 않는다(판정이 유료 호출보다 앞에 있다)
      savedPlans.getPersonal.mockResolvedValue(makePlan());
      channels.getAiModels.mockResolvedValue(models({ video: RENDERABLE_VIDEO_MODEL }));
      render.createJob.mockResolvedValue('job-once');

      const first = await service.createFromSavedPlanPersonal(at(), 5, undefined, 'click-1');
      const second = await service.createFromSavedPlanPersonal(at(), 5, undefined, 'click-1');

      expect(second?.id).toBe(first?.id);
      expect(render.createJob).toHaveBeenCalledTimes(1);
      expect(repository.createRecord).toHaveBeenCalledTimes(1);
    });

    it('잡 등록이 실패하면 예약 행을 지운다(아무것도 만들어지지 않는다)', async () => {
      savedPlans.getPersonal.mockResolvedValueOnce(makePlan());
      channels.getAiModels.mockResolvedValueOnce(models({ video: RENDERABLE_VIDEO_MODEL }));
      repository.createRecord.mockResolvedValueOnce(makeProject({ id: 77, videoModel: RENDERABLE_VIDEO_MODEL }));
      render.createJob.mockRejectedValueOnce(new Error('엔진 도달 불가'));

      await expect(service.createFromSavedPlanPersonal(at(), 5)).rejects.toThrow('엔진 도달 불가');

      expect(repository.deleteRecordById).toHaveBeenCalledWith(10, 77);
    });

  });

  describe('listPersonal (reconcile)', () => {
    it('지정 채널 것만 조회해야 한다. 워크스페이스는 작업자 × 채널로 분리된다', async () => {
      // channelId 가 레포로 내려가지 않으면 그 작업자의 전 채널 원천 영상이 한 워크스페이스에 섞인다.
      repository.findRecordsByOwner.mockResolvedValueOnce([]);

      await service.listPersonal(ws(42));

      expect(repository.findRecordsByOwner).toHaveBeenCalledWith(ws(42));
    });

    it('채널이 다르면 다른 워크스페이스로 조회해야 한다', async () => {
      repository.findRecordsByOwner.mockResolvedValue([]);

      await service.listPersonal(ws(1));
      await service.listPersonal(ws(2));

      expect(repository.findRecordsByOwner).toHaveBeenNthCalledWith(1, ws(1));
      expect(repository.findRecordsByOwner).toHaveBeenNthCalledWith(2, ws(2));
    });

    it('렌더 중 프로젝트는 잡 상태를 조회해 완료로 갱신한다', async () => {
      const rendering = makeProject({ renderStatus: 'RENDERING', renderJobId: 'job-1' });
      repository.findRecordsByOwner.mockResolvedValueOnce([rendering]);
      render.getJobStatus.mockResolvedValueOnce(
        makeJobStatus({
          status: 'COMPLETED',
          resultUploadId: 'result-1',
          workerAlive: null,
          captionsUploadId: 'cap-1',
        }),
      );
      const completed = makeProject({ renderStatus: 'COMPLETED', resultUploadId: 'result-1' });
      repository.updateRenderStateRecord.mockResolvedValueOnce(completed);

      const result = await service.listPersonal(ws(42));

      expect(render.getJobStatus).toHaveBeenCalledWith('job-1');
      expect(repository.updateRenderStateRecord).toHaveBeenCalledWith(10, 100, {
        renderStatus: 'COMPLETED',
        resultUploadId: 'result-1',
        captionsUploadId: 'cap-1',
        error: null,
        errorCode: null,
        // 세그먼트는 렌더가 주지 않아 null 이고, 그러면 행의 값이 유지됨
        segments: null,
      });
      expect(result[0]).toBe(completed);
    });

    it('렌더 중이면 진행률(%)을 응답에 실어준다(상태 변화 없으면 DB 미갱신)', async () => {
      const rendering = makeProject({ renderStatus: 'RENDERING', renderJobId: 'job-1' });
      repository.findRecordsByOwner.mockResolvedValueOnce([rendering]);
      render.getJobStatus.mockResolvedValueOnce(
        makeJobStatus({
          progress: 50,
        }),
      );

      const result = await service.listPersonal(ws(42));

      expect(repository.updateRenderStateRecord).not.toHaveBeenCalled(); // 상태 동일 → 저장 안 함
      expect(result[0].progress).toBe(50); // 진행률은 응답에만
    });

    it('워커가 없고(heartbeat 만료) 생성 후 유예가 지나면 STALLED 로 갱신한다', async () => {
      const rendering = makeProject({
        renderStatus: 'RENDERING',
        renderJobId: 'job-1',
        createdAt: new Date(Date.now() - 5 * 60_000), // 5분 전: 유예(2분) 초과
      });
      repository.findRecordsByOwner.mockResolvedValueOnce([rendering]);
      render.getJobStatus.mockResolvedValueOnce(
        makeJobStatus({
          workerAlive: false, // 소비 워커 없음
        }),
      );
      const stalled = makeProject({ renderStatus: 'STALLED' });
      repository.updateRenderStateRecord.mockResolvedValueOnce(stalled);

      const result = await service.listPersonal(ws(42));

      // STALLED 는 종료가 아니라 세그먼트를 저장하지 않는다(null)
      expect(repository.updateRenderStateRecord).toHaveBeenCalledWith(10, 100, {
        renderStatus: 'STALLED',
        resultUploadId: null,
        captionsUploadId: null,
        error: null,
        errorCode: null,
        segments: null,
      });
      expect(result[0]).toBe(stalled);
    });

    it('세그먼트는 종료 전이에서만 저장한다', async () => {
      // 완료 뒤에는 렌더에 다시 묻지 않는다. 그때 굳히지 않으면 완성된 영상의 세그먼트 격자가 사라진다.
      const rendering = makeProject({ renderStatus: 'RENDERING', renderJobId: 'job-1' });
      const scenes = [
        { order: 1, status: 'done', clipUploadId: 'clip-1', durationSec: 4, prompt: '묘사 1' },
      ];
      repository.findRecordsByOwner.mockResolvedValueOnce([rendering]);
      render.getJobStatus.mockResolvedValueOnce(
        makeJobStatus({
          status: 'COMPLETED',
          resultUploadId: 'result-1',
          workerAlive: null,
          renderStage: 'FINALIZING',
          scenes,
        }),
      );
      repository.updateRenderStateRecord.mockResolvedValueOnce(
        makeProject({ renderStatus: 'COMPLETED', resultUploadId: 'result-1' }),
      );

      await service.listPersonal(ws(42));

      expect(repository.updateRenderStateRecord).toHaveBeenCalledWith(10, 100, {
        renderStatus: 'COMPLETED',
        resultUploadId: 'result-1',
        captionsUploadId: null,
        error: null,
        errorCode: null,
        segments: scenes,
      });
    });

    it('렌더 중 틱은 세그먼트를 저장하지 않는다(쓰기 증폭 방지)', async () => {
      // 상태가 바뀌어 갱신은 일어나지만 아직 종료가 아님. 4초마다 jsonb 를 다시 쓰지 않음
      const rendering = makeProject({ renderStatus: 'RENDERING', renderJobId: 'job-1' });
      repository.findRecordsByOwner.mockResolvedValueOnce([rendering]);
      render.getJobStatus.mockResolvedValueOnce(
        makeJobStatus({
          error: '벤더 지연',
          progress: 30,
          renderStage: 'SCENES',
          scenes: [
            { order: 1, status: 'done', clipUploadId: 'clip-1', durationSec: 4, prompt: null },
            { order: 2, status: 'running', clipUploadId: null, durationSec: null, prompt: null },
          ],
        }),
      );
      repository.updateRenderStateRecord.mockResolvedValueOnce(
        makeProject({ renderStatus: 'RENDERING', error: '벤더 지연' }),
      );

      await service.listPersonal(ws(42));

      expect(repository.updateRenderStateRecord).toHaveBeenCalledWith(10, 100, {
        renderStatus: 'RENDERING',
        resultUploadId: null,
        captionsUploadId: null,
        error: '벤더 지연',
        errorCode: null,
        segments: null,
      });
    });

    it('살아 있는 세그먼트를 응답에 실어주고, 없으면 행에 저장된 것이 남는다', async () => {
      const live = [
        { order: 1, status: 'running', clipUploadId: null, durationSec: null, prompt: '묘사 1' },
      ];
      const saved = [
        { order: 1, status: 'done', clipUploadId: 'clip-1', durationSec: 4, prompt: '묘사 1' },
      ];
      const rendering = makeProject({
        renderStatus: 'RENDERING',
        renderJobId: 'job-1',
        segments: saved,
      });
      repository.findRecordsByOwner.mockResolvedValue([rendering]);
      const status = makeJobStatus({ progress: 50, renderStage: 'SCENES' });
      render.getJobStatus.mockResolvedValueOnce({ ...status, scenes: live });

      const withLive = await service.listPersonal(ws(42));
      expect(withLive[0].segments).toBe(live);
      expect(withLive[0].renderStage).toBe('SCENES');

      // 렌더가 씬을 주지 않는 경우(끝난 잡, 구 버전 서버): 행에 저장된 격자가 그대로 유지
      rendering.segments = saved;
      render.getJobStatus.mockResolvedValueOnce({ ...status, scenes: null });
      const withSaved = await service.listPersonal(ws(42));
      expect(withSaved[0].segments).toBe(saved);
    });

    it('워커가 살아있으면 유예가 지나도 STALLED 로 만들지 않는다(RENDERING 유지)', async () => {
      const rendering = makeProject({
        renderStatus: 'RENDERING',
        createdAt: new Date(Date.now() - 5 * 60_000),
      });
      repository.findRecordsByOwner.mockResolvedValueOnce([rendering]);
      render.getJobStatus.mockResolvedValueOnce(
        makeJobStatus({
          progress: 30,
        }),
      );

      await service.listPersonal(ws(42));

      expect(repository.updateRenderStateRecord).not.toHaveBeenCalled();
    });

    it('완료된 프로젝트는 잡 상태를 조회하지 않는다', async () => {
      repository.findRecordsByOwner.mockResolvedValueOnce([
        makeProject({ renderStatus: 'COMPLETED', resultUploadId: 'r' }),
      ]);

      await service.listPersonal(ws(42));

      expect(render.getJobStatus).not.toHaveBeenCalled();
    });

    it('잡 상태 조회 실패는 삼켜 이전 상태를 유지한다(목록이 깨지지 않는다)', async () => {
      const rendering = makeProject({ renderStatus: 'RENDERING' });
      repository.findRecordsByOwner.mockResolvedValueOnce([rendering]);
      render.getJobStatus.mockRejectedValueOnce(new Error('video-model down'));

      const result = await service.listPersonal(ws(42));

      expect(result[0]).toBe(rendering);
      expect(repository.updateRenderStateRecord).not.toHaveBeenCalled();
    });
  });

  describe('getPersonal', () => {
    it('다른 작업자 프로젝트는 null 을 반환한다', async () => {
      repository.findOneOwned.mockResolvedValueOnce(null);

      const result = await service.getPersonal(at(), 100);

      expect(result).toBeNull();
    });
  });

  /**
   * 작업 공간 배치: 생성 창의 마지막 단계
   *
   * 검사하는 것은 셋이다. 완성본만 배치된다는 것, 썸네일 확정이 갱신보다 뒤에 온다는 것
   * (브라우저가 미리 확정하면 참조 없는 자산이 남는다), 그리고 확정이 실패해도 배치는 남는다는
   * 것(그 영상은 이미 그 사람의 것이고 그림만 붙지 못했다)
   */
  describe('placeInWorkspacePersonal', () => {
    it('남의 영상이면 null 이고 아무것도 고치지 않는다', async () => {
      repository.findOneOwned.mockResolvedValueOnce(null);

      expect(await service.placeInWorkspacePersonal(at(), 100, 'thumb-1')).toBeNull();
      expect(repository.placeInWorkspaceRecord).not.toHaveBeenCalled();
      expect(storage.confirmAssets).not.toHaveBeenCalled();
    });

    it('아직 만들어지는 중이면 400 이고 배치하지 않는다', async () => {
      // 배치를 열어 두면 그 버전의 워크스페이스가 다시 "아직 영상이 아닌 것" 을 담게 됨
      repository.findOneOwned.mockResolvedValueOnce(makeProject({ renderStatus: 'RENDERING' }));

      await expect(service.placeInWorkspacePersonal(at(), 100)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.placeInWorkspaceRecord).not.toHaveBeenCalled();
    });

    it('그림 없이도 배치된다', async () => {
      // 캔버스를 옮기지 못하는 경우가 있고, 그때 영상까지 배치하지 못하면 만든 것이 어느 목록에도 없음
      repository.findOneOwned.mockResolvedValueOnce(
        makeProject({ renderStatus: 'COMPLETED', thumbnailUploadId: null }),
      );
      repository.placeInWorkspaceRecord.mockResolvedValueOnce(
        makeProject({ placedAt: new Date() }),
      );

      const result = await service.placeInWorkspacePersonal(at(), 100);

      expect(repository.placeInWorkspaceRecord).toHaveBeenCalledWith(10, 100, null);
      expect(storage.confirmAssets).not.toHaveBeenCalled();
      expect(result?.placedAt).not.toBeNull();
    });

    it('행을 고친 뒤에 썸네일을 확정한다', async () => {
      repository.findOneOwned.mockResolvedValueOnce(
        makeProject({ renderStatus: 'COMPLETED', thumbnailUploadId: null }),
      );
      const order: string[] = [];
      repository.placeInWorkspaceRecord.mockImplementationOnce(async (_org, _id, uploadId) => {
        order.push('row');
        return makeProject({ thumbnailUploadId: uploadId, placedAt: new Date() });
      });
      storage.confirmAssets.mockImplementationOnce(async () => {
        order.push('confirm');
      });

      const result = await service.placeInWorkspacePersonal(at(), 100, 'thumb-1');

      expect(order).toEqual(['row', 'confirm']);
      expect(storage.confirmAssets).toHaveBeenCalledWith(['thumb-1']);
      expect(result?.thumbnailUploadId).toBe('thumb-1');
    });

    it('확정이 실패하면 그림만 되돌리고 던진다(배치는 남는다)', async () => {
      repository.findOneOwned.mockResolvedValueOnce(
        makeProject({ renderStatus: 'COMPLETED', thumbnailUploadId: 'old' }),
      );
      repository.placeInWorkspaceRecord.mockResolvedValueOnce(
        makeProject({ thumbnailUploadId: 'thumb-1', placedAt: new Date() }),
      );
      storage.confirmAssets.mockRejectedValueOnce(new Error('확정 실패'));

      await expect(service.placeInWorkspacePersonal(at(), 100, 'thumb-1')).rejects.toThrow(
        '확정 실패',
      );

      // 그림만 되돌림. 배치를 되돌리면 방금 만든 영상이 어느 목록에도 없게 되기 때문
      expect(repository.updateThumbnailRecord).toHaveBeenCalledWith(10, 100, 'old');
      // 되돌렸으므로 이전 그림은 살아 있어야 한다(지우면 카드가 빈 칸이 된다)
      expect(storage.deleteAsset).not.toHaveBeenCalled();
    });

    it('갈아 끼우면 이전 그림을 지운다', async () => {
      repository.findOneOwned.mockResolvedValueOnce(
        makeProject({ renderStatus: 'COMPLETED', thumbnailUploadId: 'old' }),
      );
      repository.placeInWorkspaceRecord.mockResolvedValueOnce(
        makeProject({ thumbnailUploadId: 'thumb-1', placedAt: new Date() }),
      );

      await service.placeInWorkspacePersonal(at(), 100, 'thumb-1');

      expect(storage.deleteAsset).toHaveBeenCalledWith('old');
    });

    it('같은 그림으로 다시 배치해도 그 그림을 지우지 않는다', async () => {
      // 여기서 접지 않으면 정리 단계가 방금 붙인 자산을 지운다(이전 값과 새 값이 같으므로)
      repository.findOneOwned.mockResolvedValueOnce(
        makeProject({ renderStatus: 'COMPLETED', thumbnailUploadId: 'thumb-1' }),
      );
      repository.placeInWorkspaceRecord.mockResolvedValueOnce(
        makeProject({ thumbnailUploadId: 'thumb-1', placedAt: new Date() }),
      );

      await service.placeInWorkspacePersonal(at(), 100, 'thumb-1');

      expect(storage.confirmAssets).not.toHaveBeenCalled();
      expect(storage.deleteAsset).not.toHaveBeenCalled();
    });
  });

  describe('중복 제출', () => {
    it('같은 멱등키로 동시에 와도 렌더 잡은 한 번만 만들어진다', async () => {
      // 순차 중복(더블클릭 후 재시도)은 사가가 COMPLETED 를 보고 처리. 동시 중복은 실행권이 처리
      //   실행권이 없으면 두 요청이 같은 사가의 남은 단계를 각자 수행해 유료 잡이 둘 생기고,
      //   나중에 붙은 잡만 폴링되므로 먼저 만든 잡은 요금만 나가는 고아가 됨
      savedPlans.getPersonal.mockResolvedValue(makePlan());
      channels.getAiModels.mockResolvedValue(models({ video: RENDERABLE_VIDEO_MODEL }));
      // 예약 INSERT 를 느리게: 두 요청이 겹치는 시간을 생성
      // 첫 인자는 스코프다. 이 자리를 레코드로 받으면 행에 스코프가 펼쳐지고 모델 스냅샷이 비어,
      //   행의 값으로 판정하는 규칙들이 엉뚱한 쪽을 보게 됨
      repository.createRecord.mockImplementation(async (scope, rec) => {
        await new Promise((r) => setTimeout(r, 15));
        return reservedRow(scope, rec);
      });
      render.createJob.mockResolvedValue('job-1');

      const [a, b] = await Promise.all([
        service.createFromSavedPlanPersonal(at(), 5, null, 'same-key'),
        service.createFromSavedPlanPersonal(at(), 5, null, 'same-key'),
      ]);

      expect(render.createJob).toHaveBeenCalledTimes(1);
      expect(repository.createRecord).toHaveBeenCalledTimes(1);
      // 두 요청이 같은 산출물을 받는다(뒤에 온 쪽에 오류나 404 를 주지 않는다)
      expect(a?.id).toBe(b?.id);
    });
  });

  describe('벤더 멱등키', () => {
    it('잡 등록에 재실행 불변 키를 실어 보낸다', async () => {
      // 이 키가 없으면 벤더 호출과 진행 기록 사이에서 죽었을 때 재실행이 두 번째 유료 잡을 생성
      //   호출자 쪽에서는 닫을 수 없는 창이라(이미 만든 잡을 알아보는 일은 만든 쪽만 한다) video-model
      //   이 이 키로 처리. 키는 사가 id + 단계 번호라 재시도에도 동일
      savedPlans.getPersonal.mockResolvedValueOnce(makePlan());
      channels.getAiModels.mockResolvedValueOnce(models({ video: RENDERABLE_VIDEO_MODEL }));
      render.createJob.mockResolvedValueOnce('job-1');

      await service.createFromSavedPlanPersonal(at(), 5, null, null);

      const key = render.createJob.mock.calls[0][1];
      expect(key).toMatch(/^saga:\d+:\d+$/);
    });

    it('재렌더도 같은 규칙으로 키를 보낸다', async () => {
      // 재렌더 경로는 행을 두 번 읽는다(서비스 검증 + 사가 단계). Once 로 두면 두 번째가
      //   기본 목으로 떨어져 모델 없는 행을 받게 됨
      repository.findOneOwned.mockResolvedValue(makeProject({ videoModel: RENDERABLE_VIDEO_MODEL }));
      render.createJob.mockResolvedValueOnce('job-2');
      repository.startRenderRecord.mockResolvedValueOnce(makeProject({ renderJobId: 'job-2' }));

      await service.rerenderPersonal(at(), 100);

      expect(render.createJob.mock.calls[0][1]).toMatch(/^saga:\d+:\d+$/);
    });
  });

  /**
   * 미리보기 산출물(진행 화면 미리보기의 '영상 생성')
   *
   * 이 도구 버전의 그 버튼은 작업 공간 배치와 서버 저장을 함께 한다. 미리보기는 유료 렌더를 돌리지
   * 않아 그 시점까지 행이 없으므로, 이 경로가 완성 + 배치 상태로 행을 만든다. 검사하는 것은
   * 셋이다: 만들어진 행이 실제 산출물과 구별되지 않는가, 자산 확정이 행 뒤에 오는가, 확정이 실패하면
   * 행이 남지 않는가
   */
  describe('createPreviewPersonal', () => {
    const INPUT = {
      channelId: 3,
      title: '마케팅 영상 미리보기',
      videoModel: 'VEO3',
      resultUploadId: 'preview-video',
    };

    it('완성 + 배치된 행을 만들고 자산을 확정한다', async () => {
      repository.createPlacedRecord.mockResolvedValueOnce(
        makeProject({ renderStatus: 'COMPLETED', resultUploadId: 'preview-video', placedAt: new Date() }),
      );

      const created = await service.createPreviewPersonal(at(), {
        ...INPUT,
        thumbnailUploadId: 'preview-thumb',
      });

      expect(created.renderStatus).toBe('COMPLETED');
      expect(repository.createPlacedRecord).toHaveBeenCalledWith(
        at(),
        expect.objectContaining({
          channelId: 3,
          title: '마케팅 영상 미리보기',
          resultUploadId: 'preview-video',
          thumbnailUploadId: 'preview-thumb',
        }),
      );
      // 브라우저는 presign + PUT 까지만. 확정은 그 자산을 참조할 행을 만든 이쪽의 일
      expect(storage.confirmAssets).toHaveBeenCalledWith(['preview-video', 'preview-thumb']);
    });

    it('그림이 없으면 영상만 확정한다', async () => {
      // 빈 값을 그대로 실으면 확정할 수 없는 자산을 기다리게 됨
      repository.createPlacedRecord.mockResolvedValueOnce(makeProject({ renderStatus: 'COMPLETED' }));

      await service.createPreviewPersonal(at(), { ...INPUT, thumbnailUploadId: '  ' });

      expect(storage.confirmAssets).toHaveBeenCalledWith(['preview-video']);
      expect(repository.createPlacedRecord.mock.calls[0][1].thumbnailUploadId).toBeNull();
    });

    it('자산 확정이 실패하면 행을 되돌린다(서빙되지 않는 카드를 남기지 않는다)', async () => {
      // 그대로 두면 PENDING 자산을 가리키는 완성본이 목록에 남고, 재렌더할 잡도 없어 고칠 수 없음
      repository.createPlacedRecord.mockResolvedValueOnce(makeProject({ id: 77 }));
      storage.confirmAssets.mockRejectedValueOnce(new Error('confirm failed'));

      await expect(service.createPreviewPersonal(at(), INPUT)).rejects.toThrow('confirm failed');
      expect(repository.deleteRecordById).toHaveBeenCalledWith(10, 77);
    });

    it('원장에 렌더가 돌지 않았다는 사실을 남긴다', async () => {
      // 없으면 이 줄이 유료 렌더 한 건처럼 읽힌다.
      repository.createPlacedRecord.mockResolvedValueOnce(makeProject({ renderStatus: 'COMPLETED' }));

      await service.createPreviewPersonal(at(), INPUT);

      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'source.created',
          detail: { preview: true },
        }),
      );
    });

    it('만들어진 행은 그대로 보관함으로 갈 수 있다(실제 산출물과 구별되지 않는다)', async () => {
      // 이 경로의 존재 이유. 배치와 완성 조건을 둘 다 만족한 채로 만들어지므로 보관 통과
      const preview = makeProject({
        renderStatus: 'COMPLETED',
        resultUploadId: 'preview-video',
        placedAt: new Date(),
      });
      repository.findOneOwned.mockResolvedValueOnce(preview);
      repository.archiveRecord.mockResolvedValueOnce({ ...preview, location: 'archive' });

      const moved = await service.archivePersonal(at(), preview.id);

      expect(moved?.location).toBe('archive');
    });
  });

  describe('rerenderPersonal', () => {
    it('저장된 스펙으로 새 잡을 등록하고 RENDERING 으로 재시작한다', async () => {
      const project = makeProject({
        scenes: [
          { order: 1, imageUploadId: 'u-1', narration: '나1', subtitle: { text: '자1' } },
        ],
        videoModel: 'wan2.2-ti2v-5b',
      });
      repository.findOneOwned.mockResolvedValue(project);
      render.createJob.mockResolvedValueOnce('job-2');
      repository.startRenderRecord.mockResolvedValueOnce(
        makeProject({ renderJobId: 'job-2' }),
      );

      await service.rerenderPersonal(at(), 100);

      expect(render.createJob.mock.calls[0][0].videoProvider).toBe('wan2.2-ti2v-5b');
      expect(render.createJob.mock.calls[0][0].bgm).toEqual({ fileId: 'bgm-up' });
      expect(repository.startRenderRecord).toHaveBeenCalledWith(10, 100, 'job-2');
    });

    it('BGM 스냅샷이 없는 구 프로젝트는 재렌더를 막는다(400)', async () => {
      repository.findOneOwned.mockResolvedValue(makeProject({ bgm: null }));

      await expect(service.rerenderPersonal(at(), 100)).rejects.toThrow(BadRequestException);
      expect(render.createJob).not.toHaveBeenCalled();
    });

    it('붙일 행이 사라지면 만든 잡을 취소한다(요금만 나가는 유료 잡을 남기지 않는다)', async () => {
      // 재렌더는 예약할 행이 없어 잡이 먼저 만들어진다. 그 잡을 붙이지 못하면 아무도 폴링하지 않는
      //   유료 잡이 남으므로 사가가 되돌림
      repository.findOneOwned.mockResolvedValue(makeProject({ videoModel: RENDERABLE_VIDEO_MODEL }));
      render.createJob.mockResolvedValueOnce('job-9');
      repository.startRenderRecord.mockResolvedValueOnce(null); // 그 사이 삭제됐다

      expect(await service.rerenderPersonal(at(), 100)).toBeNull();
      expect(render.cancelJob).toHaveBeenCalledWith('job-9');
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('스코프에 없는 프로젝트는 잡을 만들지 않고 null 을 반환한다', async () => {
      // 남의 것도 다른 버전 것도 질의가 내주지 않는다(소유가 WHERE 에 있다). 그러면 재렌더는
      //   유료 잡을 만들기 전에 멈춘다.
      repository.findOneOwned.mockResolvedValue(null);

      expect(await service.rerenderPersonal(at(), 100)).toBeNull();
      expect(render.createJob).not.toHaveBeenCalled();
      expect(repository.findOneOwned).toHaveBeenCalledWith(at(), 100);
    });
  });

  describe('rerenderSegmentPersonal', () => {
    /**
     * 이 블록이 지키는 것은 비용과 화면의 정직함
     *
     * 붙어 있는 잡을 다시 돌려야 렌더가 나머지 씬을 건너뛰어 재과금이 그 세그먼트 하나에 그침
     * 그리고 원격 호출이 실패했는데 행이 '만드는 중' 으로 남으면, 아무 일도 일어나지 않은 렌더를
     * 화면이 영원히 기다리게 됨
     */
    it('원격 호출 전에 행을 RENDERING 으로 예약한다', async () => {
      const project = makeProject({ renderStatus: 'COMPLETED', renderJobId: 'job-1' });
      repository.findOneOwned.mockResolvedValue(project);
      repository.startRenderRecord.mockResolvedValueOnce(
        makeProject({ renderStatus: 'RENDERING' }),
      );

      await service.rerenderSegmentPersonal(at(), 100, 2, '새 묘사');

      expect(repository.startRenderRecord).toHaveBeenCalledWith(10, 100, 'job-1');
      // 새 잡을 만들지 않음. 만들면 체크포인트가 없어 전 씬이 다시 돌고 전액 재과금
      expect(render.createJob).not.toHaveBeenCalled();
      expect(render.rerenderScene).toHaveBeenCalledWith('job-1', 2, '새 묘사');
      const [reserveIndex, requestIndex] = [
        repository.startRenderRecord.mock.invocationCallOrder[0],
        render.rerenderScene.mock.invocationCallOrder[0],
      ];
      expect(reserveIndex).toBeLessThan(requestIndex);
    });

    it('원격 호출이 실패하면 행을 이전 상태로 되돌린다', async () => {
      const project = makeProject({
        renderStatus: 'COMPLETED',
        renderJobId: 'job-1',
        resultUploadId: 'result-1',
        captionsUploadId: 'cap-1',
      });
      repository.findOneOwned.mockResolvedValue(project);
      repository.startRenderRecord.mockResolvedValueOnce(
        makeProject({ renderStatus: 'RENDERING' }),
      );
      render.rerenderScene.mockRejectedValueOnce(new Error('렌더 서버 응답 없음'));

      await expect(service.rerenderSegmentPersonal(at(), 100, 2)).rejects.toThrow();

      // 되돌리지 않으면 아무 일도 시작되지 않은 렌더를 화면이 영원히 기다리게 됨
      expect(repository.updateRenderStateRecord).toHaveBeenCalledWith(10, 100, {
        renderStatus: 'COMPLETED',
        resultUploadId: 'result-1',
        captionsUploadId: 'cap-1',
        error: null,
        errorCode: null,
      });
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('아직 렌더된 적 없는 프로젝트는 400 으로 막는다', async () => {
      repository.findOneOwned.mockResolvedValue(makeProject({ renderJobId: null }));

      await expect(service.rerenderSegmentPersonal(at(), 100, 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(render.rerenderScene).not.toHaveBeenCalled();
      expect(repository.startRenderRecord).not.toHaveBeenCalled();
    });

    it('스코프에 없는 프로젝트는 아무것도 하지 않고 null 을 반환한다', async () => {
      repository.findOneOwned.mockResolvedValue(null);

      expect(await service.rerenderSegmentPersonal(at(), 100, 1)).toBeNull();
      expect(render.rerenderScene).not.toHaveBeenCalled();
      expect(repository.findOneOwned).toHaveBeenCalledWith(at(), 100);
    });

    it('세그먼트 순번과 묘사 수정 여부를 원장에 남긴다', async () => {
      repository.findOneOwned.mockResolvedValue(
        makeProject({ renderStatus: 'COMPLETED', renderJobId: 'job-1' }),
      );
      repository.startRenderRecord.mockResolvedValueOnce(
        makeProject({ renderStatus: 'RENDERING' }),
      );

      await service.rerenderSegmentPersonal(at(), 100, 3, null);

      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'source.rerendered',
          jobId: 'job-1',
          // 같은 묘사로 다시 뽑은 것과 고쳐서 뽑은 것은 다른 사건
          detail: expect.objectContaining({ segment_order: 3, prompt_edited: false }),
        }),
      );
    });
  });

  /**
   * 보관함(조직 공용). 이 버전에서는 원천 표가 보관물을 갖는다: 원천과 최종을 나누지 않는
   * 구성에서 그 하나뿐인 영상이 곧 배포본이라, 최종 표에 사본을 만들지 않고 이 행을 이동
   *
   * 최종 영상의 보관함과 같은 계약을 지키는지 본다(이동이지 복사가 아니다, 완성본만, 조건부 전이라
   * 로그가 중복되지 않는다, 열람은 공용이고 삭제는 아니다). 하나 더 있다: 배치를 거친 것만
   * 보낼 수 있음
   */
  describe('보관함(조직 공용)', () => {
    /** 보관 가능한 상태: 완성됐고 작업 공간에 배치됐다. */
    const placed = (overrides: Partial<VideoProjectEntity> = {}) =>
      makeProject({
        renderStatus: 'COMPLETED',
        resultUploadId: 'r',
        placedAt: new Date(),
        ...overrides,
      });

    it('완성 배치본을 보내면 personal→archive 로 전이하고 활동 로그를 남긴다', async () => {
      repository.findOneOwned.mockResolvedValueOnce(placed());
      repository.archiveRecord.mockResolvedValueOnce(placed({ location: 'archive' }));

      const moved = await service.archivePersonal(at(), 100);

      expect(repository.archiveRecord).toHaveBeenCalledWith(10, 100);
      expect(moved?.location).toBe('archive');
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'source.archived', actorUserId: 7, channelId: 3 }),
      );
    });

    it('배치되지 않은 영상은 400: 만든 사람이 자기 것으로 확정한 적이 없다', async () => {
      // 화면에서는 고를 방법이 없다(목록에 없다). 그래도 계약이 막는다: 확정 없이 조직 공용 공간에
      //   올라가면 만든 사람이 버릴 셈이었던 결과가 남의 눈에 남음
      repository.findOneOwned.mockResolvedValueOnce(placed({ placedAt: null }));

      await expect(service.archivePersonal(at(), 100)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.archiveRecord).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('렌더 중 항목은 400: 보관함은 폴링(reconcile)을 돌리지 않으므로 상태가 멈춘다', async () => {
      repository.findOneOwned.mockResolvedValueOnce(makeProject({ renderStatus: 'RENDERING' }));

      await expect(service.archivePersonal(at(), 100)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.archiveRecord).not.toHaveBeenCalled();
    });

    it('스코프에 없는 항목은 보관할 수 없다(전이/로그 없음)', async () => {
      // 남의 것도 다른 버전 것도 질의가 내주지 않는다(소유가 WHERE 에 있다)
      repository.findOneOwned.mockResolvedValueOnce(null);

      expect(await service.archivePersonal(at(), 100)).toBeNull();
      expect(repository.archiveRecord).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('이미 보관된 항목을 다시 보내도 로그가 중복되지 않는다(조건부 갱신)', async () => {
      repository.findOneOwned.mockResolvedValueOnce(placed());
      repository.archiveRecord.mockResolvedValueOnce(null); // 이미 archive → 전이 없음

      expect(await service.archivePersonal(at(), 100)).toBeNull();
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('보관물은 작업 공간 경로(조회/배치/재렌더/삭제)에서 빠진다', async () => {
      repository.findOneOwned.mockResolvedValue(placed({ location: 'archive' }));

      expect(await service.getPersonal(at(), 100)).toBeNull();
      expect(await service.placeInWorkspacePersonal(at(), 100, 'thumb-1')).toBeNull();
      expect(await service.rerenderPersonal(at(), 100)).toBeNull();
      expect(await service.deletePersonal(at(), 100)).toBe(false);
      expect(repository.deleteRecordById).not.toHaveBeenCalled();
      // 보관물 재렌더는 잡을 만들지도 않는다(만들면 취소해야 할 유료 잡이 된다)
      expect(render.createJob).not.toHaveBeenCalled();
    });

    it('보관함 목록은 조직 공용 스코프로 조회하고 reconcile 을 돌리지 않는다', async () => {
      repository.findRecordsByLocation.mockResolvedValueOnce([
        placed({ location: 'archive', ownerUserId: 99 }),
      ]);

      const rows = await service.listArchive(org());

      // 작업자도 채널도 스코프에 없음. 남이 만든 보관물도 같은 목록에 포함
      expect(repository.findRecordsByLocation).toHaveBeenCalledWith(org());
      expect(rows).toHaveLength(1);
      // 만든 사람은 그대로 실려 나온다(화면이 이름 라벨로 바꾼다)
      expect(rows[0].ownerUserId).toBe(99);
      expect(render.getJobStatus).not.toHaveBeenCalled();
    });

    it('보관함은 요청 버전으로 조회한다(v1.0 과 v1.5 가 섞이지 않는다)', async () => {
      repository.findRecordsByLocation.mockResolvedValueOnce([]);

      await service.listArchive(org('v1.0'));

      expect(repository.findRecordsByLocation).toHaveBeenCalledWith(org('v1.0'));
    });

    it('남이 만든 보관물도 꺼낼 수 있고, 꺼낸 사람의 작업 공간으로 들어온다', async () => {
      // 소유 검증을 앞세우지 않는다(공용이라 "남의 것" 구분이 열람에 없다). 전이 조건이 권한 경계다.
      repository.moveArchivedToWorkspaceRecord.mockResolvedValueOnce(
        placed({ ownerUserId: 7, channelId: 3 }),
      );

      const moved = await service.unarchive(ws(3), 100);

      // 스코프가 그대로 전달. 소유자와 채널을 꺼낸 사람 쪽으로 바꾸는 것은 레포의 일
      expect(repository.moveArchivedToWorkspaceRecord).toHaveBeenCalledWith(ws(3), 100);
      expect(repository.findOneOwned).not.toHaveBeenCalled();
      expect(moved?.location).toBe('personal');
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'source.unarchived', actorUserId: 7 }),
      );
    });

    it('이미 꺼내진 항목은 전이가 없고 로그도 남지 않는다', async () => {
      repository.moveArchivedToWorkspaceRecord.mockResolvedValueOnce(null);

      expect(await service.unarchive(ws(3), 100)).toBeNull();
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('보관함 삭제: 올린 본인은 지울 수 있고 그 행의 썸네일도 함께 지운다', async () => {
      // 썸네일은 이 행이 소유한 자산이다. 개인 삭제와 보관물 삭제가 같은 절차를 쓴다는 증거다.
      repository.findOneOwned.mockResolvedValueOnce(
        placed({ location: 'archive', thumbnailUploadId: 'thumb-1' }),
      );
      repository.deleteRecordById.mockResolvedValueOnce(true);

      expect(await service.deleteArchived(at(), 100)).toBe(true);
      expect(storage.deleteAsset).toHaveBeenCalledWith('thumb-1');
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'source.deleted', actorUserId: 7 }),
      );
    });

    it('삭제는 열람과 다르다: 일반 구성원은 남의 보관물을 지울 수 없다', async () => {
      // 열람이 공용이라고 삭제까지 전원에게 열면 남의 완성본을 누구나 지울 수 있다. 소유 질의가
      //   내주지 않는 것으로 막는다(꺼내기와 갈리는 지점: 꺼내기는 원본을 잃지 않는다)
      repository.findOneOwned.mockResolvedValueOnce(null);

      expect(await service.deleteArchived(at(), 100)).toBe(false);
      expect(repository.findOneArchived).not.toHaveBeenCalled();
      expect(repository.deleteRecordById).not.toHaveBeenCalled();
    });

    it('관리급(manageAll)은 남이 만든 보관물도 지운다', async () => {
      // 공용 공간은 누군가 정리해야 한다. 소유 무관 조회로 갈아타는 것이 그 권한의 구현
      repository.findOneArchived.mockResolvedValueOnce(
        placed({ location: 'archive', ownerUserId: 99 }),
      );
      repository.deleteRecordById.mockResolvedValueOnce(true);

      expect(await service.deleteArchived(at(), 100, true)).toBe(true);
      // 조직과 버전만으로 집는다(작업자는 조건이 아니다)
      expect(repository.findOneArchived).toHaveBeenCalledWith(
        { organizationId: 10, version: 'v1.5' },
        100,
      );
      expect(repository.findOneOwned).not.toHaveBeenCalled();
      // 로그 행위자는 지운 사람이다(소유자 99 가 아니라 요청자 7)
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'source.deleted', actorUserId: 7 }),
      );
    });

    it('관리급이어도 개인 작업 공간 항목은 이 경로로 지워지지 않는다', async () => {
      // 위치 조건이 없으면 "보관함 정리" 권한으로 남의 작업 중 항목까지 삭제 가능
      repository.findOneArchived.mockResolvedValueOnce(placed({ location: 'personal' }));

      expect(await service.deleteArchived(at(), 100, true)).toBe(false);
      expect(repository.deleteRecordById).not.toHaveBeenCalled();
    });
  });

  describe('pre-flight 자산 검증', () => {
    it('참조 자산이 UPLOADED 가 아니면(누락/미완료) 잡 등록/저장 없이 400 을 던진다', async () => {
      savedPlans.getPersonal.mockResolvedValueOnce(makePlan());
      channels.getAiModels.mockResolvedValueOnce(models());
      // 씬 이미지 u-3 가 아직 업로드 안 됨(MISSING)
      storage.getAssetStatuses.mockResolvedValueOnce({
        'u-1': 'UPLOADED',
        'u-3': 'MISSING',
        'bgm-up': 'UPLOADED',
      } as Record<string, AssetUploadStatus>);

      await expect(service.createFromSavedPlanPersonal(at(), 5)).rejects.toThrow(
        BadRequestException,
      );
      expect(render.createJob).not.toHaveBeenCalled();
      expect(repository.createRecord).not.toHaveBeenCalled();
    });

    it('참조 자산이 모두 UPLOADED 면 통과해 잡을 등록한다', async () => {
      savedPlans.getPersonal.mockResolvedValueOnce(makePlan());
      channels.getAiModels.mockResolvedValueOnce(models({ video: RENDERABLE_VIDEO_MODEL }));
      render.createJob.mockResolvedValueOnce('job-ok');
      repository.createRecord.mockImplementationOnce(async (scope, rec) =>
        reservedRow(scope, rec),
      );
      // storage 기본 mock = 넘긴 id 전부 UPLOADED.

      await service.createFromSavedPlanPersonal(at(), 5);

      // 씬 이미지(u-1,u-3) + BGM(bgm-up) 을 한 번에 검증했다.
      const checked = storage.getAssetStatuses.mock.calls[0][0];
      expect(checked).toEqual(expect.arrayContaining(['u-1', 'u-3', 'bgm-up']));
      expect(render.createJob).toHaveBeenCalled();
    });
  });

  describe('활동 로그', () => {
    it('삭제 시 채널/잡 id 를 담아 1건 기록한다', async () => {
      repository.findOneOwned.mockResolvedValueOnce(makeProject({ title: '지울 영상' }));
      repository.deleteRecordById.mockResolvedValueOnce(true);

      await service.deletePersonal(at(), 100);

      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'source.deleted',
          channelId: 3,
          jobId: 'job-1',
          target: { kind: 'source', id: 100 },
        }),
      );
    });

    it('진행 중 렌더는 삭제 전에 취소한다', async () => {
      // 취소하지 않으면 사라진 프로젝트의 렌더가 끝까지 돌아 벤더 요금만 나가고, 완료 로그도
      //   남지 않는다(폴링할 프로젝트가 없어서). dev 에서 실제로 xAI 15초가 그렇게 청구됐다.
      repository.findOneOwned.mockResolvedValueOnce(makeProject({ renderStatus: 'RENDERING' }));
      repository.deleteRecordById.mockResolvedValueOnce(true);

      await service.deletePersonal(at(), 100);

      expect(render.cancelJob).toHaveBeenCalledWith('job-1');
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ detail: expect.objectContaining({ render_canceled: true }) }),
      );
    });

    it('이미 끝난 렌더는 취소하지 않는다', async () => {
      // 완료/실패는 이미 종료다. 취소를 부르면 무의미한 호출이고, 결과를 되돌린다는 오해를 부른다.
      repository.findOneOwned.mockResolvedValueOnce(
        makeProject({ renderStatus: 'COMPLETED', resultUploadId: 'r-1' }),
      );
      repository.deleteRecordById.mockResolvedValueOnce(true);

      await service.deletePersonal(at(), 100);

      expect(render.cancelJob).not.toHaveBeenCalled();
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ detail: expect.objectContaining({ render_canceled: false }) }),
      );
    });

    it('취소가 실패해도 삭제는 진행된다', async () => {
      // 사용자의 삭제 의사가 우선. 취소 실패로 삭제를 막으면 화면에서 지워지지 않는 항목이 남음
      repository.findOneOwned.mockResolvedValueOnce(makeProject({ renderStatus: 'RENDERING' }));
      render.cancelJob.mockRejectedValueOnce(new Error('video-model down'));
      repository.deleteRecordById.mockResolvedValueOnce(true);

      const removed = await service.deletePersonal(at(), 100);

      expect(removed).toBe(true);
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ detail: expect.objectContaining({ render_canceled: false }) }),
      );
    });

    it('내 것이 아니면 기록하지 않는다', async () => {
      repository.findOneOwned.mockResolvedValueOnce(null);

      await service.deletePersonal(at(), 100);

      expect(activityLog.log).not.toHaveBeenCalled();
    });

    describe('렌더 종료 관측(reconcile)', () => {
      it('RENDERING → COMPLETED 전이를 기록한다', async () => {
        const project = makeProject({ renderStatus: 'RENDERING' });
        repository.findOneOwned.mockResolvedValueOnce(project);
        render.getJobStatus.mockResolvedValueOnce(
          makeJobStatus({
            status: 'COMPLETED',
            resultUploadId: 'out-1',
            progress: 100,
          }),
        );
        // 레포가 갱신한 행을 돌려준다 = 이 호출이 전이를 기록했다는 증표
        repository.updateRenderStateRecord.mockResolvedValueOnce(
          makeProject({ renderStatus: 'COMPLETED', resultUploadId: 'out-1' }),
        );

        await service.getPersonal(at(), 100);

        expect(activityLog.log).toHaveBeenCalledTimes(1);
        expect(activityLog.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'source.render_completed',
            failed: false,
            dedupeKey: 'source:100:job-1:COMPLETED',
          }),
        );
      });

      it('영구 실패는 CANCELLED 로 되돌리고 사유를 남긴다. 반쯤 만들어진 산출물을 목록에 두지 않는다', async () => {
        // video-model 이 FAILED 를 준 시점은 이미 영구 실패이거나 재시도 예산 소진이다(일시적 대기는
        //   비종료로 남아 여기 오지 않는다). 그래서 작업을 취소로 확정하고 사유를 레코드와 로그에
        //   남긴다. 사용자에게는 전역 알림으로 통보되고 그 알림은 사라지므로 기록이 유일한 추적 근거다.
        repository.findOneOwned.mockResolvedValueOnce(makeProject());
        render.getJobStatus.mockResolvedValueOnce(
          makeJobStatus({
            status: 'FAILED',
            error: 'ffmpeg 실패',
          }),
        );
        repository.updateRenderStateRecord.mockResolvedValueOnce(
          makeProject({ renderStatus: 'CANCELLED', error: 'ffmpeg 실패' }),
        );

        await service.getPersonal(at(), 100);

        // 저장도 취소 상태로 이뤄져야 한다(FAILED 를 그대로 쓰면 목록에서 걷히지 않는다)
        expect(repository.updateRenderStateRecord).toHaveBeenCalledWith(10, 100, {
          renderStatus: 'CANCELLED',
          resultUploadId: null,
          captionsUploadId: null,
          error: 'ffmpeg 실패',
          errorCode: null,
          segments: null,
        });
        expect(activityLog.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'source.render_cancelled',
            failed: true,
            detail: expect.objectContaining({ error: 'ffmpeg 실패' }),
          }),
        );
      });

      it('RENDERING → STALLED 플래핑은 기록하지 않는다', async () => {
        // 이 테스트가 설계 전체를 지킨다: STALLED 는 비종료라 계속 오갈 수 있어서,
        // 종료 상태로 좁히지 않으면 정체된 렌더 하나가 폴링마다 로그를 쏟아낸다.
        repository.findOneOwned.mockResolvedValueOnce(makeProject({ renderStatus: 'RENDERING' }));
        render.getJobStatus.mockResolvedValueOnce(
          makeJobStatus({
            progress: 10,
            workerAlive: false, // 워커 부재 → deriveRenderStatus 가 STALLED 로 승격
          }),
        );
        repository.updateRenderStateRecord.mockResolvedValueOnce(
          makeProject({ renderStatus: 'STALLED' }),
        );

        await service.getPersonal(at(), 100);

        expect(activityLog.log).not.toHaveBeenCalled();
      });

      it('다른 폴러가 먼저 전이시켰으면(갱신 결과 null) 기록하지 않는다', async () => {
        // 동시성 게이트: 레포가 비종료 상태만 갱신하므로 늦은 폴러는 null 수신
        //   탭 두 개가 동시에 목록을 조회해도 완료 로그는 한 건이어야 함
        repository.findOneOwned.mockResolvedValueOnce(makeProject());
        render.getJobStatus.mockResolvedValueOnce(
          makeJobStatus({
            status: 'COMPLETED',
            resultUploadId: 'out-1',
            progress: 100,
          }),
        );
        repository.updateRenderStateRecord.mockResolvedValueOnce(null);

        const result = await service.getPersonal(at(), 100);

        expect(activityLog.log).not.toHaveBeenCalled();
        // 갱신이 없어도 조회는 깨지지 않는다(이전 스냅샷을 그대로 돌려준다)
        expect(result).not.toBeNull();
      });

      it('유료 provider 의 청구 초를 실효 provider 에 귀속해 금액을 남긴다', async () => {
        // 6씬 × 7초 + 입력 이미지 6장 = $2.112 (레포 실측 앵커와 같은 계산)
        repository.findOneOwned.mockResolvedValueOnce(
          makeProject({ videoModel: 'grok-imagine-video' }),
        );
        render.getJobStatus.mockResolvedValueOnce(
          makeJobStatus({
            status: 'COMPLETED',
            resultUploadId: 'out-1',
            progress: 100,
            usage: {
              provider: 'grok-imagine-video',
              sceneCount: 6,
              outputVideoSeconds: 42,
              inputImageCount: 6,
              sceneSeconds: [7, 7, 7, 7, 7, 7],
            },
          }),
        );
        repository.updateRenderStateRecord.mockResolvedValueOnce(
          makeProject({ renderStatus: 'COMPLETED', videoModel: 'grok-imagine-video' }),
        );

        await service.getPersonal(at(), 100);

        expect(activityLog.log).toHaveBeenCalledWith(
          expect.objectContaining({
            cost: expect.objectContaining({
              status: 'computed',
              model: 'grok-imagine-video',
              microUsd: 2_112_000,
            }),
            detail: expect.objectContaining({ scene_seconds: [7, 7, 7, 7, 7, 7] }),
          }),
        );
      });

      it('사내 provider(usage 없음)는 무료로 남긴다', async () => {
        // 사내 provider 는 청구 단위를 보고하지 않는다. 요청 모델이 사내 모델이면 외부 벤더가
        //   낄 수 없으므로 '무료' 가 확정
        repository.findOneOwned.mockResolvedValueOnce(
          makeProject({ videoModel: 'wan2.2-ti2v-5b' }),
        );
        render.getJobStatus.mockResolvedValueOnce(
          makeJobStatus({
            status: 'COMPLETED',
            resultUploadId: 'out-1',
            progress: 100,
          }),
        );
        repository.updateRenderStateRecord.mockResolvedValueOnce(
          makeProject({ renderStatus: 'COMPLETED', videoModel: 'wan2.2-ti2v-5b' }),
        );

        await service.getPersonal(at(), 100);

        expect(activityLog.log).toHaveBeenCalledWith(
          expect.objectContaining({
            cost: expect.objectContaining({ status: 'free', microUsd: 0 }),
          }),
        );
      });

      it('외부 모델인데 usage 가 없으면 무료로 위장하지 않고 모름으로 남긴다', async () => {
        // 폴백(키 미등록)인지 구버전 video-model 인지 구분할 수 없는 구간이다. 유료 렌더를
        //   '무료 0원' 으로 적으면 돈이 조용히 사라지므로 금액 없이 usage-missing 으로 기록
        repository.findOneOwned.mockResolvedValueOnce(
          makeProject({ videoModel: 'grok-imagine-video' }),
        );
        render.getJobStatus.mockResolvedValueOnce(
          makeJobStatus({
            status: 'COMPLETED',
            resultUploadId: 'out-1',
            progress: 100,
          }),
        );
        repository.updateRenderStateRecord.mockResolvedValueOnce(
          makeProject({ renderStatus: 'COMPLETED', videoModel: 'grok-imagine-video' }),
        );

        await service.getPersonal(at(), 100);

        const entry = activityLog.log.mock.calls[0][0];
        expect(entry.cost).toMatchObject({ status: 'usage-missing', model: 'grok-imagine-video' });
        expect(entry.cost).not.toHaveProperty('microUsd');
      });

      it('경유 라우트로 고른 모델도 같은 규칙을 받는다', async () => {
        // 위 테스트는 라우트 없는 key 하나만 지켰다. "외부 모델인가" 를 라우트 없는 표만 보고
        //   판정하던 동안, 라우트로 고른 모델은 외부로 잡히지 않아 유료 렌더가 기본 비주얼
        //   (무료 0원)로 귀속됨. 그 렌더는 감사에서 공짜로 보이고 되메울 근거도 남지 않음
        repository.findOneOwned.mockResolvedValueOnce(
          makeProject({ videoModel: 'gemini/veo-3.1-generate-preview' }),
        );
        render.getJobStatus.mockResolvedValueOnce(
          makeJobStatus({
            status: 'COMPLETED',
            resultUploadId: 'out-1',
            progress: 100,
          }),
        );
        repository.updateRenderStateRecord.mockResolvedValueOnce(
          makeProject({ renderStatus: 'COMPLETED', videoModel: 'gemini/veo-3.1-generate-preview' }),
        );

        await service.getPersonal(at(), 100);

        const entry = activityLog.log.mock.calls[0][0];
        expect(entry.cost).toMatchObject({
          status: 'usage-missing',
          model: 'gemini/veo-3.1-generate-preview',
        });
      });

      it('같은 잡의 같은 종료 상태는 같은 dedupeKey 를 만든다', async () => {
        const run = async () => {
          repository.findOneOwned.mockResolvedValueOnce(makeProject());
          render.getJobStatus.mockResolvedValueOnce(
            makeJobStatus({
              status: 'COMPLETED',
              resultUploadId: 'out-1',
              progress: 100,
            }),
          );
          repository.updateRenderStateRecord.mockResolvedValueOnce(
            makeProject({ renderStatus: 'COMPLETED' }),
          );
          await service.getPersonal(at(), 100);
        };
        await run();
        await run();

        const keys = activityLog.log.mock.calls.map((c) => c[0].dedupeKey);
        expect(keys).toEqual(['source:100:job-1:COMPLETED', 'source:100:job-1:COMPLETED']);
      });
    });
  });
});
