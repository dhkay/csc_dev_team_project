// 원료 등록 부속: CAS 목록 조회 레이어.
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/rbfrApi';
import type { IngredientCasEntry } from '../types';

export const ingredientCasKeys = {
	list: (ingredientId: number) => ['rbfr', 'ingredient-cas', ingredientId] as const
};

export function ingredientCasQueryOptions(ingredientId: number) {
	return queryOptions({
		queryKey: ingredientCasKeys.list(ingredientId),
		queryFn: async (): Promise<IngredientCasEntry[]> => {
			const res = await api.listIngredientCas(ingredientId);
			if (!res.success) throw new Error(res.error ?? 'CAS 목록을 불러오지 못했습니다.');
			return res.data;
		},
		enabled: ingredientId > 0
	});
}
