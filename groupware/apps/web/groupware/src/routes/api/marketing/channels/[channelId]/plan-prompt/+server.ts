// 채널별 기획서 생성 프롬프트 BFF: csc-marketing `/channels/:channelId/plan-prompt` 중계
// GET: 고정 머리/꼬리 + 편집 가능한 중간 지침(현재값) + 기본값. PUT: 편집 지침 저장(편집 권한)
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { mapMarketingError, parseChannelId, requireOrgUserVersion,
  versionedPath, requireToolSettingsEditor } from '$lib/server/marketing/bff';

interface PlanPromptView {
  header: string;
  footer: string;
  // header/footer 의 한국어 표시본(영어가 실물, 이건 표시용). BFF 는 그대로 통과시킨다.
  defaultInstructions: string;
  instructions: string;
  // 채널 이미지 모델에 적용되는 안전 제약(고정). 해당 없으면 ''
  imageSafetyDirective: string;
}

/** 조회: GET /api/marketing/channels/:channelId/plan-prompt */
export async function GET(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const channelId = parseChannelId(event.params.channelId);
  if (!channelId) {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  try {
    const res = await serverMarketingClient().GET<PlanPromptView>(
      versionedPath(auth.version, `/channels/${channelId}/plan-prompt?organizationId=${auth.orgId}&ownerUserId=${auth.userId}`),
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '기획서 프롬프트를 불러오지 못했습니다.');
  }
}

/** 저장: PUT /api/marketing/channels/:channelId/plan-prompt { instructions } */
export async function PUT(event: RequestEvent) {
  const auth = await requireToolSettingsEditor(event);
  if ('error' in auth) return auth.error;

  const channelId = parseChannelId(event.params.channelId);
  if (!channelId) {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const body = (await event.request.json().catch(() => null)) as { instructions?: unknown } | null;
  const instructions = typeof body?.instructions === 'string' ? body.instructions : '';

  try {
    const res = await serverMarketingClient().PUT<PlanPromptView>(
      versionedPath(auth.version, `/channels/${channelId}/plan-prompt`),
      { organizationId: auth.orgId, ownerUserId: auth.userId, instructions },
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '기획서 프롬프트를 저장하지 못했습니다.');
  }
}
