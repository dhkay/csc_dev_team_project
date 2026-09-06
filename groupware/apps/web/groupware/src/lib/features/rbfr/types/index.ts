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
