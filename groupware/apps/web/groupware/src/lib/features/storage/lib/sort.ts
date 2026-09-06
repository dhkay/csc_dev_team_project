// 정렬 카탈로그(순수): 화면의 선택지와 서버 파라미터를 한 곳에서 잇는다.

import type { StorageSortId } from '../types';

interface StorageSortOption {
  id: StorageSortId;
  label: string;
}

/** 화면에 나열되는 순서 그대로. 항목을 늘리면 select 와 파서가 함께 따라온다. */
export const STORAGE_SORTS: readonly StorageSortOption[] = [
  { id: 'name-asc', label: '이름 오름차순' },
  { id: 'name-desc', label: '이름 내림차순' },
  { id: 'updated-desc', label: '최근 수정 순' },
  { id: 'updated-asc', label: '오래된 수정 순' },
  { id: 'size-desc', label: '큰 파일 순' },
  { id: 'size-asc', label: '작은 파일 순' }
];

export const DEFAULT_SORT: StorageSortId = 'name-asc';

export function isStorageSortId(value: unknown): value is StorageSortId {
  return STORAGE_SORTS.some((s) => s.id === value);
}

/** 정렬 id → 서버 파라미터(축 + 방향). 모르는 값은 기본값으로 접는다. */
export function parseSortId(raw: string | null | undefined): {
  // 서버(file-upload)의 StorageSort 와 같은 집합이어야 한다. 없는 축을 보내면 422 다
  sort: 'name' | 'size' | 'updated';
  descending: boolean;
} {
  const id = isStorageSortId(raw) ? raw : DEFAULT_SORT;
  const [axis, direction] = id.split('-') as ['name' | 'size' | 'updated', 'asc' | 'desc'];
  return { sort: axis, descending: direction === 'desc' };
}
