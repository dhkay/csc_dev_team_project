/**
 * 8단계(관리자/검증 워크플로우) — 검수 승인(APPROVED) 시 만들어지는 버전 스냅샷(확정본).
 * 05_스코어링엔진.md 원칙7 "확정 후 불변 — 확정된 산출값은 수정하지 않는다. 새 버전(스냅샷)을
 * 만든다"의 실제 구현이다. Cell 변환은 그 시점에 승인된 Cell 규칙 판(가장 최근 승인분)을
 * 쓴다 — 승인된 판이 없는 Profile은 확정할 수 없다(03/05번 문서 "승인된 판만 실제 계산에
 * 쓴다"와 일관).
 */

/** rbfr_version_recipe 한 줄을 만들기 전, 원자재 소스 데이터(가공 전). */
export interface VersionRecipeSourceLine {
	ingredientId: number;
	inciName: string;
	nameKo?: string;
	phase?: string;
	/** 실제 배합비(%). */
	pct: number;
	/** 가장 최근 단가(원/단위). 없으면 undefined. */
	unitPrice?: number;
}

/** rbfr_formula_ratios에서 읽은 목표 비중(가공 전). */
export interface FormulaTargetRatio {
	domainCode: string;
	targetRatio: number;
	isMain: boolean;
}

/** 확정 시 실제로 만들어지는 배합표 한 줄(그램 계산 후). */
export interface VersionRecipeLine extends VersionRecipeSourceLine {
	grams: number;
}

/** 확정 시 실제로 만들어지는 역할비율 한 줄(Cell 변환 후). */
export interface VersionRatioLine {
	domainCode: string;
	targetRatio: number;
	resultRatio: number;
	cellCount: number;
	isMain: boolean;
}

export interface CreateFormulaVersionInput {
	formulaId: number;
	versionNo: number;
	fixedBy: number;
	appVersion: string;
	ruleVersion: string;
	batchSize: number;
	totalCells: number;
	totalCost: number;
	snapshotJson: string;
	recipeLines: VersionRecipeLine[];
	ratioLines: VersionRatioLine[];
}

export interface FormulaVersionSummary {
	id: number;
	formulaId: number;
	versionNo: number;
	fixedAt: string;
	fixedBy: number;
	appVersion: string;
	ruleVersion?: string;
	batchSize: number;
	totalCells?: number;
	totalCost?: number;
}
