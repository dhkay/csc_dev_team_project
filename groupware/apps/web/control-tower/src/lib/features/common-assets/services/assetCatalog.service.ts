// 태그 카탈로그 서비스: 컴포넌트(관리 UI)는 이 service 만 호출. 현재 UI 는 추가/삭제만. 목록은 SSR.
import * as api from '../apis/assetCatalogApi';
import type { CreateAxisInput, CreateTagInput } from '../apis/assetCatalogApi';
import type { ApiResult } from '$lib/infrastructure/http/apiResult';

async function must(p: Promise<ApiResult<unknown>>): Promise<void> {
  const res = await p;
  if (!res.success) throw new Error(res.error ?? '요청에 실패했습니다.');
}

export const assetCatalogService = {
  createAxis: (input: CreateAxisInput) => must(api.createAxis(input)),
  deleteAxis: (id: number) => must(api.deleteAxis(id)),
  createTag: (input: CreateTagInput) => must(api.createTag(input)),
  deleteTag: (id: number) => must(api.deleteTag(id)),
};
