// 공통 에셋 presign BFF: file-upload `POST /uploads/presign` 로 중계(서비스토큰 자동 주입)
//   BFF 가 scope='platform' + partition='marketing-video/<cat>' 주입 → object_key=platform/marketing-video/bgm/<uuid>.
//   플랫폼 관리자(ai-tools-management) 전용: 백엔드는 서비스토큰만 검증하므로 인가는 여기서 건다.
import type { RequestEvent } from '@sveltejs/kit';
import { serverStorageClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError } from '$lib/server/http/bff';
import { requireAdminFeature } from '$lib/server/platform/guard';
import { isCommonAssetCategory, type CommonAssetCategory } from '$lib/features/common-assets/types';
import type { PresignResponse } from '$lib/server/upload/presign';

/** 카테고리 → 스토리지 파티션 슬러그. platform/marketing-video/<slug>/<uuid> 로 폴더 분리(각 세그먼트 [a-z0-9-]+) */
function partitionFor(category: CommonAssetCategory): string {
  return `marketing-video/${category.toLowerCase().replace(/_/g, '-')}`;
}

export async function POST(event: RequestEvent) {
  const gateErr = await requireAdminFeature(event, 'ai-tools-management');
  if (gateErr) return gateErr;

  try {
    const { category, fileName, mimeType, size } = await event.request.json();
    if (
      !isCommonAssetCategory(category) ||
      typeof fileName !== 'string' ||
      typeof mimeType !== 'string' ||
      typeof size !== 'number'
    ) {
      return fail('잘못된 요청입니다.', { status: 400 });
    }

    const res = await serverStorageClient().POST<PresignResponse>('/uploads/presign', {
      file_name: fileName,
      mime_type: mimeType,
      size,
      scope: 'platform',
      partition: partitionFor(category),
    });

    return ok({ uploadId: res.data.upload_id, presignedUrl: res.data.presigned_url });
  } catch (error) {
    return mapHttpError(error, {
      fallback: '업로드 준비에 실패했습니다.',
      log: 'Common asset presign failed',
      table: { ...AUTH_ERROR_RULES, 400: { message: '업로드할 수 없는 파일입니다.' } },
    });
  }
}
