/** rbfr_ingredient_roles 한 행 입력. 통합역할(균형) 대상이면 evidence가 필요하다(05번 원칙5). */
export interface RoleContributionInput {
	domainCode: string;
	contribution: number;
	evidence?: string;
}

/** 원료 선택 목록(처방 생성 화면 등에서 사용). */
export interface IngredientSummary {
	id: number;
	nameKo: string;
	inciName: string;
}

/** rbfr_ingredients 신규 등록 입력. 02_화면구성.md 탭3 "원료 기본정보" + "직접 역할 기여도"에 대응. */
export interface CreateIngredientInput {
	inciName: string;
	nameKo: string;
	category?: string;
	concMin?: number;
	concMax?: number;
	phMin?: number;
	phMax?: number;
	hlb?: number;
	emulsionRole?: string;
	solubility?: string;
	isBase?: boolean;
	createdBy?: number;
	/** 직접역할 4개 기여도만 받는다 — 통합역할(균형)은 원료 단위로 입력하지 않는다(05번 원칙5). */
	contributions: RoleContributionInput[];
}
