// AI 챗봇 데이터 접근(브라우저): 같은 origin BFF(/api/ai-chat)만 호출. 신원은 BFF 가 주입
//  - 세션 CRUD 는 frontClient(axios 봉투) 사용
//  - 스트리밍(streamTurn)은 fetch + ReadableStream 리더로 SSE 를 직접 파싱한다(axios 부적합)
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import { run, type ApiResult } from '$lib/infrastructure/http/apiResult';
import type { ChatMessage, ChatModel, ChatSession, StreamHandlers, TokenUsage } from '../types';

const SESSIONS = ROUTES.AI_CHAT.SESSIONS;
const MODELS = ROUTES.AI_CHAT.MODELS;

/** 공용 결과 봉투(앱 공용 run 과 동형) */
export type ChatResult<T = unknown> = ApiResult<T>;

export function listModels(): Promise<ChatResult<ChatModel[]>> {
  return run<ChatModel[]>(() => frontClient().GET(MODELS));
}

export function listSessions(): Promise<ChatResult<ChatSession[]>> {
  return run<ChatSession[]>(() => frontClient().GET(SESSIONS));
}

export function createSession(
  model?: string,
  title?: string,
  enableThinking?: boolean
): Promise<ChatResult<ChatSession>> {
  return run<ChatSession>(() =>
    frontClient().POST(SESSIONS, { model, title, enable_thinking: enableThinking })
  );
}

export function getMessages(id: string): Promise<ChatResult<ChatMessage[]>> {
  return run<ChatMessage[]>(() => frontClient().GET(`${SESSIONS}/${id}`));
}

/** 대화창 사고 토글 영속: PATCH { enable_thinking }. 메시지 전송 없이 켜고/끈 상태를 저장 */
export function setThinking(id: string, enableThinking: boolean): Promise<ChatResult<ChatSession>> {
  return run<ChatSession>(() =>
    frontClient().PATCH(`${SESSIONS}/${id}`, { enable_thinking: enableThinking })
  );
}

export function deleteSession(id: string): Promise<ChatResult> {
  return run(() => frontClient().DELETE(`${SESSIONS}/${id}`));
}

/** SSE 한 프레임의 event/data 를 파싱 */
function parseFrame(frame: string): { event: string; data: string } | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

/**
 * 스트리밍 턴: POST /api/ai-chat/sessions/:id/stream 을 fetch 로 열고 SSE 를 파싱해 콜백 호출
 * signal 로 취소(중단 버튼)하면 fetch 가 abort → BFF/language-model 가 추론을 취소한다.
 */
export async function streamTurn(
  id: string,
  text: string,
  model: string | undefined,
  enableThinking: boolean | undefined,
  handlers: StreamHandlers,
  signal: AbortSignal
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${SESSIONS}/${id}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model, enable_thinking: enableThinking }),
      signal
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return;
    handlers.onError?.('스트리밍 연결에 실패했습니다.');
    return;
  }

  if (!res.ok || !res.body) {
    handlers.onError?.('스트리밍을 시작하지 못했습니다.');
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // CRLF(\r\n) 정규화: sse-starlette 는 \r\n\r\n 로 프레임을 구분한다.
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
      // SSE 프레임 구분 = 빈 줄(\n\n)
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const parsed = parseFrame(frame);
        if (!parsed) continue;
        if (parsed.event === 'token') {
          try {
            handlers.onToken(JSON.parse(parsed.data).delta ?? '');
          } catch {
            /* skip malformed */
          }
        } else if (parsed.event === 'done') {
          let usage: TokenUsage | null = null;
          try {
            usage = JSON.parse(parsed.data).usage ?? null;
          } catch {
            /* ignore */
          }
          handlers.onDone?.(usage);
        } else if (parsed.event === 'error') {
          let msg = '생성 중 오류가 발생했습니다.';
          try {
            msg = JSON.parse(parsed.data).message ?? msg;
          } catch {
            /* ignore */
          }
          handlers.onError?.(msg);
        }
      }
    }
  } catch (e) {
    if ((e as Error)?.name !== 'AbortError') {
      handlers.onError?.('스트리밍 중 오류가 발생했습니다.');
    }
  }
}
