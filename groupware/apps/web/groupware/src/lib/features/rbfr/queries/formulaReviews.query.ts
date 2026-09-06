// 처방 검수 이력 조회 레이어.
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/rbfrApi';
import type { FormulaReviewSummary } from '../types';

export const formulaReviewsKeys = {
	list: (formulaId: number) => ['rbfr', 'formula-reviews', formulaId] as const
};

export function formulaReviewsQueryOptions(formulaId: number) {
	return queryOptions({
		queryKey: formulaReviewsKeys.list(formulaId),
		queryFn: async (): Promise<FormulaReviewSummary[]> => {
			const res = await api.listFormulaReviews(formulaId);
			if (!res.success) throw new Error(res.error ?? '검수 이력을 불러오지 못했습니다.');
			return res.data;
		},
		enabled: formulaId > 0
	});
}
