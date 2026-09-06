// 영상 프로젝트 단건 BFF: 삭제(DELETE). csc-marketing `/video-projects/:id` 중계
//
// 단건 조회(GET)는 두지 않는다. 렌더 상태는 목록 폴링이 가지고 오고, 그 목록 응답만이 취소된
// 작업(CANCELLED)을 사유와 함께 한 번 내려주는 경로다(그 뒤로는 조회에서 제외된다). 단건 조회를
// 열어 두면 그 한 번의 전송이 알림 배선 없는 경로로 소비돼, 작업이 조용히 사라질 수 있다.
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, parseIdParam } from '$lib/server/http/bff';
import { requireOrgUserVersion,
  versionedPath, mapMarketingError } from '$lib/server/marketing/bff';

/** 삭제: DELETE /api/marketing/video-projects/:id (내 개인 프로젝트만, 멱등) */
export async function DELETE(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const id = parseIdParam(event.params.id);
  if (!id) return fail('잘못된 요청입니다.', { status: 400 });

  try {
    await serverMarketingClient().DELETE(
      versionedPath(auth.version, `/video-projects/${id}?organizationId=${auth.orgId}&ownerUserId=${auth.userId}`),
    );
    return ok();
  } catch (error) {
    return mapMarketingError(error, '영상 삭제에 실패했습니다.');
  }
}
