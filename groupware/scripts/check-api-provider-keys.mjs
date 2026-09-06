/**
 * 자격증명 프로바이더 key 일치 검사 (CI 게이트).
 *
 * 왜 필요한가: 어떤 모델이 어떤 조직 API 키를 요구하는지는 문자열 하나로 이어져 있다.
 * 카탈로그(`@csc/api-providers`)가 그 문자열의 주인이고, 세 소비자가 그것을 가리킨다.
 *   - `aiModelOptions.ts`      : 설정 화면이 모델을 게이팅할 때 쓰는 credentialProvider
 *   - 마케팅 spec builder      : 렌더 시 조직 키를 resolve 할 provider
 *   - language-model(Python)   : 모델별 credential_provider (언어가 달라 표를 공유할 수 없다)
 *
 * TypeScript 쪽 둘은 타입으로 묶여 있지만 Python 은 그럴 수 없고, 카탈로그 key 를 개명하면 세 곳이
 * 조용히 어긋난다. 어긋난 결과가 에러가 아니라는 것이 문제다. 모델은 "키 미등록" 으로 영원히 선택
 * 불가가 되거나 기본 방식으로 폴백하고, 등록한 사람은 키를 넣었는데 왜 안 되는지 알 수 없다.
 *
 * 그러니 소비자가 가리키는 provider 문자열은 전부 카탈로그에 있어야 한다.
 * (반대 방향은 검사하지 않는다. 아직 그 키를 쓰는 모델이 없는 프로바이더가 정상 상태다.)
 *
 * `check-pricing-coverage.mjs` 와 같은 계열의 게이트다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CATALOG = join(ROOT, 'packages', 'api-providers', 'src', 'providers.ts');
const AI_MODEL_OPTIONS = join(
  ROOT, 'apps', 'web', 'groupware', 'src', 'lib', 'pages', 'tools', 'marketing-video',
  'aiModelOptions.ts',
);
const SPEC_BUILDER = join(
  ROOT, 'apps', 'api', 'nestjs', 'csc-marketing', 'src', 'domains', 'video-project', 'core',
  'application', 'sagas', 'video-project-spec-builder.ts',
);
const LM_CATALOG = join(
  ROOT, 'apps', 'api', 'fastapi', 'language-model', 'app', 'domains', 'inference',
  'core', 'application', 'model_catalog.py',
);

/** 파일을 읽는다. 없으면 게이트를 통과시키지 않는다(경로가 바뀌면 검사가 조용히 비는 것이 더 나쁘다). */
function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    console.error(`[api-provider-keys] 파일을 읽지 못했습니다: ${relative(ROOT, path)}`);
    console.error('  파일이 옮겨졌다면 이 스크립트의 경로 상수를 함께 고칩니다.');
    process.exit(1);
  }
}

/** 카탈로그의 `export const API_PROVIDER_KEYS = [...] as const` 에서 key 를 뽑는다. */
function catalogKeys(source) {
  const match = /export const API_PROVIDER_KEYS\s*=\s*\[([^\]]*)\]/.exec(source);
  if (!match) {
    console.error('[api-provider-keys] 카탈로그에서 API_PROVIDER_KEYS 를 찾지 못했습니다.');
    process.exit(1);
  }
  return new Set([...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
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

const known = catalogKeys(read(CATALOG));

/** 소비자별로 (파일, 쓰인 provider 문자열 목록)을 모은다. */
const usages = [
  {
    path: AI_MODEL_OPTIONS,
    label: 'aiModelOptions.ts (credentialProvider)',
    values: [...read(AI_MODEL_OPTIONS).matchAll(/credentialProvider:\s*'([^']+)'/g)].map((m) => m[1]),
  },
  {
    path: SPEC_BUILDER,
    label: 'video-project-spec-builder.ts (CREDENTIAL_PROVIDER_BY_MODEL)',
    values: [
      ...objectBlockAfter(read(SPEC_BUILDER), 'CREDENTIAL_PROVIDER_BY_MODEL').matchAll(
        /:\s*'([^']+)'/g,
      ),
    ].map((m) => m[1]),
  },
  {
    // 경유 라우트 표. 위 표와 같은 파일의 다른 표라 따로 훑는다: 라우트가 있는 모델의 조직 키는
    //   이쪽이 정하므로, 여기만 어긋나도 "키를 등록했는데 렌더가 다른 키를 찾는" 상태가 된다.
    path: SPEC_BUILDER,
    label: 'video-project-spec-builder.ts (VIDEO_ROUTES)',
    values: [
      ...objectBlockAfter(read(SPEC_BUILDER), 'VIDEO_ROUTES').matchAll(/:\s*'([^']+)'/g),
    ].map((m) => m[1]),
  },
  {
    path: LM_CATALOG,
    label: 'model_catalog.py (credential_provider)',
    values: [...read(LM_CATALOG).matchAll(/credential_provider\s*=\s*"([^"]+)"/g)].map((m) => m[1]),
  },
];

const problems = [];
for (const usage of usages) {
  if (usage.values.length === 0) {
    // 하나도 못 찾으면 정규식이 코드 변화를 따라가지 못한 것이다. 통과시키면 검사가 빈다.
    problems.push(`${usage.label}: provider 문자열을 하나도 찾지 못했습니다(${relative(ROOT, usage.path)}).`);
    continue;
  }
  for (const value of new Set(usage.values)) {
    if (!known.has(value)) {
      problems.push(`${usage.label}: 카탈로그에 없는 provider '${value}'`);
    }
  }
}

if (problems.length > 0) {
  console.error('[api-provider-keys] 자격증명 프로바이더 key 가 카탈로그와 어긋납니다.\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `\n  카탈로그: ${relative(ROOT, CATALOG)} (API_PROVIDER_KEYS)`,
    `\n  알려진 key: ${[...known].join(', ')}`,
  );
  process.exit(1);
}

console.log(`[api-provider-keys] 소비자 ${usages.length}곳의 provider 문자열이 카탈로그와 일치합니다.`);
