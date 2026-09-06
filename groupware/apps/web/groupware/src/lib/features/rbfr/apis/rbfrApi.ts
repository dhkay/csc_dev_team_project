// RBFR 데이터 접근(브라우저): 같은 origin BFF(/api/rbfr/...)만 frontClient 로 호출
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import { run, type ApiResult } from '$lib/infrastructure/http/apiResult';
import type {
	CellMappingEntry,
	CellMappingRow,
	CellRuleLimitSummary,
	CreateFormulaInput,
	CreateFormulaResult,
	CreateIngredientInput,
	CreateIngredientResult,
	CreateProfileInput,
	CreateProfileResult,
	FormulaCalculationResult,
	FormulaReviewSummary,
	FormulaSensoryStabilityInput,
	FormulaSensoryStabilityRecord,
	FormulaVersionSummary,
	IngredientCasEntry,
	IngredientCasInput,
	IngredientCertEntry,
	IngredientCertInput,
	IngredientFlagEntry,
	IngredientFlagInput,
	IngredientIncompatInput,
	IngredientIncompatRecord,
	IngredientInteractionEntry,
	IngredientInteractionInput,
	IngredientRegulationInput,
	IngredientRegulationRecord,
	IngredientSummary,
	ProfileSummary,
	RecommendIngredientsResult,
	RoleDomainSummary,
	TargetRatioInput
} from '../types';

export function calculateFormula(
	formulaId: number,
	profileCode: string
): Promise<ApiResult<FormulaCalculationResult>> {
	return run<FormulaCalculationResult>(() =>
		frontClient().GET(ROUTES.RBFR.calculateFormula(formulaId, profileCode))
	);
}

export function listDirectDomains(profileCode: string): Promise<ApiResult<string[]>> {
	return run<string[]>(() => frontClient().GET(ROUTES.RBFR.directDomains(profileCode)));
}

export function registerIngredient(
	input: CreateIngredientInput
): Promise<ApiResult<CreateIngredientResult>> {
	return run<CreateIngredientResult>(() => frontClient().POST(ROUTES.RBFR.INGREDIENTS, input));
}

export function listIngredients(): Promise<ApiResult<IngredientSummary[]>> {
	return run<IngredientSummary[]>(() => frontClient().GET(ROUTES.RBFR.INGREDIENTS));
}

export function createFormula(input: CreateFormulaInput): Promise<ApiResult<CreateFormulaResult>> {
	return run<CreateFormulaResult>(() => frontClient().POST(ROUTES.RBFR.FORMULAS, input));
}

export function recommendIngredients(
	targetRatios: TargetRatioInput[]
): Promise<ApiResult<RecommendIngredientsResult>> {
	return run<RecommendIngredientsResult>(() =>
		frontClient().POST(ROUTES.RBFR.RECOMMENDATIONS, { targetRatios })
	);
}

export function listProfiles(): Promise<ApiResult<ProfileSummary[]>> {
	return run<ProfileSummary[]>(() => frontClient().GET(ROUTES.RBFR.PROFILES));
}

export function listRoleDomains(profileCode: string): Promise<ApiResult<RoleDomainSummary[]>> {
	return run<RoleDomainSummary[]>(() => frontClient().GET(ROUTES.RBFR.roleDomains(profileCode)));
}

export function createProfile(input: CreateProfileInput): Promise<ApiResult<CreateProfileResult>> {
	return run<CreateProfileResult>(() => frontClient().POST(ROUTES.RBFR.PROFILES, input));
}

export function listCellRuleLimits(profileCode: string): Promise<ApiResult<CellRuleLimitSummary[]>> {
	return run<CellRuleLimitSummary[]>(() => frontClient().GET(ROUTES.RBFR.cellRuleLimits(profileCode)));
}

export function approveCellRuleLimit(
	ruleVersion: string,
	approvedBy: string
): Promise<ApiResult<{ ruleVersion: string; approved: boolean }>> {
	return run<{ ruleVersion: string; approved: boolean }>(() =>
		frontClient().POST(ROUTES.RBFR.approveCellRuleLimit(ruleVersion), { approvedBy })
	);
}

export function setProfileActive(
	profileCode: string,
	isActive: boolean
): Promise<ApiResult<{ profileCode: string; isActive: boolean }>> {
	return run<{ profileCode: string; isActive: boolean }>(() =>
		frontClient().PATCH(ROUTES.RBFR.setProfileActive(profileCode), { isActive })
	);
}

export function listCellMapping(ruleVersion: string): Promise<ApiResult<CellMappingRow[]>> {
	return run<CellMappingRow[]>(() => frontClient().GET(ROUTES.RBFR.cellMapping(ruleVersion)));
}

export function setCellMapping(
	ruleVersion: string,
	entries: CellMappingEntry[]
): Promise<ApiResult<{ ruleVersion: string; count: number }>> {
	return run<{ ruleVersion: string; count: number }>(() =>
		frontClient().PUT(ROUTES.RBFR.cellMapping(ruleVersion), { entries })
	);
}

export function addIngredientCas(
	ingredientId: number,
	input: IngredientCasInput
): Promise<ApiResult<{ ingredientId: number }>> {
	return run<{ ingredientId: number }>(() =>
		frontClient().POST(ROUTES.RBFR.ingredientCas(ingredientId), input)
	);
}

export function listIngredientCas(ingredientId: number): Promise<ApiResult<IngredientCasEntry[]>> {
	return run<IngredientCasEntry[]>(() => frontClient().GET(ROUTES.RBFR.ingredientCas(ingredientId)));
}

