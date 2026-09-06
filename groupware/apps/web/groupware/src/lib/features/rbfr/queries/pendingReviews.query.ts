// 검수 대기열 조회 레이어(REVIEWER 화면).
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/rbfrApi';
import type { FormulaReviewSummary } from '../types';

export const pendingReviewsKeys = {
	list: () => ['rbfr', 'pending-reviews'] as const
};

export function pendingReviewsQueryOptions() {
	return queryOptions({
		queryKey: pendingReviewsKeys.list(),
		queryFn: async (): Promise<FormulaReviewSummary[]> => {
			const res = await api.listPendingReviews();
			if (!res.success) throw new Error(res.error ?? '검수 대기열을 불러오지 못했습니다.');
			return res.data;
		}
	});
}
