import type {
  IngredientCasEntry,
  IngredientCasInput,
  IngredientCertEntry,
  IngredientCertInput,
  IngredientFlagEntry,
  IngredientFlagInput,
  IngredientIncompatRecord,
  IngredientIncompatInput,
  IngredientInteractionEntry,
  IngredientInteractionInput,
  IngredientRegulationRecord,
  IngredientRegulationInput,
} from '../../../domain/types';

/** 원료 등록 화면의 부속 섹션(CAS/국가별 규제/인증/무첨가/원료쌍) Outbound Port. */
export interface RbfrIngredientDetailRepositoryPort {
  createCas(ingredientId: number, input: IngredientCasInput): Promise<void>;
  listCas(ingredientId: number): Promise<IngredientCasEntry[]>;

  createRegulation(
    ingredientId: number,
    input: IngredientRegulationInput,
    status: 'CONFIRMED' | 'PROPOSED' | 'REJECTED',
  ): Promise<IngredientRegulationRecord>;
  listRegulations(ingredientId: number): Promise<IngredientRegulationRecord[]>;

  createCert(ingredientId: number, input: IngredientCertInput): Promise<void>;
  listCerts(ingredientId: number): Promise<IngredientCertEntry[]>;

  createFlag(ingredientId: number, input: IngredientFlagInput): Promise<void>;
  listFlags(ingredientId: number): Promise<IngredientFlagEntry[]>;

  /** ingredientAId/ingredientBId는 이미 정규화(A<B)된 상태로 들어온다. */
  createInteraction(input: IngredientInteractionInput): Promise<IngredientInteractionEntry>;
  listInteractions(ingredientId: number): Promise<IngredientInteractionEntry[]>;

  createIncompat(input: IngredientIncompatInput): Promise<void>;
  /** ingredientId가 ingredient_id/other_id 어느 쪽에 있어도 찾도록 양방향 검색한다(03번 문서). */
  listIncompat(ingredientId: number): Promise<IngredientIncompatRecord[]>;
}

export const RBFR_INGREDIENT_DETAIL_REPOSITORY_PORT = Symbol('RBFR_INGREDIENT_DETAIL_REPOSITORY_PORT');
