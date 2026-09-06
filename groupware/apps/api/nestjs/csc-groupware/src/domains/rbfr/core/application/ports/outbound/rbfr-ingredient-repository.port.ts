import type {
  CreateIngredientInput,
  IngredientRecommendationCandidate,
  IngredientSummary,
  MfdsIngredientRecord,
} from '../../../domain/types';

/** 원료 등록(쓰기) + 목록 조회 Outbound Port. 계산·검증용 조회는 RbfrFormulaRepositoryPort가 담당한다. */
export interface RbfrIngredientRepositoryPort {
  /** rbfr_ingredients 한 행 + rbfr_ingredient_roles(직접역할 기여도)를 함께 생성하고 새 id를 돌려준다. */
  createIngredient(input: CreateIngredientInput): Promise<number>;
  /** 처방 생성 화면 등에서 원료를 고를 때 쓰는 최소 목록. */
  listIngredients(): Promise<IngredientSummary[]>;
  /** F-92 사전 동기화: rbfr_ingredient_dictionary에 upsert(name_ko 기준). */
  upsertDictionaryEntries(entries: MfdsIngredientRecord[]): Promise<number>;
  /** 역방향 추천용 원자료: 활성 원료마다 지정 도메인 기여도 + 규제 확정 상태. */
  findIngredientsForRecommendation(domainCodes: string[]): Promise<IngredientRecommendationCandidate[]>;
}

export const RBFR_INGREDIENT_REPOSITORY_PORT = Symbol('RBFR_INGREDIENT_REPOSITORY_PORT');
