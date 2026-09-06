// 브랜드/컨셉 선택지 데이터 접근(브라우저)
// 프론트는 선택지 목록을 소유하지 않는다. 그 문구를 프롬프트에 싣는 csc-marketing 이 유일한 출처다.
// 자체 목록을 들고 있으면 문구를 고쳐도 이미 저장된 채널은 옛 문구를 계속 프롬프트로 보낸다.
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type { BrandConceptAxis } from '../types';
import { run, type ApiResult } from './result';

export function getBrandConceptCatalog(): Promise<ApiResult<BrandConceptAxis[]>> {
  return run<BrandConceptAxis[]>(() =>
    frontClient().GET(ROUTES.MARKETING.BRAND_CONCEPT_CATALOG),
  );
}
