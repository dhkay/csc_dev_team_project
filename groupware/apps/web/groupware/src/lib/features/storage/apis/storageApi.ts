// 스토리지 HTTP 호출부: 같은 origin BFF 만 부른다(백엔드 주소를 브라우저가 알지 못한다)
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import { run, type ApiResult } from '$lib/infrastructure/http/apiResult';
import { publicFilePath } from '../lib/publicUrl';
import type {
  StorageListing,
  StorageScope,
  StorageSortId,
  StorageUsageSummary
} from '../types';

/** 조회 파라미터: 영역과 부서는 어느 목록인지를 정하고, 나머지는 그 안에서 좁힌다. */
interface StorageBrowseParams {
  scope: StorageScope;
  sort: StorageSortId;
  search: string;
  trashed: boolean;
  // 한 번에 받아 오는 개수. 화면의 "더 보기" 가 이 값을 넓힌다.
  limit: number;
}

export function listItems(params: StorageBrowseParams): Promise<ApiResult<StorageListing>> {
  const query = new URLSearchParams({
    area: params.scope.area,
    sort: params.sort,
    trashed: String(params.trashed),
    limit: String(params.limit)
  });
  if (params.scope.departmentId) query.set('dept', String(params.scope.departmentId));
  if (params.search) query.set('q', params.search);
  return run<StorageListing>(() =>
    frontClient().GET(`${ROUTES.STORAGE.BROWSE}?${query.toString()}`)
  );
}

export function getUsage(): Promise<ApiResult<StorageUsageSummary>> {
  return run<StorageUsageSummary>(() => frontClient().GET(ROUTES.STORAGE.SUMMARY));
}

/**
 * 파일 주소. fetch 하지 않고 링크로 쓴다(`<a href>`, `<img src>` 에 그대로 넣는다)
 *
 * 공통 파일은 공개 주소다. 로그인 없이 열리므로 사용자가 그대로 복사해 다른 페이지에 이미지로
 * 붙여 넣을 수 있다. 조직과 개인 파일은 세션을 확인하는 BFF 경로라, 그 주소를 밖으로 넘겨도
 * 받은 사람에게는 열리지 않는다.
 */
export function downloadHref(scope: StorageScope, id: string): string {
  return scope.area === 'COMMON'
    ? publicFilePath(id)
    : ROUTES.STORAGE.download(id, scope.area, scope.departmentId);
}

/** presign 라우트 문자열: uploadBlob 이 이 값을 받아 시퀀스를 돈다(시퀀스는 복제하지 않는다) */
export function presignRouteFor(scope: StorageScope): string {
  return ROUTES.STORAGE.presign(scope.area, scope.departmentId);
}

export function confirmUpload(
  scope: StorageScope,
  uploadId: string
): Promise<ApiResult<void>> {
  return run<void>(() =>
    frontClient().POST(ROUTES.STORAGE.CONFIRM, {
      uploadId,
      area: scope.area,
      departmentId: scope.departmentId
    })
  );
}

/**
 * 업로드 취소: 확정되지 않은 자산을 서버에서 지금 버린다.
 *
 * 실패해도 호출부는 무시한다. 그 자산은 확정되지 않은 채 남아 하루 뒤 수거자가 거두므로,
 * 이 요청은 정리를 앞당길 뿐 취소의 성립 조건이 아니다.
 */
export function discardUpload(
  scope: StorageScope,
  uploadId: string
): Promise<ApiResult<{ affected: number }>> {
  return run<{ affected: number }>(() =>
    frontClient().POST(ROUTES.STORAGE.DISCARD, {
      uploadId,
      area: scope.area,
      departmentId: scope.departmentId
    })
  );
}

export function renameFile(
  scope: StorageScope,
  id: string,
  fileName: string
): Promise<ApiResult<void>> {
  return run<void>(() =>
    frontClient().PATCH(ROUTES.STORAGE.file(id), {
      area: scope.area,
      departmentId: scope.departmentId,
      fileName
    })
  );
}

export function runItemAction(
  action: 'trash' | 'restore' | 'purge',
  scope: StorageScope,
  ids: string[]
): Promise<ApiResult<{ affected: number }>> {
  return run<{ affected: number }>(() =>
    frontClient().POST(ROUTES.STORAGE.items(action), {
      area: scope.area,
      departmentId: scope.departmentId,
      ids
    })
  );
}
