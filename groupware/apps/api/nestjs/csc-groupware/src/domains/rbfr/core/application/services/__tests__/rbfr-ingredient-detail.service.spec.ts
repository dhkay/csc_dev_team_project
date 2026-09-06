import { Test, TestingModule } from '@nestjs/testing';
import { RbfrIngredientDetailService } from '../rbfr-ingredient-detail.service';
import { RBFR_INGREDIENT_DETAIL_REPOSITORY_PORT } from '../../ports/outbound';
import type { RbfrIngredientDetailRepositoryPort } from '../../ports/outbound';

describe('RbfrIngredientDetailService', () => {
  let service: RbfrIngredientDetailService;
  let detailRepository: jest.Mocked<RbfrIngredientDetailRepositoryPort>;

  beforeEach(async () => {
    detailRepository = {
      createCas: jest.fn(),
      listCas: jest.fn(),
      createRegulation: jest.fn(),
      listRegulations: jest.fn(),
      createCert: jest.fn(),
      listCerts: jest.fn(),
      createFlag: jest.fn(),
      listFlags: jest.fn(),
      createInteraction: jest.fn(),
      listInteractions: jest.fn(),
      createIncompat: jest.fn(),
      listIncompat: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbfrIngredientDetailService,
        { provide: RBFR_INGREDIENT_DETAIL_REPOSITORY_PORT, useValue: detailRepository },
      ],
    }).compile();

    service = module.get(RbfrIngredientDetailService);
  });

  describe('addRegulation', () => {
    it('status를 안 주면 CONFIRMED를 기본값으로 위임한다', async () => {
      await service.addRegulation(1, { countryCode: 'KR', regType: 'ALLOW' });
      expect(detailRepository.createRegulation).toHaveBeenCalledWith(
        1,
        { countryCode: 'KR', regType: 'ALLOW' },
        'CONFIRMED',
      );
    });

    it('status를 주면 그 값을 그대로 위임한다', async () => {
      await service.addRegulation(1, { countryCode: 'KR', regType: 'ALLOW', status: 'PROPOSED' });
      expect(detailRepository.createRegulation).toHaveBeenCalledWith(
        1,
        { countryCode: 'KR', regType: 'ALLOW', status: 'PROPOSED' },
        'PROPOSED',
      );
    });
  });

  describe('addInteraction', () => {
    it('입력 순서와 무관하게 ingredientAId < ingredientBId로 정규화해 저장한다', async () => {
      await service.addInteraction({
        ingredientAId: 5,
        ingredientBId: 2,
        domainCode: 'MOISTURE',
        interactionType: 'synergy',
      });
      expect(detailRepository.createInteraction).toHaveBeenCalledWith(
        expect.objectContaining({ ingredientAId: 2, ingredientBId: 5 }),
      );
    });

    it('이미 정렬된 순서면 그대로 저장한다', async () => {
      await service.addInteraction({
        ingredientAId: 2,
        ingredientBId: 5,
        domainCode: 'MOISTURE',
        interactionType: 'synergy',
      });
      expect(detailRepository.createInteraction).toHaveBeenCalledWith(
        expect.objectContaining({ ingredientAId: 2, ingredientBId: 5 }),
      );
    });

    it('동일한 원료끼리는 등록할 수 없다', async () => {
      await expect(
        service.addInteraction({ ingredientAId: 3, ingredientBId: 3, domainCode: 'MOISTURE', interactionType: 'synergy' }),
      ).rejects.toThrow();
      expect(detailRepository.createInteraction).not.toHaveBeenCalled();
    });
  });

  describe('addIncompat', () => {
    it('동일한 원료끼리는 등록할 수 없다', async () => {
      await expect(service.addIncompat({ ingredientId: 1, otherId: 1, severity: 'BLOCK' })).rejects.toThrow();
      expect(detailRepository.createIncompat).not.toHaveBeenCalled();
    });

    it('서로 다른 원료면 그대로 위임한다', async () => {
      await service.addIncompat({ ingredientId: 1, otherId: 2, severity: 'BLOCK' });
      expect(detailRepository.createIncompat).toHaveBeenCalledWith({ ingredientId: 1, otherId: 2, severity: 'BLOCK' });
    });
  });
});
