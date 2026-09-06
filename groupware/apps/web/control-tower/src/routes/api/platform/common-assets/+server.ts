// 공통 에셋 등록 BFF: csc-marketing `POST /common-assets` 로 중계(서비스토큰 자동 주입)
//   업로드(presign/PUT/confirm) 완료 후 메타(카테고리/uploadId/이름/mime)만 등록한다.
//   플랫폼 관리자(ai-tools-management) 전용. createdByAdminId 는 세션의 관리자 id(감사)
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError } from '$lib/server/http/bff';
import { requireAdminFeature } from '$lib/server/platform/guard';
import { isCommonAssetCategory, toTagIds } from '$lib/features/common-assets/types';

export async function POST(event: RequestEvent) {
  const gateErr = await requireAdminFeature(event, 'ai-tools-management');
  if (gateErr) return gateErr;

  try {
    const { category, uploadId, name, mimeType, sizeBytes, tagIds } = await event.request.json();
    if (
      !isCommonAssetCategory(category) ||
      typeof uploadId !== 'string' ||
      typeof name !== 'string' ||
      typeof mimeType !== 'string'
    ) {
      return fail('잘못된 요청입니다.', { status: 400 });
    }

    const ids = toTagIds(tagIds);
    const res = await serverMarketingClient().POST('/common-assets', {
      category,
      uploadId,
      name,
      mimeType,
      ...(typeof sizeBytes === 'number' ? { sizeBytes } : {}),
      ...(ids ? { tagIds: ids } : {}),
      ...(typeof event.locals.userId === 'number' ? { createdByAdminId: event.locals.userId } : {}),
    });
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '에셋 등록에 실패했습니다.',
      log: 'Create common asset failed',
      table: { ...AUTH_ERROR_RULES, 400: { message: '입력값을 확인하세요.' } },
    });
  }
}
