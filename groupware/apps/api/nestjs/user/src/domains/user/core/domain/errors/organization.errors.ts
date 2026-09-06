/**
 * 조직(테넌트) 도메인 에러: 멀티테넌시. Service 는 HTTP 를 모른다.
 * inbound 어댑터(필터)에서 HTTP 상태로 변환한다.
 */
export abstract class OrganizationError extends Error {}

/** slug 중복: 이미 같은 slug 의 조직이 존재 */
export class OrganizationSlugAlreadyExistsError extends OrganizationError {
  constructor(slug: string) {
    super(`이미 존재하는 조직 slug 입니다: ${slug}`);
  }
}

/**
 * slug 가 예약어: web 앱의 정적 최상위 경로(login, admin, s ...)와 같은 이름
 *
 * 그런 조직을 만들면 그 조직 주소가 정적 경로에 가려 열리지 않는다. 만드는 순간이 아니라
 * 그 조직 사람이 로그인한 뒤에야 드러나는 사고라, 만들 때 막는다.
 */
export class ReservedOrganizationSlugError extends OrganizationError {
  constructor(slug: string) {
    super(`예약된 조직 slug 입니다: ${slug}`);
  }
}

/** 조직 없음 */
export class OrganizationNotFoundError extends OrganizationError {
  constructor(id: number) {
    super(`조직을 찾을 수 없습니다: ${id}`);
  }
}

/** PLATFORM(벤더) 조직은 삭제/변경할 수 없음 */
export class CannotModifyPlatformOrganizationError extends OrganizationError {
  constructor() {
    super('PLATFORM 조직은 삭제할 수 없습니다.');
  }
}

/** 조직의 ROOT 관리자 없음. 조회/비밀번호 재설정 대상이 없을 때 */
export class RootAdminNotFoundError extends OrganizationError {
  constructor(organizationId: number) {
    super(`조직의 ROOT 관리자를 찾을 수 없습니다: ${organizationId}`);
  }
}

/**
 * 조직 ROOT 이양 대상이 부적격: 그 조직의 활성 일반관리자가 아니다.
 * (다른 조직 멤버, 탈퇴/정지 계정, 이미 ROOT 인 본인)
 */
export class RootAdminTransferTargetInvalidError extends OrganizationError {
  constructor(userId: number) {
    super(`루트 관리자로 지정할 수 없는 대상입니다: ${userId}`);
  }
}

/**
 * 조직 ROOT 관리자 이메일 중복: 이미 그 이메일의 조직유저가 있다(UNIQUE email)
 * 로그인이 조직을 모른 채 이메일로 계정을 찾으므로 유일성 범위는 전역이다.
 */
export class RootAdminEmailAlreadyExistsError extends OrganizationError {
  constructor(email: string) {
    super(`이미 사용 중인 이메일입니다: ${email}`);
  }
}
