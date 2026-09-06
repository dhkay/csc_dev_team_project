// "내가 배정받은 검수" 조회 레이어(REVIEWER 화면). 서버 조회라 새로고침해도 유지된다.
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/rbfrApi';
import type { FormulaReviewSummary } from '../types';

export const myAssignedReviewsKeys = {
	list: (reviewerId: number) => ['rbfr', 'my-assigned-reviews', reviewerId] as const
};

export function myAssignedReviewsQueryOptions(reviewerId: number) {
	return queryOptions({
		queryKey: myAssignedReviewsKeys.list(reviewerId),
		queryFn: async (): Promise<FormulaReviewSummary[]> => {
			const res = await api.listMyAssignedReviews(reviewerId);
			if (!res.success) throw new Error(res.error ?? '내가 배정받은 검수를 불러오지 못했습니다.');
			return res.data;
		},
		enabled: reviewerId > 0
	});
}
