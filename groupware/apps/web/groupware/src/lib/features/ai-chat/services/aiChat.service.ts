// AI 챗봇 서비스: 컴포넌트는 이 서비스만 참조한다.
// 스트리밍(streamTurn)은 본질적으로 명령형이라 TanStack 대신 apis 를 직접 노출한다.
// 세션 목록/CRUD 는 apis 를 그대로 재노출(추후 TanStack 이관 여지)
import {
  createSession,
  deleteSession,
  getMessages,
  listModels,
  listSessions,
  setThinking,
  streamTurn
} from '../apis/aiChatApi';

export const aiChatService = {
  listModels,
  listSessions,
  createSession,
  getMessages,
  setThinking,
  deleteSession,
  streamTurn
};
