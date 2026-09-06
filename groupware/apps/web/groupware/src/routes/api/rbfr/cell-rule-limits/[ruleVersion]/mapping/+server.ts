// RBFR Cell 변환표 BFF: csc-groupware RbfrSettingsController(GET/PUT /rbfr-api/cell-rule-limits/:ruleVersion/mapping)를 중계한다.
import type { RequestHandler } from '@sveltejs/kit';
import { authMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

export const GET: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	const { ruleVersion } = event.params;
	if (!ruleVersion) return fail('ruleVersion이 필요합니다.', { status: 400 });

	try {
		const res = await authMainClient(event).GET(
			`/rbfr-api/cell-rule-limits/${encodeURIComponent(ruleVersion)}/mapping`
		);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, {
			fallback: 'Cell 변환표를 불러오지 못했습니다.',
			log: 'RBFR list cell mapping failed'
		});
	}
};

export const PUT: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	const { ruleVersion } = event.params;
	if (!ruleVersion) return fail('ruleVersion이 필요합니다.', { status: 400 });

	try {
		const body = await event.request.json();
		const res = await authMainClient(event).PUT(
			`/rbfr-api/cell-rule-limits/${encodeURIComponent(ruleVersion)}/mapping`,
			body
		);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, {
			fallback: 'Cell 변환표 저장에 실패했습니다.',
			log: 'RBFR set cell mapping failed'
		});
	}
};
