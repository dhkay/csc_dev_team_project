// AI 챗봇 세션 단건 BFF: 메시지 조회 / 사고 토글 / 삭제. language-model /conversations/{id} 로 중계
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverLanguageModelClient } from '$lib/infrastructure/http/serverClientInstances';
import { requireIdentity, mapError } from '$lib/server/ai-chat/bff';

interface MessageDto {
  id: string;
  role: string;
  content: string;
  model: string | null;
  created_at: string | null;
}

/** 메시지 목록: GET /api/ai-chat/sessions/:id */
export async function GET(event: RequestEvent) {
  const auth = await requireIdentity(event);
  if ('error' in auth) return auth.error;
  const id = event.params.id;
  try {
    const res = await serverLanguageModelClient().GET<MessageDto[]>(
      `/conversations/${id}/messages`,
      { headers: auth.headers }
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapError(error, '메시지를 불러오지 못했습니다.');
  }
}

/** 사고 토글: PATCH /api/ai-chat/sessions/:id { enable_thinking } */
export async function PATCH(event: RequestEvent) {
  const auth = await requireIdentity(event);
  if ('error' in auth) return auth.error;
  const id = event.params.id;
  const body = await event.request.json().catch(() => ({}));
  if (typeof body?.enable_thinking !== 'boolean') {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }
  try {
    const res = await serverLanguageModelClient().PATCH(
      `/conversations/${id}`,
      { enable_thinking: body.enable_thinking },
      { headers: auth.headers }
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapError(error, '사고 설정 변경에 실패했습니다.');
  }
}

/** 삭제: DELETE /api/ai-chat/sessions/:id (멱등) */
export async function DELETE(event: RequestEvent) {
  const auth = await requireIdentity(event);
  if ('error' in auth) return auth.error;
  const id = event.params.id;
  try {
    await serverLanguageModelClient().DELETE(`/conversations/${id}`, undefined, {
      headers: auth.headers
    });
    return json({ success: true });
  } catch (error) {
    return mapError(error, '세션 삭제에 실패했습니다.');
  }
}
