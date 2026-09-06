import { BadRequestException } from '@nestjs/common';
import { assertAssetsUploaded } from '../asset-preflight';
import type { AssetUploadStatus, FileUploadStoragePort } from '../file-upload-storage.port';

const storageWith = (statuses: Record<string, AssetUploadStatus>): FileUploadStoragePort => ({
  deleteAsset: jest.fn(),
  deleteAssets: jest.fn(async () => ({ failed: [] })),
  confirmAssets: jest.fn(),
  getAssetStatuses: jest.fn(async (ids: string[]) =>
    Object.fromEntries(ids.filter((id) => id in statuses).map((id) => [id, statuses[id]])),
  ),
});

describe('assertAssetsUploaded', () => {
  it('모두 UPLOADED 면 통과(throw 없음)', async () => {
    const storage = storageWith({ a: 'UPLOADED', b: 'UPLOADED' });
    await expect(assertAssetsUploaded(storage, ['a', 'b'])).resolves.toBeUndefined();
  });

  it('하나라도 PENDING/MISSING 이면 400', async () => {
    const storage = storageWith({ a: 'UPLOADED', b: 'PENDING' });
    await expect(assertAssetsUploaded(storage, ['a', 'b', 'c'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('빈/중복/falsy id 는 정리: 빈 목록은 조회 없이 통과', async () => {
    const storage = storageWith({});
    await expect(assertAssetsUploaded(storage, ['', ''])).resolves.toBeUndefined();
    expect(storage.getAssetStatuses).not.toHaveBeenCalled();
  });

  it('중복 id 는 한 번만 검사한다', async () => {
    const storage = storageWith({ a: 'UPLOADED' });
    await assertAssetsUploaded(storage, ['a', 'a', 'a']);
    expect(storage.getAssetStatuses).toHaveBeenCalledWith(['a']);
  });
});
