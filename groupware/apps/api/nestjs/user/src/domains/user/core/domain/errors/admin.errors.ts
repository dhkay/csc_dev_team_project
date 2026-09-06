/**
 * 플랫폼 관리자(admin_users) 관리 도메인 에러: Service 는 HTTP 를 모른다.
 * inbound 어댑터(필터)에서 HTTP 상태로 변환한다.
 */
export abstract class AdminError extends Error {}

/** 이메일 중복: 이미 같은 이메일의 플랫폼 관리자가 존재(전역 유일) */
export class AdminEmailAlreadyExistsError extends AdminError {
  constructor(email: string) {
    super(`이미 존재하는 관리자 이메일입니다: ${email}`);
  }
}

/** 관리자 없음 */
export class AdminNotFoundError extends AdminError {
  constructor(id: number) {
    super(`관리자를 찾을 수 없습니다: ${id}`);
  }
}

/** ROOT 관리자는 삭제할 수 없음 */
export class CannotDeleteRootAdminError extends AdminError {
  constructor() {
    super('루트 관리자는 삭제할 수 없습니다.');
  }
}

/**
 * ROOT 관리자는 이메일(로그인 ID)을 바꿀 수 없음
 * ROOT 계정은 환경변수(PLATFORM_ROOT_EMAIL) 시드가 단일 출처라, 화면에서 이메일을 바꾸면
 * 다음 부팅의 시더가 옛 이메일로 ROOT 를 하나 더 만들어 계정이 갈린다.
 */
export class CannotChangeRootAdminEmailError extends AdminError {
  constructor() {
    super('루트 관리자의 이메일은 변경할 수 없습니다.');
  }
}
