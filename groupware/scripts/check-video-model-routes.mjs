/**
 * 영상 모델 경유 라우트 일치 검사 (CI 게이트).
 *
 * 왜 필요한가: 한 영상 모델이 어느 조직 키를 요구하는지를 두 곳이 각자 말한다.
 *   - 웹 카탈로그(`aiModelOptions.ts`)의 `credentialProvider` : 화면이 게이팅에 쓴다(고를 수 있는가)
 *   - 백엔드 라우트 표(`video-project-spec-builder.ts` 의 `VIDEO_ROUTES`) : 렌더가 조직 키를 찾는다
 *
 * 둘이 어긋나면 아무 에러도 나지 않는다. 화면은 키가 등록됐다고 보고 모델을 열어 주는데, 렌더는
 * 다른 프로바이더의 키를 찾아 없다고 판단한다. 사용자는 "등록했는데 402" 를 보고, 로그는 등록하지
 * 않은 프로바이더의 이름을 말한다.
 *
 * 경로가 하나뿐이면 접두사도 하나라 어긋날 자리가 없다. 같은 모델이 두 경로로 존재하는
 * 순간(Veo 3.1: 플랫폼 경유와 운영사 직접) 실재하는 위험이 된다.
 *
 * 검사 규칙은 하나다: 카탈로그 key 에 라우트 접두사가 있으면, 그 접두사에 대해 백엔드 표가 정한
 * 프로바이더와 카탈로그가 선언한 `credentialProvider` 가 같아야 한다.
 *
 * `check-api-provider-keys.mjs` 와 같은 계열의 게이트다(그쪽은 "카탈로그에 있는 key 인가",
 * 이쪽은 "두 곳이 같은 답을 하는가").
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const AI_MODEL_OPTIONS = join(
  ROOT, 'apps', 'web', 'groupware', 'src', 'lib', 'pages', 'tools', 'marketing-video',
  'aiModelOptions.ts',
);
const SPEC_BUILDER = join(
  ROOT, 'apps', 'api', 'nestjs', 'csc-marketing', 'src', 'domains', 'video-project', 'core',
  'application', 'sagas', 'video-project-spec-builder.ts',
);

/** 파일을 읽는다. 없으면 게이트를 통과시키지 않는다(경로가 바뀌면 검사가 조용히 비는 것이 더 나쁘다). */
function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    console.error(`[video-model-routes] 파일을 읽지 못했습니다: ${relative(ROOT, path)}`);
    console.error('  파일이 옮겨졌다면 이 스크립트의 경로 상수를 함께 고칩니다.');
    process.exit(1);
  }
}

/** `{ ... }` 블록 하나를 중괄호 짝을 세어 잘라낸다. 없으면 빈 문자열. */
function objectBlockAfter(source, anchor) {
  const start = source.indexOf(anchor);
  if (start === -1) return '';
  const open = source.indexOf('{', start);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return '';
}

/** 백엔드 라우트 표: { 라우트 이름 → 프로바이더 key }. */
function backendRoutes(source) {
  const block = objectBlockAfter(source, 'export const VIDEO_ROUTES');
  const routes = new Map();
  for (const m of block.matchAll(/(\w+)\s*:\s*'([^']+)'/g)) routes.set(m[1], m[2]);
  return routes;
}

/** 카탈로그의 (모델 key, credentialProvider) 쌍. 한 줄에 함께 적히는 형태만 읽는다. */
function catalogEntries(source) {
  const entries = [];
  for (const line of source.split('\n')) {
    const key = line.match(/\bkey:\s*'([^']+)'/);
    const cred = line.match(/credentialProvider:\s*'([^']+)'/);
    if (key && cred) entries.push({ key: key[1], credentialProvider: cred[1] });
  }
  return entries;
}

const routes = backendRoutes(read(SPEC_BUILDER));
const entries = catalogEntries(read(AI_MODEL_OPTIONS));

const problems = [];
// 정규식이 코드 변화를 따라가지 못했는데 통과시키면 검사가 빈다. 둘 다 비어 있을 수 없다.
if (routes.size === 0) {
  problems.push(`라우트 표(VIDEO_ROUTES)를 읽지 못했습니다: ${relative(ROOT, SPEC_BUILDER)}`);
}
if (entries.length === 0) {
  problems.push(`카탈로그에서 credentialProvider 를 하나도 찾지 못했습니다: ${relative(ROOT, AI_MODEL_OPTIONS)}`);
}

let routed = 0;
for (const { key, credentialProvider } of entries) {
  const head = key.includes('/') ? key.slice(0, key.indexOf('/')) : '';
  if (!head || !routes.has(head)) continue; // 라우트가 없는 key(구 단일 모델)는 이 검사의 대상이 아니다.
  routed += 1;
  const expected = routes.get(head);
  if (expected !== credentialProvider) {
    problems.push(
      `'${key}': 카탈로그는 ${credentialProvider} 를 요구한다고 하는데 라우트 '${head}' 는 ${expected} 를 찾습니다.`,
    );
  }
}

if (routed === 0) {
  problems.push(
    '라우트 접두사를 쓰는 모델이 카탈로그에 하나도 없습니다. 접두사 규칙이 바뀌었다면 이 검사도 함께 고칩니다.',
  );
}

if (problems.length > 0) {
  console.error('[video-model-routes] 영상 모델의 경유 라우트가 어긋납니다.\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `\n  카탈로그: ${relative(ROOT, AI_MODEL_OPTIONS)}` +
      `\n  라우트 표: ${relative(ROOT, SPEC_BUILDER)} (VIDEO_ROUTES)` +
      '\n  어긋나면 화면은 모델을 열어 주는데 렌더는 다른 키를 찾아 402 로 끝납니다.',
  );
  process.exit(1);
}

console.log(`[video-model-routes] 라우트 경유 모델 ${routed}개의 조직 키 선언이 일치합니다.`);
