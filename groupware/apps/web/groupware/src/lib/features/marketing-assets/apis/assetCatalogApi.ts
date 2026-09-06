// 조직 태그 카탈로그(축/태그) 쓰기 데이터 접근: 같은 origin BFF(/api/marketing/asset-catalog) frontClient 호출
//   현재 UI 는 추가/삭제만 사용(수정/토글 미노출) → create/delete 만 노출. 목록(GET)은 SSR(orgId 로 공통 ∪ 조직)
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import { run, type ApiResult } from '$lib/infrastructure/http/apiResult';

const AXES = ROUTES.MARKETING.ASSET_CATALOG_AXES;
const TAGS = ROUTES.MARKETING.ASSET_CATALOG_TAGS;

export interface CreateAxisInput {
  category: string;
  key: string;
  label: string;
  hint?: string;
  sortOrder?: number;
}
export interface CreateTagInput {
  axisId: number;
  value: string;
  label?: string;
  sortOrder?: number;
}

export function createAxis(input: CreateAxisInput): Promise<ApiResult<unknown>> {
  return run(() => frontClient().POST(AXES, input));
}
export function deleteAxis(id: number): Promise<ApiResult<unknown>> {
  return run(() => frontClient().DELETE(ROUTES.MARKETING.assetCatalogAxis(id)));
}
export function createTag(input: CreateTagInput): Promise<ApiResult<unknown>> {
  return run(() => frontClient().POST(TAGS, input));
}
export function deleteTag(id: number): Promise<ApiResult<unknown>> {
  return run(() => frontClient().DELETE(ROUTES.MARKETING.assetCatalogTag(id)));
}
