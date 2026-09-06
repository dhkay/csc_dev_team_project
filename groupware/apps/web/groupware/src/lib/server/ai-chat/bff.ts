// AI 챗봇 BFF 공용 헬퍼 (서버 전용, $lib/server 하위 → 클라 번들 유입 불가)
// 신원(org/user) 도출 + 에러 매핑을 한 곳에서 관리해 라우트들이 공유한다.
// 봉투/인증/에러매핑 기본기는 공용 코어($lib/server/http/bff)에 위임한다.
import type { RequestEvent } from '@sveltejs/kit';
import { canUseAiAssistant } from '$lib/shared/lib/auth/access';
import { AUTH_ERROR_RULES, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

/** 로그인 + 조직 소속 확인 후 language-model 로 넘길 신원 헤더 반환. 실패 시 에러 응답. (AI 어시스턴트는 기본 제공 도구: 엔타이틀먼트 불요.) */
export async function requireIdentity(
  event: RequestEvent
): Promise<{ headers: Record<string, string> } | { error: Response }> {
  const authErr = requireAuth(event);
  if (authErr) return { error: authErr };

  const user = await event.locals.getUser();
  const orgId = user?.organization?.id;
  if (!orgId || !user) {
    return { error: fail('조직 정보를 확인할 수 없습니다.', { status: 403 }) };
  }
  // 데이터 계층 게이트: 팝아웃 진입 가드(+page.server.ts)의 심층 방어. 접근 정책의 단일 출처는
  // canUseAiAssistant(access.ts): AI 어시스턴트는 기본 제공 도구라 인증된 조직 유저 전원 허용
  if (!canUseAiAssistant(user)) {
    return { error: fail('AI 어시스턴트 권한이 없습니다.', { status: 403 }) };
  }
  return {
    headers: { 'X-Organization-Id': String(orgId), 'X-User-Id': String(user.id) }
  };
}

/** language-model 호출 에러 → 사용자 응답 매핑(상세는 서버 로그) */
export function mapError(error: unknown, fallback: string): Response {
  return mapHttpError(error, {
    fallback,
    log: 'ai-chat BFF failed',
    table: {
      ...AUTH_ERROR_RULES,
      400: { message: '잘못된 요청입니다.' },
      404: { message: '대상을 찾을 수 없습니다.' }
    }
  });
}
