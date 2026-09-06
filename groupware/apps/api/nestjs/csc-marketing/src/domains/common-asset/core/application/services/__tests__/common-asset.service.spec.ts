import { Test, TestingModule } from '@nestjs/testing';
import { CommonAssetService } from '../common-asset.service';
import { CommonAssetEntity } from '../../../domain';
import {
  COMMON_ASSET_REPOSITORY_PORT,
  CommonAssetRepositoryPort,
  CommonAssetUpdateValues,
  CommonAssetValues,
} from '../../ports/outbound';
import {
  AssetDeleteResult,
  FileUploadStoragePort,
  FILE_UPLOAD_STORAGE_PORT,
} from '../../../../../../shared/domain/storage';

/**
 * 인메모리 가짜 레포: Protocol(포트) 구현으로 프레임워크 없이 서비스 단위 테스트
 * 태그 카탈로그는 catalog(tagId→{category,axisKey,value,label})로 흉내내고, 자산-태그 링크는 links 로 보관한다.
 */
class FakeCommonAssetRepository implements CommonAssetRepositoryPort {
  private seq = 0;
  readonly items = new Map<number, CommonAssetEntity>();
  readonly links = new Map<number, number[]>();
  /** 가짜 카탈로그: 테스트가 시드. category 로 유효성 필터, 나머지는 조회 shape. */
  readonly catalog = new Map<number, { category: string; axisKey: string; value: string; label: string }>();

  private withTags(a: CommonAssetEntity): CommonAssetEntity {
    const ids = this.links.get(a.id) ?? [];
    const tags = ids.map((id) => {
      const c = this.catalog.get(id)!;
      return { tagId: id, axisKey: c.axisKey, value: c.value, label: c.label, scope: 'common' as const };
    });
    return { ...a, tags };
  }

  findManyRecords(organizationId: number | null): Promise<CommonAssetEntity[]> {
    const all = [...this.items.values()];
    const scoped =
      organizationId === null
        ? all.filter((a) => a.scope === 'common')
        : all.filter(
            (a) =>
              a.scope === 'common' ||
              (a.scope === 'organization' && a.organizationId === organizationId),
          );
    return Promise.resolve(scoped.map((a) => this.withTags(a)));
  }
  findOneRecordById(id: number): Promise<CommonAssetEntity | null> {
    const a = this.items.get(id);
    return Promise.resolve(a ? this.withTags(a) : null);
  }
  createRecord(values: CommonAssetValues): Promise<CommonAssetEntity> {
    const id = ++this.seq;
    const entity: CommonAssetEntity = {
      id,
      category: values.category,
      scope: values.scope,
      organizationId: values.organizationId,
      packId: null,
      uploadId: values.uploadId,
      name: values.name,
      mimeType: values.mimeType,
      sizeBytes: values.sizeBytes,
      sortOrder: 0,
      tags: [],
    };
    this.items.set(id, entity);
    return Promise.resolve(entity);
  }
  updateOneRecordById(id: number, values: CommonAssetUpdateValues): Promise<CommonAssetEntity | null> {
    const cur = this.items.get(id);
    if (!cur) return Promise.resolve(null);
    const next: CommonAssetEntity = { ...cur, name: values.name };
    this.items.set(id, next);
    return Promise.resolve(this.withTags(next));
  }
  deleteOneRecordById(id: number): Promise<boolean> {
    this.links.delete(id);
    return Promise.resolve(this.items.delete(id));
  }
  filterValidTagIds(category: string, tagIds: number[], _owner: number | null): Promise<number[]> {
    // 가짜 카탈로그 태그는 모두 공통 취급(owner 무관): 카테고리 일치만 확인
    void _owner;
    return Promise.resolve(tagIds.filter((id) => this.catalog.get(id)?.category === category));
  }
  replaceTags(assetId: number, tagIds: number[]): Promise<void> {
    this.links.set(assetId, [...new Set(tagIds)]);
    return Promise.resolve();
  }
}

