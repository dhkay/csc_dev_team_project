// RBFR "내가 배정받은 검수" BFF: csc-groupware RbfrReviewController(GET /rbfr-api/reviews/mine)를 중계한다.
import type { RequestHandler } from '@sveltejs/kit';
import { authMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

export const GET: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	const reviewerId = event.url.searchParams.get('reviewerId');
	if (!reviewerId) return fail('reviewerId가 필요합니다.', { status: 400 });

	try {
		const res = await authMainClient(event).GET(
			`/rbfr-api/reviews/mine?reviewerId=${encodeURIComponent(reviewerId)}`
		);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, {
			fallback: '내가 배정받은 검수를 불러오지 못했습니다.',
			log: 'RBFR list my assigned reviews failed'
		});
	}
};
