import { Inject, Injectable } from '@nestjs/common';
import type { CreateIngredientInput, IngredientSummary } from '../../domain/types';
import { RBFR_INGREDIENT_REPOSITORY_PORT, type RbfrIngredientRepositoryPort } from '../ports/outbound';
import { RBFR_FORMULA_REPOSITORY_PORT, type RbfrFormulaRepositoryPort } from '../ports/outbound';
import type { RbfrIngredientRegistrationPort } from '../ports/inbound/rbfr-ingredient-registration.port';

/**
 * 원료 등록 오케스트레이션. "활성 Profile의 직접역할 목록 조회"는 이미 RbfrFormulaRepositoryPort가
 * 갖고 있는 조회라 재사용한다(새 포트에 중복 정의하지 않는다).
 */
@Injectable()
export class RbfrIngredientRegistrationService implements RbfrIngredientRegistrationPort {
  constructor(
    @Inject(RBFR_INGREDIENT_REPOSITORY_PORT)
    private readonly ingredientRepository: RbfrIngredientRepositoryPort,
    @Inject(RBFR_FORMULA_REPOSITORY_PORT)
    private readonly formulaRepository: RbfrFormulaRepositoryPort,
  ) {}

  async listDirectDomains(profileCode: string): Promise<string[]> {
    return await this.formulaRepository.findDirectDomainCodes(profileCode);
  }

  async registerIngredient(input: CreateIngredientInput): Promise<{ ingredientId: number }> {
    const ingredientId = await this.ingredientRepository.createIngredient(input);
    return { ingredientId };
  }

  async listIngredients(): Promise<IngredientSummary[]> {
    return await this.ingredientRepository.listIngredients();
  }
}
