// dev 로 뜨는 앱 레지스트리(단일 출처) + 포트 프로브.
//
// 왜 별도 모듈인가: 같은 목록을 기동 점검(dev.mjs)과 종료(kill.mjs)가 함께 본다. 포트를 dev.mjs 의
//   APPS 와 package.json 의 `kill:*` 인자에 이중으로 적으면 한쪽만 고쳤을 때 여기선 "응답 없음",
//   저기선 "안 죽는 프로세스" 로 서로 다르게 어긋난다. 새 앱 추가는 이 파일 한 줄이고, 점검과
//   종료와 개별 kill 스크립트가 전부 따라온다.
//
// port 는 각 앱 dev 스크립트/main.ts 의 값과 일치해야 한다.
import { connect } from 'node:net';

const AI_COMPOSE = 'infra/docker/dev/ai/docker-compose.yml';
const WEB_COMPOSE = 'infra/docker/dev/web/docker-compose.yml';

/**
 * 앱이 의존하는 도커 인프라. 없으면 그 앱이 기동 실패하거나 기능이 죽는다.
 * compose 파일별로 묶는다(한 번의 `up -d` 가 여러 서비스를 받고, 파일 파싱도 한 번이면 된다).
 *   - redis: 영상 렌더 큐(arq). 없으면 워커가 잡을 못 받아 "만드는 중"에서 멈춘다.
 *   - kafka: log-server 는 lifespan 에서 프로듀서를 열고 실패 시 기동을 거부한다(fail-closed).
 *   - clickhouse: log-server 의 로그 적재/조회 저장소.
 *   - ollama: 챗봇 실모델(없으면 language-model 을 stub 로 두고 개발 가능).
 *
 * `services` 를 명시해 compose 파일의 다른 서비스는 건드리지 않는다. 같은 파일에 컨테이너로 도는
 * api-log-server, api-data-collector 등이 함께 있어서, 파일 단위로 up/stop 하면 의도치 않게 그것들까지 오간다.
 */
export const INFRA = [
  {
    compose: WEB_COMPOSE,
    services: ['redis', 'kafka', 'clickhouse'],
    warn: 'redis/kafka/clickhouse 기동 실패. 영상 렌더 큐와 log-server 가 동작하지 않습니다.',
  },
  {
    compose: AI_COMPOSE,
    services: ['ollama'],
    warn:
      'Ollama 기동 실패. 챗봇 실모델이 비활성일 수 있습니다. ' +
      'apps/api/fastapi/language-model/.env 를 INFERENCE_ENGINE=stub 로 두면 개발은 계속 가능.',
  },
];

/**
 * dev 로 뜨는 앱. name 은 `pnpm kill:<name>` 의 인자이기도 하다.
 *
 * `dir` 은 그 앱의 프로세스를 알아보는 지문이다. dev 프로세스의 커맨드라인에는 대부분 자기 앱 경로가
 * 들어간다(예: `node "…\apps\web\groupware\node_modules\.bin\..\vite\bin\vite.js" dev --port 5173`,
 * `…\apps\api\fastapi\file-upload\.venv\Scripts\python.exe … uvicorn`). 그래서 `kill:<앱>` 이 포트를 안 잡고
 * 멈춰 있는 그 앱의 잔여 프로세스까지 골라낼 수 있다. 포트만 보면 그런 좀비를 놓친다.
 */
export const APPS = [
  {
    pkg: '@csc/api-csc-groupware',
    name: 'csc-groupware',
    port: 3000,
    dir: 'apps/api/nestjs/csc-groupware',
  },
  {
    pkg: '@csc/api-csc-control-tower',
    name: 'csc-control-tower',
    port: 3001,
    dir: 'apps/api/nestjs/csc-control-tower',
  },
  { pkg: '@csc/api-user', name: 'user', port: 3002, dir: 'apps/api/nestjs/user' },
  {
    pkg: '@csc/api-csc-marketing',
    name: 'csc-marketing',
    port: 3003,
    dir: 'apps/api/nestjs/csc-marketing',
  },
  { pkg: '@csc/api-csc-mes', name: 'csc-mes', port: 3004, dir: 'apps/api/nestjs/csc-mes' },
  {
    pkg: '@csc/scalar-gateway',
    name: 'scalar-gateway',
    port: 3300,
    dir: 'apps/tools/scalar-gateway',
  },
  { pkg: '@csc/web-groupware', name: 'web-groupware', port: 5173, dir: 'apps/web/groupware' },
  {
    pkg: '@csc/web-control-tower',
    name: 'web-control-tower',
    port: 5174,
    dir: 'apps/web/control-tower',
  },
  {
    pkg: '@csc/api-video-model',
    name: 'video-model',
    port: 8000,
    dir: 'apps/api/fastapi/video-model',
    hint: 'API + arq 워커가 함께 떠야 렌더가 돈다. 없으면 "영상 만들기" 가 500(잡 등록 실패).',
  },
  {
    pkg: '@csc/api-file-upload',
    name: 'file-upload',
    port: 8001,
    dir: 'apps/api/fastapi/file-upload',
  },
  {
    pkg: '@csc/api-language-model',
    name: 'language-model',
    port: 8010,
    dir: 'apps/api/fastapi/language-model',
    hint: '이미지/기획 LLM. 없으면 기획서 생성과 씬 이미지가 실패.',
  },
  {
    pkg: '@csc/api-log-server',
    name: 'log-server',
    port: 8020,
    dir: 'apps/api/fastapi/log-server',
    hint: 'kafka(호스트 6092) + clickhouse(6123)가 먼저 떠 있어야 기동된다.',
  },
  {
    pkg: '@csc/api-data-collector',
    name: 'data-collector',
    port: 8030,
    dir: 'apps/api/fastapi/data-collector',
    hint: '네이티브 postgres 의 crawler DB(수집 서버 리네임과 무관하게 DB 이름은 유지)와 redis db1 이 필요하다. 도커 dev 스택만 쓰려면 pnpm kill:data-collector.',
  },
  {
    pkg: '@csc/api-metrics-agent',
    name: 'metrics-agent',
    port: 8090,
    dir: 'apps/api/fastapi/metrics-agent',
  },
];

