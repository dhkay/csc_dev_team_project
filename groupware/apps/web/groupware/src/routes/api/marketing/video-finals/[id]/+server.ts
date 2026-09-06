// 최종 영상 단건 BFF: 삭제(DELETE). csc-marketing `/video-finals/:id` 중계
//   단건 조회(GET)는 두지 않는다. 이유는 video-projects/[id] 의 같은 자리 주석 참고(취소 전송은
//   목록 폴링 한 경로로만 소비돼야 알림이 빠지지 않는다)
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, parseIdParam } from '$lib/server/http/bff';
import { requireOrgUserVersion,
  versionedPath, mapMarketingError } from '$lib/server/marketing/bff';

/** 삭제: DELETE /api/marketing/video-finals/:id (내 개인 최종만, 멱등) */
export async function DELETE(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const id = parseIdParam(event.params.id);
  if (!id) return fail('잘못된 요청입니다.', { status: 400 });

  try {
    await serverMarketingClient().DELETE(
      versionedPath(auth.version, `/video-finals/${id}?organizationId=${auth.orgId}&ownerUserId=${auth.userId}`),
    );
    return ok();
  } catch (error) {
    return mapMarketingError(error, '최종 영상 삭제에 실패했습니다.');
  }
}
