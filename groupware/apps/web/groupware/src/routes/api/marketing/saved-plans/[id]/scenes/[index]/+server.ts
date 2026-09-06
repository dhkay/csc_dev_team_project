// 저장본 씬 편집 BFF: csc-marketing `PATCH /saved-plans/:id/scenes/:index` 중계(내 개인 저장본만)
//   브리프(imagePrompt) 수정 / 이미지 교체(uploadId + prompt) 중 준 것만 반영. 이미지 바이트 업로드
//   (presign→PUT)는 프론트가 먼저 수행해 uploadId 를 넘긴다. 확정(confirm)은 csc-marketing 이 한다:
//   교체가 실패했을 때 그 자산이 PENDING 으로 남아 수거되게(참조 없는 UPLOADED 를 만들지 않는다)
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail } from '$lib/server/http/bff';
import { requireOrgUserVersion,
  versionedPath, mapMarketingError } from '$lib/server/marketing/bff';

function parseIntParam(raw: string | undefined, min: number): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= min ? n : null;
}

/** 씬 편집: PATCH /api/marketing/saved-plans/:id/scenes/:index { uploadId?, prompt?, imagePrompt? } */
export async function PATCH(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const id = parseIntParam(event.params.id, 1);
  // 씬 인덱스는 0부터다(백엔드 @ApiParam 과 저장본 sceneImages 가 0-based). min 1 로 두면 첫 씬
  //   편집이 늘 400 으로 막힌다.
  const index = parseIntParam(event.params.index, 0);
  if (id === null || index === null) {
    return fail('잘못된 요청입니다.', { status: 400 });
  }

  const body = await event.request.json();
  const { uploadId, prompt, imagePrompt } = body ?? {};

  try {
    const res = await serverMarketingClient().PATCH(versionedPath(auth.version, `/saved-plans/${id}/scenes/${index}`), {
      organizationId: auth.orgId,
      ownerUserId: auth.userId,
      ...(typeof uploadId === 'string' ? { uploadId } : {}),
      ...(typeof prompt === 'string' ? { prompt } : {}),
      ...(typeof imagePrompt === 'string' ? { imagePrompt } : {})
    });
    return ok(res.data);
  } catch (error) {
    return mapMarketingError(error, '씬을 수정하지 못했습니다.');
  }
}
