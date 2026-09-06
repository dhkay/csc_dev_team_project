import type { QueryClient } from '@tanstack/svelte-query';
import { ingredientIncompatKeys } from '../queries/ingredientIncompat.query';
import * as api from '../apis/rbfrApi';
import type { IngredientIncompatInput } from '../types';

/** 목록이 양쪽 원료 관점에서 각각 조회되므로, 성공 시 두 원료의 목록을 모두 invalidate한다. */
export function addIngredientIncompatMutationOptions(queryClient: QueryClient) {
	return {
		mutationFn: async (input: IngredientIncompatInput) => {
			const res = await api.addIngredientIncompat(input);
			if (!res.success) throw new Error(res.error ?? '병용금기 등록에 실패했습니다.');
			return res.data;
		},
		onSuccess: (_data: unknown, variables: IngredientIncompatInput) => {
			void queryClient.invalidateQueries({ queryKey: ingredientIncompatKeys.list(variables.ingredientId) });
			void queryClient.invalidateQueries({ queryKey: ingredientIncompatKeys.list(variables.otherId) });
		}
	};
}
