// 세그먼트 재생성 BFF: POST /api/marketing/video-projects/:id/segments/:order/render.
// csc-marketing `/video-projects/:id/segments/:order/render` 중계. 붙어 있는 렌더 잡을 다시 돌려
// 그 세그먼트 하나만 만든다(나머지는 이미 만든 것을 쓰므로 벤더 비용이 그 하나에 그친다)
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
  // 순번은 0 부터 시작할 수 있어 parseIdParam(1 이상)을 쓰지 않는다. 음수와 비정수만 막는다.
  const order = Number(event.params.order);
  if (!id || !Number.isInteger(order) || order < 0) {
    return fail('잘못된 요청입니다.', { status: 400 });
  }

  const body = (await event.request.json().catch(() => ({}))) as {
    visualPrompt?: unknown;
  };
  const visualPrompt = typeof body.visualPrompt === 'string' ? body.visualPrompt : null;

  try {
    const res = await serverMarketingClient().POST<RawVideoProject>(
      versionedPath(auth.version, `/video-projects/${id}/segments/${order}/render`),
      { organizationId: auth.orgId, ownerUserId: auth.userId, visualPrompt },
    );
    return ok(withVideoProjectUrls(res.data));
  } catch (error) {
    return mapMarketingError(error, '세그먼트 다시 만들기에 실패했습니다.');
  }
}
