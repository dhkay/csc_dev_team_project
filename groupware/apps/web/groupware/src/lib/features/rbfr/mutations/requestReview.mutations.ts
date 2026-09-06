import type { QueryClient } from '@tanstack/svelte-query';
import { formulaReviewsKeys } from '../queries/formulaReviews.query';
import * as api from '../apis/rbfrApi';

export function requestReviewMutationOptions(queryClient: QueryClient, formulaId: number) {
	return {
		mutationFn: async (requestedBy: number) => {
			const res = await api.requestReview(formulaId, requestedBy);
			if (!res.success) throw new Error(res.error ?? '검수 요청에 실패했습니다.');
			return res.data;
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: formulaReviewsKeys.list(formulaId) });
		}
	};
}
