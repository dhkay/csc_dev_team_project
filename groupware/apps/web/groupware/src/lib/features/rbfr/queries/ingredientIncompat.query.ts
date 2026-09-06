// 원료쌍 병용금기 목록 조회 레이어.
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/rbfrApi';
import type { IngredientIncompatRecord } from '../types';

export const ingredientIncompatKeys = {
	list: (ingredientId: number) => ['rbfr', 'ingredient-incompat', ingredientId] as const
};

export function ingredientIncompatQueryOptions(ingredientId: number) {
	return queryOptions({
		queryKey: ingredientIncompatKeys.list(ingredientId),
		queryFn: async (): Promise<IngredientIncompatRecord[]> => {
			const res = await api.listIngredientIncompat(ingredientId);
			if (!res.success) throw new Error(res.error ?? '병용금기 목록을 불러오지 못했습니다.');
			return res.data;
		},
		enabled: ingredientId > 0
	});
}
