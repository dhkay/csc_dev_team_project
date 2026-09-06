// 저장된 기획안 단건 BFF: 삭제(DELETE). csc-marketing `/saved-plans/:id` 중계(개인 소유만)
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, parseIdParam } from '$lib/server/http/bff';
import { requireOrgUserVersion,
  versionedPath, mapMarketingError } from '$lib/server/marketing/bff';

/** 삭제: DELETE /api/marketing/saved-plans/:id (내 개인 저장본만, 멱등) */
export async function DELETE(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const id = parseIdParam(event.params.id);
  if (!id) {
    return fail('잘못된 요청입니다.', { status: 400 });
  }

  try {
    await serverMarketingClient().DELETE(
      versionedPath(auth.version, `/saved-plans/${id}?organizationId=${auth.orgId}&ownerUserId=${auth.userId}`)
    );
    return ok();
  } catch (error) {
    return mapMarketingError(error, '기획안 삭제에 실패했습니다.');
  }
}
