import type { QueryClient } from '@tanstack/svelte-query';
import { pendingReviewsKeys } from '../queries/pendingReviews.query';
import { myAssignedReviewsKeys } from '../queries/myAssignedReviews.query';
import * as api from '../apis/rbfrApi';

export function pickupReviewMutationOptions(queryClient: QueryClient) {
	return {
		mutationFn: async (input: { reviewId: number; reviewerId: number }) => {
			const res = await api.pickupReview(input.reviewId, input.reviewerId);
			if (!res.success) throw new Error(res.error ?? '검수 배정에 실패했습니다.');
			return res.data;
		},
		onSuccess: (_data: unknown, variables: { reviewId: number; reviewerId: number }) => {
			void queryClient.invalidateQueries({ queryKey: pendingReviewsKeys.list() });
			void queryClient.invalidateQueries({ queryKey: myAssignedReviewsKeys.list(variables.reviewerId) });
		}
	};
}