export function addIngredientRegulation(
	ingredientId: number,
	input: IngredientRegulationInput
): Promise<ApiResult<IngredientRegulationRecord>> {
	return run<IngredientRegulationRecord>(() =>
		frontClient().POST(ROUTES.RBFR.ingredientRegulations(ingredientId), input)
	);
}

export function listIngredientRegulations(
	ingredientId: number
): Promise<ApiResult<IngredientRegulationRecord[]>> {
	return run<IngredientRegulationRecord[]>(() =>
		frontClient().GET(ROUTES.RBFR.ingredientRegulations(ingredientId))
	);
}

export function addIngredientCert(
	ingredientId: number,
	input: IngredientCertInput
): Promise<ApiResult<{ ingredientId: number }>> {
	return run<{ ingredientId: number }>(() =>
		frontClient().POST(ROUTES.RBFR.ingredientCerts(ingredientId), input)
	);
}

export function listIngredientCerts(ingredientId: number): Promise<ApiResult<IngredientCertEntry[]>> {
	return run<IngredientCertEntry[]>(() => frontClient().GET(ROUTES.RBFR.ingredientCerts(ingredientId)));
}

export function addIngredientFlag(
	ingredientId: number,
	input: IngredientFlagInput
): Promise<ApiResult<{ ingredientId: number }>> {
	return run<{ ingredientId: number }>(() =>
		frontClient().POST(ROUTES.RBFR.ingredientFlags(ingredientId), input)
	);
}

export function listIngredientFlags(ingredientId: number): Promise<ApiResult<IngredientFlagEntry[]>> {
	return run<IngredientFlagEntry[]>(() => frontClient().GET(ROUTES.RBFR.ingredientFlags(ingredientId)));
}

export function addIngredientInteraction(
	input: IngredientInteractionInput
): Promise<ApiResult<IngredientInteractionEntry>> {
	return run<IngredientInteractionEntry>(() =>
		frontClient().POST(ROUTES.RBFR.ingredientInteractions(), input)
	);
}

export function listIngredientInteractions(
	ingredientId: number
): Promise<ApiResult<IngredientInteractionEntry[]>> {
	return run<IngredientInteractionEntry[]>(() =>
		frontClient().GET(ROUTES.RBFR.ingredientInteractions(ingredientId))
	);
}

export function addIngredientIncompat(
	input: IngredientIncompatInput
): Promise<ApiResult<{ ingredientId: number; otherId: number }>> {
	return run<{ ingredientId: number; otherId: number }>(() =>
		frontClient().POST(ROUTES.RBFR.ingredientIncompat(), input)
	);
}

export function listIngredientIncompat(
	ingredientId: number
): Promise<ApiResult<IngredientIncompatRecord[]>> {
	return run<IngredientIncompatRecord[]>(() =>
		frontClient().GET(ROUTES.RBFR.ingredientIncompat(ingredientId))
	);
}

export function addSensoryStabilityRecord(
	formulaId: number,
	input: FormulaSensoryStabilityInput
): Promise<ApiResult<FormulaSensoryStabilityRecord>> {
	return run<FormulaSensoryStabilityRecord>(() =>
		frontClient().POST(ROUTES.RBFR.sensoryStability(formulaId), input)
	);
}

export function listSensoryStabilityRecords(
	formulaId: number
): Promise<ApiResult<FormulaSensoryStabilityRecord[]>> {
	return run<FormulaSensoryStabilityRecord[]>(() =>
		frontClient().GET(ROUTES.RBFR.sensoryStability(formulaId))
	);
}

export function requestReview(
	formulaId: number,
	requestedBy: number
): Promise<ApiResult<FormulaReviewSummary>> {
	return run<FormulaReviewSummary>(() =>
		frontClient().POST(ROUTES.RBFR.formulaReviews(formulaId), { requestedBy })
	);
}

export function listFormulaReviews(formulaId: number): Promise<ApiResult<FormulaReviewSummary[]>> {
	return run<FormulaReviewSummary[]>(() => frontClient().GET(ROUTES.RBFR.formulaReviews(formulaId)));
}

export function listPendingReviews(): Promise<ApiResult<FormulaReviewSummary[]>> {
	return run<FormulaReviewSummary[]>(() => frontClient().GET(ROUTES.RBFR.PENDING_REVIEWS));
}

export function listMyAssignedReviews(reviewerId: number): Promise<ApiResult<FormulaReviewSummary[]>> {
	return run<FormulaReviewSummary[]>(() => frontClient().GET(ROUTES.RBFR.myAssignedReviews(reviewerId)));
}

export function pickupReview(reviewId: number, reviewerId: number): Promise<ApiResult<FormulaReviewSummary>> {
	return run<FormulaReviewSummary>(() =>
		frontClient().POST(ROUTES.RBFR.pickupReview(reviewId), { reviewerId })
	);
}

export function decideReview(
	reviewId: number,
	decision: 'APPROVED' | 'CHANGES' | 'REJECTED',
	comment?: string,
	profileCode?: string
): Promise<ApiResult<FormulaReviewSummary>> {
	return run<FormulaReviewSummary>(() =>
		frontClient().POST(ROUTES.RBFR.decideReview(reviewId), { decision, comment, profileCode })
	);
}

export function listFormulaVersions(formulaId: number): Promise<ApiResult<FormulaVersionSummary[]>> {
	return run<FormulaVersionSummary[]>(() => frontClient().GET(ROUTES.RBFR.formulaVersions(formulaId)));
}
