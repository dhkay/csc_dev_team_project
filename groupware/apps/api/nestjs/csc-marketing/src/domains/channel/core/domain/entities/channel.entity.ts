/**
 * 채널: 블로그와 유튜브 등 마케팅 채널 단위 그룹
 * URL 경로 식별자는 이름에서 파생(프론트 slugify)하므로 별도 slug 필드가 없음
 * 조직 공유 대표 채널 플래그도 없음(진입 채널은 개인 도구 설정이 소유)
 */
export interface ChannelEntity {
  id: number;
  name: string;
}

/**
 * 조직 전체의 채널 이름 한 줄(id, 이름, 주인)
 *
 * 조직 전체 원장이 남의 채널 id 를 담는데 이름으로 바꿀 통로가 없으면 전부 '삭제된 채널'로 보임
 * 이름 외의 것은 이 통로로 오지 않아 개인 소유 경계는 그대로 유지
 * ownerUserId 를 함께 싣는 이유: 채널 이름은 주인 안에서만 유일해 조직 목록에서 중복이 생김
 */
export interface ChannelRosterEntry {
  id: number;
  name: string;
  ownerUserId: number;
}
