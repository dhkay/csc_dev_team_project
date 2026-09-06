// 원료 등록 부속: 무첨가 분류 목록 조회 레이어.
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/rbfrApi';
import type { IngredientFlagEntry } from '../types';

export const ingredientFlagsKeys = {
	list: (ingredientId: number) => ['rbfr', 'ingredient-flags', ingredientId] as const
};

export function ingredientFlagsQueryOptions(ingredientId: number) {
	return queryOptions({
		queryKey: ingredientFlagsKeys.list(ingredientId),
		queryFn: async (): Promise<IngredientFlagEntry[]> => {
			const res = await api.listIngredientFlags(ingredientId);
			if (!res.success) throw new Error(res.error ?? '무첨가 분류를 불러오지 못했습니다.');
			return res.data;
		},
		enabled: ingredientId > 0
	});
}
