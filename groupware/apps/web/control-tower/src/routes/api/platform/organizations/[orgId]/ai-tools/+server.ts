// 조직 AI도구 grant 조회 BFF: csc-control-tower `GET /platform/organizations/:id/ai-tools` 로 중계
// 부여(저장)는 기존 PATCH /api/platform/organizations 에 aiTools 를 실어 일괄 처리하므로 여기선 조회만
import type { RequestEvent } from '@sveltejs/kit';
import { authControlClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

export async function GET(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  const id = Number(event.params.orgId);
  if (!Number.isFinite(id)) {
    return fail('잘못된 요청입니다.', { status: 400 });
  }
  try {
    const res = await authControlClient(event).GET<string[]>(
      `/platform/organizations/${id}/ai-tools`,
    );
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: 'AI 도구 정보를 불러오지 못했습니다.',
      log: 'Get org ai-tools failed',
      table: {
        ...AUTH_ERROR_RULES,
        404: { message: '조직을 찾을 수 없습니다.' }
      }
    });
  }
}
