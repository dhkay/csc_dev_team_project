// AI 도구 카탈로그 목록 BFF: csc-control-tower `GET /platform/ai-tools`(→ user 서버) 로 중계
// PlatformAdminGuard(access 토큰) + ServiceTokenGuard 보호라 authControlClient 가 둘 다 첨부한다.
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { authControlClient } from '$lib/infrastructure/http/serverClientInstances';
import type { AiToolCatalogItem } from '$lib/features/ai-tools/types';

export async function GET(event: RequestEvent) {
  if (!event.locals.accessToken) {
    return json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
  }
  try {
    const res = await authControlClient(event).GET<AiToolCatalogItem[]>('/platform/ai-tools');
    return json({ success: true, data: res.data });
  } catch (error) {
    console.error(
      'List AI tools failed:',
      error instanceof Error ? error.message : 'unknown',
    );
    return json({ success: false, error: 'AI 도구 목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}
