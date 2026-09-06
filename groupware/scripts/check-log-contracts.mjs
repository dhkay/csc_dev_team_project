/**
 * 로그 계약 미러 동기화 검사 (CI 게이트).
 *
 * 왜 필요한가: `@csc/entitlements` 는 TS 전용이라 Python 쪽 `AiToolKey` 는 문자열을 복제할
 * 수밖에 없다. 복제본은 반드시 갈라지므로, 갈라지는 순간 CI 가 실패하게 만든다.
 * 갈라지면 프로듀서가 보낸 도구 key 가 컨슈머의 닫힌 집합 가드에서 조용히 제거되어
 * 그 도구의 로그가 도구 필터에 안 잡히는, 발견하기 어려운 형태로 망가진다.
 *
 * 검사 대상:
 *   1. AiToolKey        : packages/entitlements (SSOT) ↔ apps/api/fastapi/log-contracts
 *   2. LogKind/LogLevel/LogScope/PrincipalType : packages/log-contracts ↔ 같은 Python 패키지
 *   3. 전송 필드명       : TS `LogEnvelopeWire` ↔ Python `serde.to_dict`
 *      (한쪽에만 있는 필드는 조용히 유실된다. 프로듀서가 보낸 값이 저장소에 안 남는 형태)
 *   4. 상관관계 헤더명    : packages/net-utils ↔ apps/api/fastapi/net-utils
 *      (한 글자만 달라져도 trace 가 홉 경계에서 끊긴다. 에러는 안 나고 추적만 조용히 망가진다)
 *
 * `check-endpoint-ids.mjs` 와 같은 방식의 게이트다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const TS_ENTITLEMENTS = join(ROOT, 'packages', 'entitlements', 'src', 'catalog.ts');
const TS_LOG_TYPES = join(ROOT, 'packages', 'log-contracts', 'src', 'types.ts');
const TS_LOG_ENVELOPE = join(ROOT, 'packages', 'log-contracts', 'src', 'envelope.ts');
const PY_LOG_DIR = join(ROOT, 'apps', 'api', 'fastapi', 'log-contracts', 'src', 'csc_log_contracts');
const PY_LOG_TYPES = join(PY_LOG_DIR, 'types.py');
const PY_LOG_SERDE = join(PY_LOG_DIR, 'serde.py');

// 상관관계 헤더: 두 net-utils 구현이 같은 이름을 써야 홉 경계에서 trace 가 이어진다.
const TS_CONTEXT = join(ROOT, 'packages', 'net-utils', 'src', 'request-context.ts');
const PY_CONTEXT = join(
  ROOT, 'apps', 'api', 'fastapi', 'net-utils', 'src', 'csc_net_utils', 'request_context.py',
);

/** TS `export enum Name { Member = 'value', ... }` 의 value 집합을 뽑는다. */
function tsEnumValues(source, enumName) {
  const block = source.match(new RegExp(`export enum ${enumName}\\s*\\{([^}]*)\\}`, 's'));
  if (!block) throw new Error(`TS enum 을 찾지 못했습니다: ${enumName}`);
  return new Set([...block[1].matchAll(/=\s*'([^']+)'/g)].map((m) => m[1]));
}

/** Python `class Name(str, Enum): MEMBER = "value"` 의 value 집합을 뽑는다. */
function pyEnumValues(source, enumName) {
  const block = source.match(
    new RegExp(`class ${enumName}\\(str, Enum\\):([\\s\\S]*?)(?=\\nclass |\\ndef |$)`),
  );
  if (!block) throw new Error(`Python enum 을 찾지 못했습니다: ${enumName}`);
  return new Set([...block[1].matchAll(/^\s{4}[A-Z_]+\s*=\s*"([^"]+)"/gm)].map((m) => m[1]));
}

/**
 * TS `export interface LogEnvelopeWire { field: Type; ... }` 의 최상위 필드명 집합.
 * 본문은 열린 줄부터 컬럼 0 의 `}` 까지로 잡는다. 중첩 객체 타입(actor)이 있어
 * `[^}]*` 류로는 조기 종료된다.
 */
function tsInterfaceFields(source, interfaceName) {
  const block = source.match(
    new RegExp(`export interface ${interfaceName}\\s*\\{\\n([\\s\\S]*?)\\n\\}`),
  );
  if (!block) throw new Error(`TS interface 를 찾지 못했습니다: ${interfaceName}`);
  // 들여쓰기 2칸 = 최상위 필드. 중첩 객체의 내부 필드는 같은 줄에 있어 걸리지 않는다.
  return new Set([...block[1].matchAll(/^ {2}([a-z_][a-z0-9_]*)\??:/gm)].map((m) => m[1]));
}

/** Python `def to_dict(...) -> ...: return { "field": ..., }` 의 최상위 키 집합. */
function pyToDictKeys(source) {
  const block = source.match(/def to_dict\([\s\S]*?\n    return \{([\s\S]*?)\n    \}/);
  if (!block) throw new Error('Python to_dict 를 찾지 못했습니다.');
  return new Set([...block[1].matchAll(/^\s{8}"([a-z_]+)":/gm)].map((m) => m[1]));
}

/** `export const NAME = 'value';` / `NAME = "value"` 형태의 상수 값을 뽑는다(TS, Python 공용). */
function constantValue(source, name) {
  const m = source.match(new RegExp(`${name}[^=\\n]*=\\s*['"]([^'"]+)['"]`));
  if (!m) throw new Error(`상수를 찾지 못했습니다: ${name}`);
  return m[1];
}

function diff(label, expected, actual, fixPath) {
  const missing = [...expected].filter((v) => !actual.has(v));
  const extra = [...actual].filter((v) => !expected.has(v));
  if (!missing.length && !extra.length) return null;
  const parts = [];
  if (missing.length) parts.push(`Python 에 없음: ${missing.join(', ')}`);
  if (extra.length) parts.push(`Python 에만 있음: ${extra.join(', ')}`);
  // 검사마다 고칠 파일이 다르므로 항목 옆에 붙여준다(마지막에 한 줄로 몰면 엉뚱한 파일을 가리킨다).
  return `  ${label}: ${parts.join(' / ')}\n      고칠 파일: ${fixPath}`;
}

const entitlements = readFileSync(TS_ENTITLEMENTS, 'utf8');
const tsLogTypes = readFileSync(TS_LOG_TYPES, 'utf8');
const tsLogEnvelope = readFileSync(TS_LOG_ENVELOPE, 'utf8');
const pyLogTypes = readFileSync(PY_LOG_TYPES, 'utf8');
const pyLogSerde = readFileSync(PY_LOG_SERDE, 'utf8');

const checks = [
  ['AiToolKey', tsEnumValues(entitlements, 'AiToolKey'), pyEnumValues(pyLogTypes, 'AiToolKey'), PY_LOG_TYPES],
  ['LogKind', tsEnumValues(tsLogTypes, 'LogKind'), pyEnumValues(pyLogTypes, 'LogKind'), PY_LOG_TYPES],
  ['LogLevel', tsEnumValues(tsLogTypes, 'LogLevel'), pyEnumValues(pyLogTypes, 'LogLevel'), PY_LOG_TYPES],
  ['LogScope', tsEnumValues(tsLogTypes, 'LogScope'), pyEnumValues(pyLogTypes, 'LogScope'), PY_LOG_TYPES],
  [
    'PrincipalType',
    tsEnumValues(tsLogTypes, 'PrincipalType'),
    pyEnumValues(pyLogTypes, 'PrincipalType'),
    PY_LOG_TYPES,
  ],
  [
    '전송 필드명(LogEnvelopeWire ↔ to_dict)',
    tsInterfaceFields(tsLogEnvelope, 'LogEnvelopeWire'),
    pyToDictKeys(pyLogSerde),
    PY_LOG_SERDE,
  ],
  [
    '상관관계 헤더명(net-utils TS ↔ Python)',
    new Set([
      constantValue(readFileSync(TS_CONTEXT, 'utf8'), 'TRACE_ID_HEADER'),
      constantValue(readFileSync(TS_CONTEXT, 'utf8'), 'REQUEST_ID_HEADER'),
    ]),
    new Set([
      constantValue(readFileSync(PY_CONTEXT, 'utf8'), 'TRACE_ID_HEADER'),
      constantValue(readFileSync(PY_CONTEXT, 'utf8'), 'REQUEST_ID_HEADER'),
    ]),
    PY_CONTEXT,
  ],
];

const failures = checks.map(([label, ts, py, fix]) => diff(label, ts, py, fix)).filter(Boolean);

if (failures.length) {
  console.error('로그 계약 미러가 어긋났습니다 (TS 가 SSOT):');
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`로그 계약 미러 동기화 확인 (${checks.length}개 항목)`);
