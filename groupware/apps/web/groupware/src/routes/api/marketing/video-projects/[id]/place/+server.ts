// 작업 공간 배치 BFF: POST /api/marketing/video-projects/:id/place.
// csc-marketing `/video-projects/:id/place` 중계. 생성 창의 마지막 단계이고, 확정 단계를 가진 도구
// 버전에서는 이것을 거친 영상만 작업 공간 목록에 선다.
//
// 썸네일은 선택이다: 브라우저가 presign + PUT 까지만 마친 uploadId 를 보내고 UPLOADED 확정은 그
// 자산을 참조할 행을 고치는 백엔드가 한다(계약: docs/specs/marketing-write-consistency.md 4.2)
// 그림을 만들지 못해도 배치는 되어야 한다: 아니면 만들어진 영상이 어느 목록에도 없다.
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

  const body = (await event.request.json().catch(() => null)) as
    | { thumbnailUploadId?: unknown }
    | null;
  // 빈 값을 실어 보내지 않는다: 백엔드가 "그림이 있다" 로 읽어 확정할 수 없는 자산을 기다린다.
  const thumbnailUploadId =
    typeof body?.thumbnailUploadId === 'string' && body.thumbnailUploadId.trim()
      ? body.thumbnailUploadId.trim()
      : undefined;

  try {
    const res = await serverMarketingClient().POST<RawVideoProject>(
      versionedPath(auth.version, `/video-projects/${id}/place`),
      {
        organizationId: auth.orgId,
        ownerUserId: auth.userId,
        ...(thumbnailUploadId ? { thumbnailUploadId } : {}),
      },
    );
    return ok(withVideoProjectUrls(res.data));
  } catch (error) {
    return mapMarketingError(error, '작업 공간에 배치하지 못했습니다.');
  }
}
