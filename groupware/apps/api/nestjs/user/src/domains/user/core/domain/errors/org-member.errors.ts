/**
 * 조직유저(organization_users) 관리 도메인 에러: 슈퍼관리자(ROOT)가 일반관리자(ADMIN)를 관리할 때
 * Service 는 HTTP 를 모른다. inbound 어댑터(OrgMemberExceptionFilter)가 HTTP 상태로 변환한다.
 */
export abstract class OrgMemberError extends Error {}

/** 이메일 중복: 같은 조직 내 동일 이메일의 조직유저가 이미 존재(UNIQUE org_id,email) */
export class OrgMemberEmailAlreadyExistsError extends OrgMemberError {
  constructor(email: string) {
    super(`이미 사용 중인 이메일입니다: ${email}`);
  }
}

// 이름 중복 에러는 두지 않는다. 이름은 표시 이름이라 조직 내 중복이 정상이다(구 org_id,name UNIQUE 해제)

/** 대상 멤버 없음(또는 다른 조직) */
export class OrgMemberNotFoundError extends OrgMemberError {
  constructor(id: number) {
    super(`조직 관리자를 찾을 수 없습니다: ${id}`);
  }
}

/**
 * 권한 거부: 호출자가 조직 슈퍼관리자(ROOT)가 아니거나,
 * 대상이 일반관리자(ADMIN)가 아니거나(ROOT 등), 다른 조직 멤버에 접근(테넌트 격리)
 */
export class OrgMemberForbiddenError extends OrgMemberError {
  constructor(message = '이 작업을 수행할 권한이 없습니다.') {
    super(message);
  }
}
