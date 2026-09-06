// 원료 등록 부속: 국가별 규제 확인 목록 조회 레이어.
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/rbfrApi';
import type { IngredientRegulationRecord } from '../types';

export const ingredientRegulationsKeys = {
	list: (ingredientId: number) => ['rbfr', 'ingredient-regulations', ingredientId] as const
};

export function ingredientRegulationsQueryOptions(ingredientId: number) {
	return queryOptions({
		queryKey: ingredientRegulationsKeys.list(ingredientId),
		queryFn: async (): Promise<IngredientRegulationRecord[]> => {
			const res = await api.listIngredientRegulations(ingredientId);
			if (!res.success) throw new Error(res.error ?? '국가별 규제 목록을 불러오지 못했습니다.');
			return res.data;
		},
		enabled: ingredientId > 0
	});
}
