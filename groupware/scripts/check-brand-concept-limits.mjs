#!/usr/bin/env node
/**
 * 브랜드/컨셉 커스텀 카테고리 상한 미러 동기화 검사 (CI 게이트).
 *
 * 왜 필요한가: 이 상한은 두 곳에서 쓰인다. 백엔드는 DTO 검증과 저장 정규화에, 프론트는 추가 버튼
 * 비활성과 `maxlength` 에 쓴다. 둘을 잇는 공유 패키지가 없어(마케팅 도구에는 `@csc/entitlements` 같은
 * 커널이 없다) 프론트가 숫자를 복제할 수밖에 없고, 복제본은 반드시 갈라진다.
 *
 * 갈라지면 조용히 망가진다. 프론트 상한이 더 크면 화면은 입력을 받아 저장 성공을 보여주는데 서버
 * 정규화가 그 값을 잘라 버려, 저장했는데 사라진다. 반대로 프론트가 더 작으면 서버가 받아 줄 값을
 * 화면이 막아 이유 없이 못 넣는다. 둘 다 에러 없이 일어나므로 테스트로는 잡히지 않는다.
 *
 * key 형식도 같은 부류다. 프론트 `newCustomKey` 가 만든 key 가 서버 정규식을 통과하지 못하면 서버가
 * 그 정의를 버리고 200 을 돌려준다(형식이 어긋난 정의는 400 이 아니라 폐기가 정책이다: 하나 때문에
 * 나머지 편집을 잃게 하지 않는다). 그래서 화면은 저장됐다고 말하고 카테고리는 없다.
 *
 * `check-mes-contracts.mjs`(TS ↔ Rust), `check-log-contracts.mjs`(TS ↔ Python) 와 같은 방식이다.
 *
 * 검사 대상:
 *   1. 커스텀 상한 5종 : 백엔드 `brand-concept-limits.ts`(SSOT) ↔ 프론트 `conceptCategories.ts`
 *                        (이름이 같아 그대로 짝을 찾는다)
 *   2. 세트 상한 2종   : 같은 SSOT ↔ 컴포넌트의 로컬 상수. 이름이 다르다(`MAX_TEXT`,
 *                        `MAX_SETS`). 이름이 다른 복제는 grep 으로 안 걸리므로 더 오래 살아남는다
 *   3. key 형식        : 백엔드 `custom-concept.types.ts` ↔ 프론트 단위 테스트의 기대 형식
 *                        (프론트는 정규식을 앱 코드에 두지 않는다. key 를 만들기만 하고 판정은
 *                         서버가 하므로, 프론트가 주장하는 형식은 그 테스트가 유일한 자리다)
 *
 * 백엔드에만 있는 상한(`CONCEPT_MAX_PER_SET`, `BRAND_CONCEPTS_JSON_MAX_BYTES`)은 대상이 아니다.
 * 화면이 그 숫자로 무엇을 막지 않아 복제본이 없다.
 *
 * 사용: node scripts/check-brand-concept-limits.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const BACKEND_LIMITS = join(
  ROOT,
  'apps/api/nestjs/csc-marketing/src/domains/channel-settings/core/domain/brand-concept-limits.ts',
);
const BACKEND_KEY = join(
  ROOT,
  'apps/api/nestjs/csc-marketing/src/domains/channel-settings/core/domain/types/custom-concept.types.ts',
);
const WEB_LIMITS = join(
  ROOT,
  'apps/web/groupware/src/lib/features/marketing-channels/lib/conceptCategories.ts',
);
const WEB_KEY_TEST = join(
  ROOT,
  'apps/web/groupware/tests/unit/features/marketing-channels/conceptCategories.test.ts',
);
const WEB_SET_CARD = join(
  ROOT,
  'apps/web/groupware/src/lib/pages/tools/marketing-video/settings/BrandConceptSetCard.svelte',
);
const WEB_EDITOR = join(
  ROOT,
  'apps/web/groupware/src/lib/pages/tools/marketing-video/settings/BrandConceptEditor.svelte',
);

/**
 * 백엔드 상수 ↔ 프론트 상수. 이름이 같으면 `web` 를 생략한다.
 *
 * 이름이 다른 짝(`MAX_TEXT`, `MAX_SETS`)이 오래 살아남는 부류다. 같은 이름이면 누군가 grep 하다
 * 마주치기라도 하는데, 다른 이름은 그 기회조차 없다.
 */
