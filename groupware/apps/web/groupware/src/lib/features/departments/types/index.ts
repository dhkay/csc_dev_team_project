// 부서(조직도) 도메인 타입: user 서버 /user-api/org/departments* 응답과 동형
// 트리는 parentId(자기참조)로 표현(null = 최상위 = 회사 바로 아래)

export interface Department {
  id: number;
  parentId: number | null;
  name: string;
}

/** 셀렉터/들여쓰기용 평탄화 옵션: 트리를 DFS 순서 + depth 로 펼친다. */
export interface DepartmentOption {
  id: number;
  name: string;
  depth: number;
}

/** 부서 트리를 DFS 순서로 평탄화(상위→하위, depth 포함): 소속 셀렉터 옵션 생성용 */
export function flattenDepartments(list: Department[]): DepartmentOption[] {
  const childrenOf = new Map<number | null, Department[]>();
  for (const d of list) {
    const arr = childrenOf.get(d.parentId) ?? [];
    arr.push(d);
    childrenOf.set(d.parentId, arr);
  }
  const out: DepartmentOption[] = [];
  const walk = (parentId: number | null, depth: number): void => {
    for (const d of childrenOf.get(parentId) ?? []) {
      out.push({ id: d.id, name: d.name, depth });
      walk(d.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
