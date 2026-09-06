/**
 * 역방향 추천 — 02_화면구성.md 탭2. 목표 역할 비중(%)을 입력받아 그 구성비에 가장 가까운
 * 원료 상위 10개를 추천한다. BAN(규제 금지)/NODATA(확정 규제 데이터 없음)는 "허용된 것처럼
 * 조용히 빼지 않고" 별도 목록으로 알린다(05번 원칙4와 같은 종류의 원칙).
 */
import { Inject, Injectable } from '@nestjs/common';
import type {
  ExcludedIngredient,
  IngredientRecommendation,
  IngredientRecommendationCandidate,
  RecommendIngredientsResult,
  TargetRatioInput,
} from '../../domain/types';
import type { RbfrRecommendationPort } from '../ports/inbound';
import { RBFR_INGREDIENT_REPOSITORY_PORT, type RbfrIngredientRepositoryPort } from '../ports/outbound';
import { clamp0to100 } from './rbfr-scoring.service';

const TOP_N = 10;

/** 벡터를 합 100으로 정규화한다. 합이 0 이하면(기여도 데이터 없음) 전부 0으로 둔다. */
export function normalizeVector(values: number[]): number[] {
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return values.map(() => 0);
  return values.map((v) => (v / total) * 100);
}

/**
 * 목표 비중과 원료 기여도 벡터 사이의 근접도(0~100). Total Variation Distance 기반으로,
 * 두 분포 차이 절대값 합의 절반을 100에서 뺀다. 값이 클수록 목표 구성비에 가깝다.
 */
export function calculateProximity(
  targetRatios: TargetRatioInput[],
  candidate: IngredientRecommendationCandidate,
): number {
  const targetVector = targetRatios.map((t) => clamp0to100(t.targetPercent));
  const rawContribution = targetRatios.map((t) => candidate.contributions[t.domainCode] ?? 0);
  const normalizedContribution = normalizeVector(rawContribution);

  const totalVariation = targetVector.reduce(
    (sum, target, i) => sum + Math.abs(target - normalizedContribution[i]),
    0,
  );
  return clamp0to100(100 - totalVariation / 2);
}

@Injectable()
export class RbfrRecommendationService implements RbfrRecommendationPort {
  constructor(
    @Inject(RBFR_INGREDIENT_REPOSITORY_PORT)
    private readonly ingredientRepository: RbfrIngredientRepositoryPort,
  ) {}

  async recommendIngredients(targetRatios: TargetRatioInput[]): Promise<RecommendIngredientsResult> {
    const domainCodes = targetRatios.map((t) => t.domainCode);
    const candidates = await this.ingredientRepository.findIngredientsForRecommendation(domainCodes);

    const excluded: ExcludedIngredient[] = [];
    const recommendations: IngredientRecommendation[] = [];

    for (const candidate of candidates) {
      if (candidate.hasBanRegulation) {
        excluded.push({ ingredientId: candidate.ingredientId, nameKo: candidate.nameKo, reason: 'BAN' });
        continue;
      }
      if (!candidate.hasAnyConfirmedRegulation) {
        excluded.push({ ingredientId: candidate.ingredientId, nameKo: candidate.nameKo, reason: 'NODATA' });
        continue;
      }
      recommendations.push({
        ingredientId: candidate.ingredientId,
        nameKo: candidate.nameKo,
        inciName: candidate.inciName,
        proximityPercent: calculateProximity(targetRatios, candidate),
      });
    }

    recommendations.sort((a, b) => b.proximityPercent - a.proximityPercent);
    return { recommendations: recommendations.slice(0, TOP_N), excluded };
  }
}
