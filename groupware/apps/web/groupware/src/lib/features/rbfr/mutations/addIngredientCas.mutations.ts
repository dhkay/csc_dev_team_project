import type { QueryClient } from '@tanstack/svelte-query';
import { ingredientCasKeys } from '../queries/ingredientCas.query';
import * as api from '../apis/rbfrApi';
import type { IngredientCasInput } from '../types';

export function addIngredientCasMutationOptions(queryClient: QueryClient, ingredientId: number) {
	return {
		mutationFn: async (input: IngredientCasInput) => {
			const res = await api.addIngredientCas(ingredientId, input);
			if (!res.success) throw new Error(res.error ?? 'CAS 등록에 실패했습니다.');
			return res.data;
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ingredientCasKeys.list(ingredientId) });
		}
	};
}
