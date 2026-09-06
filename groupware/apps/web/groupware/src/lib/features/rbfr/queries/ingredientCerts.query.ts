// 원료 등록 부속: 인증 정보 목록 조회 레이어.
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/rbfrApi';
import type { IngredientCertEntry } from '../types';

export const ingredientCertsKeys = {
	list: (ingredientId: number) => ['rbfr', 'ingredient-certs', ingredientId] as const
};

export function ingredientCertsQueryOptions(ingredientId: number) {
	return queryOptions({
		queryKey: ingredientCertsKeys.list(ingredientId),
		queryFn: async (): Promise<IngredientCertEntry[]> => {
			const res = await api.listIngredientCerts(ingredientId);
			if (!res.success) throw new Error(res.error ?? '인증 정보를 불러오지 못했습니다.');
			return res.data;
		},
		enabled: ingredientId > 0
	});
}
