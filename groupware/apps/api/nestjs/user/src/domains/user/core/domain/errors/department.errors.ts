/**
 * 부서(departments) 관리 도메인 에러: 슈퍼관리자(ROOT)가 조직 부서 트리를 관리할 때
 * Service 는 HTTP 를 모른다. inbound 어댑터(DepartmentExceptionFilter)가 HTTP 상태로 변환한다.
 */
export abstract class DepartmentError extends Error {}

/** 부서 없음(또는 다른 조직) */
export class DepartmentNotFoundError extends DepartmentError {
  constructor(id: number) {
    super(`부서를 찾을 수 없습니다: ${id}`);
  }
}

/**
 * 권한 거부: 호출자가 조직 슈퍼관리자(ROOT)가 아니거나, 다른 조직의 부서에 접근(테넌트 격리)
 */
export class DepartmentForbiddenError extends DepartmentError {
  constructor(message = '이 작업을 수행할 권한이 없습니다.') {
    super(message);
  }
}

/** 잘못된 이동: 자기 자신/자손 하위로 이동(사이클) 등 */
export class InvalidDepartmentMoveError extends DepartmentError {
  constructor(message = '해당 위치로 이동할 수 없습니다.') {
    super(message);
  }
}