// RBFR Cell 규칙 판 목록 BFF: csc-groupware RbfrSettingsController(GET /rbfr-api/profiles/:code/cell-rule-limits)를 중계한다.
import type { RequestHandler } from '@sveltejs/kit';
import { authMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

export const GET: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	const { profileCode } = event.params;
	if (!profileCode) return fail('profileCode가 필요합니다.', { status: 400 });

	try {
		const res = await authMainClient(event).GET(
			`/rbfr-api/profiles/${encodeURIComponent(profileCode)}/cell-rule-limits`
		);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, {
			fallback: 'Cell 규칙 판 목록을 불러오지 못했습니다.',
			log: 'RBFR list cell rule limits failed'
		});
	}
};
