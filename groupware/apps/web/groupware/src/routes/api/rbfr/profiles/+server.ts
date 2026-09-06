// RBFR Profile 목록/등록 BFF: csc-groupware RbfrSettingsController(GET/POST /rbfr-api/profiles)를 중계한다.
import type { RequestHandler } from '@sveltejs/kit';
import { authMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

export const GET: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	try {
		const res = await authMainClient(event).GET('/rbfr-api/profiles');
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, {
			fallback: 'Profile 목록을 불러오지 못했습니다.',
			log: 'RBFR list profiles failed'
		});
	}
};

export const POST: RequestHandler = async (event) => {
	const authErr = requireAuth(event);
	if (authErr) return authErr;

	try {
		const body = await event.request.json();
		const res = await authMainClient(event).POST('/rbfr-api/profiles', body);
		return ok(res.data);
	} catch (error) {
		return mapHttpError(error, {
			fallback: 'Profile 등록에 실패했습니다.',
			log: 'RBFR create profile failed'
		});
	}
};
