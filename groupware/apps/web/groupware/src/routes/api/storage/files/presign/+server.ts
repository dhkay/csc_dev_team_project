// 스토리지 업로드 주소 발급 BFF.
//
// 본문은 uploadBlob 계약대로 {fileName, mimeType, size} 뿐이다. 어느 영역에 올리는지는
// 쿼리스트링으로 온다(업로더가 라우트 문자열 하나만 정하면 되도록: upload.ts 머리말 참고)
// 저장 경로와 소유 컬럼은 file-upload 가 영역과 신원으로 만든다. 브라우저는 관여하지 않는다.
import type { RequestHandler } from '@sveltejs/kit';
import { fail, ok } from '$lib/server/http/bff';
import { mapStorageError, resolveStorageRequest, storagePost } from '$lib/server/storage/api';

interface RawPresign {
  upload_id: string;
  object_key: string;
  presigned_url: string;
}

export const POST: RequestHandler = async (event) => {
  const params = event.url.searchParams;
  const resolved = await resolveStorageRequest(event, params.get('area'), params.get('dept'));
  if ('error' in resolved) return resolved.error;

  const body = await event.request.json().catch(() => null);
  const fileName = typeof body?.fileName === 'string' ? body.fileName : '';
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : '';
  const size = typeof body?.size === 'number' ? body.size : 0;
  if (!fileName || !mimeType || size <= 0) {
    return fail('업로드 정보가 올바르지 않습니다.', { status: 400 });
  }

  try {
    const res = await storagePost<RawPresign>(resolved.access, '/storage/presign', {
      scope: resolved.scope,
      file_name: fileName,
      mime_type: mimeType,
      size
    });
    return ok({
      uploadId: res.data.upload_id,
      presignedUrl: res.data.presigned_url
    });
  } catch (error) {
    return mapStorageError(error, '업로드 준비에 실패했습니다.');
  }
};
