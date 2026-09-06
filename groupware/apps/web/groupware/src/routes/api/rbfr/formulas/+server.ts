// RBFR 처방 생성 BFF: csc-groupware RbfrFormulaController(POST /rbfr-api/formulas)를 중계한다.
import type { RequestHandler } from '@sveltejs/kit';
import { authMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

export const POST: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	try {
		const body = await event.request.json();
		const res = await authMainClient(event).POST<{ formulaId: number; projectId: number }>(
			'/rbfr-api/formulas',
			body
		);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, {
			fallback: '처방 생성에 실패했습니다.',
			log: 'RBFR create formula failed'
		});
	}
};