const MIRRORS = [
  { backend: 'CUSTOM_AXES_MAX_PER_SET', file: WEB_LIMITS },
  { backend: 'CUSTOM_OPTIONS_MAX_PER_AXIS', file: WEB_LIMITS },
  { backend: 'CUSTOM_OPTIONS_MAX_PER_SET', file: WEB_LIMITS },
  { backend: 'CUSTOM_LABEL_MAX_LEN', file: WEB_LIMITS },
  { backend: 'CUSTOM_DESCRIPTION_MAX_LEN', file: WEB_LIMITS },
  { backend: 'BRAND_CONCEPT_TEXT_MAX_LEN', web: 'MAX_TEXT', file: WEB_SET_CARD },
  { backend: 'BRAND_CONCEPT_MAX_SETS', web: 'MAX_SETS', file: WEB_EDITOR },
];

const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');

function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error(`파일을 읽지 못했습니다: ${rel(path)}`);
  }
}

/**
 * `const NAME = <값>;` 의 값. 없으면 던진다.
 *
 * 조용히 넘기면 이름이 바뀐 쪽을 검사하지 않고 통과해, 게이트가 있는데 헛도는 상태가 된다.
 * 숫자 리터럴의 `_` 구분자(`256_000`)는 제거해 비교한다.
 */
function constantValue(source, name, path) {
  const m = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*([^;]+);`).exec(source);
  if (!m) {
    throw new Error(
      `상수를 찾지 못했습니다: ${name} (${rel(path)})\n` +
        '      → 이름을 바꿨다면 이 스크립트의 목록도 함께 고치세요(검사가 헛돕니다).',
    );
  }
  return m[1].trim().replace(/_/g, '');
}

const failures = [];

try {
  const backend = read(BACKEND_LIMITS);
  /** 프론트 파일을 한 번만 읽는다(짝이 여러 개인 파일이 있다). */
  const webSources = new Map();
  const webSource = (file) => {
    if (!webSources.has(file)) webSources.set(file, read(file));
    return webSources.get(file);
  };

  for (const { backend: name, web = name, file } of MIRRORS) {
    const a = constantValue(backend, name, BACKEND_LIMITS);
    const b = constantValue(webSource(file), web, file);
    if (a !== b) {
      const label = web === name ? name : `${name} ↔ ${web}`;
      failures.push(
        `  ${label}: 백엔드 ${a} ↔ 프론트 ${b}\n` + `      고칠 파일: ${rel(file)}`,
      );
    }
  }
} catch (error) {
  failures.push(`  ${error.message}`);
}

try {
  const pattern = constantValue(read(BACKEND_KEY), 'CUSTOM_CONCEPT_KEY_PATTERN', BACKEND_KEY);
  const expected = constantValue(read(WEB_KEY_TEST), 'SERVER_KEY_PATTERN', WEB_KEY_TEST);
  if (pattern !== expected) {
    failures.push(
      `  커스텀 key 형식: 백엔드 ${pattern} ↔ 프론트 기대 ${expected}\n` +
        `      고칠 파일: ${rel(WEB_KEY_TEST)}`,
    );
  }
} catch (error) {
  failures.push(`  ${error.message}`);
}

if (failures.length) {
  console.error('브랜드컨셉 상한 미러가 어긋났습니다 (백엔드가 SSOT):');
  console.error(failures.join('\n'));
  process.exit(1);
}

const renamed = MIRRORS.filter((m) => m.web && m.web !== m.backend).length;
console.log(
  `브랜드컨셉 상한 미러 동기화 확인 (상한 ${MIRRORS.length}종[이름 다른 짝 ${renamed}] + key 형식 1종)`,
);
