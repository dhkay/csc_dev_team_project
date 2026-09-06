import { Test, TestingModule } from '@nestjs/testing';
import { SavedPlanService } from '..';
import { SavedPlanEntity } from '../../../domain';
import { SavePlanInput } from '../../ports/inbound';
import { SavedPlanRepositoryPort, SAVED_PLAN_REPOSITORY_PORT } from '../../ports/outbound';
import {
  FileUploadStoragePort,
  FILE_UPLOAD_STORAGE_PORT,
} from '../../../../../../shared/domain/storage';
import {
  ChannelSettingsPort,
  CHANNEL_SETTINGS_PORT,
  AiModelSelection,
} from '../../../../../channel-settings/core/application/ports/inbound';
import {
  createSavedPlanRepositoryMock,
  createFileUploadStorageMock,
} from '../../../../__mocks__';
import type { ToolVersion } from '../../../../../../shared/domain/tool-version';
import {
  ownerVersionScope,
  workspaceScope,
} from '../../../../../../shared/domain/workspace-scope';
import {
  ActivityLogPort,
  ACTIVITY_LOG_PORT,
} from '../../../../../../shared/domain/activity-log';
import { createActivityLogMock } from '../../../../../../shared/domain/activity-log/__mocks__/activity-log.mock';
import { SavePlanSaga } from '../../sagas';
import {
  createInMemorySagaStore,
  InMemorySagaStore,
  sagaTestProviders,
} from '@csc/saga/testing';

