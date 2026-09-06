// 보관함에서 꺼내기 BFF: 보관함 → 꺼낸 사람의 작업 공간
//
// 보내기와 경계가 다르다. 보내기는 소유지만 꺼내기는 아니다: 보관함이 조직 공용이라 남이 만든 것도
// 꺼낼 수 있고, 그때 소유와 채널이 꺼낸 사람 쪽으로 바뀐다. 그래서 채널을 함께 보낸다(꺼낸 항목이
// 들어갈 작업 공간을 정해야 한다: 작업 공간은 작업자 × 채널로 갈린다)
//
// 삭제(`DELETE ../:id`)와 갈라 둔 이유: 원본이 사라지지 않고 위치만 바뀌는 동작이라 같은 자원의
// 삭제로 표현하면 되돌릴 수 없는 쪽과 구분되지 않는다.
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, parseIdParam } from '$lib/server/http/bff';
import {
  mapMarketingError,
  parseChannelId,
  requireOrgUserVersion,
  versionedPath,
} from '$lib/server/marketing/bff';
import { archiveTarget } from '$lib/server/marketing/archiveTarget';

/** 보관함 꺼내기: POST /api/marketing/archive/:id/restore?channelId=... */
export async function POST(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const id = parseIdParam(event.params.id);
  if (!id) return fail('잘못된 요청입니다.', { status: 400 });

  // 대상 작업 공간(= 지금 보고 있는 채널)을 지정해야 한다. 없으면 꺼낸 항목이 어느 목록에도 없다.
  const channelId = parseChannelId(event.url.searchParams.get('channelId'));
  if (!channelId) return fail('채널이 지정되지 않았습니다.', { status: 400 });

  const target = archiveTarget(auth.version);
  try {
    const res = await serverMarketingClient().POST<Record<string, unknown>>(
      versionedPath(auth.version, `/${target.resource}/${id}/unarchive`),
      { organizationId: auth.orgId, ownerUserId: auth.userId, channelId },
    );
    return ok(target.withUrls(res.data));
  } catch (error) {
    return mapMarketingError(error, '보관함에서 꺼내기에 실패했습니다.');
  }
}
