// AI 챗봇 도메인 타입(브라우저): BFF(/api/ai-chat) 응답 형태와 일치

export type ChatRole = 'user' | 'assistant' | 'system';

/** 드롭다운 모델 항목: 백엔드 카탈로그(SSOT)가 내려주는 형태 */
export interface ChatModel {
  id: string;
  label: string;
  serving: 'self' | 'api';
  // 제공 기업/브랜드(드롭다운 '기업' 그룹, 예: "Qwen", "Anthropic")
  vendor?: string | null;
  available: boolean;
  supports_thinking: boolean;
  // 이 조직의 기본 모델(조직 설정 → 없으면 내장 Qwen). 새 대화의 초기 선택
  is_default?: boolean;
  // 드롭다운 상세(선택: 백엔드 카탈로그가 있으면 내려줌)
  params?: string | null; // 파라미터 수(예: "4B", "14B")
  description?: string | null; // 한 줄 설명
  context_length?: number | null; // 컨텍스트 길이(토큰)
}

export interface ChatSession {
  id: string;
  title: string;
  model: string;
  enable_thinking: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  model?: string | null;
  created_at?: string | null;
}

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

/** 스트리밍 턴 콜백: apis.streamTurn 이 SSE 프레임을 파싱해 호출 */
export interface StreamHandlers {
  onToken: (delta: string) => void;
  onDone?: (usage: TokenUsage | null) => void;
  onError?: (message: string) => void;
}
