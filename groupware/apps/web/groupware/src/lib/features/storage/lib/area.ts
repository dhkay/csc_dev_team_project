// 영역 카탈로그(순수): 좌측 nav 가 이 배열을 돌며 그린다. 영역이 늘면 여기 한 줄이다.

import type { StorageArea } from '../types';

interface StorageAreaMeta {
  id: StorageArea;
  label: string;
  description: string;
}

export const STORAGE_AREAS: readonly StorageAreaMeta[] = [
  {
    id: 'COMMON',
    label: '공통',
    // 공개라는 사실을 영역 설명에 적는다. 행마다 배지를 달면 모든 행에 같은 배지가 붙는다.
    description: '조직 전원이 함께 씁니다. 주소를 아는 사람은 로그인 없이 열 수 있습니다.'
  },
  { id: 'DEPARTMENT', label: '조직', description: '부서별로 나뉜 파일입니다.' },
  { id: 'PERSONAL', label: '개인', description: '나만 볼 수 있는 파일입니다.' }
];

export function areaLabel(area: StorageArea): string {
  return STORAGE_AREAS.find((a) => a.id === area)?.label ?? '공통';
}

/** 영역 설명(화면 부제). 문장을 화면에 적어 두면 영역이 늘 때 고칠 자리가 둘이 된다. */
export function areaDescription(area: StorageArea): string {
  return STORAGE_AREAS.find((a) => a.id === area)?.description ?? '';
}

export function isStorageArea(value: unknown): value is StorageArea {
  return value === 'COMMON' || value === 'DEPARTMENT' || value === 'PERSONAL';
}
