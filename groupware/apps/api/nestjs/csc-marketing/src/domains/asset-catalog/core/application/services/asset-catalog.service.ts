import { Inject, Injectable } from '@nestjs/common';
import { AssetAxisEntity, AssetTagEntity, AxisWithTags } from '../../domain';
import { AssetCatalogPort, CreateAxisInput, CreateTagInput } from '../ports/inbound';
import {
  AssetCatalogRepositoryPort,
  ASSET_CATALOG_REPOSITORY_PORT,
} from '../ports/outbound';
import { AssetOwner, isOwnedBy } from '../../../../../shared/domain/scoped-ownership';

/**
 * AssetCatalogPort 구현: 태그 축/태그 카탈로그 조회 + CRUD. owner 로 스코프
 *   조회: common ∪ 자기 org. 편집: 자기 소유(플랫폼=common / 조직=자기 org)만. 공통은 조직에게 읽기 전용
 */
@Injectable()
export class AssetCatalogService implements AssetCatalogPort {
  constructor(
    @Inject(ASSET_CATALOG_REPOSITORY_PORT)
    private readonly repository: AssetCatalogRepositoryPort,
  ) {}

  /** 축이 owner 에게 보이는가: 공통이거나 자기 org 소유. (owner=null 이면 공통만.) */
  private axisVisibleTo(axis: AssetAxisEntity, owner: AssetOwner): boolean {
    return axis.scope === 'common' || (owner !== null && axis.scope === 'organization' && axis.organizationId === owner);
  }

  async listAxesWithTags(owner: AssetOwner, category?: string): Promise<AxisWithTags[]> {
    const axes = await this.repository.findAxes(owner, category?.trim() || undefined);
    if (axes.length === 0) return [];
    const tags = await this.repository.findTags(owner, axes.map((a) => a.id));
    const byAxis = new Map<number, AssetTagEntity[]>();
    for (const t of tags) {
      const arr = byAxis.get(t.axisId);
      if (arr) arr.push(t);
      else byAxis.set(t.axisId, [t]);
    }
    return axes.map((a) => ({ ...a, tags: byAxis.get(a.id) ?? [] }));
  }

  createAxis(input: CreateAxisInput, owner: AssetOwner): Promise<AssetAxisEntity> {
    return this.repository.createAxisRecord({
      scope: owner === null ? 'common' : 'organization',
      organizationId: owner,
      category: input.category.trim(),
      key: input.key.trim(),
      label: input.label.trim() || input.key.trim(),
      hint: input.hint?.trim() ?? '',
      sortOrder: input.sortOrder ?? 0,
    });
  }

  async deleteAxis(id: number, owner: AssetOwner): Promise<boolean> {
    const existing = await this.repository.findAxisById(id);
    if (!existing || !isOwnedBy(existing, owner)) return false;
    return this.repository.deleteAxisRecordById(id);
  }

  async createTag(input: CreateTagInput, owner: AssetOwner): Promise<AssetTagEntity | null> {
    // 축은 owner 가 볼 수 있어야(공통 또는 자기 org). 조직은 공통 축 아래에도 자기 태그를 달 수 있다.
    const axis = await this.repository.findAxisById(input.axisId);
    if (!axis || !this.axisVisibleTo(axis, owner)) return null;
    const value = input.value.trim();
    return this.repository.createTagRecord({
      axisId: input.axisId,
      scope: owner === null ? 'common' : 'organization',
      organizationId: owner,
      value,
      label: input.label?.trim() || value,
      sortOrder: input.sortOrder ?? 0,
    });
  }

  async deleteTag(id: number, owner: AssetOwner): Promise<boolean> {
    const existing = await this.repository.findTagById(id);
    if (!existing || !isOwnedBy(existing, owner)) return false;
    return this.repository.deleteTagRecordById(id);
  }
}
