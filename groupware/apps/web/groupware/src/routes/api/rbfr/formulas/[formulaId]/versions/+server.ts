// RBFR 확정 버전 이력 BFF: csc-groupware RbfrReviewController(GET .../formulas/:formulaId/versions)를 중계한다.
import type { RequestHandler } from '@sveltejs/kit';
import { authMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, mapHttpError, requireAuth, parseIdParam } from '$lib/server/http/bff';

export const GET: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	const formulaId = parseIdParam(event.params.formulaId);
	if (formulaId === null) return fail('formulaId가 필요합니다.', { status: 400 });

	try {
		const res = await authMainClient(event).GET(`/rbfr-api/formulas/${formulaId}/versions`);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, { fallback: '확정 버전 이력을 불러오지 못했습니다.', log: 'RBFR list versions failed' });
	}
};
