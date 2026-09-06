/** 02_화면구성.md 탭2 "역방향 추천" 입력. 역할 도메인별 목표 비중(%), 합 100. */
export interface TargetRatioInput {
	domainCode: string;
	targetPercent: number;
}

/** 추천 원료 후보. proximityPercent가 높을수록 목표 비중에 가깝다. */
export interface IngredientRecommendation {
	ingredientId: number;
	nameKo: string;
	inciName: string;
	proximityPercent: number;
}

/**
 * 추천에서 제외된 원료. BAN(규제 금지)/NODATA(확정 규제 데이터 없음)를 구분해 알린다 —
 * "허용 안 된 것처럼 조용히 빼지 않는다"(02번 문서, 05번 원칙4와 같은 종류의 원칙).
 */
export interface ExcludedIngredient {
	ingredientId: number;
	nameKo: string;
	reason: 'BAN' | 'NODATA';
}

export interface RecommendIngredientsResult {
	recommendations: IngredientRecommendation[];
	excluded: ExcludedIngredient[];
}

/** Outbound 조회 결과 원자료(순위 계산 전). */
export interface IngredientRecommendationCandidate {
	ingredientId: number;
	nameKo: string;
	inciName: string;
	/** domainCode → contribution(0~100). 값이 없는 도메인은 이 맵에 없다(0으로 취급). */
	contributions: Record<string, number>;
	hasBanRegulation: boolean;
	hasAnyConfirmedRegulation: boolean;
}
