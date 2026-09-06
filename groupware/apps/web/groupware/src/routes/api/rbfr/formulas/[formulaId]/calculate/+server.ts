// RBFR 처방 계산·검증 BFF: csc-groupware RbfrFormulaController(GET /rbfr-api/formulas/:id/calculate)를 중계한다.
import type { RequestHandler } from '@sveltejs/kit';
import { authMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, mapHttpError, requireAuth, parseIdParam } from '$lib/server/http/bff';

export const GET: RequestHandler = async (event) => {
  const authErr = requireAuth(event);
  if (authErr) return authErr;

  const formulaId = parseIdParam(event.params.formulaId);
  if (formulaId === null) return fail('유효하지 않은 처방 ID입니다.', { status: 400 });

  const profileCode = event.url.searchParams.get('profileCode');
  if (!profileCode) return fail('profileCode가 필요합니다.', { status: 400 });

  try {
    const res = await authMainClient(event).GET(
      `/rbfr-api/formulas/${formulaId}/calculate?profileCode=${encodeURIComponent(profileCode)}`
    );
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '처방 계산에 실패했습니다.',
      log: 'RBFR calculate formula failed'
    });
  }
};
