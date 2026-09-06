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
import { ingredientCasQueryOptions } from '../queries/ingredientCas.query';
import { ingredientRegulationsQueryOptions } from '../queries/ingredientRegulations.query';
import { ingredientCertsQueryOptions } from '../queries/ingredientCerts.query';
import { ingredientFlagsQueryOptions } from '../queries/ingredientFlags.query';
import { ingredientInteractionsQueryOptions } from '../queries/ingredientInteractions.query';
import { ingredientIncompatQueryOptions } from '../queries/ingredientIncompat.query';
import { addIngredientCasMutationOptions } from '../mutations/addIngredientCas.mutations';
import { addIngredientRegulationMutationOptions } from '../mutations/addIngredientRegulation.mutations';
import { addIngredientCertMutationOptions } from '../mutations/addIngredientCert.mutations';
import { addIngredientFlagMutationOptions } from '../mutations/addIngredientFlag.mutations';
import { addIngredientInteractionMutationOptions } from '../mutations/addIngredientInteraction.mutations';
import { addIngredientIncompatMutationOptions } from '../mutations/addIngredientIncompat.mutations';
import { sensoryStabilityQueryOptions } from '../queries/sensoryStability.query';
import { addSensoryStabilityRecordMutationOptions } from '../mutations/addSensoryStabilityRecord.mutations';
import { formulaReviewsQueryOptions } from '../queries/formulaReviews.query';
import { formulaVersionsQueryOptions } from '../queries/formulaVersions.query';
import { pendingReviewsQueryOptions } from '../queries/pendingReviews.query';
import { myAssignedReviewsQueryOptions } from '../queries/myAssignedReviews.query';
import { requestReviewMutationOptions } from '../mutations/requestReview.mutations';
import { pickupReviewMutationOptions } from '../mutations/pickupReview.mutations';
import { decideReviewMutationOptions } from '../mutations/decideReview.mutations';

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
	setProfileActive: setProfileActiveMutationOptions,
	ingredientCas: ingredientCasQueryOptions,
	ingredientRegulations: ingredientRegulationsQueryOptions,
	ingredientCerts: ingredientCertsQueryOptions,
	ingredientFlags: ingredientFlagsQueryOptions,
	ingredientInteractions: ingredientInteractionsQueryOptions,
	ingredientIncompat: ingredientIncompatQueryOptions,
	addIngredientCas: addIngredientCasMutationOptions,
	addIngredientRegulation: addIngredientRegulationMutationOptions,
	addIngredientCert: addIngredientCertMutationOptions,
	addIngredientFlag: addIngredientFlagMutationOptions,
	addIngredientInteraction: addIngredientInteractionMutationOptions,
	addIngredientIncompat: addIngredientIncompatMutationOptions,
	sensoryStability: sensoryStabilityQueryOptions,
	addSensoryStabilityRecord: addSensoryStabilityRecordMutationOptions,
	formulaReviews: formulaReviewsQueryOptions,
	formulaVersions: formulaVersionsQueryOptions,
	pendingReviews: pendingReviewsQueryOptions,
	myAssignedReviews: myAssignedReviewsQueryOptions,
	requestReview: requestReviewMutationOptions,
	pickupReview: pickupReviewMutationOptions,
	decideReview: decideReviewMutationOptions
};
