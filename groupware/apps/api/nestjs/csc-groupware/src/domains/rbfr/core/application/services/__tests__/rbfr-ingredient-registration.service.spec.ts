import { Test, TestingModule } from '@nestjs/testing';
import { RbfrIngredientRegistrationService } from '../rbfr-ingredient-registration.service';
import { RBFR_INGREDIENT_REPOSITORY_PORT } from '../../ports/outbound';
import { RBFR_FORMULA_REPOSITORY_PORT } from '../../ports/outbound';
import { createRbfrFormulaRepositoryMock } from '../../../../__mocks__/rbfr-formula-repository.mock';
import type { RbfrFormulaRepositoryPort, RbfrIngredientRepositoryPort } from '../../ports/outbound';

describe('RbfrIngredientRegistrationService', () => {
  let service: RbfrIngredientRegistrationService;
  let ingredientRepository: jest.Mocked<RbfrIngredientRepositoryPort>;
  let formulaRepository: jest.Mocked<RbfrFormulaRepositoryPort>;

  beforeEach(async () => {
    ingredientRepository = {
      createIngredient: jest.fn(),
      listIngredients: jest.fn(),
      upsertDictionaryEntries: jest.fn(),
      findIngredientsForRecommendation: jest.fn(),
    };
    formulaRepository = createRbfrFormulaRepositoryMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbfrIngredientRegistrationService,
        { provide: RBFR_INGREDIENT_REPOSITORY_PORT, useValue: ingredientRepository },
        { provide: RBFR_FORMULA_REPOSITORY_PORT, useValue: formulaRepository },
      ],
    }).compile();

    service = module.get(RbfrIngredientRegistrationService);
  });

  it('listDirectDomains는 formulaRepository의 findDirectDomainCodes를 그대로 위임한다', async () => {
    formulaRepository.findDirectDomainCodes.mockResolvedValueOnce(['MOISTURE', 'SOOTHING']);
    const result = await service.listDirectDomains('SKIN');
    expect(result).toEqual(['MOISTURE', 'SOOTHING']);
    expect(formulaRepository.findDirectDomainCodes).toHaveBeenCalledWith('SKIN');
  });

  it('registerIngredient은 새 ingredientId를 봉투에 담아 돌려준다', async () => {
    ingredientRepository.createIngredient.mockResolvedValueOnce(42);
    const result = await service.registerIngredient({
      inciName: 'Test Ingredient',
      nameKo: '테스트 원료',
      contributions: [{ domainCode: 'MOISTURE', contribution: 80 }],
    });
    expect(result).toEqual({ ingredientId: 42 });
  });
});
