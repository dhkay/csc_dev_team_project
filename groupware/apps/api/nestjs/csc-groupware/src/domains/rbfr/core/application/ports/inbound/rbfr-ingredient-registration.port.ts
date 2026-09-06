import type { CreateIngredientInput, IngredientSummary } from '../../../domain/types';

/** 02_화면구성.md 탭3 "원료 등록/검증" 화면(DATA 권한)이 호출하는 진입점. */
export interface RbfrIngredientRegistrationPort {
  /** 등록 폼이 보여줄 직접역할 목록(활성 Profile 기준). */
  listDirectDomains(profileCode: string): Promise<string[]>;
  registerIngredient(input: CreateIngredientInput): Promise<{ ingredientId: number }>;
  /** 처방 생성 화면 등에서 원료를 고를 때 쓰는 최소 목록. */
  listIngredients(): Promise<IngredientSummary[]>;
}

export const RBFR_INGREDIENT_REGISTRATION_PORT = Symbol('RBFR_INGREDIENT_REGISTRATION_PORT');
