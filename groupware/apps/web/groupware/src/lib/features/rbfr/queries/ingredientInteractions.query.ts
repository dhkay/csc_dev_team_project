// 원료쌍 조합계수 목록 조회 레이어.
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/rbfrApi';
import type { IngredientInteractionEntry } from '../types';

export const ingredientInteractionsKeys = {
	list: (ingredientId: number) => ['rbfr', 'ingredient-interactions', ingredientId] as const
};

export function ingredientInteractionsQueryOptions(ingredientId: number) {
	return queryOptions({
		queryKey: ingredientInteractionsKeys.list(ingredientId),
		queryFn: async (): Promise<IngredientInteractionEntry[]> => {
			const res = await api.listIngredientInteractions(ingredientId);
			if (!res.success) throw new Error(res.error ?? '원료쌍 조합계수 목록을 불러오지 못했습니다.');
			return res.data;
		},
		enabled: ingredientId > 0
	});
}
