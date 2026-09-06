#!/usr/bin/env node
/**
 * MES 계약 미러 동기화 검사 (CI 게이트).
 *
 * 왜 필요한가: `@csc/mes-contracts` 는 TS 전용이라 데스크톱의 Rust 쪽은 같은 어휘를 복제할
 * 수밖에 없다. 복제본은 반드시 갈라지므로, 갈라지는 순간 CI 가 실패하게 만든다.
 * 갈라지면 조용히 망가진다. enum 값이 어긋나면 서버가 보낸 거부 사유를 클라이언트가 못 읽어
 * 재시도 판정이 틀어지고, 봉투 필드가 어긋나면 보낸 줄 알았는데 서버에 값이 안 남는다.
 *
 * `check-log-contracts.mjs`(TS ↔ Python) 와 같은 방식의 게이트다.
 *
 * 검사 대상:
 *   1. RejectReason  : packages/mes-contracts (SSOT) ↔ src-tauri/crates/mes-contracts
 *   2. MesErrorCode  : 같음
 *   3. MutationOp / SyncOpStatus / SyncEntity : 같음
 *   4. 전송 필드명    : TS `MutationEnvelope` ↔ Rust `MutationEnvelope`
 *                      (Rust 는 snake_case 필드 + rename_all = "camelCase" 라 변환 후 비교)
 *   5. 공유 상수      : 헤더 이름, 배치 한도, WIRE_VERSION 등 양쪽에 같은 이름으로 있는 값
 *                      (헤더 한 글자가 달라지면 서버가 "버전 미상" 으로 보고 통과시킨다 =
 *                       버전 게이트가 조용히 무력화된다)
 *
 * 사용: node scripts/check-mes-contracts.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const TS_DIR = join(ROOT, 'packages', 'mes-contracts', 'src');
const TS_ERRORS = join(TS_DIR, 'errors.ts');
const TS_ENTITY = join(TS_DIR, 'sync', 'entity.ts');
const TS_ENVELOPE = join(TS_DIR, 'sync', 'envelope.ts');
const TS_VERSION = join(TS_DIR, 'version.ts');

const RUST_LIB = join(
  ROOT, 'apps', 'desktop', 'mes', 'src-tauri', 'crates', 'mes-contracts', 'src', 'lib.rs',
);

/** TS `export enum Name { Member = 'value', ... }` 의 value 집합. */
function tsEnumValues(source, enumName) {
  const block = source.match(new RegExp(`export enum ${enumName}\\s*\\{([^}]*)\\}`, 's'));
  if (!block) throw new Error(`TS enum 을 찾지 못했습니다: ${enumName}`);
  return new Set([...block[1].matchAll(/=\s*'([^']+)'/g)].map((m) => m[1]));
}

/**
 * Rust `pub enum Name { #[serde(rename = "value")] Member, ... }` 의 rename 값 집합.
 *
 * 본문은 `pub enum Name {` 부터 컬럼 0 의 `}` 까지로 잡는다. variant 에 붙은 속성 때문에
 * `[^}]*` 류로는 끊기지 않지만, 중첩 중괄호가 생길 여지를 없애려 컬럼 0 을 기준으로 둔다.
 */
function rustEnumRenames(source, enumName) {
  const block = source.match(new RegExp(`pub enum ${enumName} \\{\\n([\\s\\S]*?)\\n\\}`));
  if (!block) throw new Error(`Rust enum 을 찾지 못했습니다: ${enumName}`);
  const values = [...block[1].matchAll(/#\[serde\(rename = "([^"]+)"\)\]/g)].map((m) => m[1]);
  // variant 수와 rename 수가 다르면 rename 을 빠뜨린 variant 가 있다는 뜻이다.
  // 그 variant 는 Rust 이름 그대로 직렬화되어 서버가 못 읽는다.
  const variantCount = [...block[1].matchAll(/^\s{4}[A-Z][A-Za-z0-9]*,/gm)].length;
  if (variantCount !== values.length) {
    throw new Error(
      `Rust enum ${enumName}: variant ${variantCount}개 중 ${values.length}개만 ` +
        `#[serde(rename = "...")] 을 갖고 있습니다. 전부 명시해야 합니다.`,
    );
  }
  return new Set(values);
}

/**
 * TS `export interface Name {\n  field: Type;\n}` 의 최상위 필드명 집합.
 * 들여쓰기 2칸 = 최상위 필드. 선택 필드(`field?:`)도 포함한다.
 */
function tsInterfaceFields(source, interfaceName) {
  const block = source.match(
    new RegExp(`export interface ${interfaceName}\\s*\\{\\n([\\s\\S]*?)\\n\\}`),
  );
  if (!block) throw new Error(`TS interface 를 찾지 못했습니다: ${interfaceName}`);
  return new Set([...block[1].matchAll(/^ {2}([a-zA-Z_][a-zA-Z0-9_]*)\??:/gm)].map((m) => m[1]));
}

/** snake_case -> camelCase. Rust 구조체의 rename_all = "camelCase" 와 같은 변환. */
function toCamelCase(name) {
  return name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/**
 * Rust `pub struct Name {\n    pub field: Type,\n}` 의 필드명 집합(camelCase 변환 후).
 * 구조체에 `#[serde(rename_all = "camelCase")]` 가 붙어 있는지도 함께 확인한다.
 */
function rustStructFields(source, structName) {
  const block = source.match(
    new RegExp(`(#\\[serde\\([^)]*\\)\\]\\n)?pub struct ${structName} \\{\\n([\\s\\S]*?)\\n\\}`),
  );
  if (!block) throw new Error(`Rust struct 를 찾지 못했습니다: ${structName}`);
  const attr = block[1] ?? '';
  if (!attr.includes('rename_all = "camelCase"')) {
    throw new Error(
      `Rust struct ${structName} 에 #[serde(rename_all = "camelCase")] 가 없습니다. ` +
        `없으면 전송 필드가 snake_case 로 나가 서버가 전 필드를 못 읽습니다.`,
    );
  }
  const fields = [...block[2].matchAll(/^\s{4}pub ([a-z_][a-z0-9_]*):/gm)].map((m) => m[1]);
  return new Set(fields.map(toCamelCase));
}

/**
 * `export const NAME = 값;` / `pub const NAME: T = 값;` 에서 값을 뽑아 정규화한다.
 *
 * 숫자일 때만 자릿수 구분자(`1_048_576`)를 제거한다. 문자열 값에서 무조건 `_` 를 지우면
 * `x_client_app` 같은 이름이 조용히 뭉개져 비교가 무의미해진다.
 */
function constantValue(source, name) {
  // 타입 표기는 `= ` 앞까지 통째로 건너뛴다. Rust 는 `&str`, `&'static str` 처럼
  // 영숫자가 아닌 문자를 쓴다(이걸 `[A-Za-z0-9_]+` 로 잡으려다 문자열 상수를 전부 놓쳤다).
  const m = source.match(new RegExp(`\\b${name}(?::\\s*[^=;]+)?\\s*=\\s*([^;]+);`));
  if (!m) throw new Error(`상수를 찾지 못했습니다: ${name}`);
  const raw = m[1].trim().replace(/['"]/g, '');
  return /^[0-9_]+$/.test(raw) ? raw.replace(/_/g, '') : raw;
}

function diff(label, expected, actual, fixPath) {
  const missing = [...expected].filter((v) => !actual.has(v));
  const extra = [...actual].filter((v) => !expected.has(v));
  if (!missing.length && !extra.length) return null;
  const parts = [];
  if (missing.length) parts.push(`Rust 에 없음: ${missing.join(', ')}`);
  if (extra.length) parts.push(`Rust 에만 있음: ${extra.join(', ')}`);
  return `  ${label}: ${parts.join(' / ')}\n      고칠 파일: ${relative(ROOT, fixPath).replace(/\\/g, '/')}`;
}

const tsErrors = readFileSync(TS_ERRORS, 'utf8');
const tsEntity = readFileSync(TS_ENTITY, 'utf8');
const tsEnvelope = readFileSync(TS_ENVELOPE, 'utf8');
const tsVersion = readFileSync(TS_VERSION, 'utf8');
const rust = readFileSync(RUST_LIB, 'utf8');

const failures = [];

try {
  const checks = [
    ['RejectReason', tsEnumValues(tsErrors, 'RejectReason'), rustEnumRenames(rust, 'RejectReason')],
    ['MesErrorCode', tsEnumValues(tsErrors, 'MesErrorCode'), rustEnumRenames(rust, 'MesErrorCode')],
    ['MutationOp', tsEnumValues(tsEnvelope, 'MutationOp'), rustEnumRenames(rust, 'MutationOp')],
    ['SyncOpStatus', tsEnumValues(tsEnvelope, 'SyncOpStatus'), rustEnumRenames(rust, 'SyncOpStatus')],
    ['SyncEntity', tsEnumValues(tsEntity, 'SyncEntity'), rustEnumRenames(rust, 'SyncEntity')],
    [
      '전송 필드명(MutationEnvelope)',
      tsInterfaceFields(tsEnvelope, 'MutationEnvelope'),
      rustStructFields(rust, 'MutationEnvelope'),
    ],
    [
      '전송 필드명(PushRequest)',
      tsInterfaceFields(tsEnvelope, 'PushRequest'),
      rustStructFields(rust, 'PushRequest'),
    ],
    [
      '전송 필드명(SyncOpResult)',
      tsInterfaceFields(tsEnvelope, 'SyncOpResult'),
      rustStructFields(rust, 'SyncOpResult'),
    ],
    [
      '전송 필드명(PushResponse)',
      tsInterfaceFields(tsEnvelope, 'PushResponse'),
      rustStructFields(rust, 'PushResponse'),
    ],
    [
      '전송 필드명(SyncChange)',
      tsInterfaceFields(tsEnvelope, 'SyncChange'),
      rustStructFields(rust, 'SyncChange'),
    ],
    [
      '전송 필드명(PullResponse)',
      tsInterfaceFields(tsEnvelope, 'PullResponse'),
      rustStructFields(rust, 'PullResponse'),
    ],
  ];

  for (const [label, ts, rs] of checks) {
    const result = diff(label, ts, rs, RUST_LIB);
    if (result) failures.push(result);
  }

  // 양쪽에 같은 이름으로 존재하는 상수. 값이 갈리면 오류 없이 망가진다.
  //
  //   - 헤더 이름: 서버는 `x-client-version` 을 읽는데 단말이 `x-client-ver` 를 보내면,
  //     서버는 "버전을 안 밝힌 호출자" 로 보고 ok 로 통과시킨다. soft-block 이 영원히
  //     안 걸리고 아무도 눈치채지 못한다. check-log-contracts.mjs 가 상관관계 헤더에
  //     대해 막는 것과 같은 실패 모드다.
  //   - 배치 한도: 클라가 서버보다 큰 값을 믿으면 매 전송이 413 으로 튕긴다.
  //   - WIRE_VERSION: 갈리면 서버가 커서를 거부해 전 단말이 재부트스트랩에 빠진다.
  const SHARED_CONSTANTS = [
    ['WIRE_VERSION', tsVersion],
    ['SYNC_PUSH_ALWAYS_ACCEPTED', tsVersion],
    ['CLIENT_APP_HEADER', tsVersion],
    ['CLIENT_VERSION_HEADER', tsVersion],
    ['DEVICE_ID_HEADER', tsVersion],
    ['LOCAL_SCHEMA_HEADER', tsVersion],
    ['DEVICE_TOKEN_HEADER', tsVersion],
    ['MES_DESKTOP_APP_ID', tsVersion],
    ['MAX_OPERATIONS_PER_BATCH', tsEnvelope],
    ['MAX_PUSH_BODY_BYTES', tsEnvelope],
    ['DEFAULT_PULL_LIMIT', tsEnvelope],
    ['MAX_PULL_LIMIT', tsEnvelope],
  ];

  for (const [name, tsSource] of SHARED_CONSTANTS) {
    const tsValue = constantValue(tsSource, name);
    const rustValue = constantValue(rust, name);
    if (tsValue !== rustValue) {
      failures.push(
        `  ${name} — TS "${tsValue}" ↔ Rust "${rustValue}"\n` +
          `      고칠 파일: ${relative(ROOT, RUST_LIB).replace(/\\/g, '/')}`,
      );
    }
  }
} catch (error) {
  failures.push(`  ${error.message}`);
}

if (failures.length) {
  console.error('MES 계약 미러가 어긋났습니다 (TS 가 SSOT):');
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('MES 계약 미러 동기화 확인 (enum 5종 + 전송 구조체 6종 + 공유 상수 12종)');
