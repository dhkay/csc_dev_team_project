// 스토리지 사용량 요약 BFF: 영역이 필요 없는 조회라 스코프 대신 인가 집합만 넘긴다.
import type { RequestHandler } from '@sveltejs/kit';
import { ok } from '$lib/server/http/bff';
import { requireStorageAccess } from '$lib/server/storage/access';
import { mapStorageError, storagePost } from '$lib/server/storage/api';
import type {
  StorageArea,
  StorageUsageEntry,
  StorageUsageSummary
} from '$lib/features/storage/types';

/** file-upload 응답(snake_case). 화면 타입과 이름이 갈리는 자리라 여기서만 옮긴다. */
interface UsageResponse {
  common: StorageUsageEntry;
  department: StorageUsageEntry;
  personal: StorageUsageEntry;
  trash_by_area: Record<string, StorageUsageEntry>;
}

const EMPTY: StorageUsageEntry = { bytes: 0, files: 0 };

export const GET: RequestHandler = async (event) => {
  const auth = await requireStorageAccess(event);
  if ('error' in auth) return auth.error;

  try {
    const res = await storagePost<UsageResponse>(auth.access, '/storage/usage', {
      department_ids: auth.access.accessibleDepartmentIds,
      can_manage_org: auth.access.canManage
    });
    const trash = res.data.trash_by_area ?? {};
    const summary: StorageUsageSummary = {
      common: res.data.common,
      department: res.data.department,
      personal: res.data.personal,
      // 영역이 빠져 오면 0 으로 채운다. 화면이 세 영역을 모두 그리므로 빈 칸을 만들지 않는다.
      trashByArea: {
        COMMON: trash.COMMON ?? EMPTY,
        DEPARTMENT: trash.DEPARTMENT ?? EMPTY,
        PERSONAL: trash.PERSONAL ?? EMPTY
      } satisfies Record<StorageArea, StorageUsageEntry>
    };
    return ok(summary);
  } catch (error) {
    return mapStorageError(error, '사용량을 불러오지 못했습니다.');
  }
};
