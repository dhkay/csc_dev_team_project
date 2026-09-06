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
