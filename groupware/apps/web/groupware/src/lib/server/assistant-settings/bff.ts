// 조직 AI 어시스턴트 설정 BFF 공용 헬퍼: 조직 스코프 + 루트 권한 확인, 에러 매핑
// 조직 어시스턴트 설정(기본 모델/프롬프트 추가)은 루트 권한자(ROOT/대표) 전용
import type { RequestEvent } from '@sveltejs/kit';
import { hasRootAuthority } from '$lib/shared/lib/auth/access';
import { AUTH_ERROR_RULES, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

/** 로그인 + 조직 소속 + 루트 권한(ROOT/대표) 확인 후 organizationId 반환 */
export async function requireAssistantSettingsManager(
  event: RequestEvent,
): Promise<{ orgId: number } | { error: Response }> {
  const authErr = requireAuth(event);
  if (authErr) return { error: authErr };
  const user = await event.locals.getUser();
  const orgId = user?.organization?.id;
  if (!orgId) {
    return { error: fail('조직 정보를 확인할 수 없습니다.', { status: 403 }) };
  }
  if (!hasRootAuthority(user)) {
    return { error: fail('권한이 없습니다.', { status: 403 }) };
  }
  return { orgId };
}

/** 백엔드 호출 에러 → 사용자 응답 정규화 */
export function mapAssistantSettingsError(error: unknown, fallback: string): Response {
  return mapHttpError(error, {
    fallback,
    log: 'assistant-settings bff failed',
    table: {
      ...AUTH_ERROR_RULES,
      400: (e) => ({
        message: e.response?.data?.error ?? e.response?.data?.message ?? '잘못된 요청입니다.',
      }),
    },
  });
}
