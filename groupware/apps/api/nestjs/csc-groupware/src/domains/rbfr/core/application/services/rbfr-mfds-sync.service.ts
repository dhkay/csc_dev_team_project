import { Inject, Injectable } from '@nestjs/common';
import type { MfdsIngredientRecord, MfdsSyncResult } from '../../domain/types';
import { RBFR_MFDS_API_PORT, type RbfrMfdsApiPort } from '../ports/outbound';
import { RBFR_INGREDIENT_REPOSITORY_PORT, type RbfrIngredientRepositoryPort } from '../ports/outbound';
import type { RbfrMfdsSyncPort } from '../ports/inbound/rbfr-mfds-sync.port';

const SYNC_PAGE_SIZE = 1000;

@Injectable()
export class RbfrMfdsSyncService implements RbfrMfdsSyncPort {
  constructor(
    @Inject(RBFR_MFDS_API_PORT)
    private readonly mfdsApi: RbfrMfdsApiPort,
    @Inject(RBFR_INGREDIENT_REPOSITORY_PORT)
    private readonly ingredientRepository: RbfrIngredientRepositoryPort,
  ) {}

  async searchIngredientDictionary(nameKo: string): Promise<MfdsIngredientRecord[]> {
    return await this.mfdsApi.searchByKoreanName(nameKo);
  }

  async syncFullDictionary(): Promise<MfdsSyncResult> {
    let pageNo = 1;
    let synced = 0;
    let totalCount = Number.POSITIVE_INFINITY;

    while ((pageNo - 1) * SYNC_PAGE_SIZE < totalCount) {
      const { items, totalCount: total } = await this.mfdsApi.fetchPage(pageNo, SYNC_PAGE_SIZE);
      totalCount = total;
      if (items.length === 0) break;
      synced += await this.ingredientRepository.upsertDictionaryEntries(items);
      pageNo += 1;
    }

    return { synced, pages: pageNo - 1 };
  }
}
