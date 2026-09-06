import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AssetSetEntity, isSetSlot, SetSlot } from '../../domain';
import { AssetSetPort, AssetSetCreateInput, AssetSetPatch } from '../ports/inbound';
import { AssetSetRepositoryPort, ASSET_SET_REPOSITORY_PORT } from '../ports/outbound';
import {
  FileUploadStoragePort,
  FILE_UPLOAD_STORAGE_PORT,
} from '../../../../../shared/domain/storage';
import { AssetOwner, isOwnedBy } from '../../../../../shared/domain/scoped-ownership';

/**
 * AssetSetPort 구현: 플랫폼(common)/조직(organization) 스코프 에셋 세트 CRUD + 슬롯 업로드 지정/비우기
 * 조회는 owner(플랫폼 null / 조직 orgId)로 스코프를 정하고, 변경은 대상 소유권을 검증한다(불일치=null→404)
 * 세트가 슬롯 바이트를 file-upload uploadId 로 자기완결 소유. 슬롯 교체/비우기/세트 삭제 시 옛 바이트를 best-effort 삭제
 */
@Injectable()
export class AssetSetService implements AssetSetPort {
  constructor(
    @Inject(ASSET_SET_REPOSITORY_PORT)
    private readonly repository: AssetSetRepositoryPort,
    @Inject(FILE_UPLOAD_STORAGE_PORT)
    private readonly storage: FileUploadStoragePort,
  ) {}

  list(owner: AssetOwner): Promise<AssetSetEntity[]> {
    return this.repository.findManyRecords(owner);
  }

  getOneById(id: number, owner: AssetOwner): Promise<AssetSetEntity | null> {
    return this.owned(id, owner);
  }

  createOne(input: AssetSetCreateInput): Promise<AssetSetEntity> {
    const organizationId = input.organizationId ?? null;
    return this.repository.createRecord({
      name: input.name.trim() || '새 세트',
      scope: organizationId === null ? 'common' : 'organization',
      organizationId,
      createdByAdminId: input.createdByAdminId ?? null,
      overlays: input.overlays ?? null,
    });
  }

  async updateOneById(
    id: number,
    patch: AssetSetPatch,
    owner: AssetOwner,
  ): Promise<AssetSetEntity | null> {
    const existing = await this.owned(id, owner);
    if (!existing) return null;
    const name = patch.name !== undefined ? patch.name.trim() || existing.name : existing.name;
    // overlays 는 미전달 시 기존 유지, 전달 시 교체(null=스타일 제거)
    const overlays = patch.overlays !== undefined ? patch.overlays : existing.overlays;
    return this.repository.updateOneRecordById(id, { name, overlays });
  }

  async deleteOneById(id: number, owner: AssetOwner): Promise<boolean> {
    const existing = await this.owned(id, owner);
    if (!existing) return false;
    const removed = await this.repository.deleteOneRecordById(id);
    if (removed) {
      await this.deleteBytes(existing.frameUploadId);
      await this.deleteBytes(existing.outroUploadId);
    }
    return removed;
  }

  async setSlot(
    setId: number,
    slot: string,
    uploadId: string,
    owner: AssetOwner,
  ): Promise<AssetSetEntity | null> {
    const validSlot = this.assertSlot(slot);
    const set = await this.owned(setId, owner);
    if (!set) return null;
    const next = uploadId.trim();
    const old = this.slotUpload(set, validSlot);
    const updated = await this.repository.updateSlotUpload(setId, validSlot, next);
    if (old && old !== next) await this.deleteBytes(old);
    return updated;
  }

  async clearSlot(setId: number, slot: string, owner: AssetOwner): Promise<AssetSetEntity | null> {
    const validSlot = this.assertSlot(slot);
    const set = await this.owned(setId, owner);
    if (!set) return null;
    const old = this.slotUpload(set, validSlot);
    const updated = await this.repository.updateSlotUpload(setId, validSlot, null);
    if (old) await this.deleteBytes(old);
    return updated;
  }

  /** 대상 세트를 조회하고 소유자면 반환, 아니면 null. */
  private async owned(id: number, owner: AssetOwner): Promise<AssetSetEntity | null> {
    const set = await this.repository.findOneRecordById(id);
    return set && isOwnedBy(set, owner) ? set : null;
  }

  private assertSlot(slot: string): SetSlot {
    if (!isSetSlot(slot)) {
      throw new BadRequestException('세트 슬롯은 배경프레임(frame)/아웃트로(outro)만 가능합니다.');
    }
    return slot;
  }

  private slotUpload(set: AssetSetEntity, slot: SetSlot): string | null {
    return slot === 'frame' ? set.frameUploadId : set.outroUploadId;
  }

  private async deleteBytes(uploadId: string | null): Promise<void> {
    if (uploadId) await this.storage.deleteAsset(uploadId);
  }
}
