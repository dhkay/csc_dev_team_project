// RBFR Profile 활성화 토글 BFF: csc-groupware RbfrSettingsController(PATCH /rbfr-api/profiles/:code/active)를 중계한다.
import type { RequestHandler } from '@sveltejs/kit';
import { authMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

export const PATCH: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	const { profileCode } = event.params;
	if (!profileCode) return fail('profileCode가 필요합니다.', { status: 400 });

	try {
		const body = await event.request.json();
		const res = await authMainClient(event).PATCH(
			`/rbfr-api/profiles/${encodeURIComponent(profileCode)}/active`,
			body
		);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, {
			fallback: 'Profile 활성화 상태 변경에 실패했습니다.',
			log: 'RBFR set profile active failed'
		});
	}
};
