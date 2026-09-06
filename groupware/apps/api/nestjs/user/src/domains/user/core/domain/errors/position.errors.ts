/**
 * 직책(position) 관리 도메인 에러: 조직 관리자가 멤버 직책(대표/팀장)을 임명/해임할 때
 * Service 는 HTTP 를 모른다. inbound 어댑터(PositionExceptionFilter)가 HTTP 상태로 변환한다.
 */
export abstract class PositionError extends Error {}

/**
 * 권한 거부: 호출자가 조직 관리 권한이 없거나, 대표 임명/해임을 ROOT(개발관리자)가 아닌 자가 시도,
 * 또는 대상이 관리 가능한 멤버(ADMIN)가 아닌 경우
 */
export class PositionForbiddenError extends PositionError {
  constructor(message = '이 직책을 부여할 권한이 없습니다.') {
    super(message);
  }
}

/** 대상 멤버 없음(또는 다른 조직) */
export class PositionTargetNotFoundError extends PositionError {
  constructor(id: number) {
    super(`대상 멤버를 찾을 수 없습니다: ${id}`);
  }
}

/** 잘못된 직책 지정: 예: 팀장인데 대상이 부서 미배치 */
export class PositionInvalidError extends PositionError {
  constructor(message: string) {
    super(message);
  }
}

/** 부서당 팀장 1명 위반: 해당 부서에 이미 다른 팀장이 있음 */
export class TeamLeaderAlreadyExistsError extends PositionError {
  constructor() {
    super('해당 부서에는 이미 팀장이 있습니다. 기존 팀장을 해제한 뒤 지정하세요.');
  }
}
