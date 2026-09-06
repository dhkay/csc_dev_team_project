import { Inject, Injectable } from '@nestjs/common';
import { CommonAssetEntity } from '../../domain';
import { CommonAssetPort, CommonAssetCreateInput, CommonAssetPatch } from '../ports/inbound';
import { CommonAssetRepositoryPort, COMMON_ASSET_REPOSITORY_PORT } from '../ports/outbound';
import {
  FileUploadStoragePort,
  FILE_UPLOAD_STORAGE_PORT,
} from '../../../../../shared/domain/storage';
import { AssetOwner, isOwnedBy } from '../../../../../shared/domain/scoped-ownership';

/**
 * CommonAssetPort 구현: 플랫폼 전역(scope='common') + 조직(scope='organization') 공통 에셋
 * 조회는 owner(플랫폼 null / 조직 orgId)로 스코프를 정하고, 변경은 대상 소유권을 검증한다(불일치=null→404)
 * 삭제는 메타 제거 후 file-upload 바이트를 best-effort 로 지운다.
 */
@Injectable()
export class CommonAssetService implements CommonAssetPort {
  constructor(
    @Inject(COMMON_ASSET_REPOSITORY_PORT)
    private readonly repository: CommonAssetRepositoryPort,
    @Inject(FILE_UPLOAD_STORAGE_PORT)
    private readonly storage: FileUploadStoragePort,
  ) {}

  list(owner: AssetOwner): Promise<CommonAssetEntity[]> {
    return this.repository.findManyRecords(owner);
  }

  async createOne(input: CommonAssetCreateInput): Promise<CommonAssetEntity> {
    const uploadId = input.uploadId.trim();
    const name = input.name.trim();
    const organizationId = input.organizationId ?? null;
    const asset = await this.repository.createRecord({
      category: input.category,
      scope: organizationId === null ? 'common' : 'organization',
      organizationId,
      uploadId,
      name: name || uploadId,
      mimeType: input.mimeType.trim(),
      sizeBytes: input.sizeBytes ?? null,
      createdByAdminId: input.createdByAdminId ?? null,
    });
    if (input.tagIds && input.tagIds.length > 0) {
      const valid = await this.repository.filterValidTagIds(input.category, input.tagIds, organizationId);
      if (valid.length > 0) await this.repository.replaceTags(asset.id, valid);
    }
    // 태그를 붙였으면 조인 결과로 다시 읽어 반환
    return (await this.repository.findOneRecordById(asset.id)) ?? asset;
  }

  async updateOneById(
    id: number,
    patch: CommonAssetPatch,
    owner: AssetOwner,
  ): Promise<CommonAssetEntity | null> {
    const existing = await this.repository.findOneRecordById(id);
    if (!existing || !isOwnedBy(existing, owner)) return null;
    const name = patch.name !== undefined ? patch.name.trim() || existing.name : existing.name;
    await this.repository.updateOneRecordById(id, { name });
    // tagIds 제공 시에만 유효성 필터 후 통째로 교체(미제공이면 기존 유지). owner=자산 소유자(검증됨)
    if (patch.tagIds !== undefined) {
      const valid = await this.repository.filterValidTagIds(existing.category, patch.tagIds, owner);
      await this.repository.replaceTags(id, valid);
    }
    return this.repository.findOneRecordById(id);
  }

  async deleteOneById(id: number, owner: AssetOwner): Promise<boolean> {
    const existing = await this.repository.findOneRecordById(id);
    if (!existing || !isOwnedBy(existing, owner)) return false;
    const removed = await this.repository.deleteOneRecordById(id);
    if (removed) await this.storage.deleteAsset(existing.uploadId);
    return removed;
  }
}
