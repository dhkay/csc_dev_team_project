// 원료 목록 조회 레이어: 처방 생성 화면의 원료 선택 드롭다운에서 쓴다.
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/rbfrApi';
import type { IngredientSummary } from '../types';

export const ingredientsKeys = {
	list: () => ['rbfr', 'ingredients'] as const
};

export function ingredientsQueryOptions() {
	return queryOptions({
		queryKey: ingredientsKeys.list(),
		queryFn: async (): Promise<IngredientSummary[]> => {
			const res = await api.listIngredients();
			if (!res.success) {
				throw new Error(res.error ?? '원료 목록을 불러오지 못했습니다.');
			}
			return res.data;
		}
	});
}
