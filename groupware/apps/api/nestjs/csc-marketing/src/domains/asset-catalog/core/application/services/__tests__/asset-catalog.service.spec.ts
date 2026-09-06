import { Test, TestingModule } from '@nestjs/testing';
import { AssetCatalogService } from '../asset-catalog.service';
import { AssetAxisEntity, AssetTagEntity } from '../../../domain';
import {
  ASSET_CATALOG_REPOSITORY_PORT,
  AssetCatalogRepositoryPort,
  AxisValues,
  TagValues,
} from '../../ports/outbound';
import type { AssetOwner } from '../../../../../../shared/domain/scoped-ownership';

/** 인메모리 가짜 카탈로그 레포: Protocol 구현. owner 가시성(common ∪ 자기 org)을 흉내낸다. */
class FakeAssetCatalogRepository implements AssetCatalogRepositoryPort {
  private axisSeq = 0;
  private tagSeq = 0;
  readonly axes = new Map<number, AssetAxisEntity>();
  readonly tags = new Map<number, AssetTagEntity>();

  private visible(e: { scope: string; organizationId: number | null }, owner: AssetOwner): boolean {
    return e.scope === 'common' || (owner !== null && e.organizationId === owner);
  }

  findAxes(owner: AssetOwner, category?: string): Promise<AssetAxisEntity[]> {
    const all = [...this.axes.values()]
      .filter((a) => this.visible(a, owner))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return Promise.resolve(category ? all.filter((a) => a.category === category) : all);
  }
  findAxisById(id: number): Promise<AssetAxisEntity | null> {
    return Promise.resolve(this.axes.get(id) ?? null);
  }
  findTags(owner: AssetOwner, axisIds?: number[]): Promise<AssetTagEntity[]> {
    const all = [...this.tags.values()]
      .filter((t) => this.visible(t, owner))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return Promise.resolve(axisIds ? all.filter((t) => axisIds.includes(t.axisId)) : all);
  }
  findTagById(id: number): Promise<AssetTagEntity | null> {
    return Promise.resolve(this.tags.get(id) ?? null);
  }
  createAxisRecord(v: AxisValues): Promise<AssetAxisEntity> {
    const id = ++this.axisSeq;
    const e: AssetAxisEntity = { id, ...v, isActive: true };
    this.axes.set(id, e);
    return Promise.resolve(e);
  }
  deleteAxisRecordById(id: number): Promise<boolean> {
    return Promise.resolve(this.axes.delete(id));
  }
  createTagRecord(v: TagValues): Promise<AssetTagEntity> {
    const id = ++this.tagSeq;
    const e: AssetTagEntity = { id, ...v, isActive: true };
    this.tags.set(id, e);
    return Promise.resolve(e);
  }
  deleteTagRecordById(id: number): Promise<boolean> {
    return Promise.resolve(this.tags.delete(id));
  }
}

describe('AssetCatalogService', () => {
  let service: AssetCatalogService;
  let repository: FakeAssetCatalogRepository;

  beforeEach(async () => {
    repository = new FakeAssetCatalogRepository();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AssetCatalogService,
        { provide: ASSET_CATALOG_REPOSITORY_PORT, useValue: repository },
      ],
    }).compile();
    service = moduleRef.get(AssetCatalogService);
  });

  it('플랫폼(owner=null)이 공통 축/태그를 트리로 만든다', async () => {
    const mood = await service.createAxis({ category: 'BGM', key: 'mood', label: '분위기', sortOrder: 10 }, null);
    await service.createTag({ axisId: mood.id, value: '잔잔한', sortOrder: 10 }, null);
    await service.createTag({ axisId: mood.id, value: '밝은', sortOrder: 20 }, null);
    const tree = await service.listAxesWithTags(null, 'BGM');
    expect(tree).toHaveLength(1);
    expect(tree[0].scope).toBe('common');
    expect(tree[0].tags.map((t) => t.value)).toEqual(['잔잔한', '밝은']);
  });

  it('조직은 공통 ∪ 자기 org 를 보고, 공통 축에 자기 태그를 더한다', async () => {
    const mood = await service.createAxis({ category: 'BGM', key: 'mood', label: '분위기' }, null); // 공통
    await service.createTag({ axisId: mood.id, value: '잔잔한' }, null); // 공통 태그
    const orgTag = await service.createTag({ axisId: mood.id, value: '몽환적' }, 7); // 조직 태그(공통 축 아래)
    expect(orgTag?.scope).toBe('organization');
    expect(orgTag?.organizationId).toBe(7);

    const tree7 = await service.listAxesWithTags(7, 'BGM');
    expect(tree7[0].tags.map((t) => t.value).sort()).toEqual(['몽환적', '잔잔한']);

    // 다른 조직/플랫폼엔 조직 태그가 안 보인다.
    const tree9 = await service.listAxesWithTags(9, 'BGM');
    expect(tree9[0].tags.map((t) => t.value)).toEqual(['잔잔한']);
    const treeP = await service.listAxesWithTags(null, 'BGM');
    expect(treeP[0].tags.map((t) => t.value)).toEqual(['잔잔한']);
  });

  it('조직은 자기 전용 축을 만들 수 있고 그 조직만 본다', async () => {
    await service.createAxis({ category: 'BGM', key: 'instrument', label: '악기' }, 7);
    const t7 = await service.listAxesWithTags(7, 'BGM');
    expect(t7.map((a) => a.key)).toContain('instrument');
    const tP = await service.listAxesWithTags(null, 'BGM');
    expect(tP.map((a) => a.key)).not.toContain('instrument');
  });

  it('조직은 공통 축/태그를 삭제할 수 없다', async () => {
    const mood = await service.createAxis({ category: 'BGM', key: 'mood', label: '분위기' }, null);
    const tag = await service.createTag({ axisId: mood.id, value: '잔잔한' }, null);
    expect(tag).not.toBeNull();
    expect(await service.deleteAxis(mood.id, 7)).toBe(false);
    expect(await service.deleteTag(tag!.id, 7)).toBe(false);
  });

  it('플랫폼은 조직 소유 축을 삭제할 수 없다', async () => {
    const axis = await service.createAxis({ category: 'BGM', key: 'instrument', label: '악기' }, 7);
    expect(await service.deleteAxis(axis.id, null)).toBe(false);
  });

  it('없는 축에는 태그를 달 수 없다(null)', async () => {
    expect(await service.createTag({ axisId: 999, value: 'x' }, 7)).toBeNull();
  });
});