describe('SavedPlanService', () => {
  let service: SavedPlanService;
  let repository: jest.Mocked<SavedPlanRepositoryPort>;
  let imageStorage: jest.Mocked<FileUploadStoragePort>;
  let channels: jest.Mocked<Pick<ChannelSettingsPort, 'getAiModels'>>;
  let activityLog: jest.Mocked<ActivityLogPort>;
  let sagaStore: InMemorySagaStore;

  const makePlan = (overrides: Partial<SavedPlanEntity> = {}): SavedPlanEntity => ({
    id: 1,
    organizationId: 10,
    ownerUserId: 7,
    location: 'personal',
    channelId: 3,
    brandName: '브랜드',
    clientRequestId: null,
    brandConcepts: [],
    title: '기획안',
    summary: '요약',
    scenes: [],
    sceneImages: [],
    bgm: null,
    version: 'v1.5',
    llmModel: '',
    imageModel: '',
    videoModel: '',
    segmentMode: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  /**
   * 스코프 헬퍼. 예전의 `(10, 7[, channelId])` 인자 나열을 대신한다.
   *
   * 버전이 스코프에 있는 것이 계약이다: 기획안은 버전 소유이고, 스코프를 빠뜨린 호출은 컴파일되지
   * 않는다(서버가 개인 설정에서 읽으면 화면과 어긋난다)
   */
  const at = (version: ToolVersion = 'v1.5') =>
    ownerVersionScope({ organizationId: 10, ownerUserId: 7, version });
  const ws = (channelId: number, version: ToolVersion = 'v1.5') =>
    workspaceScope({ organizationId: 10, ownerUserId: 7, channelId, version });

  const aiModels = (o: Partial<AiModelSelection> = {}): AiModelSelection => ({
    llm: '',
    video: '',
    videoMode: '',
    tts: '',
    ttsVoice: '',
    ttsPitch: '',
    image: '',
    ...o,
  });

  const input: SavePlanInput = {
    channelId: 3,
    // BGM 은 저장 입력의 필수 필드다(후보 풀이 비면 null)
    bgm: null,
    brandName: '브랜드',
    brandConcepts: [],
    // 생성 응답이 밝힌 모델. 필수다: 이 값이 없으면 원장이 그 기획안을 '모델 모름' 으로
    //   말하는데, 무엇이 썼는지는 생성 순간에만 안다(나중에 되메울 수 없다)
    llmModel: 'claude-sonnet-5',
    title: '기획안',
    summary: '요약',
    scenes: [{ index: 0, sourceDirection: '연출', subtitle: '자막', narration: '내레이션' }],
    sceneImages: [{ index: 0, uploadId: 'u-1' }],
  };

  beforeEach(async () => {
    repository = createSavedPlanRepositoryMock();
    imageStorage = createFileUploadStorageMock();
    channels = { getAiModels: jest.fn() };
    activityLog = createActivityLogMock();
    sagaStore = createInMemorySagaStore();
    // 저장은 사가에 위임된다. 러너를 mock 하지 않고 진짜 러너 + 인메모리 저장소로 돌린다:
    //   그래야 단계 순서와 보상(정의)이 이 테스트의 검증 범위에 들어온다.
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavedPlanService,
        SavePlanSaga,
        ...sagaTestProviders(sagaStore),
        { provide: SAVED_PLAN_REPOSITORY_PORT, useValue: repository },
        { provide: FILE_UPLOAD_STORAGE_PORT, useValue: imageStorage },
        { provide: CHANNEL_SETTINGS_PORT, useValue: channels },
        { provide: ACTIVITY_LOG_PORT, useValue: activityLog },
      ],
    }).compile();
    service = module.get<SavedPlanService>(SavedPlanService);
    // 사가 컨텍스트는 스칼라만 담으므로(jsonb 왕복 안전) 저장 결과는 id 로 다시 읽어 돌려준다.
    //   그래서 이 기본 mock 은 방금 createRecord 가 만든 행을 돌려줘야 한다(실제 DB 와 같다)
    //   새 엔티티를 지어내면 시각(new Date())이 1ms 어긋나는 순간마다 테스트가 실패한다.
    repository.findOneOwned.mockImplementation(async (_scope, id: number) => {
      const results = repository.createRecord.mock.results;
      const last = results[results.length - 1];
      if (last?.type === 'return') return (await last.value) as SavedPlanEntity;
      return makePlan({ id });
    });
  });

  afterEach(() => jest.clearAllMocks());

  describe('savePersonal', () => {
    it('location=personal + owner + 저장한 사람의 AI 모델 스냅샷(llm/image)을 채워 저장해야 한다', async () => {
      const saved = makePlan();
      repository.createRecord.mockResolvedValueOnce(saved);
      channels.getAiModels.mockResolvedValueOnce(
        aiModels({ llm: 'claude-sonnet-5', image: 'flux-schnell' }),
      );

      const result = await service.savePersonal(at(), input);

      // 사가가 만든 행을 id 로 다시 읽어 돌려준다(같은 행이다)
      expect(result.id).toBe(saved.id);
      // 채널(3)이 아니라 저장한 사람(7)으로 조회한다: 모델 선택은 개인 스코프다.
      expect(channels.getAiModels).toHaveBeenCalledWith(at());
      // 조직/작업자/버전은 첫 인자(스코프)가 소유한다: 레코드에 다시 담지 않는다.
      expect(repository.createRecord).toHaveBeenCalledWith(at(), {
        location: 'personal',
        channelId: 3,
        bgm: null,
        brandName: '브랜드',
        clientRequestId: null,
        brandConcepts: [],
        title: '기획안',
        summary: '요약',
        scenes: input.scenes,
        sceneImages: input.sceneImages,
        llmModel: 'claude-sonnet-5',
        imageModel: 'flux-schnell',
        // 고른 적 없으면 빈 문자열이다. 그때는 영상을 만들 때 서버가 설정과 렌더 기본을 본다.
        videoModel: '',
        segmentMode: '',
      });
    });

    it('컨트롤러가 넘기는 DTO 인스턴스 그대로도 저장된다', async () => {
      // 실제 컨트롤러는 검증 파이프가 만든 클래스 인스턴스를 중첩해 넘긴다(sceneImages/brandConcepts)
      //   이 스펙이 평범한 객체만 넘겨서, 사가 payload 저장 규칙이 그 인스턴스를 막는 것을 못 잡았다.
      //   그 결과가 사용자에게 보인 "기획안 저장에 실패했습니다"(500) 였다.
      class SceneImageDto {
        constructor(
          readonly index: number,
          readonly uploadId: string,
        ) {}
      }
      class BrandConceptDto {
        constructor(
          readonly axisKey: string,
          readonly optionLabel: string,
        ) {}
      }
      repository.createRecord.mockResolvedValueOnce(makePlan());
      channels.getAiModels.mockResolvedValueOnce(aiModels());

      const result = await service.savePersonal(at(), {
        ...input,
        sceneImages: [new SceneImageDto(0, 'u-1')] as never,
        brandConcepts: [new BrandConceptDto('tone', '차분함')] as never,
      });

      expect(result.id).toBe(1);
      expect(repository.createRecord).toHaveBeenCalledTimes(1);
    });

    it('채널이 없어도(channelId=null) 저장한 사람의 모델 스냅샷은 남는다', async () => {
      // 모델 선택이 채널에서 개인으로 옮겨졌다: 채널 없이 저장해도 무엇으로 만들었는지는 남아야 한다.
      repository.createRecord.mockResolvedValueOnce(makePlan());
      channels.getAiModels.mockResolvedValueOnce(aiModels({ llm: 'claude-sonnet-5' }));

      await service.savePersonal(at(), { ...input, channelId: null });

      expect(channels.getAiModels).toHaveBeenCalledWith(at());
      expect(repository.createRecord).toHaveBeenCalledWith(
        at(),
        expect.objectContaining({ channelId: null, llmModel: 'claude-sonnet-5', imageModel: '' }),
      );
    });

    it('기획 LLM 은 요청이 실어 온 값이다: 저장 시점 설정을 다시 읽지 않는다 [v1.0]', async () => {
      // 이것이 예전 버그다. 생성은 A 로 만들었는데 저장 전에 설정을 B 로 바꾸면, 저장이 그
      //   시점 설정을 읽어 B 를 기록했다. 원장에는 A 가 남아 둘이 갈렸고, 그 사실은 두 기록을
      //   나란히 놓고 보지 않으면 드러나지 않는다.
      //
      // 모델을 고르는 버전으로 본다. 고정하는 버전은 아래 케이스가 따로 지킨다.
      repository.createRecord.mockResolvedValueOnce(makePlan());
      // 설정은 그 사이 바뀌었다(생성 때와 다른 모델)
      channels.getAiModels.mockResolvedValueOnce(aiModels({ llm: 'claude-haiku-4-5-20251001' }));

      await service.savePersonal(at('v1.0'), { ...input, llmModel: 'claude-opus-4-8' });

      expect(repository.createRecord).toHaveBeenCalledWith(
        at('v1.0'),
        expect.objectContaining({ llmModel: 'claude-opus-4-8' }),
      );
    });

    it('고정하는 버전은 요청이 실어 온 값보다 고정 모델이 이긴다 [v1.5]', async () => {
      // 실어 온 값은 클라이언트를 거쳐 온다. 정상 경로에서는 그 버전의 고정값과 같지만(생성이
      //   그것으로 돌았으므로), 낡은 탭이 다른 값을 실으면 원장에 거짓이 남는다. 그 버전이 부를 수
      //   있는 모델은 하나라는 서버의 사실이 이긴다.
      repository.createRecord.mockResolvedValueOnce(makePlan());
      channels.getAiModels.mockResolvedValueOnce(aiModels());

      await service.savePersonal(at('v1.5'), { ...input, llmModel: 'claude-opus-4-8' });

      expect(repository.createRecord).toHaveBeenCalledWith(
        at('v1.5'),
        expect.objectContaining({ llmModel: 'claude-sonnet-5' }),
      );
    });

    it('모델 선택 조회가 실패해도 저장은 막지 않는다(이미지 스냅샷만 빈다)', async () => {
      // 기획 LLM 은 요청이 실어 왔으므로 이 조회와 무관하다. 이미지 모델만 빈다.
      repository.createRecord.mockResolvedValueOnce(makePlan());
      channels.getAiModels.mockRejectedValueOnce(new Error('down'));

      await service.savePersonal(at(), input);

      expect(repository.createRecord).toHaveBeenCalledWith(
        at(),
        expect.objectContaining({ llmModel: 'claude-sonnet-5', imageModel: '' }),
      );
    });

    it('씬 이미지 확정이 실패하면 방금 만든 행을 되돌리고 예외를 올린다', async () => {
      // 확정을 서버로 미룬 이유가 이것이다. 확정 전에 행이 만들어지므로, 확정이 실패하면 그 행을
      //   지워야 결과가 예전과 같아진다(아무것도 저장되지 않음). 남은 자산은 PENDING 이라 수거된다.
      const plan = makePlan();
      channels.getAiModels.mockResolvedValueOnce(aiModels());
      repository.createRecord.mockResolvedValueOnce(plan);
      imageStorage.confirmAssets.mockRejectedValueOnce(new Error('file-upload 도달 불가'));

      await expect(service.savePersonal(at(), input)).rejects.toThrow('file-upload 도달 불가');

      expect(repository.deleteRecordById).toHaveBeenCalledWith(10, plan.id);
      // 저장이 안 됐으므로 저장 로그도 남지 않는다.
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('같은 멱등키로 다시 저장하면 단계를 하나도 다시 돌리지 않는다', async () => {
      // '다시 저장' 은 업로드부터 전체를 재실행한다. 첫 시도가 이미 끝났으면 사가는 완료 상태이므로
      //   INSERT/확정/로그가 되풀이되지 않는다(멱등의 주체가 사가 인스턴스다)
      repository.createRecord.mockResolvedValue(makePlan());
      channels.getAiModels.mockResolvedValue(aiModels());
      const vars = { ...input, clientRequestId: '3:p1' };

      const first = await service.savePersonal(at(), vars);
      jest.clearAllMocks();
      repository.findOneOwned.mockImplementation(async (_scope, id: number) =>
        makePlan({ id }),
      );
      const second = await service.savePersonal(at(), vars);

      expect(second.id).toBe(first.id);
      expect(repository.createRecord).not.toHaveBeenCalled();
      expect(imageStorage.confirmAssets).not.toHaveBeenCalled();
      // 로그도 다시 남기지 않는다(같은 저장이 두 번 기록되면 원장이 거짓이 된다)
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('확정 단계에서 죽어도 재시도가 그 단계부터 이어 간다(행을 다시 만들지 않는다)', async () => {
      // 사가의 값이 여기 있다. 재시도가 처음부터 돌면 이미 만든 행을 또 만들려 든다.
      repository.createRecord.mockResolvedValue(makePlan());
      channels.getAiModels.mockResolvedValue(aiModels());
      const vars = { ...input, clientRequestId: '3:p1' };
      imageStorage.confirmAssets.mockRejectedValueOnce(new Error('file-upload 도달 불가'));

      await expect(service.savePersonal(at(), vars)).rejects.toThrow('file-upload 도달 불가');
      // 실패로 보상까지 끝났다(행 삭제). 같은 키로 다시 오면 처음부터 다시 시도한다.
      expect(repository.deleteRecordById).toHaveBeenCalled();

      jest.clearAllMocks();
      repository.createRecord.mockResolvedValue(makePlan());
      channels.getAiModels.mockResolvedValue(aiModels());
      repository.findOneOwned.mockImplementation(async (_scope, id: number) =>
        makePlan({ id }),
      );
      await service.savePersonal(at(), vars);

      expect(repository.createRecord).toHaveBeenCalledTimes(1);
      expect(imageStorage.confirmAssets).toHaveBeenCalledTimes(1);
    });
  });

  describe('listPersonal', () => {
    it('내 personal 저장본만, 그리고 지정 채널 것만 조회해야 한다', async () => {
      // 워크스페이스는 작업자 × 채널 × 버전으로 분리된다. 스코프가 그 셋을 함께 나르므로 하나라도
      // 빠진 질의는 표현할 수 없다(인자를 빠뜨리면 전 채널이 섞여 나온다)
      const rows = [makePlan()];
      repository.findRecordsByOwner.mockResolvedValueOnce(rows);

      const result = await service.listPersonal(ws(42));

      expect(result).toBe(rows);
      expect(repository.findRecordsByOwner).toHaveBeenCalledWith(ws(42), 'personal');
    });

    it('버전이 다르면 다른 워크스페이스로 조회해야 한다', async () => {
      // v1.0 과 v1.5 는 별개 워크스페이스다. 같은 채널이라도 버전이 다르면 다른 목록이어야 하고,
      //   그 사실이 질의에 실려 나가야 한다(안 실리면 두 버전 산출물이 한 화면에 섞인다)
      repository.findRecordsByOwner.mockResolvedValue([]);

      await service.listPersonal(ws(42, 'v1.5'));
      await service.listPersonal(ws(42, 'v1.0'));

      expect(repository.findRecordsByOwner).toHaveBeenNthCalledWith(
        1,
        ws(42, 'v1.5'),
        'personal',
      );
      expect(repository.findRecordsByOwner).toHaveBeenNthCalledWith(
        2,
        ws(42, 'v1.0'),
        'personal',
      );
    });

    it('채널이 다르면 다른 워크스페이스로 조회해야 한다', async () => {
      repository.findRecordsByOwner.mockResolvedValue([]);

      await service.listPersonal(ws(1));
      await service.listPersonal(ws(2));

      expect(repository.findRecordsByOwner).toHaveBeenNthCalledWith(1, ws(1), 'personal');
      expect(repository.findRecordsByOwner).toHaveBeenNthCalledWith(2, ws(2), 'personal');
    });
  });

  describe('deletePersonal', () => {
    it('내 personal 저장본이면 삭제하고 참조 이미지를 정리한다(cascade)', async () => {
      repository.findOneOwned.mockResolvedValueOnce(
        makePlan({
          ownerUserId: 7,
          sceneImages: [
            { index: 0, uploadId: 'u-1' },
            { index: 1, uploadId: 'u-2' },
          ],
        }),
      );
      repository.deleteRecordById.mockResolvedValueOnce(true);

      const ok = await service.deletePersonal(at(), 1);

      expect(ok).toBe(true);
      expect(repository.deleteRecordById).toHaveBeenCalledWith(10, 1);
      expect(imageStorage.deleteAssets).toHaveBeenCalledWith(['u-1', 'u-2']);
    });

    it('이미지가 없으면 스토리지 정리를 호출하지 않는다', async () => {
      repository.findOneOwned.mockResolvedValueOnce(
        makePlan({ ownerUserId: 7, sceneImages: [] }),
      );
      repository.deleteRecordById.mockResolvedValueOnce(true);

      const ok = await service.deletePersonal(at(), 1);

      expect(ok).toBe(true);
      expect(imageStorage.deleteAssets).not.toHaveBeenCalled();
    });

    it('다른 작업자/다른 버전 저장본은 스코프 질의에 잡히지 않아 삭제되지 않는다', async () => {
      // 소유 검증이 서비스의 if 문에서 질의의 WHERE 로 옮겨졌다(레포가 남의 것도 다른 버전
      //   것도 내주지 않는다). 그래서 이 테스트가 재현하는 것은 "레포가 null 을 준다" 이고,
      //   확인하는 것은 그때 아무것도 지우지 않는다는 것이다.
      repository.findOneOwned.mockResolvedValueOnce(null);

      const ok = await service.deletePersonal(at(), 1);

      expect(ok).toBe(false);
      expect(repository.deleteRecordById).not.toHaveBeenCalled();
      expect(imageStorage.deleteAssets).not.toHaveBeenCalled();
      // 스코프가 그대로 질의에 실려야 그 WHERE 가 성립한다. 빠지면 남의 것이 잡힌다.
      expect(repository.findOneOwned).toHaveBeenCalledWith(at(), 1);
    });

    it('보관함(archive) 항목은 개인 삭제로 지우지 않는다', async () => {
      repository.findOneOwned.mockResolvedValueOnce(
        makePlan({ ownerUserId: 7, location: 'archive' }),
      );

      const ok = await service.deletePersonal(at(), 1);

      expect(ok).toBe(false);
      expect(repository.deleteRecordById).not.toHaveBeenCalled();
    });

    it('없는 저장본이면 false 를 반환한다', async () => {
      repository.findOneOwned.mockResolvedValueOnce(null);

      const ok = await service.deletePersonal(at(), 1);

      expect(ok).toBe(false);
      expect(repository.deleteRecordById).not.toHaveBeenCalled();
    });
  });

  describe('updateScenePersonal', () => {
    it('스코프에 없는 저장본이면 null 을 돌려주고 갱신하지 않는다', async () => {
      // 남의 것도 다른 버전 것도 레포가 내주지 않는다(소유가 WHERE 에 있다). 삭제와 같은 규칙
      repository.findOneOwned.mockResolvedValueOnce(null);
      const r = await service.updateScenePersonal(at(), 1, { index: 0, imagePrompt: 'x' });
      expect(r).toBeNull();
      expect(repository.updateScenesRecord).not.toHaveBeenCalled();
      expect(repository.findOneOwned).toHaveBeenCalledWith(at(), 1);
    });

    it('다른 버전 스코프로는 그 저장본을 집을 수 없다', async () => {
      // v1.0 화면에서 v1.5 기획안 id 를 실어 보내도 편집되지 않아야 한다. 그 판정은 질의가 한다.
      repository.findOneOwned.mockResolvedValueOnce(null);
      const r = await service.updateScenePersonal(at('v1.0'), 1, { index: 0, imagePrompt: 'x' });
      expect(r).toBeNull();
      expect(repository.findOneOwned).toHaveBeenCalledWith(at('v1.0'), 1);
    });

    it('브리프(imagePrompt)만 준 경우 이미지는 건드리지 않고 씬만 바꾼다', async () => {
      const plan = makePlan({
        scenes: [{ index: 0, sourceDirection: 'd', subtitle: 's', narration: 'n', imagePrompt: 'old' }],
        sceneImages: [{ index: 0, uploadId: 'u-1', prompt: 'p' }],
      });
      repository.findOneOwned.mockResolvedValueOnce(plan);
      repository.updateScenesRecord.mockResolvedValueOnce(plan);

      await service.updateScenePersonal(at(), 1, { index: 0, imagePrompt: 'new brief' });

      const [, , scenes, images] = repository.updateScenesRecord.mock.calls[0];
      expect(scenes[0].imagePrompt).toBe('new brief');
      expect(images).toBe(plan.sceneImages); // 이미지 미변경
      expect(imageStorage.deleteAssets).not.toHaveBeenCalled();
    });

    it('이미지 교체 시 씬이미지 uploadId/prompt 를 바꾸고 이전 이미지를 정리한다', async () => {
      const plan = makePlan({
        scenes: [{ index: 0, sourceDirection: 'd', subtitle: 's', narration: 'n' }],
        sceneImages: [{ index: 0, uploadId: 'old-upload', prompt: 'oldp' }],
      });
      repository.findOneOwned.mockResolvedValueOnce(plan);
      repository.updateScenesRecord.mockResolvedValueOnce(plan);

      await service.updateScenePersonal(at(), 1, {
        index: 0,
        uploadId: 'new-upload',
        prompt: 'newp',
      });

      const [, , , images] = repository.updateScenesRecord.mock.calls[0];
      expect(images[0]).toEqual({ index: 0, uploadId: 'new-upload', prompt: 'newp' });
      expect(imageStorage.deleteAssets).toHaveBeenCalledWith(['old-upload']); // 이전 이미지 정리
    });

    it('없던 씬 이미지는 추가한다(외부 이미지 첫 지정)', async () => {
      const plan = makePlan({
        scenes: [{ index: 2, sourceDirection: 'd', subtitle: 's', narration: 'n' }],
        sceneImages: [],
      });
      repository.findOneOwned.mockResolvedValueOnce(plan);
      repository.updateScenesRecord.mockResolvedValueOnce(plan);

      await service.updateScenePersonal(at(), 1, { index: 2, uploadId: 'ext-upload' });

      const [, , , images] = repository.updateScenesRecord.mock.calls[0];
      expect(images).toEqual([{ index: 2, uploadId: 'ext-upload' }]);
      expect(imageStorage.deleteAssets).not.toHaveBeenCalled(); // 이전 이미지 없음
    });
  });


  describe('활동 로그', () => {
    it('저장 시 생성된 id/채널을 담아 1건 기록한다', async () => {
      const saved = makePlan({ id: 55, channelId: 3, title: '촉촉 세럼' });
      repository.createRecord.mockResolvedValueOnce(saved);
      channels.getAiModels.mockResolvedValueOnce(aiModels());

      await service.savePersonal(at(), input);

      expect(activityLog.log).toHaveBeenCalledTimes(1);
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 10,
          actorUserId: 7,
          channelId: 3,
          action: 'saved_plan.created',
          target: { kind: 'saved_plan', id: 55 },
        }),
      );
    });

    it('삭제 시 제목/채널을 남긴다. 행이 사라지면 로그가 유일한 흔적이다', async () => {
      const plan = makePlan({ id: 55, title: '지울 기획안' });
      repository.findOneOwned.mockResolvedValueOnce(plan);
      repository.deleteRecordById.mockResolvedValueOnce(true);

      await service.deletePersonal(at(), 55);

      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'saved_plan.deleted',
          message: '기획안 삭제: 지울 기획안',
          channelId: 3,
        }),
      );
    });

    it('내 것이 아닌 저장본은 기록하지 않는다. 인가 실패는 활동이 아니다', async () => {
      repository.findOneOwned.mockResolvedValueOnce(makePlan({ ownerUserId: 999 }));

      await service.deletePersonal(at(), 1);

      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('삭제가 실제로 일어나지 않으면 기록하지 않는다', async () => {
      repository.findOneOwned.mockResolvedValueOnce(makePlan());
      repository.deleteRecordById.mockResolvedValueOnce(false);

      await service.deletePersonal(at(), 1);

      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('씬 편집은 무엇을 바꿨는지(이미지 교체/브리프 수정) 구분해 남긴다', async () => {
      const plan = makePlan({ sceneImages: [{ index: 0, uploadId: 'old' }] });
      repository.findOneOwned.mockResolvedValueOnce(plan);
      repository.updateScenesRecord.mockResolvedValueOnce(plan);

      await service.updateScenePersonal(at(), 1, { index: 0, uploadId: 'new' });

      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'saved_plan.scene_updated',
          detail: expect.objectContaining({ image_replaced: true, prompt_edited: false }),
        }),
      );
    });

    it('로그 결과를 기다리지 않는다. 반환 전에 이미 기록이 끝나 있다', async () => {
      // "throw 해도 안전한가" 는 서비스가 아니라 주입 경계가 보장한다(safeActivityLog)
      // 여기서 지키는 것은 서비스가 로그를 await 하거나 결과에 따라 분기하지 않는다는 것이다:
      // 포트가 void 라 그럴 수 없고, 그래서 로깅이 응답 지연에 끼어들 여지가 없다.
      const saved = makePlan();
      repository.createRecord.mockResolvedValueOnce(saved);
      channels.getAiModels.mockResolvedValueOnce(aiModels());

      const result = await service.savePersonal(at(), input);

      expect(result).toEqual(saved);
      expect(activityLog.log).toHaveBeenCalledTimes(1);
      expect(activityLog.log.mock.results[0].type).toBe('return'); // 예외/프로미스가 아니다
    });
  });
});
