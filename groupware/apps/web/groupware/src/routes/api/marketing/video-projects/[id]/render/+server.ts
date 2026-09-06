// 영상 재렌더 BFF: POST /api/marketing/video-projects/:id/render. csc-marketing `/video-projects/:id/render` 중계
// 저장된 조합 스펙으로 새 렌더 잡을 등록한다(다시 만들기)
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, parseIdParam } from '$lib/server/http/bff';
import { requireOrgUserVersion,
  versionedPath, mapMarketingError } from '$lib/server/marketing/bff';
import {
  withVideoProjectUrls,
  type RawVideoProject,
} from '$lib/server/marketing/videoProjectUrls';

export async function POST(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const id = parseIdParam(event.params.id);
  if (!id) return fail('잘못된 요청입니다.', { status: 400 });

  try {
    const res = await serverMarketingClient().POST<RawVideoProject>(
      versionedPath(auth.version, `/video-projects/${id}/render`),
      { organizationId: auth.orgId, ownerUserId: auth.userId },
    );
    return ok(withVideoProjectUrls(res.data));
  } catch (error) {
    return mapMarketingError(error, '다시 만들기에 실패했습니다.');
  }
}
