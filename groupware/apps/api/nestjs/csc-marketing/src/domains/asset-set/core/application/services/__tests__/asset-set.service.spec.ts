import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AssetSetService } from '../asset-set.service';
import { AssetSetEntity, SetSlot } from '../../../domain';
import {
  ASSET_SET_REPOSITORY_PORT,
  AssetSetRepositoryPort,
  AssetSetUpdateValues,
  AssetSetValues,
} from '../../ports/outbound';
import {
  AssetDeleteResult,
  FileUploadStoragePort,
  FILE_UPLOAD_STORAGE_PORT,
} from '../../../../../../shared/domain/storage';

/** 인메모리 가짜 레포: 자기완결 세트(scope/org + frame/outro uploadId) */
class FakeAssetSetRepository implements AssetSetRepositoryPort {
  private seq = 0;
  readonly sets = new Map<number, AssetSetEntity>();

  findManyRecords(organizationId: number | null): Promise<AssetSetEntity[]> {
    const all = [...this.sets.values()];
    const scoped =
      organizationId === null
        ? all.filter((s) => s.scope === 'common')
        : all.filter(
            (s) =>
              s.scope === 'common' ||
              (s.scope === 'organization' && s.organizationId === organizationId),
          );
    return Promise.resolve(scoped.map((s) => ({ ...s })));
  }
  findOneRecordById(id: number): Promise<AssetSetEntity | null> {
    const s = this.sets.get(id);
    return Promise.resolve(s ? { ...s } : null);
  }
  createRecord(values: AssetSetValues): Promise<AssetSetEntity> {
    const id = ++this.seq;
    const set: AssetSetEntity = {
      id,
      name: values.name,
      scope: values.scope,
      organizationId: values.organizationId,
      packId: null,
      sortOrder: 0,
      frameUploadId: null,
      outroUploadId: null,
      overlays: values.overlays,
    };
    this.sets.set(id, set);
    return Promise.resolve({ ...set });
  }
  updateOneRecordById(id: number, values: AssetSetUpdateValues): Promise<AssetSetEntity | null> {
    const s = this.sets.get(id);
    if (!s) return Promise.resolve(null);
    s.name = values.name;
    s.overlays = values.overlays;
    return Promise.resolve({ ...s });
  }
  deleteOneRecordById(id: number): Promise<boolean> {
    return Promise.resolve(this.sets.delete(id));
  }
  updateSlotUpload(
    id: number,
    slot: SetSlot,
    uploadId: string | null,
  ): Promise<AssetSetEntity | null> {
    const s = this.sets.get(id);
    if (!s) return Promise.resolve(null);
    if (slot === 'frame') s.frameUploadId = uploadId;
    else s.outroUploadId = uploadId;
    return Promise.resolve({ ...s });
  }
}

/** 가짜 스토리지: 삭제된 uploadId 기록 */
class FakeAssetSetStorage implements FileUploadStoragePort {
  // 이 spec 이 쓰지 않는 계약. 페이크가 포트 전체를 구현해야 계약이 바뀔 때 여기서 걸린다.
  getAssetStatuses(): Promise<Record<string, never>> {
    throw new Error('not used');
  }
  readonly deleted: string[] = [];
  deleteAsset(uploadId: string): Promise<void> {
    this.deleted.push(uploadId);
    return Promise.resolve();
  }
  async deleteAssets(uploadIds: string[]): Promise<AssetDeleteResult> {
    for (const id of uploadIds) await this.deleteAsset(id);
    return { failed: [] };
  }
  /** 이 도메인은 확정을 쓰지 않는다(생성 시점에 이미 UPLOADED). 포트 충족용 no-op. */
  async confirmAssets(_uploadIds: string[]): Promise<void> {}
}

