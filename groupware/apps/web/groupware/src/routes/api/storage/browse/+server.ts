// 스토리지 목록 조회 BFF: 브라우저는 "어느 영역의 어느 부서를 어떻게 정렬해 보는가" 만 보낸다.
// 조직, 사용자, 인가된 부서 집합은 전부 세션에서 도출해 주입한다.
import type { RequestHandler } from '@sveltejs/kit';
import { ok } from '$lib/server/http/bff';
import { mapStorageError, resolveStorageRequest, storagePost } from '$lib/server/storage/api';
import { parseSortId } from '$lib/features/storage/lib/sort';
import { clampPageSize } from '$lib/features/storage/lib/paging';
import type { StorageFile, StorageListing } from '$lib/features/storage/types';

/** file-upload 응답(snake_case) → 화면 타입(camelCase). 변환은 이 경계에서만 한다. */
interface RawFile {
  id: string;
  file_name: string;
  mime_type: string;
  size: number;
  created_at: string;
  updated_at: string | null;
  owner_user_id: number | null;
  deleted_at: string | null;
  deleted_by_user_id: number | null;
}

interface RawListing {
  files: RawFile[];
  total: number;
  has_more: boolean;
}

function toFile(raw: RawFile): StorageFile {
  return {
    id: raw.id,
    fileName: raw.file_name,
    mimeType: raw.mime_type,
    size: raw.size,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    ownerUserId: raw.owner_user_id,
    deletedAt: raw.deleted_at,
    deletedByUserId: raw.deleted_by_user_id
  };
}

export const GET: RequestHandler = async (event) => {
  const params = event.url.searchParams;
  const resolved = await resolveStorageRequest(event, params.get('area'), params.get('dept'));
  if ('error' in resolved) return resolved.error;

  const { sort, descending } = parseSortId(params.get('sort'));
  // 상한을 넘겨 보내면 서버 스키마가 422 로 거절한다. 여기서 잘라 그 사고를 만들지 않는다.
  const limit = clampPageSize(Number(params.get('limit')));

  try {
    const res = await storagePost<RawListing>(resolved.access, '/storage/list', {
      scope: resolved.scope,
      trashed: params.get('trashed') === 'true',
      search: params.get('q') || null,
      sort,
      descending,
      limit
    });
    const listing: StorageListing = {
      files: (res.data?.files ?? []).map(toFile),
      total: res.data?.total ?? 0,
      hasMore: res.data?.has_more ?? false
    };
    return ok(listing);
  } catch (error) {
    return mapStorageError(error, '파일 목록을 불러오지 못했습니다.');
  }
};
