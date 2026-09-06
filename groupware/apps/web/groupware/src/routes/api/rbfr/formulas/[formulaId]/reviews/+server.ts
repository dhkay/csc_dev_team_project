// RBFR 검수 요청 등록/목록 BFF: csc-groupware RbfrReviewController(GET/POST .../formulas/:formulaId/reviews)를 중계한다.
import type { RequestHandler } from '@sveltejs/kit';
import { authMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, mapHttpError, requireAuth, parseIdParam } from '$lib/server/http/bff';

export const GET: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	const formulaId = parseIdParam(event.params.formulaId);
	if (formulaId === null) return fail('formulaId가 필요합니다.', { status: 400 });

	try {
		const res = await authMainClient(event).GET(`/rbfr-api/formulas/${formulaId}/reviews`);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, { fallback: '검수 이력을 불러오지 못했습니다.', log: 'RBFR list reviews failed' });
	}
};

export const POST: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	const formulaId = parseIdParam(event.params.formulaId);
	if (formulaId === null) return fail('formulaId가 필요합니다.', { status: 400 });

	try {
		const body = await event.request.json();
		const res = await authMainClient(event).POST(`/rbfr-api/formulas/${formulaId}/reviews`, body);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, { fallback: '검수 요청에 실패했습니다.', log: 'RBFR request review failed' });
	}
};
