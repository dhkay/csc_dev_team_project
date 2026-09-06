/**
 * 백엔드 registry: 통합 문서 포털의 단일 진실원
 *
 * UI 드롭다운, 스펙 프록시, 호출 프록시가 모두 이 배열에서 파생된다. 신규 백엔드 추가는
 * 여기 한 줄 + 그 서버 ALLOWED_SERVICES 에 'scalar-gateway' 등록이다.
 *
 * baseUrl 은 내부망 주소다. 배포 환경은 docker 서비스명:포트를 env 로 주입하고 로컬(비도커)은
 * 아래 fallback(localhost) 을 쓴다.
 */

export interface BackendSpec {
  // URL-safe 식별자: `/specs/:name`, `/proxy/:name` 에 사용
  name: string;
  // Scalar UI 소스 드롭다운 표시명
  label: string;
  // 내부망 base URL (끝 슬래시 없음). `${baseUrl}/openapi.json` 에서 스펙을 수집한다.
  baseUrl: string;
}

/** env 값을 읽되 끝 슬래시를 제거하고, 비어 있으면 fallback 을 쓴다. */
function baseUrl(key: string, fallback: string): string {
  const raw = process.env[key];
  const value = raw && raw.trim() ? raw.trim() : fallback;
  return value.replace(/\/+$/, '');
}

export const REGISTRY: BackendSpec[] = [
  {
    name: 'csc-groupware',
    label: 'csc-groupware (그룹웨어)',
    baseUrl: baseUrl('GROUPWARE_API_URL', 'http://localhost:3000'),
  },
  {
    name: 'csc-control-tower',
    label: 'csc-control-tower (컨트롤타워)',
    baseUrl: baseUrl('CONTROL_TOWER_API_URL', 'http://localhost:3001'),
  },
  {
    name: 'user',
    label: 'user (인증/계정)',
    baseUrl: baseUrl('USER_API_URL', 'http://localhost:3002'),
  },
  {
    name: 'video-model',
    label: 'video-model (영상)',
    // fallback = 로컬 `pnpm dev` 포트(uvicorn --port 8000). 도커는 env(VIDEO_SERVICE_URL)로 override.
    baseUrl: baseUrl('VIDEO_SERVICE_URL', 'http://localhost:8000'),
  },
  {
    name: 'csc-marketing',
    label: 'csc-marketing (마케팅 도메인)',
    // fallback = 로컬 `pnpm dev` 포트(nest --port 3003). 도커는 env(MARKETING_API_URL)로 override.
    baseUrl: baseUrl('MARKETING_API_URL', 'http://localhost:3003'),
  },
  {
    name: 'csc-mes',
    label: 'csc-mes (MES 제조실행)',
    // fallback = 로컬 `pnpm dev` 포트(nest --port 3004). 도커는 env(MES_API_URL)로 override.
    baseUrl: baseUrl('MES_API_URL', 'http://localhost:3004'),
  },
  {
    name: 'file-upload',
    label: 'file-upload (업로드)',
    baseUrl: baseUrl('FILE_SERVICE_URL', 'http://localhost:8001'),
  },
  {
    name: 'language-model',
    label: 'language-model (LLM 추론/챗봇/RAG)',
    // fallback = 로컬 `pnpm dev` 포트(uvicorn --port 8010)
    baseUrl: baseUrl('LANGUAGE_MODEL_API_URL', 'http://localhost:8010'),
  },
  {
    name: 'data-collector',
    label: 'data-collector (수집 실사용)',
    // fallback = dev compose 호스트 포트(6014). 로컬 `pnpm dev` 는 8030 이지만, 포털이 항상 떠 있는
    //   쪽(컨테이너)을 가리키게 둔다(log-server 와 같은 선택)
    baseUrl: baseUrl('DATA_COLLECTOR_API_URL', 'http://localhost:6014'),
  },
  {
    // 같은 백엔드의 두 번째 OpenAPI 문서(FastAPI 서브앱 /lab). 실사용 문서와 섞지 않고 갈라 놓는다.
    // router 가 경로 포함 target 을 돌려주면 http-proxy 의 prependPath 가 /lab 을 다시 붙이므로
    // 게이트웨이 코드(index.ts)는 손댈 필요가 없다.
    name: 'data-collector-lab',
    label: 'data-collector-lab (수집 테스트, 미사용)',
    baseUrl: baseUrl('DATA_COLLECTOR_API_URL', 'http://localhost:6014') + '/lab',
  },
  {
    name: 'metrics-agent',
    label: 'metrics-agent (호스트 지표)',
    // 호스트마다 인스턴스가 있지만 API 표면은 하나다. 포털은 web 호스트 인스턴스를 가리킨다.
    baseUrl: baseUrl('METRICS_AGENT_API_URL', 'http://localhost:8090'),
  },
  {
    name: 'log-server',
    label: 'log-server (통합 로그)',
    // fallback = dev compose 호스트 포트(6015). `pnpm dev` 로 호스트 구동(8020)도 가능하다.
    //   dev compose 가 kafka(6092)/clickhouse(6123)를 호스트에 노출하므로 로그 발행/조회가 된다.
    //   컨테이너 쪽(6015)을 기본으로 두는 건 포털이 항상 뜬 쪽을 가리키게 하려는 선택이다.
    baseUrl: baseUrl('LOG_SERVER_URL', 'http://localhost:6015'),
  },
];

export function findBackend(name: string): BackendSpec | undefined {
  return REGISTRY.find((b) => b.name === name);
}
