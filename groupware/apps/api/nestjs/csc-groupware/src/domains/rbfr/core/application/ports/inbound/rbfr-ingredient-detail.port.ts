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

/** 02_화면구성.md 탭3 부속 섹션(CAS/국가별 규제/인증/무첨가/원료쌍)이 호출하는 진입점. */
export interface RbfrIngredientDetailPort {
  addCas(ingredientId: number, input: IngredientCasInput): Promise<void>;
  listCas(ingredientId: number): Promise<IngredientCasEntry[]>;

  addRegulation(ingredientId: number, input: IngredientRegulationInput): Promise<IngredientRegulationRecord>;
  listRegulations(ingredientId: number): Promise<IngredientRegulationRecord[]>;

  addCert(ingredientId: number, input: IngredientCertInput): Promise<void>;
  listCerts(ingredientId: number): Promise<IngredientCertEntry[]>;

  addFlag(ingredientId: number, input: IngredientFlagInput): Promise<void>;
  listFlags(ingredientId: number): Promise<IngredientFlagEntry[]>;

  /** 동일 원료끼리는 등록할 수 없고, 입력 순서와 무관하게 A<B로 정규화해 저장한다. */
  addInteraction(input: IngredientInteractionInput): Promise<IngredientInteractionEntry>;
  listInteractions(ingredientId: number): Promise<IngredientInteractionEntry[]>;

  addIncompat(input: IngredientIncompatInput): Promise<void>;
  listIncompat(ingredientId: number): Promise<IngredientIncompatRecord[]>;
}

export const RBFR_INGREDIENT_DETAIL_PORT = Symbol('RBFR_INGREDIENT_DETAIL_PORT');
