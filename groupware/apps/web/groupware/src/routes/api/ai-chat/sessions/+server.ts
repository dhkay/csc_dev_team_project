// AI 챗봇 세션 BFF: language-model(FastAPI) /conversations 로 중계(서비스토큰 자동 주입)
// 신원(org/user)은 BFF 가 세션(getUser)에서 도출해 X-Organization-Id/X-User-Id 헤더로 주입한다.
//  → 조직 소속원 개인별 세션 격리(브라우저는 신원을 지정하지 못한다)
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverLanguageModelClient } from '$lib/infrastructure/http/serverClientInstances';
import { requireIdentity, mapError } from '$lib/server/ai-chat/bff';

interface SessionDto {
  id: string;
  title: string;
  model: string;
  enable_thinking: boolean;
  created_at: string | null;
  updated_at: string | null;
}

/** 세션 목록: GET /api/ai-chat/sessions */
export async function GET(event: RequestEvent) {
  const auth = await requireIdentity(event);
  if ('error' in auth) return auth.error;
  try {
    const res = await serverLanguageModelClient().GET<SessionDto[]>('/conversations', {
      headers: auth.headers
    });
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapError(error, '세션 목록을 불러오지 못했습니다.');
  }
}

/** 세션 생성: POST /api/ai-chat/sessions { model?, title? } */
export async function POST(event: RequestEvent) {
  const auth = await requireIdentity(event);
  if ('error' in auth) return auth.error;
  const body = await event.request.json().catch(() => ({}));
  try {
    const res = await serverLanguageModelClient().POST<SessionDto>(
      '/conversations',
      {
        model: body?.model ?? null,
        title: body?.title ?? null,
        enable_thinking: body?.enable_thinking === true
      },
      { headers: auth.headers }
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapError(error, '세션 생성에 실패했습니다.');
  }
}
