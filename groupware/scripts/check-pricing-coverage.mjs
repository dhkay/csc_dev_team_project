/**
 * 단가표 커버리지 검사 (CI 게이트).
 *
 * 왜 필요한가: 모델 카탈로그(`aiModelOptions.ts`)와 단가표(`@csc/pricing`)는 서로 다른 이유로
 * 바뀐다. 모델은 우리가 붙이고, 단가는 벤더가 정한다. 그래서 "모델을 붙이고 단가를 잊는" 일이
 * 반드시 생기는데, 그때 화면은 "단가 확인 필요" 로 얌전히 떨어지고 비용 계산은 영구히
 * `rate-unknown` 이 된다. 에러가 안 나서 아무도 모른 채 그 모델의 비용만 계속 빈다.
 *
 * 그러니 카탈로그의 `available: true` 모델은 전부 단가 카드를 가져야 한다.
 * (available: false 는 아직 안 붙인 모델이라 대상이 아니다.)
 *
 * `check-log-contracts.mjs` 와 같은 계열의 게이트다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CATALOG = join(
  ROOT, 'apps', 'web', 'groupware', 'src', 'lib', 'pages', 'tools', 'marketing-video',
  'aiModelOptions.ts',
);
const RATES = join(ROOT, 'packages', 'pricing', 'src', 'rates.ts');
// language-model 이 응답에 실어 보내는 공용 신원(카탈로그 key)의 출처.
//   이 key 는 프론트 옵션 key/단가표 key 와 같아야 한다. 어긋나면 비용이 조용히 새고,
//   저장된 선택이 폴백돼 다른 모델로 응답한다.
const LM_CATALOG = join(
  ROOT, 'apps', 'api', 'fastapi', 'language-model', 'app', 'domains', 'inference',
  'core', 'application', 'model_catalog.py',
);

/**
 * 카탈로그에서 `available: true` 인 모델 key 를 뽑는다.
 *
 * 반드시 `options: [ ... ]` 안만 본다. 역량(AiCapability)도 `key:` 를 갖기 때문에
 * 파일 전체를 훑으면 'tts' 같은 역량 key 를 모델로 착각한다.
 * 또 옵션 key 는 문자열 리터럴이 아니라 상수 참조(EDGE_TTS_MODEL_KEY)일 수 있어 그것도 해석한다.
 */
function availableModelKeys(source) {
  // `export const NAME = 'value'` 상수 표: 옵션 key 가 참조로 쓰인 경우를 풀기 위해.
  const constants = new Map(
    [...source.matchAll(/^export const ([A-Z][A-Z0-9_]*)\s*=\s*'([^']+)'/gm)].map((m) => [
      m[1],
      m[2],
    ]),
  );

  const keys = new Set();
  // 각 `options: [` 블록의 내용을 대괄호 짝을 세어 잘라낸다.
  for (const match of source.matchAll(/options:\s*\[/g)) {
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (let i = end; i < source.length; i += 1) {
      if (source[i] === '[') depth += 1;
      else if (source[i] === ']') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const block = source.slice(match.index, end);

    // 블록 안의 각 옵션 객체 `{ ... }` 를 개별로 본다(중첩 객체는 이 카탈로그에 없다).
    for (const obj of block.matchAll(/\{[^{}]*\}/g)) {
      const body = obj[0];
      if (!/available:\s*true/.test(body)) continue;
      const literal = /key:\s*'([^']+)'/.exec(body);
      const reference = /key:\s*([A-Z][A-Z0-9_]*)/.exec(body);
      const key = literal ? literal[1] : reference ? constants.get(reference[1]) : undefined;
      if (key) keys.add(key);
      else if (reference) {
        console.error(`옵션 key 상수를 해석하지 못했습니다: ${reference[1]}`);
        process.exit(1);
      }
    }
  }
  return keys;
}

