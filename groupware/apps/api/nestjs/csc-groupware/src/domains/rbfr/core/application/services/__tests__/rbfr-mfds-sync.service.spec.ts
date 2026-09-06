import { Test, TestingModule } from '@nestjs/testing';
import { RbfrMfdsSyncService } from '../rbfr-mfds-sync.service';
import { RBFR_MFDS_API_PORT, RBFR_INGREDIENT_REPOSITORY_PORT } from '../../ports/outbound';
import type { RbfrIngredientRepositoryPort, RbfrMfdsApiPort } from '../../ports/outbound';

describe('RbfrMfdsSyncService', () => {
  let service: RbfrMfdsSyncService;
  let mfdsApi: jest.Mocked<RbfrMfdsApiPort>;
  let ingredientRepository: jest.Mocked<RbfrIngredientRepositoryPort>;

  beforeEach(async () => {
    mfdsApi = { searchByKoreanName: jest.fn(), fetchPage: jest.fn() };
    ingredientRepository = {
      createIngredient: jest.fn(),
      listIngredients: jest.fn(),
      upsertDictionaryEntries: jest.fn(),
      findIngredientsForRecommendation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbfrMfdsSyncService,
        { provide: RBFR_MFDS_API_PORT, useValue: mfdsApi },
        { provide: RBFR_INGREDIENT_REPOSITORY_PORT, useValue: ingredientRepository },
      ],
    }).compile();

    service = module.get(RbfrMfdsSyncService);
  });

  it('searchIngredientDictionary는 mfdsApi 검색 결과를 그대로 돌려준다', async () => {
    mfdsApi.searchByKoreanName.mockResolvedValueOnce([{ nameKo: '가지열매추출물', nameEn: 'Solanum Melongena Fruit Extract' }]);
    const result = await service.searchIngredientDictionary('가지열매추출물');
    expect(result).toHaveLength(1);
    expect(mfdsApi.searchByKoreanName).toHaveBeenCalledWith('가지열매추출물');
  });

  it('syncFullDictionary는 totalCount를 다 채울 때까지 페이지를 순회하고 각 페이지를 upsert한다', async () => {
    // 실제 구현의 페이지 크기(1000)에 맞춰, 2페이지가 실제로 필요한 totalCount를 준다.
    const page1Items = Array.from({ length: 1000 }, (_, i) => ({ nameKo: `A${i}` }));
    const page2Items = Array.from({ length: 500 }, (_, i) => ({ nameKo: `B${i}` }));
    mfdsApi.fetchPage
      .mockResolvedValueOnce({ items: page1Items, totalCount: 1500 })
      .mockResolvedValueOnce({ items: page2Items, totalCount: 1500 });
    ingredientRepository.upsertDictionaryEntries.mockImplementation(async (entries) => entries.length);

    const result = await service.syncFullDictionary();

    expect(mfdsApi.fetchPage).toHaveBeenNthCalledWith(1, 1, 1000);
    expect(mfdsApi.fetchPage).toHaveBeenNthCalledWith(2, 2, 1000);
    expect(result).toEqual({ synced: 1500, pages: 2 });
  });

  it('syncFullDictionary는 빈 페이지를 만나면 중단한다(무한루프 방지)', async () => {
    mfdsApi.fetchPage.mockResolvedValueOnce({ items: [], totalCount: 100 });
    const result = await service.syncFullDictionary();
    expect(result).toEqual({ synced: 0, pages: 0 });
    expect(mfdsApi.fetchPage).toHaveBeenCalledTimes(1);
  });
});
