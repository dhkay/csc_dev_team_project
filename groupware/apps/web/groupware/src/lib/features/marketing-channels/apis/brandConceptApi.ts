// 개인 브랜드/컨셉 세트 데이터 접근(브라우저)
// BFF(/api/marketing/my/brand-concept) frontClient 호출. 값 = 브랜드/컨셉 세트 배열
// 채널 id 를 싣지 않는다: 세트는 채널이 아니라 사람에게 붙는다(주인은 세션이 정한다)
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type {
  BrandConceptSet,
  BrandConceptSetInput,
  ConceptChoice,
  CustomConceptAxis,
  CustomConceptOption,
} from '../types';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import { run, type ApiResult } from './result';
import { versionQuery } from './versionQuery';

export function getMyBrandConcept(
  version: VersionMode,
): Promise<ApiResult<BrandConceptSet[]>> {
  return run<BrandConceptSet[]>(() =>
    frontClient().GET(`${ROUTES.MARKETING.MY_BRAND_CONCEPT}?${versionQuery(version)}`),
  );
}

export function setMyBrandConcept(
  version: VersionMode,
  sets: BrandConceptSetInput[],
): Promise<ApiResult<BrandConceptSet[]>> {
  return run<BrandConceptSet[]>(() =>
    frontClient().PUT(`${ROUTES.MARKETING.MY_BRAND_CONCEPT}?${versionQuery(version)}`, { sets }),
  );
}

/**
 * 세트 하나의 연출 교체 저장: 카테고리/레퍼런스 정의 + 그중 무엇을 골랐는지
 *
 * 위 `setMyBrandConcept` 와 범위가 다르다. 그쪽은 목록 전체의 이름과 설명, 선택을 저장하고 카테고리
 * 정의는 손대지 않는다. 요청을 나눠 두면 목록 화면이 낡은 정의를 들고 있어도 그것을 되돌리지 못한다.
 * 선택은 양쪽에서 저장되므로 나중에 저장한 쪽이 남는다.
 *
 * 세트는 브랜드명으로 지목한다(저장된 적 없는 브랜드는 404)
 */
export function setMyBrandConceptSet(
  version: VersionMode,
  brandName: string,
  detail: {
    customAxes: CustomConceptAxis[];
    customOptions: CustomConceptOption[];
    concepts: ConceptChoice[];
  },
): Promise<ApiResult<BrandConceptSet[]>> {
  return run<BrandConceptSet[]>(() =>
    frontClient().PUT(`${ROUTES.MARKETING.MY_BRAND_CONCEPT_SET}?${versionQuery(version)}`, {
      brandName,
      ...detail,
    }),
  );
}
