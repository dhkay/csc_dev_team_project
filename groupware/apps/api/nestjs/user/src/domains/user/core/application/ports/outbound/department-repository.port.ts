import { DepartmentEntity } from '../../../domain/entities/department.entity';

/** 부서 생성 입력 */
export interface CreateDepartmentRecord {
  organizationId: number;
  parentId: number | null;
  name: string;
}

/** 부서(departments) 레포지토리 아웃바운드 포트: userdb. */
export interface DepartmentRepositoryPort {
  /** 조직의 부서 전체(트리 구성용, 생성순) */
  findManyRecordsByOrganizationId(organizationId: number): Promise<DepartmentEntity[]>;
  /** id 단건 조회(같은 조직 검증용). 없으면 null. */
  findOneRecordById(id: number): Promise<DepartmentEntity | null>;
  createRecord(record: CreateDepartmentRecord): Promise<DepartmentEntity>;
  /** 이름 변경 */
  updateNameRecord(id: number, name: string): Promise<void>;
  /** 상위 부서 변경(이동). parentId=null 이면 최상위로 */
  updateParentRecord(id: number, parentId: number | null): Promise<void>;
  /** 여러 부서 삭제(서브트리 일괄): 호출 전 멤버 미배치 처리 필요 */
  deleteManyRecordsByIds(ids: number[]): Promise<void>;
}

export const DEPARTMENT_REPOSITORY_PORT = Symbol('DEPARTMENT_REPOSITORY_PORT');
