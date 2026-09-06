/**
 * 조직 멤버 로스터(id → 표시 신원): 레코드에 남은 사용자 id 를 화면에서 사람으로 바꿔 보여줄 때 쓴다.
 * 활동 로그(행위자)와 보관함(올린 사람)이 공유한다.
 *
 * 이름을 레코드에 스냅샷하지 않는 이유: DTO/포트/서비스/어댑터를 줄줄이 오염시키고, 개명하면
 * 과거 레코드가 옛 이름으로 굳는다. 대신 표시 시점에 조인한다. 대가는 로스터에 없는 사용자
 * (퇴사/purge)인데, 조용히 비우지 않고 id 를 드러내 원인을 알 수 있게 한다.
 *
 * 이메일까지 나르는 이유: 이름은 표시 이름이라 조직 내 동명이인이 허용된다.
 * (.claude/rules/multi-tenancy.md "이름(name): 유일한 이름 필드"). 이름만 보여주면 원장에서 두
 * 사람이 구분되지 않고 개명으로 남을 사칭할 여지가 생긴다. 사람을 지목하는 자리엔 이메일을 함께 쓴다.
 * 이 파일이 그 규칙의 SSOT 이므로 호출부엔 같은 설명을 반복하지 않는다.
 */

/** 표시 신원 조회에 필요한 최소 형태: MemberSummary 가 구조적으로 만족한다. */
export interface MemberRosterEntry {
  id: number;
  name: string;
  // 로그인 ID: 조직 내 유일해 동명이인을 갈라준다. 로스터에 없으면 undefined.
  email?: string;
}

/** 조회 결과: 로스터에 없으면 name 은 폴백 문구, email 은 null. */
export interface MemberIdentity {
  name: string;
  email: string | null;
}

/**
 * id → 표시 신원 조회 함수를 만든다(Map 을 한 번만 짓는다. 카드/행마다 재구성하지 않게)
 * 로스터에 없으면 `알 수 없는 사용자 (#id)` + email null.
 */
export function createMemberIdentityLookup(
  roster: readonly MemberRosterEntry[],
): (id: number) => MemberIdentity {
  const byId = new Map(roster.map((m) => [m.id, m]));
  return (id) => {
    const found = byId.get(id);
    return found
      ? { name: found.name, email: found.email ?? null }
      : { name: `알 수 없는 사용자 (#${id})`, email: null };
  };
}

/**
 * 한 줄 표기: `이름 (이메일)`. 이메일이 없으면 이름만(폴백 문구도 그대로 읽힌다)
 * 로스터 항목(email?: string)과 조회 결과(email: string \| null) 둘 다 그대로 넘길 수 있다.
 */
export function formatMemberLabel(member: { name: string; email?: string | null }): string {
  return member.email ? `${member.name} (${member.email})` : member.name;
}
