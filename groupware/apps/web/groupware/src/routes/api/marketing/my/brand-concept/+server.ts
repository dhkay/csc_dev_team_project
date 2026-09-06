// 개인 브랜드/컨셉 세트 BFF: csc-marketing `/user-settings/brand-concept` 중계
// GET: 보는 사람이 있는 버전의 세트 목록. PUT: 그 버전 슬롯에 교체 저장
//   버전은 요청이 나른다(`?version=`). 백엔드가 저장값에서 정하면 화면이 보여 주는 세트와 생성이
//   실제로 쓰는 세트가 갈린다.
//
// 권한 게이트가 없다(requireOrgUser 로 본인 확인만). 자기 브랜드라 남의 허락이 필요하지 않다.
// ownerUserId 는 세션에서 나온다. 요청 본문의 값을 쓰면 남의 세트를 덮어쓸 수 있다.
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { mapMarketingError, requireOrgUserVersion, versionedPath } from '$lib/server/marketing/bff';
import type { BrandConceptSet } from '$lib/features/marketing-channels/types';

/** 조회: GET /api/marketing/my/brand-concept */
export async function GET(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  try {
    const res = await serverMarketingClient().GET<BrandConceptSet[]>(
      versionedPath(auth.version, `/user-settings/brand-concept?organizationId=${auth.orgId}&ownerUserId=${auth.userId}`),
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '브랜드/컨셉을 불러오지 못했습니다.');
  }
}

/** 저장: PUT /api/marketing/my/brand-concept { sets } */
export async function PUT(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const body = (await event.request.json().catch(() => null)) as { sets?: unknown } | null;
  if (!body || !Array.isArray(body.sets)) {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  try {
    const res = await serverMarketingClient().PUT<BrandConceptSet[]>(
      versionedPath(auth.version, '/user-settings/brand-concept'),
      { organizationId: auth.orgId, ownerUserId: auth.userId, sets: body.sets },
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '브랜드/컨셉을 저장하지 못했습니다.');
  }
}
