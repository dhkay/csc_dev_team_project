import type { QueryClient } from '@tanstack/svelte-query';
import { pendingReviewsKeys } from '../queries/pendingReviews.query';
import { formulaReviewsKeys } from '../queries/formulaReviews.query';
import { myAssignedReviewsKeys } from '../queries/myAssignedReviews.query';
import { formulaVersionsKeys } from '../queries/formulaVersions.query';
import * as api from '../apis/rbfrApi';

export function decideReviewMutationOptions(queryClient: QueryClient) {
	return {
		mutationFn: async (input: {
			reviewId: number;
			decision: 'APPROVED' | 'CHANGES' | 'REJECTED';
			comment?: string;
			profileCode?: string;
		}) => {
			const res = await api.decideReview(input.reviewId, input.decision, input.comment, input.profileCode);
			if (!res.success) throw new Error(res.error ?? '검수 결정에 실패했습니다.');
			return res.data;
		},
		onSuccess: (data: { formulaId: number; reviewerId?: number }) => {
			void queryClient.invalidateQueries({ queryKey: pendingReviewsKeys.list() });
			void queryClient.invalidateQueries({ queryKey: formulaReviewsKeys.list(data.formulaId) });
			if (data.reviewerId !== undefined) {
				void queryClient.invalidateQueries({ queryKey: myAssignedReviewsKeys.list(data.reviewerId) });
			}
			void queryClient.invalidateQueries({ queryKey: formulaVersionsKeys.list(data.formulaId) });
		}
	};
}
