#!/usr/bin/env node
/**
 * 웹 BFF 라우트 무결성 검사 (apps/web/* 의 apiRoutes.ts ↔ routes/api/**\/+server.ts 정합).
 *
 * 백엔드 엔드포인트는 check-endpoint-ids.mjs 가 지키지만, 웹 BFF 층(SvelteKit +server.ts)은
 * 무검증이라 경로 drift(오타/폴더 rename)나 죽은 상수(예: 참조 0인 ROUTES 항목)가 조용히 통과했다.
 * 이 스크립트가 각 web 앱에서 아래를 강제한다(위반 시 exit 1):
 *   [존재]  apiRoutes.ts 의 모든 ROUTES 경로 패턴이 실제 routes/api/**\/+server.ts 라우트에 매칭
 *           (없으면 = 죽은 경로/타이포/rename drift)
 *   [사용]  apiRoutes.ts 의 모든 ROUTES 리프가 소스 어딘가(apiRoutes.ts 제외)에서 참조됨
 *           (참조 0 = 죽은 상수: 지난번 AI_TOOL_CATALOG 류)
 *
 * 경로 파라미터는 정규화해 비교한다: ROUTES 의 `${id}` 와 라우트 폴더 `[id]` 를 모두 `:p` 로.
 * 사용법: node scripts/check-bff-routes.mjs [--list]
 * 한계: feature api 에서 base 뒤에 조립하는 하위 경로(marketing/channels/:id/parts 등)는 검사 대상 아님
 *       (그 경로는 ROUTES 리프가 아니라 각 feature 가 소유). ROUTES 중앙 상수의 정합만 강제한다.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// apps/desktop/* 는 대상이 아니다(누락이 아니라 의도). 데스크톱 앱은 adapter-static SPA 라
// routes/api/**/+server.ts 도 apiRoutes.ts 도 없다. 백엔드를 직접 호출하며 그 계약은
// @csc/mes-contracts 와 scripts/check-mes-contracts.mjs 가 지킨다.
const APPS = [
  { name: 'web-groupware', dir: join(ROOT, 'apps', 'web', 'groupware') },
  { name: 'web-control-tower', dir: join(ROOT, 'apps', 'web', 'control-tower') },
];

/** `${...}`(ROUTES 함수 템플릿)과 `[seg]`(라우트 폴더)를 공통 파라미터 토큰으로 정규화. */
const normalizeUrl = (u) => u.replace(/\$\{[^}]*\}/g, ':p');
const normalizeRouteSeg = (s) => (s.startsWith('[') && s.endsWith(']') ? ':p' : s);

/** apiRoutes.ts → [{ access: 'AUTH.LOGIN', url: '/api/auth/login' }] (leaf 문자열/화살표함수 값). */
function parseApiRoutes(file) {
  const src = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const leaves = [];
  const stack = [];
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let m = line.match(/^([A-Za-z0-9_]+)\s*:\s*\{$/); // 그룹 열기: `AUTH: {`
    if (m) {
      stack.push(m[1]);
      continue;
    }
    if (line.startsWith('}')) {
      if (stack.length) stack.pop();
      continue;
    }
    // leaf(정적): `LOGIN: '/api/...'`
    m = line.match(/^([A-Za-z0-9_]+)\s*:\s*['"`](\/api\/[^'"`]*)['"`]/);
    if (m) {
      leaves.push({ access: [...stack, m[1]].join('.'), url: m[2] });
      continue;
    }
    // leaf(함수): `rootAdmin: (id) => `/api/.../${id}/...``
    m = line.match(/^([A-Za-z0-9_]+)\s*:\s*\([^)]*\)\s*=>\s*[`'"](\/api\/[^`'"]*)[`'"]/);
    if (m) {
      leaves.push({ access: [...stack, m[1]].join('.'), url: m[2] });
      continue;
    }
  }
  return leaves;
}

/** routes/api 하위 +server.ts 폴더 → 정규화된 경로 패턴 집합. */
function collectRoutes(apiDir) {
  const out = new Set();
  const rec = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) rec(full);
      else if (name === '+server.ts') {
        const rel = relative(apiDir, dir).split(/[\\/]/).filter(Boolean).map(normalizeRouteSeg);
        out.add('/api/' + rel.join('/'));
      }
    }
  };
  rec(apiDir);
  return out;
}

/** src 하위 모든 .ts/.svelte 파일 텍스트(apiRoutes.ts 제외) 합침: 참조 검사용. */
function readSourceForRefs(srcDir, apiRoutesFile) {
  let blob = '';
  const rec = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.svelte-kit') continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) rec(full);
      else if ((name.endsWith('.ts') || name.endsWith('.svelte')) && full !== apiRoutesFile) {
        blob += readFileSync(full, 'utf8') + '\n';
      }
    }
  };
  rec(srcDir);
  return blob;
}

const errors = [];
const listing = [];

for (const app of APPS) {
  const apiRoutesFile = join(app.dir, 'src', 'lib', 'infrastructure', 'http', 'apiRoutes.ts');
  const apiDir = join(app.dir, 'src', 'routes', 'api');
  if (!existsSync(apiRoutesFile) || !existsSync(apiDir)) continue;

  const leaves = parseApiRoutes(apiRoutesFile);
  const routes = collectRoutes(apiDir);
  const refBlob = readSourceForRefs(join(app.dir, 'src'), apiRoutesFile);

  for (const leaf of leaves) {
    listing.push(`${app.name}  ROUTES.${leaf.access}  ${leaf.url}`);
    // [존재] 정규화 경로가 실제 라우트에 있는가
    if (!routes.has(normalizeUrl(leaf.url))) {
      errors.push(
        `[${app.name}] ROUTES.${leaf.access} → ${leaf.url} 에 해당하는 +server.ts 라우트가 없습니다(경로 drift/죽은 경로).`,
      );
    }
    // [사용] 소스 어딘가에서 ROUTES.<access> 참조되는가
    if (!refBlob.includes(`ROUTES.${leaf.access}`)) {
      errors.push(
        `[${app.name}] ROUTES.${leaf.access} 가 어디서도 참조되지 않습니다(죽은 상수: 제거 대상).`,
      );
    }
  }
}

if (process.argv.includes('--list')) {
  for (const l of listing) console.log(l);
  console.log(`\n총 ${listing.length}개 ROUTES 리프`);
  process.exit(0);
}

if (errors.length) {
  console.error('웹 BFF 라우트 무결성 검사 실패\n');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`웹 BFF 라우트 무결성 검사 통과: ${listing.length}개 ROUTES 리프(경로 존재 + 참조 확인)`);
