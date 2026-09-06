import type { QueryClient } from '@tanstack/svelte-query';
import { ingredientRegulationsKeys } from '../queries/ingredientRegulations.query';
import * as api from '../apis/rbfrApi';
import type { IngredientRegulationInput } from '../types';

export function addIngredientRegulationMutationOptions(queryClient: QueryClient, ingredientId: number) {
	return {
		mutationFn: async (input: IngredientRegulationInput) => {
			const res = await api.addIngredientRegulation(ingredientId, input);
			if (!res.success) throw new Error(res.error ?? '국가별 규제 등록에 실패했습니다.');
			return res.data;
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ingredientRegulationsKeys.list(ingredientId) });
		}
	};
}
