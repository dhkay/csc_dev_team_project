// RBFR 국가별 규제 확인 목록/등록 BFF: csc-groupware RbfrIngredientDetailController(GET/POST .../regulations)를 중계한다.
import type { RequestHandler } from '@sveltejs/kit';
import { authMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, mapHttpError, requireAuth, parseIdParam } from '$lib/server/http/bff';

export const GET: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	const ingredientId = parseIdParam(event.params.ingredientId);
	if (ingredientId === null) return fail('ingredientId가 필요합니다.', { status: 400 });

	try {
		const res = await authMainClient(event).GET(`/rbfr-api/ingredients/${ingredientId}/regulations`);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, {
			fallback: '국가별 규제 목록을 불러오지 못했습니다.',
			log: 'RBFR list regulations failed'
		});
	}
};

export const POST: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	const ingredientId = parseIdParam(event.params.ingredientId);
	if (ingredientId === null) return fail('ingredientId가 필요합니다.', { status: 400 });

	try {
		const body = await event.request.json();
		const res = await authMainClient(event).POST(`/rbfr-api/ingredients/${ingredientId}/regulations`, body);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, { fallback: '국가별 규제 등록에 실패했습니다.', log: 'RBFR add regulation failed' });
	}
};
