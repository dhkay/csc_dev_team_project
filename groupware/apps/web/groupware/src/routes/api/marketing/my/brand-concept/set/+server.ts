// 브랜드/컨셉 세트 하나의 연출 BFF: csc-marketing `/user-settings/brand-concept/set` 중계
//
// 옆 라우트(`../`)와 범위가 다르다. 그쪽은 세트 목록 전체의 이름과 설명, 선택을 저장하고 카테고리
//   정의는 손대지 않는다. 이쪽은 세트 하나의 카테고리와 레퍼런스 정의, 그리고 그중 무엇을 골랐는지를
//   저장한다. 화면에서도 저장 버튼이 다르다(설정 하단 바 / 카테고리 관리 모달)
//
// 선택은 양쪽에서 저장된다. 두 화면이 같은 값을 다루므로 나중에 저장한 쪽이 남는다.
//
// 권한 게이트가 없다(requireOrgUserVersion 로 본인 확인만): 자기 브랜드라 남의 허락이 필요하지 않다.
// ownerUserId 는 세션에서 나온다. 요청 본문의 값을 쓰면 남의 세트를 덮어쓸 수 있다.
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import {
  mapMarketingError,
  parseConceptChoices,
  requireOrgUserVersion,
  versionedPath,
} from '$lib/server/marketing/bff';
import type { BrandConceptSet } from '$lib/features/marketing-channels/types';

/** 저장: PUT /api/marketing/my/brand-concept/set { brandName, customAxes, customOptions, concepts } */
export async function PUT(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const body = (await event.request.json().catch(() => null)) as {
    brandName?: unknown;
    customAxes?: unknown;
    customOptions?: unknown;
    concepts?: unknown;
  } | null;
  // 형태만 좁힌다. 어떤 정의가 유효한지(key 형식, 이름 중복, 고아)는 백엔드가 판정한다.
  if (
    !body ||
    typeof body.brandName !== 'string' ||
    !Array.isArray(body.customAxes) ||
    !Array.isArray(body.customOptions)
  ) {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  try {
    const res = await serverMarketingClient().PUT<BrandConceptSet[]>(
      versionedPath(auth.version, '/user-settings/brand-concept/set'),
      {
        organizationId: auth.orgId,
        ownerUserId: auth.userId,
        brandName: body.brandName,
        customAxes: body.customAxes,
        customOptions: body.customOptions,
        // 선택은 다른 세 라우트와 같은 방식으로 좁힌다(문구는 버리고 axis/option 만 넘긴다)
        concepts: parseConceptChoices(body.concepts),
      },
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '카테고리를 저장하지 못했습니다.');
  }
}
