#!/usr/bin/env node
/**
 * 마케팅 BFF 라우트의 도구 버전 축 검사 (apps/web/groupware/src/routes/api/marketing/**).
 *
 * 마케팅 영상 도구에는 UI 버전이 둘(v1.0/v1.5) 있고 별개 워크스페이스다. 산출물(기획안/원천/
 * 최종)과 개인 설정 슬롯이 버전으로 갈리므로, 그 자원을 다루는 BFF 는 요청의 버전을 백엔드로
 * 날라야 한다(`requireOrgUserVersion`).
 *
 * 왜 스크립트인가: 빠뜨림이 런타임에서 정상으로 보인다. 버전을 안 실은 요청은 200 을 받고,
 * 틀린 것은 "어느 버전의 데이터인가" 뿐이라 화면을 보고서야 드러난다. 타입도 못 잡는다: 새 라우트가
 * `requireOrgUser` 를 쓰면 그냥 컴파일된다.
 *
 * 강제하는 것 둘(위반 시 exit 1):
 *   [분류]  모든 마케팅 BFF 라우트가 아래 두 목록 중 정확히 한 쪽에 있다.
 *           새 라우트는 어느 쪽인지 정해야 통과한다(정하지 않고 지나가는 길이 없다).
 *   [일치]  버전 스코프 목록의 라우트는 `requireOrgUserVersion`(또는 그것을 쓰는 게이트)을 쓰고,
 *           버전 무관 목록의 라우트는 쓰지 않는다.
 *
 * 사용법: node scripts/check-marketing-version-scope.mjs [--list]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = join(ROOT, 'apps', 'web', 'groupware', 'src', 'routes', 'api', 'marketing');

/**
 * 버전 스코프: 산출물(버전 소유) + 파이프라인 입력(프롬프트 조립, 모델 슬롯).
 * 이 라우트들은 `?version=` 을 받아 백엔드의 `/v/:version/...` 로 중계한다.
 */
const VERSION_SCOPED = new Set([
  'saved-plans',
  'saved-plans/[id]',
  'saved-plans/[id]/scenes/[index]',
  'video-projects',
  'video-projects/[id]',
  'video-projects/[id]/render',
  'video-projects/[id]/segments/[order]/render',
  'video-finals',
  'video-finals/[id]',
  'video-finals/[id]/render',
  // 보관함: 담기는 산출물이 버전마다 다른 표에서 온다(archiveTarget). 그래서 버전 스코프다.
  'archive',
  'archive/[id]',
  'archive/[id]/restore',
  // 작업 공간 배치(생성 창의 마지막 동작). 배치 대상은 버전 소유 산출물이다.
  'video-projects/[id]/place',
  // 진행 화면 미리보기의 산출물 등록(dev 전용). 만들어지는 행이 버전 소유라 같은 축을 탄다.
  'video-projects/preview',
  'channels/[channelId]/plans/generate',
  'channels/[channelId]/plans/scene-image',
  'channels/[channelId]/plan-prompt',
  'channels/[channelId]/keyword-suggestions',
  'my/ai-model',
  'my/brand-concept',
  // 세트 하나의 연출(카테고리/레퍼런스 정의 + 선택). 세트는 버전 슬롯 안에 있어 같은 축을 탄다.
  //   저장 요청이 갈린 이유는 범위가 다르기 때문이다(목록 전체 vs 세트 하나). 축은 둘 다 버전이다.
  'my/brand-concept/set',
  'plans/image-engine-load',
]);

/**
 * 버전 무관: 두 버전이 함께 쓰는 자원(채널, 조직 공용 자산, 카탈로그)과 버전 자체의 메타.
 *
 * `my/entry-version` 이 여기 있는 이유: 어느 버전으로 들어갈지 자체를 담는 값이라 버전을 받으면
 * 순환이다. `saved-plans/image/presign` 은 파티션만 주입하고 산출물을 만들지 않는다.
 */
