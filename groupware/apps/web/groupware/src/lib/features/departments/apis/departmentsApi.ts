// 부서(조직도) 데이터 접근(브라우저): 타입 계약(departmentsContract) 기반 bff() 로 BFF 호출
// 쓰기(생성/수정/삭제)만 여기서. 목록은 SSR(+page.server.ts)에서 authUserClient 로
import { bff } from '$lib/infrastructure/http/bffClient';
import type { ApiResult } from '$lib/infrastructure/http/apiResult';
import { departmentsContract } from '../departmentsContract';
import type { Department } from '../types';

export type DepartmentResult<T = unknown> = ApiResult<T>;

/** 부서 추가: parentId=null 이면 최상위(회사 바로 아래) */
export function createDepartment(input: {
  parentId: number | null;
  name: string;
}): Promise<DepartmentResult<Department>> {
  return bff(departmentsContract.create, input);
}

/** 부서 수정: 이름 변경 / 이동(parentId) */
export function updateDepartment(
  id: number,
  patch: { name?: string; parentId?: number | null },
): Promise<DepartmentResult<Department>> {
  return bff(departmentsContract.update, { id, ...patch });
}

/** 부서 삭제: 서브트리 + 소속 멤버 미배치(백엔드 cascade) */
export function deleteDepartment(id: number): Promise<DepartmentResult> {
  return bff(departmentsContract.remove, { id });
}
