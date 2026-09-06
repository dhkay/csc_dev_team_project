import { Test, TestingModule } from '@nestjs/testing';
import { RbfrRecommendationService, calculateProximity, normalizeVector } from '../rbfr-recommendation.service';
import { RBFR_INGREDIENT_REPOSITORY_PORT } from '../../ports/outbound';
import type { RbfrIngredientRepositoryPort } from '../../ports/outbound';
import type { IngredientRecommendationCandidate } from '../../../domain/types';

describe('normalizeVector', () => {
  it('합이 100이 되도록 정규화한다', () => {
    expect(normalizeVector([1, 1, 2])).toEqual([25, 25, 50]);
  });

  it('합이 0이면 전부 0으로 둔다', () => {
    expect(normalizeVector([0, 0])).toEqual([0, 0]);
  });
});

describe('calculateProximity', () => {
  const makeCandidate = (contributions: Record<string, number>): IngredientRecommendationCandidate => ({
    ingredientId: 1,
    nameKo: '테스트',
    inciName: 'Test',
    contributions,
    hasBanRegulation: false,
    hasAnyConfirmedRegulation: true,
  });

  it('목표 비중과 완전히 일치하면 100을 반환한다', () => {
    const result = calculateProximity(
      [
        { domainCode: 'MOISTURE', targetPercent: 50 },
        { domainCode: 'SOOTHING', targetPercent: 50 },
      ],
      makeCandidate({ MOISTURE: 50, SOOTHING: 50 }),
    );
    expect(result).toBe(100);
  });

  it('목표 비중과 정반대이면 0에 가깝다', () => {
    const result = calculateProximity(
      [
        { domainCode: 'MOISTURE', targetPercent: 100 },
        { domainCode: 'SOOTHING', targetPercent: 0 },
      ],
      makeCandidate({ MOISTURE: 0, SOOTHING: 100 }),
    );
    expect(result).toBe(0);
  });
});

describe('RbfrRecommendationService', () => {
  let service: RbfrRecommendationService;
  let ingredientRepository: jest.Mocked<RbfrIngredientRepositoryPort>;

  beforeEach(async () => {
    ingredientRepository = {
      createIngredient: jest.fn(),
      listIngredients: jest.fn(),
      upsertDictionaryEntries: jest.fn(),
      findIngredientsForRecommendation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbfrRecommendationService,
        { provide: RBFR_INGREDIENT_REPOSITORY_PORT, useValue: ingredientRepository },
      ],
    }).compile();

    service = module.get(RbfrRecommendationService);
  });

  it('BAN 원료는 추천에서 빼고 excluded에 BAN 사유로 담는다', async () => {
    ingredientRepository.findIngredientsForRecommendation.mockResolvedValueOnce([
      {
        ingredientId: 1,
        nameKo: '금지원료',
        inciName: 'Banned',
        contributions: { MOISTURE: 100 },
        hasBanRegulation: true,
        hasAnyConfirmedRegulation: true,
      },
    ]);

    const result = await service.recommendIngredients([{ domainCode: 'MOISTURE', targetPercent: 100 }]);

    expect(result.recommendations).toEqual([]);
    expect(result.excluded).toEqual([{ ingredientId: 1, nameKo: '금지원료', reason: 'BAN' }]);
  });

  it('확정된 규제 데이터가 없는 원료는 NODATA 사유로 제외한다', async () => {
    ingredientRepository.findIngredientsForRecommendation.mockResolvedValueOnce([
      {
        ingredientId: 2,
        nameKo: '미확인원료',
        inciName: 'Unknown',
        contributions: { MOISTURE: 100 },
        hasBanRegulation: false,
        hasAnyConfirmedRegulation: false,
      },
    ]);

    const result = await service.recommendIngredients([{ domainCode: 'MOISTURE', targetPercent: 100 }]);

    expect(result.recommendations).toEqual([]);
    expect(result.excluded).toEqual([{ ingredientId: 2, nameKo: '미확인원료', reason: 'NODATA' }]);
  });

  it('허용 원료는 근접도 내림차순으로 상위 10개만 반환한다', async () => {
    // 목표는 MOISTURE 100:SOOTHING 0. i가 클수록 SOOTHING 비중이 늘어 목표에서 멀어진다.
    const candidates: IngredientRecommendationCandidate[] = Array.from({ length: 12 }, (_, i) => ({
      ingredientId: i + 1,
      nameKo: `원료${i + 1}`,
      inciName: `Ingredient${i + 1}`,
      contributions: { MOISTURE: 12 - i, SOOTHING: i },
      hasBanRegulation: false,
      hasAnyConfirmedRegulation: true,
    }));
    ingredientRepository.findIngredientsForRecommendation.mockResolvedValueOnce(candidates);

    const result = await service.recommendIngredients([
      { domainCode: 'MOISTURE', targetPercent: 100 },
      { domainCode: 'SOOTHING', targetPercent: 0 },
    ]);

    expect(result.recommendations).toHaveLength(10);
    expect(result.recommendations[0].ingredientId).toBe(1);
  });
});
