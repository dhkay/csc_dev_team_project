/** 개인 도구 설정 레코드 하나. 두 JSON 문자열은 파싱 전의 버전별 값 맵 */
export interface UserToolSettingsRecord {
  ownerUserId: number;
  // 버전 → 역량별 모델 id 맵
  aiModels: string | null;
  // 버전 → 브랜드/컨셉 세트 맵({"v1.5":{"sets":[...]}})
  brandConcepts: string | null;
  // 도구 재진입 시 열릴 버전. 값 맵의 슬롯 키가 아니라 진입 리다이렉트 힌트
  entryVersion: string;
  // 도구 진입 시 먼저 열릴 채널. null 이면 읽는 쪽이 첫 채널로 접음
  defaultChannelId: number | null;
}

/**
 * 개인 도구 설정 레포지토리(marketingdb). 조직 안에서 유저당 1행
 * upsert 를 값마다 나눈 이유: 한 쪽만 바꾸는 호출이 나머지 값을 덮는 것 방지
 */
export interface UserToolSettingsRepositoryPort {
  findRecord(organizationId: number, ownerUserId: number): Promise<UserToolSettingsRecord | null>;
  /** 모델 버전맵만 교체 */
  upsertAiModelsRecord(
    organizationId: number,
    ownerUserId: number,
    aiModels: string,
  ): Promise<UserToolSettingsRecord>;
  /** 브랜드/컨셉 버전맵만 교체 */
  upsertBrandConceptsRecord(
    organizationId: number,
    ownerUserId: number,
    brandConcepts: string,
  ): Promise<UserToolSettingsRecord>;
  /** 진입 기본 버전만 교체. 값 맵은 버전을 오가도 남아야 하므로 미변경 */
  upsertEntryVersionRecord(
    organizationId: number,
    ownerUserId: number,
    entryVersion: string,
  ): Promise<UserToolSettingsRecord>;
  /** 진입 채널만 교체(null = 지정 해제) */
  upsertDefaultChannelRecord(
    organizationId: number,
    ownerUserId: number,
    defaultChannelId: number | null,
  ): Promise<UserToolSettingsRecord>;
}

export const USER_TOOL_SETTINGS_REPOSITORY_PORT = Symbol('USER_TOOL_SETTINGS_REPOSITORY_PORT');
