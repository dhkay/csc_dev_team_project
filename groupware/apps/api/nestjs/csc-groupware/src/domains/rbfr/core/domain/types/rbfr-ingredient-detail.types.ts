/** 02_화면구성.md 탭3 "원료 등록/검증"의 부속 섹션(CAS/국가별 규제/인증/무첨가/원료쌍) 대상 타입. */

export interface IngredientCasInput {
	casNo: string;
	note?: string;
}

export interface IngredientCasEntry extends IngredientCasInput {
	ingredientId: number;
}

/** 사람이 직접 입력하는 값은 CONFIRMED가 기본이다. AI가 찾아온 값만 PROPOSED로 남는다(06번 문서). */
export interface IngredientRegulationInput {
	countryCode: string;
	regType: 'ALLOW' | 'BAN' | 'LIMIT' | 'COND' | 'NODATA';
	status?: 'CONFIRMED' | 'PROPOSED' | 'REJECTED';
	limitPct?: number;
	conditionTxt?: string;
	source?: string;
	sourceUrl?: string;
	note?: string;
}

export interface IngredientRegulationRecord extends Omit<IngredientRegulationInput, 'status'> {
	regId: number;
	ingredientId: number;
	status: 'CONFIRMED' | 'PROPOSED' | 'REJECTED';
	checkedAt?: string;
}

/** certCode/noaddCode는 rbfr_code_items가 관리하는 값 집합이라 여기서는 고정 enum으로 두지 않는다. */
export interface IngredientCertInput {
	certCode: string;
	isEligible: boolean;
	issuer?: string;
	certNo?: string;
	docUrl?: string;
	validUntil?: string;
	note?: string;
}

export interface IngredientCertEntry extends IngredientCertInput {
	ingredientId: number;
	checkedAt?: string;
}

export interface IngredientFlagInput {
	noaddCode: string;
}

export interface IngredientFlagEntry extends IngredientFlagInput {
	ingredientId: number;
}

/**
 * 원료쌍 조합계수. ingredientAId < ingredientBId로 정규화해 저장한다(03번 문서, (A,B)/(B,A)
 * 중복 방지). 입력 순서는 자유롭게 받고 서비스가 정렬한다.
 */
export interface IngredientInteractionInput {
	ingredientAId: number;
	ingredientBId: number;
	domainCode: string;
	interactionType: 'synergy' | 'conflict' | 'neutral' | 'unknown';
	coefficient?: number;
	confidenceLevel?: 'low' | 'medium' | 'high';
	dataSource?: 'manual_estimate' | 'lab_test' | 'literature' | 'expert_review' | 'unknown';
	notes?: string;
}

export interface IngredientInteractionEntry extends IngredientInteractionInput {
	id: number;
	coefficient: number;
	dataSource: 'manual_estimate' | 'lab_test' | 'literature' | 'expert_review' | 'unknown';
}

/** 병용 금기. BLOCK은 그 조합이 들어간 처방의 확정을 막고, WARN은 경고만 한다. */
export interface IngredientIncompatInput {
	ingredientId: number;
	otherId: number;
	severity: 'BLOCK' | 'WARN';
	reason?: string;
}

export type IngredientIncompatRecord = IngredientIncompatInput;
