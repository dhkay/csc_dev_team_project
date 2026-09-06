// RBFR 검수 결정 BFF: csc-groupware RbfrReviewController(POST /rbfr-api/reviews/:reviewId/decide)를 중계한다.
import type { RequestHandler } from '@sveltejs/kit';
import { authMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, mapHttpError, requireAuth, parseIdParam } from '$lib/server/http/bff';

export const POST: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	const reviewId = parseIdParam(event.params.reviewId);
	if (reviewId === null) return fail('reviewId가 필요합니다.', { status: 400 });

	try {
		const body = await event.request.json();
		const res = await authMainClient(event).POST(`/rbfr-api/reviews/${reviewId}/decide`, body);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, { fallback: '검수 결정에 실패했습니다.', log: 'RBFR decide review failed' });
	}
};
