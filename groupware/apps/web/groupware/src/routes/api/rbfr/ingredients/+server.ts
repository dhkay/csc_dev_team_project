// RBFR 원료 등록/목록 BFF: csc-groupware RbfrIngredientController를 중계한다.
import type { RequestHandler } from '@sveltejs/kit';
import { authMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

export const GET: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	try {
		const res = await authMainClient(event).GET('/rbfr-api/ingredients');
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, {
			fallback: '원료 목록을 불러오지 못했습니다.',
			log: 'RBFR list ingredients failed'
		});
	}
};

export const POST: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	try {
		const body = await event.request.json();
		const res = await authMainClient(event).POST<{ ingredientId: number }>('/rbfr-api/ingredients', body);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, {
			fallback: '원료 등록에 실패했습니다.',
			log: 'RBFR register ingredient failed'
		});
	}
};
