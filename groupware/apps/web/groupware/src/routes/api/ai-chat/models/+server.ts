// AI 챗봇 모델 목록 BFF. language-model 의 /conversations/models 로 중계한다(서비스토큰 자동 주입).
// 드롭다운 모델 목록의 진실원은 백엔드 카탈로그다(프론트는 렌더만). 신원 무관하지만
// 로그인 사용자만 접근하도록 requireIdentity 로 인증은 강제한다.
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverLanguageModelClient } from '$lib/infrastructure/http/serverClientInstances';
import { requireIdentity, mapError } from '$lib/server/ai-chat/bff';

interface ModelDto {
  id: string;
  label: string;
  serving: string;
  vendor?: string | null;
  available: boolean;
  supports_thinking: boolean;
  // 이 조직의 기본 모델(조직 설정 → 없으면 내장 Qwen). 프론트 초기 선택
  is_default?: boolean;
  params?: string | null;
  description?: string | null;
  context_length?: number | null;
}

/** 모델 목록. GET /api/ai-chat/models */
export async function GET(event: RequestEvent) {
  const auth = await requireIdentity(event);
  if ('error' in auth) return auth.error;
  try {
    const res = await serverLanguageModelClient().GET<ModelDto[]>('/conversations/models', {
      headers: auth.headers
    });
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapError(error, '모델 목록을 불러오지 못했습니다.');
  }
}
