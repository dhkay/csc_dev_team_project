// AI 챗봇 스트리밍 BFF (저장소 최초 SSE): language-model /conversations/{id}/stream 을 그대로 통과시킨다.
//  - axios 는 스트리밍에 부적합 → fetch 로 업스트림 ReadableStream 을 그대로 반환한다.
//  - 서비스토큰은 인터셉터가 아니라 여기서 직접 발급(fetch 경로라 axios 인터셉터를 안 탄다)
//  - 신원(org/user)은 세션에서 도출해 헤더로 주입(브라우저 비지정)
//  - 클라 연결 끊김(event.request.signal)을 업스트림 fetch 로 전달 → language-model 가 추론을 취소(GPU 슬롯 회수)
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { createServiceToken } from '$lib/shared/lib/utils/serviceToken';
import { requireIdentity } from '$lib/server/ai-chat/bff';

const LANGUAGE_MODEL_BASE = (
  privateEnv.PRIVATE_LANGUAGE_MODEL_API_URL || 'http://localhost:8010'
).replace(/\/$/, '');

/** 스트리밍 턴: POST /api/ai-chat/sessions/:id/stream { text, model? } → text/event-stream */
export async function POST(event: RequestEvent) {
  const auth = await requireIdentity(event);
  if ('error' in auth) return auth.error;

  const body = await event.request.json().catch(() => ({}));
  if (typeof body?.text !== 'string' || body.text.trim() === '') {
    return json({ success: false, error: '메시지를 입력하세요.' }, { status: 400 });
  }

  const id = event.params.id;
  let upstream: Response;
  try {
    upstream = await fetch(`${LANGUAGE_MODEL_BASE}/conversations/${id}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': createServiceToken(),
        ...auth.headers
      },
      body: JSON.stringify({
        text: body.text,
        model: body?.model ?? null,
        enable_thinking: typeof body?.enable_thinking === 'boolean' ? body.enable_thinking : null
      }),
      signal: event.request.signal
    });
  } catch (error) {
    console.error('ai-chat stream upstream failed:', error instanceof Error ? error.message : 'unknown');
    return json({ success: false, error: '스트리밍 연결에 실패했습니다.' }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const status = upstream.status === 404 ? 404 : upstream.status === 400 ? 400 : 502;
    return json({ success: false, error: '스트리밍을 시작하지 못했습니다.' }, { status });
  }

  // 업스트림 SSE 스트림을 그대로 브라우저로 통과. x-accel-buffering:no 로 nginx 버퍼링 비활성
  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}
