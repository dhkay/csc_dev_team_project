import type { QueryClient } from '@tanstack/svelte-query';
import { ingredientFlagsKeys } from '../queries/ingredientFlags.query';
import * as api from '../apis/rbfrApi';
import type { IngredientFlagInput } from '../types';

export function addIngredientFlagMutationOptions(queryClient: QueryClient, ingredientId: number) {
	return {
		mutationFn: async (input: IngredientFlagInput) => {
			const res = await api.addIngredientFlag(ingredientId, input);
			if (!res.success) throw new Error(res.error ?? '무첨가 분류 등록에 실패했습니다.');
			return res.data;
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ingredientFlagsKeys.list(ingredientId) });
		}
	};
}
