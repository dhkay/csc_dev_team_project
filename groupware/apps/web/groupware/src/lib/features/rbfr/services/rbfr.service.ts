import { formulaCalculationQueryOptions } from '../queries/formulaCalculation.query';
import { directDomainsQueryOptions } from '../queries/directDomains.query';
import { ingredientsQueryOptions } from '../queries/ingredients.query';
import { registerIngredientMutationOptions } from '../mutations/registerIngredient.mutations';
import { createFormulaMutationOptions } from '../mutations/createFormula.mutations';
import { recommendIngredientsMutationOptions } from '../mutations/recommendIngredients.mutations';
import { profilesQueryOptions } from '../queries/profiles.query';
import { roleDomainsQueryOptions } from '../queries/roleDomains.query';
import { cellRuleLimitsQueryOptions } from '../queries/cellRuleLimits.query';
import { createProfileMutationOptions } from '../mutations/createProfile.mutations';
import { approveCellRuleLimitMutationOptions } from '../mutations/approveCellRuleLimit.mutations';
import { cellMappingQueryOptions } from '../queries/cellMapping.query';
import { setCellMappingMutationOptions } from '../mutations/setCellMapping.mutations';
import { setProfileActiveMutationOptions } from '../mutations/setProfileActive.mutations';

/** 컴포넌트가 호출하는 RBFR 서비스 진입점. */
export const rbfrService = {
	formulaCalculation: formulaCalculationQueryOptions,
	directDomains: directDomainsQueryOptions,
	ingredients: ingredientsQueryOptions,
	registerIngredient: registerIngredientMutationOptions,
	createFormula: createFormulaMutationOptions,
	recommendIngredients: recommendIngredientsMutationOptions,
	profiles: profilesQueryOptions,
	roleDomains: roleDomainsQueryOptions,
	cellRuleLimits: cellRuleLimitsQueryOptions,
	createProfile: createProfileMutationOptions,
	approveCellRuleLimit: approveCellRuleLimitMutationOptions,
	cellMapping: cellMappingQueryOptions,
	setCellMapping: setCellMappingMutationOptions,
	setProfileActive: setProfileActiveMutationOptions
};
