// 포커스 키워드 후보 생성 BFF: csc-marketing `/channels/:channelId/keyword-suggestions` 중계
// 주제 한 줄(seed)을 보내면 검색 키워드 후보 목록이 온다. 저장하지 않는다(고른 것만 따로 저장)
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import {
  mapMarketingError,
  parseChannelId,
  requireOrgUserVersion,
  versionedPath
} from '$lib/server/marketing/bff';

/** 후보 생성: POST /api/marketing/channels/:channelId/keyword-suggestions { seed } */
export async function POST(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const channelId = parseChannelId(event.params.channelId);
  const body = (await event.request.json().catch(() => null)) as { seed?: unknown } | null;
  const seed = typeof body?.seed === 'string' ? body.seed.trim() : '';
  if (!channelId || seed.length === 0) {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  try {
    const res = await serverMarketingClient().POST<string[]>(
      versionedPath(auth.version, `/channels/${channelId}/keyword-suggestions`),
      { organizationId: auth.orgId, ownerUserId: auth.userId, seed },
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '키워드 후보를 만들지 못했습니다.');
  }
}
