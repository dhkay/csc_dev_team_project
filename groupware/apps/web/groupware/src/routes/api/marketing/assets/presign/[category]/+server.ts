// 조직 자산 업로드 presign BFF: file-upload `POST /uploads/presign`(서비스토큰 자동 주입)
//   scope='groupware' + partition=`${orgId}/marketing-video/<cat>` 주입(브라우저 비선택). ROOT/대표/팀장만
//   카테고리는 경로 파라미터(uploadBlob 은 body 에 {fileName,mimeType,size} 만 보냄)
import { json, type RequestEvent } from '@sveltejs/kit';
import { serverStorageClient } from '$lib/infrastructure/http/serverClientInstances';
import { requireToolManager, mapMarketingError } from '$lib/server/marketing/bff';
import { isMarketingAssetCategory } from '$lib/features/marketing-assets/types';

interface PresignResponse {
  upload_id: string;
  presigned_url: string;
}

export async function POST(event: RequestEvent) {
  const auth = await requireToolManager(event);
  if ('error' in auth) return auth.error;

  const category = event.params.category;
  if (!isMarketingAssetCategory(category)) {
    return json({ success: false, error: '잘못된 카테고리입니다.' }, { status: 400 });
  }

  const { fileName, mimeType, size } = await event.request.json();
  if (typeof fileName !== 'string' || typeof mimeType !== 'string' || typeof size !== 'number') {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  try {
    const res = await serverStorageClient().POST<PresignResponse>('/uploads/presign', {
      file_name: fileName,
      mime_type: mimeType,
      size,
      scope: 'groupware',
      partition: `${auth.orgId}/marketing-video/${category.toLowerCase().replace(/_/g, '-')}`,
      organization_id: auth.orgId,
    });
    return json({
      success: true,
      data: { uploadId: res.data.upload_id, presignedUrl: res.data.presigned_url },
    });
  } catch (error) {
    return mapMarketingError(error, '업로드 준비에 실패했습니다.');
  }
}
