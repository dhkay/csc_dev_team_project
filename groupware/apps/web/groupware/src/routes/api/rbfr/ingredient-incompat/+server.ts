// RBFR 원료쌍 병용금기 목록/등록 BFF: csc-groupware RbfrIngredientDetailController(GET/POST /rbfr-api/ingredient-incompat)를 중계한다.
import type { RequestHandler } from '@sveltejs/kit';
import { authMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

export const GET: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	const ingredientId = event.url.searchParams.get('ingredientId');
	if (!ingredientId) return fail('ingredientId가 필요합니다.', { status: 400 });

	try {
		const res = await authMainClient(event).GET(
			`/rbfr-api/ingredient-incompat?ingredientId=${encodeURIComponent(ingredientId)}`
		);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, {
			fallback: '병용금기 목록을 불러오지 못했습니다.',
			log: 'RBFR list ingredient incompat failed'
		});
	}
};

export const POST: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	try {
		const body = await event.request.json();
		const res = await authMainClient(event).POST('/rbfr-api/ingredient-incompat', body);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, {
			fallback: '병용금기 등록에 실패했습니다.',
			log: 'RBFR add ingredient incompat failed'
		});
	}
};
