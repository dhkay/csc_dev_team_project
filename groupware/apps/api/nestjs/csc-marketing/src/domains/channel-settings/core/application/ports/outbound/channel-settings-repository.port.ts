/** 채널별 소스 설정 레코드(비밀값 아님) */
export interface ChannelSettingsRecord {
  channelId: number;
  sourceKey: string;
  // 파싱 전 JSON 문자열
  settings: string | null;
}

/**
 * 채널 스코프 설정 레포지토리(marketingdb). sourceKey 별 JSON KV
 * 조직 검증은 서비스의 채널 소유 확인으로 보장
 */
export interface ChannelSettingsRepositoryPort {
  findRecord(
    channelId: number,
    sourceKey: string,
  ): Promise<ChannelSettingsRecord | null>;
  upsertRecord(
    organizationId: number,
    channelId: number,
    sourceKey: string,
    settings: string,
  ): Promise<ChannelSettingsRecord>;
}

export const CHANNEL_SETTINGS_REPOSITORY_PORT = Symbol(
  'CHANNEL_SETTINGS_REPOSITORY_PORT',
);
