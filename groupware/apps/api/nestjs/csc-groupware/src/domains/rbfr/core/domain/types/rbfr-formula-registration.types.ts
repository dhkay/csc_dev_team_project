/** 처방 생성 입력. 원료 선택 + 배합비율(%)만 받는다(02_화면구성.md 탭1 "정방향 계산"의 입력부). */
export interface CreateFormulaIngredientInput {
	ingredientId: number;
	actualPct: number;
}

/**
 * 처방 생성 입력. 지금은 프로젝트 선택 화면이 없어 처방을 만들 때마다 새 프로젝트를 함께
 * 만든다(임시 단순화, 확인 필요 — 실제로는 프로젝트 하나에 여러 시안이 달리는 게 정상 구조다,
 * 03_DB스키마.md 참고).
 */
export interface CreateFormulaInput {
	projectName: string;
	formulaName: string;
	/** organization_users.id. 인증 연동 전까지 임시 고정값을 쓴다(확인 필요). */
	ownerId?: number;
	ingredients: CreateFormulaIngredientInput[];
}

export interface CreateFormulaResult {
	formulaId: number;
	projectId: number;
}
