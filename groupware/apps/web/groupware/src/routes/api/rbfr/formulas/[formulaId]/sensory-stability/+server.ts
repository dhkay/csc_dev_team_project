// RBFR 처방 사용감·안정성 기록 BFF: csc-groupware RbfrFormulaController(GET/POST .../sensory-stability)를 중계한다.
import type { RequestHandler } from '@sveltejs/kit';
import { authMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, mapHttpError, requireAuth, parseIdParam } from '$lib/server/http/bff';

export const GET: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	const formulaId = parseIdParam(event.params.formulaId);
	if (formulaId === null) return fail('formulaId가 필요합니다.', { status: 400 });

	try {
		const res = await authMainClient(event).GET(`/rbfr-api/formulas/${formulaId}/sensory-stability`);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, {
			fallback: '사용감·안정성 기록을 불러오지 못했습니다.',
			log: 'RBFR list sensory stability records failed'
		});
	}
};

export const POST: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	const formulaId = parseIdParam(event.params.formulaId);
	if (formulaId === null) return fail('formulaId가 필요합니다.', { status: 400 });

	try {
		const body = await event.request.json();
		const res = await authMainClient(event).POST(`/rbfr-api/formulas/${formulaId}/sensory-stability`, body);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, {
			fallback: '사용감·안정성 기록 등록에 실패했습니다.',
			log: 'RBFR add sensory stability record failed'
		});
	}
};
