/** 부서(하위조직) 도메인 엔티티 (순수 TypeScript): userdb departments. */
export interface DepartmentEntity {
  id: number;
  organizationId: number;
  // 상위 부서 id: null 이면 최상위(회사 바로 아래)
  parentId: number | null;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}