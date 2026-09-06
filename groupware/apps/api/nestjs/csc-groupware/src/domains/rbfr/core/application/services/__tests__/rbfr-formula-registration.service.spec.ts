import { Test, TestingModule } from '@nestjs/testing';
import { RbfrFormulaRegistrationService } from '../rbfr-formula-registration.service';
import { RBFR_FORMULA_REGISTRATION_REPOSITORY_PORT } from '../../ports/outbound';
import type { RbfrFormulaRegistrationRepositoryPort } from '../../ports/outbound';

describe('RbfrFormulaRegistrationService', () => {
  let service: RbfrFormulaRegistrationService;
  let repository: jest.Mocked<RbfrFormulaRegistrationRepositoryPort>;

  beforeEach(async () => {
    repository = { createFormula: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbfrFormulaRegistrationService,
        { provide: RBFR_FORMULA_REGISTRATION_REPOSITORY_PORT, useValue: repository },
      ],
    }).compile();

    service = module.get(RbfrFormulaRegistrationService);
  });

  it('createFormula는 repository 결과를 그대로 돌려준다', async () => {
    repository.createFormula.mockResolvedValueOnce({ formulaId: 10, projectId: 5 });

    const result = await service.createFormula({
      projectName: '테스트 프로젝트',
      formulaName: '테스트 처방',
      ingredients: [{ ingredientId: 1, actualPct: 100 }],
    });

    expect(result).toEqual({ formulaId: 10, projectId: 5 });
    expect(repository.createFormula).toHaveBeenCalledWith(
      expect.objectContaining({ projectName: '테스트 프로젝트' }),
    );
  });
});