describe('AssetSetService', () => {
  let service: AssetSetService;
  let repository: FakeAssetSetRepository;
  let storage: FakeAssetSetStorage;

  beforeEach(async () => {
    repository = new FakeAssetSetRepository();
    storage = new FakeAssetSetStorage();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AssetSetService,
        { provide: ASSET_SET_REPOSITORY_PORT, useValue: repository },
        { provide: FILE_UPLOAD_STORAGE_PORT, useValue: storage },
      ],
    }).compile();
    service = moduleRef.get(AssetSetService);
  });

  describe('createOne (스코프)', () => {
    it('organizationId 없으면 common, 슬롯 빈 상태', async () => {
      const set = await service.createOne({ name: '  키트  ' });
      expect(set.name).toBe('키트');
      expect(set.scope).toBe('common');
      expect(set.organizationId).toBeNull();
      expect(set.frameUploadId).toBeNull();
    });
    it('organizationId 있으면 organization', async () => {
      const set = await service.createOne({ name: '조직키트', organizationId: 7 });
      expect(set.scope).toBe('organization');
      expect(set.organizationId).toBe(7);
    });
    it('overlays 미지정이면 null', async () => {
      const set = await service.createOne({ name: '키트' });
      expect(set.overlays).toBeNull();
    });
    it('overlays 지정 시 그대로 영속(배경색+폰트)', async () => {
      const overlays = {
        title: { fontUploadId: 'font-a', band: { color: '#112233' } },
        subtitle: { fontUploadId: 'font-b', band: { color: '#445566' } },
      };
      const set = await service.createOne({ name: '키트', organizationId: 7, overlays });
      expect(set.overlays).toEqual(overlays);
    });
  });

  describe('updateOneById (overlays)', () => {
    it('overlays 전달 시 교체', async () => {
      const set = await service.createOne({ name: '키트', organizationId: 7 });
      const overlays = {
        title: { fontUploadId: 'f', band: { color: '#abcdef' } },
        subtitle: { band: null },
      };
      const updated = await service.updateOneById(set.id, { overlays }, 7);
      expect(updated?.overlays).toEqual(overlays);
    });
    it('overlays 미전달(이름만)이면 기존 유지', async () => {
      const overlays = {
        title: { band: { color: '#000000' } },
        subtitle: { band: { color: '#111111' } },
      };
      const set = await service.createOne({ name: '키트', organizationId: 7, overlays });
      const updated = await service.updateOneById(set.id, { name: '새이름' }, 7);
      expect(updated?.name).toBe('새이름');
      expect(updated?.overlays).toEqual(overlays);
    });
  });

  describe('list (스코프 격리)', () => {
    beforeEach(async () => {
      await service.createOne({ name: 'c' });
      await service.createOne({ name: '7', organizationId: 7 });
      await service.createOne({ name: '9', organizationId: 9 });
    });
    it('플랫폼은 common 만', async () => {
      expect((await service.list(null)).map((s) => s.name).sort()).toEqual(['c']);
    });
    it('조직은 common ∪ 자기 org', async () => {
      expect((await service.list(7)).map((s) => s.name).sort()).toEqual(['7', 'c']);
    });
  });

  describe('setSlot (소유권 + 바이트)', () => {
    it('소유 org 세트 슬롯에 업로드 지정', async () => {
      const set = await service.createOne({ name: '키트', organizationId: 7 });
      const updated = await service.setSlot(set.id, 'frame', 'up-frame', 7);
      expect(updated?.frameUploadId).toBe('up-frame');
    });
    it('교체 시 옛 바이트 삭제', async () => {
      const set = await service.createOne({ name: '키트', organizationId: 7 });
      await service.setSlot(set.id, 'outro', 'up-old', 7);
      await service.setSlot(set.id, 'outro', 'up-new', 7);
      expect(storage.deleted).toEqual(['up-old']);
    });
    it('타 org 소유 세트는 null(격리)', async () => {
      const set = await service.createOne({ name: '9', organizationId: 9 });
      expect(await service.setSlot(set.id, 'frame', 'x', 7)).toBeNull();
    });
    it('조직은 common 세트 슬롯을 못 바꾼다(null)', async () => {
      const set = await service.createOne({ name: 'c' });
      expect(await service.setSlot(set.id, 'frame', 'x', 7)).toBeNull();
    });
    it('frame/outro 아닌 슬롯은 400', async () => {
      const set = await service.createOne({ name: '키트', organizationId: 7 });
      await expect(service.setSlot(set.id, 'bgm', 'x', 7)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('clearSlot', () => {
    it('소유 org 슬롯 비우고 바이트 삭제', async () => {
      const set = await service.createOne({ name: '키트', organizationId: 7 });
      await service.setSlot(set.id, 'frame', 'up-frame', 7);
      const updated = await service.clearSlot(set.id, 'frame', 7);
      expect(updated?.frameUploadId).toBeNull();
      expect(storage.deleted).toEqual(['up-frame']);
    });
  });

  describe('deleteOneById (소유권)', () => {
    it('소유 org 세트 삭제 시 프레임+아웃트로 바이트 삭제', async () => {
      const set = await service.createOne({ name: '키트', organizationId: 7 });
      await service.setSlot(set.id, 'frame', 'up-frame', 7);
      await service.setSlot(set.id, 'outro', 'up-outro', 7);
      expect(await service.deleteOneById(set.id, 7)).toBe(true);
      expect(storage.deleted).toEqual(['up-frame', 'up-outro']);
    });
    it('타 org 세트 삭제 시도는 false', async () => {
      const set = await service.createOne({ name: '9', organizationId: 9 });
      expect(await service.deleteOneById(set.id, 7)).toBe(false);
    });
  });
});
