// 조직 자산 등록 BFF: csc-marketing `POST /common-assets`(organizationId 주입 → scope='organization')
//   업로드(presign/PUT/confirm) 완료 후 메타만 등록. ROOT/대표/팀장만(requireToolManager)
import { json, type RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { requireToolManager, mapMarketingError } from '$lib/server/marketing/bff';
import { isMarketingAssetCategory, toTagIds } from '$lib/features/marketing-assets/types';

export async function POST(event: RequestEvent) {
  const auth = await requireToolManager(event);
  if ('error' in auth) return auth.error;

  const { category, uploadId, name, mimeType, sizeBytes, tagIds } = await event.request.json();
  if (
    !isMarketingAssetCategory(category) ||
    typeof uploadId !== 'string' ||
    typeof name !== 'string' ||
    typeof mimeType !== 'string'
  ) {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  try {
    // 태그 id 는 얕게만 검증(정수 배열). 카테고리 유효성 필터는 csc-marketing 이 담당
    const ids = toTagIds(tagIds);
    const res = await serverMarketingClient().POST('/common-assets', {
      category,
      organizationId: auth.orgId,
      uploadId,
      name,
      mimeType,
      ...(typeof sizeBytes === 'number' ? { sizeBytes } : {}),
      ...(ids ? { tagIds: ids } : {}),
    });
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '자산 등록에 실패했습니다.');
  }
}
