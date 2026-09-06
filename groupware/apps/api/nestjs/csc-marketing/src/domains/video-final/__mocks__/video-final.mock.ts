import type {
  FinalRenderPort,
  VideoFinalRepositoryPort,
} from '../core/application/ports/outbound';

/** VideoFinal 레포지토리 Mock 팩토리 */
export const createVideoFinalRepositoryMock = (): jest.Mocked<VideoFinalRepositoryPort> => ({
  createRecord: jest.fn(),
  findRecordsByOwner: jest.fn(),
  findRecordsByLocation: jest.fn(),
  findOneOwned: jest.fn(),
  findOneArchived: jest.fn(),
  archiveRecord: jest.fn(),
  moveArchivedToWorkspaceRecord: jest.fn(),
  updateRenderStateRecord: jest.fn(),
  startRenderRecord: jest.fn(),
  deleteRecordById: jest.fn(),
});

/** 최종 합성(video-model FINALIZE 잡) Mock 팩토리 */
export const createFinalRenderMock = (): jest.Mocked<FinalRenderPort> => ({
  createJob: jest.fn(),
  getJobStatus: jest.fn(),
  cancelJob: jest.fn(),
});
