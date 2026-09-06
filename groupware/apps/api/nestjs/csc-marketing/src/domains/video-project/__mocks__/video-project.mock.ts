import type {
  ApiCredentialResolverPort,
  VideoProjectRepositoryPort,
  VideoRenderPort,
} from '../core/application/ports/outbound';

/** VideoProject 레포지토리 Mock 팩토리 */
export const createVideoProjectRepositoryMock = (): jest.Mocked<VideoProjectRepositoryPort> => ({
  createRecord: jest.fn(),
  createPlacedRecord: jest.fn(),
  findRecordsByOwner: jest.fn(),
  findRecordsByLocation: jest.fn(),
  findOneOwned: jest.fn(),
  findOneArchived: jest.fn(),
  archiveRecord: jest.fn(),
  moveArchivedToWorkspaceRecord: jest.fn(),
  updateRenderStateRecord: jest.fn(),
  placeInWorkspaceRecord: jest.fn(),
  updateThumbnailRecord: jest.fn(),
  startRenderRecord: jest.fn(),
  deleteRecordById: jest.fn(),
});

/** 영상 렌더(video-model 잡) Mock 팩토리 */
export const createVideoRenderMock = (): jest.Mocked<VideoRenderPort> => ({
  createJob: jest.fn(),
  getJobStatus: jest.fn(),
  cancelJob: jest.fn(),
  rerenderScene: jest.fn(),
});

/** 조직 자격증명 resolve Mock 팩토리: 기본은 미등록(null). 등록 케이스는 per-test override. */
export const createApiCredentialResolverMock = (): jest.Mocked<ApiCredentialResolverPort> => ({
  resolveCredentials: jest.fn(
    async (
      _organizationId: number,
      _provider: string,
    ): Promise<Record<string, string> | null> => null,
  ),
});
