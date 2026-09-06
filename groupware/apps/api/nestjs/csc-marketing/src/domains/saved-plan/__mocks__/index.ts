import type { SavedPlanRepositoryPort } from '../core/application/ports/outbound';
import type { FileUploadStoragePort } from '../../../shared/domain/storage';

/** SavedPlan 레포지토리 Mock 팩토리 */
export const createSavedPlanRepositoryMock = (): jest.Mocked<SavedPlanRepositoryPort> => ({
  createRecord: jest.fn(),
  findRecordsByOwner: jest.fn(),
  findOneOwned: jest.fn(),
  deleteRecordById: jest.fn(),
  updateScenesRecord: jest.fn(),
});

/** 공유 file-upload 스토리지(cascade 삭제 + 사전검증 상태조회) Mock 팩토리 */
export const createFileUploadStorageMock = (): jest.Mocked<FileUploadStoragePort> => ({
  deleteAsset: jest.fn(),
  deleteAssets: jest.fn(async (_ids: string[]) => ({ failed: [] })),
  confirmAssets: jest.fn(),
  getAssetStatuses: jest.fn(async (_ids: string[]) => ({})),
});
