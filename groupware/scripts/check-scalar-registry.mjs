/**
 * 통합 문서 포털(scalar-gateway) 배선 정합성 검사 (CI 게이트).
 *
 * registry.ts 헤더가 규정하는 계약은 두 갈래인데, 둘 다 빠뜨려도 아무 에러가 안 난다:
 *   "신규 백엔드 추가 = 여기 한 줄 + 그 서버 ALLOWED_SERVICES 에 'scalar-gateway' 등록"
 *
 *   1. compose env 누락 → registry 의 baseUrl 이 localhost 폴백으로 해석된다. 컨테이너 안에서
 *      localhost 는 자기 자신이라 그 백엔드만 조용히 도달 불가가 된다(포털에서 스펙이 안 뜸).
 *      실제로 MARKETING_API_URL 이 이 상태로 방치돼 있었다.
 *   2. ALLOWED_SERVICES 누락 → 포털의 서비스토큰이 401 로 거부된다.
 *
 * 둘 다 배포 후에야, 그것도 "그 탭만 안 뜬다"는 형태로 드러나므로 여기서 잡는다.
 *
 * 대상 백엔드는 compose 의 URL 값에서 역으로 도출한다(`http://api-csc-marketing:3000` → 서비스
 * `api-csc-marketing`): 이름 매핑 표를 따로 두면 그 표가 또 어긋난다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = join(ROOT, 'apps', 'tools', 'scalar-gateway', 'src', 'registry.ts');
const COMPOSE_FILES = ['staging', 'prod'].map((env) => ({
  env,
  path: join(ROOT, 'infra', 'docker', env, 'web', 'docker-compose.yml'),
}));

const PORTAL_SERVICE = 'scalar-gateway';

/** registry.ts → [{ name, envKey }]. baseUrl('KEY', 'fallback') 의 KEY 를 뽑는다. */
function readRegistry() {
  const source = readFileSync(REGISTRY, 'utf8');
  const body = source.match(/export const REGISTRY[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!body) throw new Error('REGISTRY 배열을 찾지 못했습니다.');
  const entries = [];
  const re = /name:\s*'([^']+)'[\s\S]*?baseUrl\(\s*'([A-Z0-9_]+)'/g;
  let m;
  while ((m = re.exec(body[1])) !== null) entries.push({ name: m[1], envKey: m[2] });
  return entries;
}

/**
 * docker-compose.yml → { serviceName: { env: {K: V}, raw: string } }.
 * 서비스는 정확히 2칸 들여쓴 `name:` 로 시작하고 다음 2칸 서비스 직전까지가 블록이다.
 */
function readComposeServices(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const services = {};
  let current = null;
  let inServices = false;

  for (const line of lines) {
    if (/^services:\s*$/.test(line)) { inServices = true; continue; }
    if (inServices && /^[a-z]/i.test(line)) { inServices = false; current = null; continue; }
    if (!inServices) continue;

    const header = line.match(/^ {2}([A-Za-z0-9._-]+):\s*$/);
    if (header) {
      current = header[1];
      services[current] = { env: {}, raw: '' };
      continue;
    }
    if (!current) continue;
    services[current].raw += line + '\n';

    const kv = line.match(/^\s{6}([A-Z][A-Z0-9_]*):\s*(.+?)\s*$/);
    if (kv) services[current].env[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return services;
}

/** `http://api-csc-marketing:3000` → `api-csc-marketing` */
function serviceFromUrl(url) {
  const m = url.match(/^https?:\/\/([A-Za-z0-9._-]+)/);
  return m ? m[1] : null;
}

const registry = readRegistry();
const failures = [];

for (const { env, path } of COMPOSE_FILES) {
  const services = readComposeServices(path);
  const portal = services[PORTAL_SERVICE];
  if (!portal) {
    failures.push(`  [${env}] compose 에 ${PORTAL_SERVICE} 서비스가 없습니다.`);
    continue;
  }

  for (const { name, envKey } of registry) {
    const url = portal.env[envKey];

    // 1) 포털이 그 백엔드의 내부 URL 을 알고 있는가.
    if (!url) {
      failures.push(
        `  [${env}] registry '${name}' 의 ${envKey} 가 ${PORTAL_SERVICE} environment 에 없습니다` +
          `: 컨테이너 안에서 localhost 폴백으로 해석되어 도달 불가.`,
      );
      continue;
    }

    // 2) 그 백엔드가 포털을 호출자로 허용하는가(명시적 allowlist 가 있는 경우만).
    const target = serviceFromUrl(url);
    const allowed = target && services[target] ? services[target].env.ALLOWED_SERVICES : undefined;
    if (allowed !== undefined && !allowed.split(',').map((s) => s.trim()).includes(PORTAL_SERVICE)) {
      failures.push(
        `  [${env}] registry '${name}' → 서비스 '${target}' 의 ALLOWED_SERVICES 에` +
          ` '${PORTAL_SERVICE}' 가 없습니다. 포털 호출이 401 로 거부됩니다.`,
      );
    }
  }
}

if (failures.length) {
  console.error('통합 문서 포털 배선이 어긋났습니다:');
  console.error(failures.join('\n'));
  console.error(`\nregistry: ${REGISTRY}`);
  process.exit(1);
}

console.log(
  `통합 문서 포털 배선 확인: 백엔드 ${registry.length}개 × 환경 ${COMPOSE_FILES.length}개`,
);
