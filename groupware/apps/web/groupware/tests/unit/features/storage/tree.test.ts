import { describe, expect, it } from 'vitest';
import {
  buildDepartmentTree,
  departmentSubtreeIds
} from '$lib/features/storage/lib/tree';
import type { Department } from '$lib/features/departments/types';

const 부서: Department[] = [
  { id: 1, parentId: null, name: '본사' },
  { id: 2, parentId: 1, name: '영업본부' },
  { id: 3, parentId: 2, name: '영업1팀' },
  { id: 4, parentId: 2, name: '영업2팀' },
  { id: 5, parentId: null, name: '연구소' }
];

describe('departmentSubtreeIds', () => {
  it('자기 자신과 모든 하위 부서를 담는다', () => {
    expect(departmentSubtreeIds(부서, 2).sort()).toEqual([2, 3, 4]);
  });

  it('잎 부서는 자기 자신만 담는다', () => {
    expect(departmentSubtreeIds(부서, 3)).toEqual([3]);
  });

  it('순환이 있어도 멈춘다', () => {
    // 조직 관리 화면의 드래그로 잘못된 이동이 들어오면 만들어질 수 있는 모양이다.
    // 가드가 없으면 SSR 렌더 도중 스택을 넘겨 페이지 전체가 500 이 된다.
    const 순환: Department[] = [
      { id: 1, parentId: 2, name: 'A' },
      { id: 2, parentId: 1, name: 'B' }
    ];
    expect(departmentSubtreeIds(순환, 1).sort()).toEqual([1, 2]);
  });
});

describe('buildDepartmentTree', () => {
  it('최상위부터 트리를 만든다', () => {
    const tree = buildDepartmentTree(부서);
    expect(tree.map((n) => n.id)).toEqual([1, 5]);
    expect(tree[0].children.map((n) => n.id)).toEqual([2]);
    expect(tree[0].children[0].children.map((n) => n.id)).toEqual([3, 4]);
  });

  it('부모가 사라진 부서는 최상위로 올린다', () => {
    // 부서 삭제가 반영되는 사이 잠깐 생길 수 있는 상태다. 화면에서 사라지는 것보다 낫다.
    const 고아: Department[] = [{ id: 9, parentId: 99, name: '떠도는 부서' }];
    expect(buildDepartmentTree(고아).map((n) => n.id)).toEqual([9]);
  });
});
