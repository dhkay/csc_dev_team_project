/** 서버 모니터링 도메인 타입: 레지스트리에 등록된 서버 + 지표 소스 구분 */

/** 호스트 역할: web(무GPU) / ai(GPU) / all(dev 단일 PC) */
export type ServerRole = 'web' | 'ai' | 'all';

/** 지표 소스 종류. 현재 구현은 'agent'(자체 metrics-agent HTTP 스냅샷) 하나이고 나머지는 확장 seam 이다. */
export type SourceType = 'agent' | 'cloudwatch' | 'prometheus';

/** 레지스트리 1개 엔트리(내부용: baseUrl 포함, 프론트에 노출 금지) */
export interface RegisteredServer {
  id: string;
  label: string;
  role: ServerRole;
  sourceType: SourceType;
  // agent 소스의 스냅샷 엔드포인트 baseUrl(내부망/LAN)
  baseUrl: string;
}

/** 프론트에 노출하는 서버 메타(baseUrl/sourceType 제외) */
export interface ServerMeta {
  id: string;
  label: string;
  role: ServerRole;
}
