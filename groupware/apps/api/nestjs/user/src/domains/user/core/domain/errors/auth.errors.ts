/**
 * 계정 도메인 에러: Service 는 HTTP 를 모른다. 도메인 언어로만 throw 하고
 * inbound 어댑터(필터)에서 HTTP 상태로 변환한다.
 */
export abstract class AccountError extends Error {}

/** 이메일 또는 비밀번호 불일치 (어느 쪽인지 구분하지 않음. 정보 누출 방지) */
export class InvalidCredentialsError extends AccountError {
  constructor() {
    super('사용자 정보가 일치하지 않습니다.');
  }
}

/** 계정 잠김 */
export class AccountLockedError extends AccountError {
  constructor() {
    super('계정이 잠겼습니다.');
  }
}

/** 비활성/탈퇴 등 사용 불가 상태 */
export class AccountInactiveError extends AccountError {
  constructor() {
    super('사용할 수 없는 계정입니다.');
  }
}

/** 토큰이 없거나 유효하지 않음 (인증 만료) */
export class TokenInvalidError extends AccountError {
  constructor() {
    super('인증이 만료되었습니다.');
  }
}

/** 엔티티 없음 */
export class UserNotFoundError extends AccountError {
  constructor() {
    super('사용자를 찾을 수 없습니다.');
  }
}

/**
 * 본인 계정 수정 권한 없음. 조직 ROOT 가 플랫폼 관리 항목(비밀번호 등)을 바꾸려 하거나,
 * self-service 대상이 아닌 주체(관리자유저)가 호출한 경우. (403)
 */
export class ProfileUpdateForbiddenError extends AccountError {
  constructor(message = '해당 항목은 변경할 수 없습니다.') {
    super(message);
  }
}
