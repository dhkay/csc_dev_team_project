// RBFR Cell 규칙 판 승인 BFF: csc-groupware RbfrSettingsController(POST /rbfr-api/cell-rule-limits/:ruleVersion/approve)를 중계한다.
import type { RequestHandler } from '@sveltejs/kit';
import { authMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

export const POST: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	const { ruleVersion } = event.params;
	if (!ruleVersion) return fail('ruleVersion이 필요합니다.', { status: 400 });

	try {
		const body = await event.request.json();
		const res = await authMainClient(event).POST(
			`/rbfr-api/cell-rule-limits/${encodeURIComponent(ruleVersion)}/approve`,
			body
		);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, {
			fallback: 'Cell 규칙 판 승인에 실패했습니다.',
			log: 'RBFR approve cell rule limit failed'
		});
	}
};