/** 바이트 삭제 스파이 */
class FakeCommonAssetStorage implements FileUploadStoragePort {
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

describe('CommonAssetService', () => {
  let service: CommonAssetService;
  let repository: FakeCommonAssetRepository;
  let storage: FakeCommonAssetStorage;

  beforeEach(async () => {
    repository = new FakeCommonAssetRepository();
    storage = new FakeCommonAssetStorage();
    // 가짜 카탈로그 시드: BGM 태그 1,2 / SFX 태그 9.
    repository.catalog.set(1, { category: 'BGM', axisKey: 'mood', value: '잔잔한', label: '잔잔한' });
    repository.catalog.set(2, { category: 'BGM', axisKey: 'genre', value: '어쿠스틱', label: '어쿠스틱' });
    repository.catalog.set(9, { category: 'SFX', axisKey: 'type', value: '클릭', label: '클릭' });

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CommonAssetService,
        { provide: COMMON_ASSET_REPOSITORY_PORT, useValue: repository },
        { provide: FILE_UPLOAD_STORAGE_PORT, useValue: storage },
      ],
    }).compile();
    service = moduleRef.get(CommonAssetService);
  });

  describe('createOne', () => {
    it('organizationId 없으면 scope=common 으로 저장하고 트림한다', async () => {
      const asset = await service.createOne({
        category: 'SAMPLE_IMAGE',
        uploadId: 'u-1',
        name: '  씬 참고 샘플  ',
        mimeType: 'image/png',
      });
      expect(asset.scope).toBe('common');
      expect(asset.organizationId).toBeNull();
      expect(asset.name).toBe('씬 참고 샘플');
      expect(asset.tags).toEqual([]);
    });

    it('organizationId 있으면 scope=organization 으로 저장한다', async () => {
      const asset = await service.createOne({
        category: 'BGM',
        organizationId: 7,
        uploadId: 'u-2',
        name: '조직 BGM',
        mimeType: 'audio/mpeg',
      });
      expect(asset.scope).toBe('organization');
      expect(asset.organizationId).toBe(7);
    });

    it('tagIds 를 유효성 필터해 저장한다(타 카테고리 태그 제거)', async () => {
      const asset = await service.createOne({
        category: 'BGM',
        organizationId: 7,
        uploadId: 'u-3',
        name: '태그 BGM',
        mimeType: 'audio/mpeg',
        tagIds: [1, 2, 9], // 9=SFX 태그라 BGM 자산에서 제거되어야
      });
      expect(asset.tags.map((t) => t.tagId).sort()).toEqual([1, 2]);
      expect(asset.tags.map((t) => t.value).sort()).toEqual(['어쿠스틱', '잔잔한']);
    });

    it('tagIds 미제공이면 태그 없음', async () => {
      const asset = await service.createOne({
        category: 'BGM',
        uploadId: 'u-4',
        name: '무태그',
        mimeType: 'audio/mpeg',
      });
      expect(asset.tags).toEqual([]);
    });
  });

  describe('list (스코프)', () => {
    beforeEach(async () => {
      await service.createOne({ category: 'BGM', uploadId: 'c', name: '공통', mimeType: 'audio/mpeg' });
      await service.createOne({ category: 'BGM', organizationId: 7, uploadId: 'o7', name: '7', mimeType: 'audio/mpeg' });
      await service.createOne({ category: 'BGM', organizationId: 9, uploadId: 'o9', name: '9', mimeType: 'audio/mpeg' });
    });

    it('플랫폼(null)은 common 만 본다', async () => {
      const list = await service.list(null);
      expect(list.map((a) => a.uploadId).sort()).toEqual(['c']);
    });

    it('조직은 common ∪ 자기 org 만 본다(타 org 격리)', async () => {
      const list = await service.list(7);
      expect(list.map((a) => a.uploadId).sort()).toEqual(['c', 'o7']);
    });
  });

  describe('updateOneById (소유권)', () => {
    it('조직은 자기 org 자산 이름을 수정한다', async () => {
      const a = await service.createOne({ category: 'SFX', organizationId: 7, uploadId: 'u', name: '원래', mimeType: 'audio/wav' });
      const updated = await service.updateOneById(a.id, { name: '수정' }, 7);
      expect(updated?.name).toBe('수정');
    });
    it('이름만 수정하면 기존 태그를 유지한다', async () => {
      const a = await service.createOne({
        category: 'BGM', organizationId: 7, uploadId: 'u', name: '원래',
        mimeType: 'audio/mpeg', tagIds: [1],
      });
      const updated = await service.updateOneById(a.id, { name: '수정' }, 7);
      expect(updated?.tags.map((t) => t.tagId)).toEqual([1]);
    });
    it('tagIds 를 제공하면 유효성 필터 후 통째로 교체한다', async () => {
      const a = await service.createOne({
        category: 'BGM', organizationId: 7, uploadId: 'u', name: 'n',
        mimeType: 'audio/mpeg', tagIds: [1],
      });
      const updated = await service.updateOneById(a.id, { tagIds: [2, 9] }, 7); // 9=SFX 제거
      expect(updated?.tags.map((t) => t.tagId)).toEqual([2]);
    });
    it('조직은 common 자산을 수정할 수 없다(404 → null)', async () => {
      const a = await service.createOne({ category: 'SFX', uploadId: 'u', name: '공통', mimeType: 'audio/wav' });
      expect(await service.updateOneById(a.id, { name: 'x' }, 7)).toBeNull();
    });
    it('조직은 타 org 자산을 수정할 수 없다(null)', async () => {
      const a = await service.createOne({ category: 'SFX', organizationId: 9, uploadId: 'u', name: '9', mimeType: 'audio/wav' });
      expect(await service.updateOneById(a.id, { name: 'x' }, 7)).toBeNull();
    });
    it('플랫폼은 org 자산을 수정할 수 없다(null)', async () => {
      const a = await service.createOne({ category: 'SFX', organizationId: 7, uploadId: 'u', name: '7', mimeType: 'audio/wav' });
      expect(await service.updateOneById(a.id, { name: 'x' }, null)).toBeNull();
    });
  });

  describe('deleteOneById (소유권 + 바이트)', () => {
    it('소유 org 자산 삭제 시 메타+바이트 제거', async () => {
      const a = await service.createOne({ category: 'SFX', organizationId: 7, uploadId: 'u-5', name: '효과음', mimeType: 'audio/wav' });
      expect(await service.deleteOneById(a.id, 7)).toBe(true);
      expect(storage.deleted).toContain('u-5');
    });
    it('타 org 삭제 시도는 false 이고 스토리지를 건드리지 않는다', async () => {
      const a = await service.createOne({ category: 'SFX', organizationId: 9, uploadId: 'u-6', name: '9', mimeType: 'audio/wav' });
      expect(await service.deleteOneById(a.id, 7)).toBe(false);
      expect(storage.deleted).toHaveLength(0);
    });
    it('없는 id 는 false', async () => {
      expect(await service.deleteOneById(999, null)).toBe(false);
    });
  });
});