const VERSION_FREE = new Set([
  'activity-logs',
  'asset-catalog/axes',
  'asset-catalog/axes/[id]',
  'asset-catalog/tags',
  'asset-catalog/tags/[id]',
  'asset-sets',
  'asset-sets/[id]',
  'asset-sets/[id]/slots/[slot]',
  'asset-sets/presign/[slot]',
  'assets',
  'assets/[id]',
  'assets/presign/[category]',
  'brand-concept-catalog',
  'channels',
  'channels/[channelId]',
  'channels/order',
  'my/default-channel',
  'my/entry-version',
  'saved-plans/image/presign',
  // 개인 자산 업로드 주소 발급. 저장 경로에 버전이 없고(scope/partition 은 조직과 작업자로만
  //   갈린다) 그 자산을 참조할 행을 고치는 쪽이 버전을 안다.
  'video-projects/thumbnail/presign',
  'video-projects/preview/video/presign',
]);

/** 버전을 요구하는 게이트(직접 + 그것을 감싸는 것). */
const VERSION_GATES = ['requireOrgUserVersion', 'requireToolSettingsEditor'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name === '+server.ts') out.push(full);
  }
  return out;
}

const routes = walk(BASE)
  .map((f) => relative(BASE, dirname(f)).replace(/\\/g, '/'))
  .sort();

if (process.argv.includes('--list')) {
  for (const r of routes) {
    const tag = VERSION_SCOPED.has(r) ? '버전' : VERSION_FREE.has(r) ? '무관' : '미분류';
    console.log(`${tag}  ${r}`);
  }
  process.exit(0);
}

const errors = [];

// [어휘] 검사는 두지 않는다. `@csc/tool-versions` 가 값 공간과 파이프라인 사실을 전부 소유하고
// 백엔드와 web 이 그것을 재노출하므로 대조할 사본이 없다.
//   값이 무엇인가는 그 패키지의 단위 테스트가 잠근다(packages/tool-versions/src/pipeline.test.ts).
//
// 아래 라우트 분류는 남는다. 그것은 사본의 문제가 아니라 새 BFF 라우트가 버전을 받는지를 묻는
// 다른 질문이고, 커널이 대신 답해 줄 수 없다(라우트는 사람이 새로 만든다).

for (const r of routes) {
  const scoped = VERSION_SCOPED.has(r);
  const free = VERSION_FREE.has(r);
  if (scoped === free) {
    errors.push(
      `미분류 라우트: api/marketing/${r}\n` +
        '  → 이 라우트가 버전 스코프인지 정하고 check-marketing-version-scope.mjs 의 두 목록 중 한 쪽에 등록하세요.',
    );
    continue;
  }
  const src = readFileSync(join(BASE, r, '+server.ts'), 'utf8');
  const usesGate = VERSION_GATES.some((g) => src.includes(g));
  if (scoped && !usesGate) {
    errors.push(
      `버전 스코프인데 버전을 받지 않습니다: api/marketing/${r}\n` +
        `  → ${VERSION_GATES[0]}(event) 로 바꾸고 백엔드 경로를 versionedPath(auth.version, …) 로 감싸세요.`,
    );
  }
  if (free && usesGate) {
    errors.push(
      `버전 무관인데 버전 게이트를 씁니다: api/marketing/${r}\n` +
        '  → 두 버전이 함께 쓰는 자원이면 requireOrgUser 로 되돌리고, 아니면 VERSION_SCOPED 로 옮기세요.',
    );
  }
}

// 목록이 사라진 라우트를 가리키면(개명/삭제) 검사가 조용히 무력해진다.
for (const listed of [...VERSION_SCOPED, ...VERSION_FREE]) {
  if (!routes.includes(listed)) {
    errors.push(
      `목록에만 있고 실제로 없는 라우트: api/marketing/${listed}\n` +
        '  → 라우트를 지웠거나 옮겼다면 목록에서도 지우세요(검사가 헛돕니다).',
    );
  }
}

if (errors.length > 0) {
  console.error('\n마케팅 BFF 버전 축 검사 실패\n');
  for (const e of errors) console.error(`  ${e}\n`);
  process.exit(1);
}

console.log(
  `마케팅 BFF 버전 축 검사 통과: ${routes.length}개 라우트(버전 ${VERSION_SCOPED.size} / 무관 ${VERSION_FREE.size})`,
);
