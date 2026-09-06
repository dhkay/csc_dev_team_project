// RBFR 역방향 추천 BFF: csc-groupware RbfrRecommendationController(POST /rbfr-api/recommendations)를 중계한다.
import type { RequestHandler } from '@sveltejs/kit';
import { authMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

export const POST: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	try {
		const body = await event.request.json();
		const res = await authMainClient(event).POST<{
			recommendations: unknown[];
			excluded: unknown[];
		}>('/rbfr-api/recommendations', body);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, {
			fallback: '추천 계산에 실패했습니다.',
			log: 'RBFR recommend ingredients failed'
		});
	}
};
