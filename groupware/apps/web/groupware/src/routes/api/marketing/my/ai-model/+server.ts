// 개인 AI 모델 선택 BFF: csc-marketing `/user-settings/ai-model` 중계
// GET: 역량(LLM/영상/TTS)별 모델 id. PUT: 선택 교체 저장
//
// 권한 게이트가 없다(requireOrgUser 로 본인 확인만): 자기 선택이라 남의 허락이 필요하지 않다.
//   채널 단위였을 때는 팀장이 정한 하나를 그 채널의 모두가 따랐으므로 requireToolSettingsEditor 로 막았다.
// ownerUserId 는 세션에서 나온다. 요청 본문의 값을 쓰면 남의 선택을 덮어쓸 수 있다.
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { mapMarketingError, requireOrgUserVersion, versionedPath } from '$lib/server/marketing/bff';

interface AiModelSelection {
  llm: string;
  video: string;
  videoMode: string;
  tts: string;
  ttsVoice: string;
  ttsPitch: string;
  image: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** 조회: GET /api/marketing/my/ai-model → { data: {llm,video,tts,...} } */
export async function GET(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  try {
    const res = await serverMarketingClient().GET<AiModelSelection>(
      versionedPath(auth.version, `/user-settings/ai-model?organizationId=${auth.orgId}&ownerUserId=${auth.userId}`),
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, 'AI 모델을 불러오지 못했습니다.');
  }
}

/** 저장: PUT /api/marketing/my/ai-model { llm, video, tts, ... } */
export async function PUT(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const body = (await event.request.json().catch(() => null)) as Partial<AiModelSelection> | null;
  if (!body || typeof body !== 'object') {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  try {
    const res = await serverMarketingClient().PUT<AiModelSelection>(versionedPath(auth.version, '/user-settings/ai-model'), {
      organizationId: auth.orgId,
      ownerUserId: auth.userId,
      llm: str(body.llm),
      video: str(body.video),
      videoMode: str(body.videoMode),
      tts: str(body.tts),
      ttsVoice: str(body.ttsVoice),
      ttsPitch: str(body.ttsPitch),
      image: str(body.image),
    });
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, 'AI 모델을 저장하지 못했습니다.');
  }
}
