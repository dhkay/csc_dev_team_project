// RBFR 검수 대기열 BFF: csc-groupware RbfrReviewController(GET /rbfr-api/reviews/pending)를 중계한다.
import type { RequestHandler } from '@sveltejs/kit';
import { authMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, mapHttpError, requireAuth } from '$lib/server/http/bff';

export const GET: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	try {
		const res = await authMainClient(event).GET('/rbfr-api/reviews/pending');
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, {
			fallback: '검수 대기열을 불러오지 못했습니다.',
			log: 'RBFR list pending reviews failed'
		});
	}
};
