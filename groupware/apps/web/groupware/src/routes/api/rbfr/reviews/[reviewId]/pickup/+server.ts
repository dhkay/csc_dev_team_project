// RBFR 검수 배정 BFF: csc-groupware RbfrReviewController(POST /rbfr-api/reviews/:reviewId/pickup)를 중계한다.
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
		const res = await authMainClient(event).POST(`/rbfr-api/reviews/${reviewId}/pickup`, body);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, { fallback: '검수 배정에 실패했습니다.', log: 'RBFR pickup review failed' });
	}
};
