/**
 * 조직 공용 API 자격증명 resolve 아웃바운드 포트. csc-groupware 내부 resolve 를 서비스토큰으로 호출
 * DB 레코드가 아니라 원격 호출이라 Record 접미사를 쓰지 않음
 */
export interface ApiCredentialResolverPort {
  /**
   * 그 provider 의 자격증명 전체 맵. 미등록이나 조회 실패면 null
   * apiKey 하나만 주지 않는 이유: HIGGSFIELD 는 apiSecret 을, ELEVENLABS 는 voiceId 를 함께 요구
   * 필드 이름의 단일 출처는 자격증명 카탈로그이고 이 포트는 그대로 전달만 함
   */
  resolveCredentials(
    organizationId: number,
    provider: string,
  ): Promise<Record<string, string> | null>;
}

export const API_CREDENTIAL_RESOLVER_PORT = Symbol('API_CREDENTIAL_RESOLVER_PORT');
