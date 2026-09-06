// 공용 API 자격증명 BFF 공용 헬퍼: 조직 스코프 + 루트 권한 확인, 백엔드 에러 → 사용자 응답 매핑
// 자격증명(외부 API 키) 등록/조회/삭제는 루트 권한자(ROOT/대표) 전용이다.
// 봉투/인증/에러매핑 기본기는 공용 코어($lib/server/http/bff)에 위임한다.
import type { RequestEvent } from '@sveltejs/kit';
import { hasRootAuthority } from '$lib/shared/lib/auth/access';
import { AUTH_ERROR_RULES, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

/**
 * 로그인 + 조직 소속 + 루트 권한(ROOT/대표) 확인 후 organizationId 반환
 * 인가 단일 출처는 백엔드 검증(getUser). 여기선 그 결과로 게이트만 건다.
 */
export async function requireApiCredentialManager(
  event: RequestEvent
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

/**
 * 로그인 + 조직 소속만 확인 후 organizationId 반환(루트 권한 불요)
 * "등록된 프로바이더 key 목록"(논-시크릿)처럼 조직 편집자(팀장 등)도 읽어야 하는 org-scope 조회에 쓴다.
 */
export async function requireOrgId(
  event: RequestEvent
): Promise<{ orgId: number } | { error: Response }> {
  const authErr = requireAuth(event);
  if (authErr) return { error: authErr };
  const user = await event.locals.getUser();
  const orgId = user?.organization?.id;
  if (!orgId) {
    return { error: fail('조직 정보를 확인할 수 없습니다.', { status: 403 }) };
  }
  return { orgId };
}

/**
 * 백엔드 호출 에러를 사용자 응답으로 정규화
 * 400(검증 실패 등)/503(암호화 키 미설정)은 백엔드 메시지를 그대로 전달해 사용자가 원인을 알 수 있게 한다.
 */
export function mapApiCredentialError(error: unknown, fallback: string): Response {
  return mapHttpError(error, {
    fallback,
    log: 'api-credential bff failed',
    table: {
      ...AUTH_ERROR_RULES,
      400: (e) => ({
        message: e.response?.data?.error ?? e.response?.data?.message ?? '잘못된 요청입니다.'
      }),
      404: { message: '대상을 찾을 수 없습니다.' },
      503: (e) => ({
        message:
          e.response?.data?.error ?? e.response?.data?.message ?? '자격증명 저장소를 사용할 수 없습니다.'
      })
    }
  });
}
