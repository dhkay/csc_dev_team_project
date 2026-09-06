// AI도구 배포 BFF: user 서버 `/user-api/org/ai-tools/*`(JWT=슈퍼관리자)로 중계
// 팀(부서) 부여 / 멤버 부여. 현황(matrix)은 SSR(+page.server.ts)에서 조회
// 테넌트 격리, ROOT 강제, 조직 보유 범위는 user 서버가 강제
import type { RequestEvent } from '@sveltejs/kit';
import { authUserClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

export async function POST(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const body = await event.request.json();
    const client = authUserClient(event);

    if (body.action === 'department' || body.action === 'member') {
      if (typeof body.id !== 'number' || !Array.isArray(body.aiToolKeys)) {
        return fail('잘못된 요청입니다.', { status: 400 });
      }
      const path =
        body.action === 'department'
          ? `/user-api/org/departments/${body.id}/ai-tools`
          : `/user-api/org/members/${body.id}/ai-tools`;
      await client.POST(path, { aiToolKeys: body.aiToolKeys });
      return ok();
    }

    return fail('잘못된 요청입니다.', { status: 400 });
  } catch (error) {
    return mapHttpError(error, {
      fallback: 'AI도구 배포에 실패했습니다.',
      log: 'AI tool distribution failed',
      table: {
        ...AUTH_ERROR_RULES,
        404: { message: '대상을 찾을 수 없습니다.' },
        400: { message: '입력값을 확인하세요.' }
      }
    });
  }
}
