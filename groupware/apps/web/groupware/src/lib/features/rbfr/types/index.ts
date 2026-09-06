// RBFR 처방 계산·검증 응답 타입: csc-groupware RbfrFormulaCalculationPort 결과와 대응
// (apps/api/nestjs/csc-groupware/src/domains/rbfr/core/domain/types).

export interface DirectRoleEfficacyResult {
	domainCode: string;
	baseValue: number;
	combinationCoefficient: number;
	concentrationFactor: number;
	stabilityFactor: number;
	finalValue: number;
}

export interface RatioResult {
	domainCode: string;
	efficacy: number;
	ratioPercent: number;
}

export type ValidationSeverity = 'ok' | 'warn' | 'block';

export interface ValidationIssue {
	code: string;
	severity: ValidationSeverity;
	message: string;
}

export interface HlbResult {
	status: 'ok' | 'unstable' | 'unknown';
	requiredHlb?: number;
	mixedHlb?: number;
	message: string;
}

export interface FormulaValidationResult {
	issues: ValidationIssue[];
	canConfirm: boolean;
	hlb: HlbResult;
	cost: number;
}

export interface FormulaCalculationResult {
	directResults: DirectRoleEfficacyResult[];
	ratios: RatioResult[];
	validation: FormulaValidationResult;
}

// 원료 등록(탭3) 관련 타입: csc-groupware CreateIngredientDto와 대응.

export interface RoleContributionInput {
	domainCode: string;
	contribution: number;
	evidence?: string;
}

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
	contributions: RoleContributionInput[];
}

export interface CreateIngredientResult {
	ingredientId: number;
}

export interface IngredientSummary {
	id: number;
	nameKo: string;
	inciName: string;
}

// 처방 생성(탭1) 관련 타입: csc-groupware CreateFormulaDto와 대응.

export interface CreateFormulaIngredientInput {
	ingredientId: number;
	actualPct: number;
}

export interface CreateFormulaInput {
	projectName: string;
	formulaName: string;
	ingredients: CreateFormulaIngredientInput[];
}

export interface CreateFormulaResult {
	formulaId: number;
	projectId: number;
}

// 역방향 추천(탭2) 관련 타입: csc-groupware RecommendIngredientsDto/결과와 대응.

export interface TargetRatioInput {
	domainCode: string;
	targetPercent: number;
}

export interface IngredientRecommendation {
	ingredientId: number;
	nameKo: string;
	inciName: string;
	proximityPercent: number;
}

export interface ExcludedIngredient {
	ingredientId: number;
	nameKo: string;
	reason: 'BAN' | 'NODATA';
}

export interface RecommendIngredientsResult {
	recommendations: IngredientRecommendation[];
	excluded: ExcludedIngredient[];
}

// 설정(Profile 관리, ADMIN 전용) 관련 타입: csc-groupware RbfrSettingsPort 결과와 대응.

export interface ProfileSummary {
	profileCode: string;
	nameKo: string;
	nameEn?: string;
	profileType: 'PRIMARY' | 'CROSS';
	sortOrder: number;
	description?: string;
	isActive: boolean;
}

export interface RoleDomainSummary {
	domainCode: string;
	profileCode: string;
	nameKo: string;
	nameEn?: string;
	domainType: 'DIRECT' | 'INTEGRATED';
	sortOrder: number;
	description?: string;
	isActive: boolean;
}

export interface CreateProfileRoleInput {
	domainCode: string;
	nameKo: string;
	nameEn?: string;
	domainType: 'DIRECT' | 'INTEGRATED';
}

export interface CreateProfileInput {
	profileCode: string;
	nameKo: string;
	nameEn?: string;
	profileType: 'PRIMARY' | 'CROSS';
	description?: string;
	roles: CreateProfileRoleInput[];
}

export interface CreateProfileResult {
	profileCode: string;
	ruleVersion: string;
	anglePerDomain: number;
}

export interface CellRuleLimitSummary {
	ruleVersion: string;
	profileCode: string;
	totalMin: number;
	totalMax: number;
	fillDirection: 'CCW' | 'CW';
	startCell: number;
	isApproved: boolean;
	approvedBy?: string;
	approvedAt?: string;
	note?: string;
}

export interface CellMappingEntry {
	ratioFrom: number;
	ratioTo: number;
	cellCount: number;
}

export interface CellMappingRow extends CellMappingEntry {
	ruleVersion: string;
}

// 원료 등록(탭3) 부속 섹션 관련 타입: csc-groupware RbfrIngredientDetailPort 결과와 대응.

export interface IngredientCasInput {
	casNo: string;
	note?: string;
}

export interface IngredientCasEntry extends IngredientCasInput {
	ingredientId: number;
}

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

export interface IngredientIncompatInput {
	ingredientId: number;
	otherId: number;
	severity: 'BLOCK' | 'WARN';
	reason?: string;
}

export type IngredientIncompatRecord = IngredientIncompatInput;

// 처방 사용감·안정성 기록(탭1 부속) 관련 타입: csc-groupware RbfrFormulaSensoryStabilityPort와 대응.

export interface FormulaSensoryStabilityInput {
	stickinessScore?: number;
	freshnessScore?: number;
	absorptionScore?: number;
	spreadabilityScore?: number;
	afterfeelScore?: number;
	viscosityScore?: number;
	separationRisk?: '상' | '중' | '하';
	precipitationRisk?: '상' | '중' | '하';
	colorChangeRisk?: '상' | '중' | '하';
	odorChangeRisk?: '상' | '중' | '하';
	phStabilityScore?: number;
	heatStabilityScore?: number;
	lowTempStabilityScore?: number;
	overallStabilityScore?: number;
	testCondition?: string;
	dataSource?: 'manual_estimate' | 'lab_test' | 'literature' | 'expert_review' | 'unknown';
	confidenceLevel?: 'low' | 'medium' | 'high';
	notes?: string;
}

export interface FormulaSensoryStabilityRecord extends FormulaSensoryStabilityInput {
	id: number;
	formulaId: number;
	dataSource: 'manual_estimate' | 'lab_test' | 'literature' | 'expert_review' | 'unknown';
	createdAt: string;
}

// 8단계(검수 워크플로우) 관련 타입: csc-groupware RbfrFormulaReviewPort 결과와 대응.

export interface FormulaReviewSummary {
	id: number;
	formulaId: number;
	requestedBy: number;
	reviewerId?: number;
	status: 'PENDING' | 'REVIEWING' | 'APPROVED' | 'CHANGES' | 'REJECTED';
	comment?: string;
	requestedAt: string;
	decidedAt?: string;
}

/** 검수 승인 시 만들어지는 확정 버전 스냅샷 요약(05번 문서 "확정 후 불변"). */
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
