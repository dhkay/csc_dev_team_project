/**
 * 원료 등록 화면(탭3)의 부속 섹션 — CAS/국가별 규제/인증/무첨가 분류/원료쌍(조합계수·병용금기).
 * 국가별 규제는 사람이 직접 입력하는 값이라 status 기본값을 CONFIRMED로 둔다(06번 문서:
 * PROPOSED는 AI 제안 전용). 원료쌍 조합계수는 (A,B)/(B,A) 중복을 막기 위해 항상
 * ingredientAId < ingredientBId로 정규화해 저장한다(03번 문서).
 */
import { Inject, Injectable } from '@nestjs/common';
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
} from '../../domain/types';
import type { RbfrIngredientDetailPort } from '../ports/inbound';
import {
  RBFR_INGREDIENT_DETAIL_REPOSITORY_PORT,
  type RbfrIngredientDetailRepositoryPort,
} from '../ports/outbound';

@Injectable()
export class RbfrIngredientDetailService implements RbfrIngredientDetailPort {
  constructor(
    @Inject(RBFR_INGREDIENT_DETAIL_REPOSITORY_PORT)
    private readonly detailRepository: RbfrIngredientDetailRepositoryPort,
  ) {}

  async addCas(ingredientId: number, input: IngredientCasInput): Promise<void> {
    await this.detailRepository.createCas(ingredientId, input);
  }

  async listCas(ingredientId: number): Promise<IngredientCasEntry[]> {
    return await this.detailRepository.listCas(ingredientId);
  }

  async addRegulation(ingredientId: number, input: IngredientRegulationInput): Promise<IngredientRegulationRecord> {
    return await this.detailRepository.createRegulation(ingredientId, input, input.status ?? 'CONFIRMED');
  }

  async listRegulations(ingredientId: number): Promise<IngredientRegulationRecord[]> {
    return await this.detailRepository.listRegulations(ingredientId);
  }

  async addCert(ingredientId: number, input: IngredientCertInput): Promise<void> {
    await this.detailRepository.createCert(ingredientId, input);
  }

  async listCerts(ingredientId: number): Promise<IngredientCertEntry[]> {
    return await this.detailRepository.listCerts(ingredientId);
  }

  async addFlag(ingredientId: number, input: IngredientFlagInput): Promise<void> {
    await this.detailRepository.createFlag(ingredientId, input);
  }

  async listFlags(ingredientId: number): Promise<IngredientFlagEntry[]> {
    return await this.detailRepository.listFlags(ingredientId);
  }

  async addInteraction(input: IngredientInteractionInput): Promise<IngredientInteractionEntry> {
    if (input.ingredientAId === input.ingredientBId) {
      throw new Error('동일한 원료끼리는 조합계수를 등록할 수 없습니다.');
    }
    const [ingredientAId, ingredientBId] =
      input.ingredientAId < input.ingredientBId
        ? [input.ingredientAId, input.ingredientBId]
        : [input.ingredientBId, input.ingredientAId];

    return await this.detailRepository.createInteraction({ ...input, ingredientAId, ingredientBId });
  }

  async listInteractions(ingredientId: number): Promise<IngredientInteractionEntry[]> {
    return await this.detailRepository.listInteractions(ingredientId);
  }

  async addIncompat(input: IngredientIncompatInput): Promise<void> {
    if (input.ingredientId === input.otherId) {
      throw new Error('동일한 원료끼리는 병용금기를 등록할 수 없습니다.');
    }
    await this.detailRepository.createIncompat(input);
  }

  async listIncompat(ingredientId: number): Promise<IngredientIncompatRecord[]> {
    return await this.detailRepository.listIncompat(ingredientId);
  }
}
