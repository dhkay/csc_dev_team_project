import { DepartmentEntity } from '../../../domain/entities/department.entity';
import { OrgCallerActor } from './org-caller';

/** 부서 관리 호출 주체: 공유 조직 호출자(토큰 도출). 인가(ROOT/시스템관리)는 서비스가 판정 */
export type DepartmentActor = OrgCallerActor;

/** 부서 생성 입력 */
export interface CreateDepartmentInput {
  // 상위 부서: null/미지정이면 최상위(회사 바로 아래)
  parentId?: number | null;
  name: string;
}

/** 부서 수정 입력: 제공된 필드만(이름 변경 / 이동) */
export interface UpdateDepartmentInput {
  name?: string;
  // 상위 부서 변경(이동). null = 최상위로. undefined = 변경 안 함
  parentId?: number | null;
}

/**
 * 부서(조직도) 관리 Inbound Port: 슈퍼관리자(ROOT)가 조직의 부서 트리를 관리
 * 테넌트 격리(조직 범위), ROOT 강제, 이동 사이클 방지는 서비스가 보안 경계로 강제한다.
 */
export interface DepartmentManagementPort {
  /** 조직 부서 전체(트리 구성용: 프런트가 parentId 로 트리 구성) */
  listDepartments(actor: DepartmentActor): Promise<DepartmentEntity[]>;
  createDepartment(actor: DepartmentActor, input: CreateDepartmentInput): Promise<DepartmentEntity>;
  updateDepartment(actor: DepartmentActor, id: number, patch: UpdateDepartmentInput): Promise<DepartmentEntity>;
  /** 부서 삭제: 서브트리 일괄 삭제 + 소속 멤버 미배치 처리 */
  deleteDepartment(actor: DepartmentActor, id: number): Promise<void>;
}

export const DEPARTMENT_MANAGEMENT_PORT = Symbol('DEPARTMENT_MANAGEMENT_PORT');