/**
 * `pnpm dev` 로 자동 기동하지 않는 앱. 종료(`pnpm kill:<name>`)와 개별 실행은 지원한다.
 *
 * 데스크톱(Tauri) 앱이 여기 있는 이유 둘:
 *   1. Tauri 창은 포트를 열지 않는다. 위 probe() 는 TCP 응답을 "살아 있다" 의 정의로 쓰므로
 *      APPS 에 넣으면 기동 점검이 영원히 "응답 없음" 을 찍는다.
 *   2. 첫 cargo 빌드가 수 분이다. 매번 네이티브 창이 뜨면 전체 dev 경험이 망가진다.
 *
 * 그렇다고 레지스트리 밖에 두면 `pnpm kill` 이 못 죽인다. Tauri dev 는 node(vite) + cargo +
 * exe 3층 트리라 포트 하나만 봐서는 정리되지 않는다. port 는 그 앱이 띄우는 vite dev 포트다.
 */
export const MANUAL_APPS = [
  {
    pkg: '@csc/desktop-mes',
    name: 'mes-desktop',
    port: 5175,
    dir: 'apps/desktop/mes',
    hint: '현장 PC 앱. `pnpm dev:mes` 로 따로 띄운다(Tauri 창 + vite 5175).',
  },
];

/** 도커로 관리하지 않는 외부 의존. 점검만 한다(사용자 로컬 서비스, 종료 대상 아님). */
export const EXTERNAL = [
  {
    name: 'postgres(native)',
    port: 5432,
    hint: '앱 DB 는 네이티브 PG 를 쓴다(도커 6432 는 컨테이너 앱 전용). 꺼져 있으면 대부분의 API 가 실패.',
  },
];

/** 앱 묶음 별칭. `pnpm kill:api` 처럼 한 번에 고르는 용도. */
export const GROUPS = {
  api: APPS.filter((a) => a.pkg.startsWith('@csc/api-')).map((a) => a.name),
  web: APPS.filter((a) => a.pkg.startsWith('@csc/web-')).map((a) => a.name),
  desktop: MANUAL_APPS.map((a) => a.name),
};

/** 종료 대상 전체(자동 기동 + 수동 기동). 점검(dev.mjs)은 APPS 만 본다. */
const KILLABLE = [...APPS, ...MANUAL_APPS];

/** 이름(앱 또는 그룹)으로 앱을 고른다. 인자가 없으면 자동 기동 앱 전체.
 *
 * 인자 없는 `pnpm kill:all` 에 MANUAL_APPS 를 포함하지 않는 이유: `pnpm dev` 가 안 띄웠는데
 * 죽이러 가면 "안 띄운 앱의 포트가 안 비었다" 는 혼란스러운 실패가 난다. 데스크톱은
 * `pnpm kill:mes-desktop` 또는 `pnpm kill:desktop` 으로 명시해 죽인다.
 *
 * 모르는 이름은 조용히 넘기지 않고 던진다. 오타 때문에 "죽인 줄 알았는데 안 죽은" 상태가
 * 제일 나쁘기 때문이다(포트가 남아 다음 기동이 실패한다).
 */
export function selectApps(names = []) {
  if (names.length === 0) return APPS;
  const wanted = new Set();
  for (const raw of names) {
    const key = String(raw).trim();
    if (GROUPS[key]) {
      GROUPS[key].forEach((n) => wanted.add(n));
      continue;
    }
    if (!KILLABLE.some((a) => a.name === key)) {
      const known = [...KILLABLE.map((a) => a.name), ...Object.keys(GROUPS)].join(', ');
      throw new Error(`알 수 없는 대상 '${key}'. 가능한 값: ${known}`);
    }
    wanted.add(key);
  }
  return KILLABLE.filter((a) => wanted.has(a.name));
}

/** TCP 연결 가능 여부. 의존성 없이 포트만 본다(헬스 엔드포인트는 앱마다 달라 포트로 통일). */
export function probe(port, timeoutMs = 700) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    const done = (up) => {
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/** 목록의 각 항목에 `up` 을 붙여 돌려준다(원본 불변). */
export async function probeAll(list, timeoutMs = 700) {
  const results = await Promise.all(list.map((x) => probe(x.port, timeoutMs)));
  return list.map((x, i) => ({ ...x, up: results[i] }));
}
