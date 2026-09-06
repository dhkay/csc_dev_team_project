import type { QueryClient } from '@tanstack/svelte-query';
import { ingredientInteractionsKeys } from '../queries/ingredientInteractions.query';
import * as api from '../apis/rbfrApi';
import type { IngredientInteractionInput } from '../types';

/** 목록이 양쪽 원료 관점에서 각각 조회되므로, 성공 시 두 원료의 목록을 모두 invalidate한다. */
export function addIngredientInteractionMutationOptions(queryClient: QueryClient) {
	return {
		mutationFn: async (input: IngredientInteractionInput) => {
			const res = await api.addIngredientInteraction(input);
			if (!res.success) throw new Error(res.error ?? '원료쌍 조합계수 등록에 실패했습니다.');
			return res.data;
		},
		onSuccess: (_data: unknown, variables: IngredientInteractionInput) => {
			void queryClient.invalidateQueries({
				queryKey: ingredientInteractionsKeys.list(variables.ingredientAId)
			});
			void queryClient.invalidateQueries({
				queryKey: ingredientInteractionsKeys.list(variables.ingredientBId)
			});
		}
	};
}