/** 단가표에서 카드 key 와 별칭 key 를 따로 뽑는다(별칭은 카탈로그 항목이 아니라 구분해야 한다). */
function ratedKeys(source) {
  const cards = source.match(/MODEL_RATE_CARDS[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!cards) throw new Error('MODEL_RATE_CARDS 를 찾지 못했습니다.');
  const cardKeys = new Set([...cards[1].matchAll(/^\s{2}'([^']+)':/gm)].map((m) => m[1]));

  const aliasBlock = source.match(/MODEL_KEY_ALIASES[^=]*=\s*\{([\s\S]*?)\n\};/);
  const aliasKeys = new Set(
    aliasBlock ? [...aliasBlock[1].matchAll(/'([^']+)':\s*'([^']+)'/g)].map((m) => m[1]) : [],
  );
  return { cardKeys, aliasKeys };
}

const catalog = readFileSync(CATALOG, 'utf8');
const rates = readFileSync(RATES, 'utf8');

const available = availableModelKeys(catalog);
const { cardKeys, aliasKeys } = ratedKeys(rates);
// 별칭도 조회 가능한 key 이므로 커버리지 판정에는 포함한다.
const rated = new Set([...cardKeys, ...aliasKeys]);

if (available.size === 0) {
  console.error('카탈로그에서 available 모델을 하나도 찾지 못했습니다. 파서가 깨졌을 수 있습니다.');
  process.exit(1);
}

const missing = [...available].filter((k) => !rated.has(k)).sort();
// 반대 방향(카드는 있는데 카탈로그에 없음)은 실패로 보지 않는다. 모델을 내렸어도 과거 비용을
// 재계산하려면 카드가 남아 있어야 한다. 별칭은 애초에 카탈로그 항목이 아니라 제외한다.
const retired = [...cardKeys].filter((k) => !available.has(k)).sort();

if (missing.length) {
  console.error('단가 카드가 없는 활성 모델이 있습니다 (비용이 영구히 rate-unknown 이 됩니다):');
  for (const key of missing) console.error(`  - ${key}`);
  console.error(`\n고칠 파일: packages/pricing/src/rates.ts (MODEL_RATE_CARDS 에 '${missing[0]}' 추가)`);
  process.exit(1);
}

/**
 * language-model 카탈로그(파이썬)의 (key, served_model_name) 쌍을 뽑는다.
 *
 * 파이썬을 정규식으로 읽는 이유는 check-log-contracts.mjs 와 같다. 두 언어에 걸친 한 계약을
 * 빌드 없이 대조하는 가장 값싼 방법이고, 어긋나면 돈이 조용히 새기 때문이다.
 */
function lmCatalogIdentities(source) {
  const out = [];
  for (const m of source.matchAll(
    /ModelSpecRecord\(\s*key="([^"]+)",\s*served_model_name="([^"]+)",([\s\S]*?)[\r\n]\s*\),/g,
  )) {
    const [, key, served, rest] = m;
    if (/available=False/.test(rest)) continue; // 아직 안 붙인 모델은 대상이 아니다.
    out.push({ key, served });
  }
  return out;
}

const lmIdentities = lmCatalogIdentities(readFileSync(LM_CATALOG, 'utf8'));
if (lmIdentities.length === 0) {
  console.error('language-model 카탈로그에서 ModelSpecRecord 를 하나도 찾지 못했습니다. 파서가 깨졌을 수 있습니다.');
  process.exit(1);
}

// 카탈로그 key = 응답이 밝히는 신원(= 프론트 옵션 key = 단가표 key). 세 네임스페이스가 하나여야 한다.
const unpriced = lmIdentities.filter((i) => !rated.has(i.key));
if (unpriced.length) {
  console.error('language-model 카탈로그 key 중 단가표에 없는 것이 있습니다');
  console.error('(응답이 그 key 를 신원으로 밝히므로 호출자의 비용이 rate-unknown 으로 새게 됩니다):');
  for (const i of unpriced) console.error(`  - key='${i.key}' (served='${i.served}')`);
  console.error(
    `
고칠 파일: packages/pricing/src/rates.ts 에 카드 추가, 또는 카탈로그 key 를` +
      ` 프론트 옵션 key(aiModelOptions.ts)와 일치시키기`,
  );
  process.exit(1);
}

const note = retired.length ? ` (내린 모델 ${retired.length}개는 과거 비용 재계산용으로 보존)` : '';
console.log(
  `단가표 커버리지 확인: 활성 모델 ${available.size}개 + language-model 신원 ${lmIdentities.length}개 전부 단가 있음${note}`,
);
