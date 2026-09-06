// 트리 유틸(순수): 서버(접근 범위 도출)와 클라이언트(좌측 nav)가 공유한다.

import type { Department } from '$lib/features/departments/types';

/**
 * 한 부서와 그 하위 전부의 id.
 *
 * `Set` 으로 방문을 표시하는 것은 장식이 아니다. `parentId` 는 조직 관리 화면의 드래그로 편집되는
 * 값이라 잘못된 이동 한 번이 순환을 만들 수 있고, 그때 가드 없는 재귀는 SSR 렌더 도중 스택을
 * 넘겨 페이지 전체를 500 으로 만든다. 원인을 짐작하기도 어렵다.
 */
export function departmentSubtreeIds(
  departments: readonly Department[],
  rootId: number
): number[] {
  const childrenOf = new Map<number | null, number[]>();
  for (const d of departments) {
    const siblings = childrenOf.get(d.parentId) ?? [];
    siblings.push(d.id);
    childrenOf.set(d.parentId, siblings);
  }
  const out: number[] = [];
  const seen = new Set<number>();
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop() as number;
    if (seen.has(current)) continue;
    seen.add(current);
    out.push(current);
    stack.push(...(childrenOf.get(current) ?? []));
  }
  return out;
}

/** 부서 트리 노드: 화면이 재귀 렌더에 쓰는 형태 */
export interface DepartmentNode extends Department {
  children: DepartmentNode[];
}

/** 평면 목록을 트리로. 순환은 위와 같은 이유로 잘라 낸다(도달 못 한 노드는 버린다) */
export function buildDepartmentTree(
  departments: readonly Department[]
): DepartmentNode[] {
  const nodes = new Map<number, DepartmentNode>(
    departments.map((d) => [d.id, { ...d, children: [] }])
  );
  const roots: DepartmentNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId === null ? null : nodes.get(node.parentId);
    if (!parent) {
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }
  const seen = new Set<number>();
  const prune = (list: DepartmentNode[]): DepartmentNode[] =>
    list.filter((node) => {
      if (seen.has(node.id)) return false;
      seen.add(node.id);
      node.children = prune(node.children);
      return true;
    });
  return prune(roots);
}
