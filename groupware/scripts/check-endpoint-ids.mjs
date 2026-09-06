#!/usr/bin/env node
/**
 * API 엔드포인트 안정 식별자([PREFIX-NNN]) 무결성 검사.
 *
 * 각 엔드포인트는 문서/코드 식별자를 summary 앞에 단다:
 *   NestJS : @ApiOperation({ summary: '[AUTH-001] 이메일 로그인' })
 *   FastAPI: @router.post(..., summary="[VIDEO-001] 미디어 작업 생성")
 * 이 식별자는 Scalar 문서 표시 + `grep AUTH-001` 코드 탐색용이며 런타임엔 영향이 없다.
 *
 * 이 스크립트가 소스에서 모든 식별자를 추출해 아래를 강제한다(위반 시 exit 1):
 *   - 형식      : 정확히 [대문자접두사-3자리]  (예: [AUTH-001])
 *   - 유일성    : 중복 식별자 금지  ← "중복되지 않은 고유식별자" 보장
 *   - 접두사    : 아래 화이트리스트(태그 1:1) 외 접두사 금지(오타 방지)
 *
 * 사용:
 *   node scripts/check-endpoint-ids.mjs         # 검사(비정상 시 exit 1)
 *   node scripts/check-endpoint-ids.mjs --list  # 전체 식별자 카탈로그 출력
 *
 * 접두사 SSOT(태그 1:1, 전역 유일):
 *   user           : AUTH ACCOUNT INTERNAL DEPARTMENT MEMBER DIRECTORY
 *   csc-groupware  : ENTITLEMENT
 *   control-tower  : ADMIN AITOOL ORG SERVER ASSISTANT
 *   csc-mes        : MES SYNC DEVICE EQUIP
 *   data-collector : CATALOG (소스/선택지)  LAB (/lab 검증 표면)
 *                    실사용 수집은 소스마다 접두사를 하나씩 가진다:
 *                    DATALAB GTRENDS NATE WIKI ADKEYWORD SEARCHTREND YOUTUBE GSEARCH
 *   video-model: VIDEO      file-upload: UPLOAD FILES      log-server: LOG
 *   csc-marketing  : CHANNEL WORD PLAN SOURCE PREF  +  SAGA(다단계 쓰기 복구, 운영)
 * 새 엔드포인트 = 해당 접두사의 다음 빈 번호를 append(기존 번호 재부여 금지: 식별자는 안정적).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOT = join(ROOT, 'apps', 'api');

const ALLOWED_PREFIXES = new Set([
  'AUTH', 'ACCOUNT', 'INTERNAL', 'DEPARTMENT', 'MEMBER', 'DIRECTORY',
  'ENTITLEMENT', 'ADMIN', 'AITOOL', 'ORG', 'SERVER', 'ASSISTANT',
  'VIDEO', 'UPLOAD', 'FILES', 'LOG',
  // file-upload. STORAGE 를 UPLOAD 와 분리한 이유: 업로드는 다른 서비스들이 자산을 맡기는
  // 범용 경로이고, 스토리지는 조직 사용자가 파일을 직접 다루는 화면의 표면이다. 인가 모델도
  // (서비스 신뢰 vs 영역/부서 스코프) 다르므로 한 접두사에 섞으면 그 차이가 보이지 않는다.
  'STORAGE',
  // csc-mes. SYNC 를 MES 와 분리한 이유: 동기화 계약은 오프라인 클라이언트와 맞물려 있어
  // 하위호환 감사 대상이 다르다. 나중에 v2 호환성을 훑을 때 이 접두사가 검색 키가 된다.
  'MES', 'SYNC', 'DEVICE', 'EQUIP',
  // csc-marketing. 채널 자원을 도메인 넷이 나눠 가진다(채널/단어/설정/기획). 접두사는 그 경계를
  // 따라 가른다. CHANNEL 은 채널 자체와 그 설정(브랜드컨셉)을 함께 쓴다.
  // 둘 다 "채널이라는 자원의 속성" 이라 읽는 사람이 나눌 이유가 없다.
  // PREF 는 반대로 사람에게 매달린 설정이다(AI 모델 선택). 채널을 옮겨도 따라오므로 CHANNEL
  // 과 같은 접두사를 쓰면 스코프를 착각하게 된다.
  'CHANNEL', 'WORD', 'PLAN', 'SOURCE', 'PREF',
  // SAGA 는 도메인이 아니라 그 도메인들의 다단계 쓰기를 이어 가는 운영 표면이다. 어느 도메인
  // 접두사에 넣어도 소유가 어긋나므로 따로 둔다(복구는 세 도메인을 함께 다룬다).
  // data-collector. 한 서버가 OpenAPI 문서를 둘 내므로 접두사도 표면별로 가른다:
  // CATALOG/소스별 접두사 = 실사용 수집, LAB = 아직 실사용하지 않는 외부 API 검증(/lab 서브앱).
  'CATALOG', 'LAB', 'SAGA',
  // 실사용 수집은 소스마다 접두사를 하나씩 쓴다. 한 접두사에 몰아 넣으면 소스가 늘 때마다
  // 번호가 뒤섞여, 나중에 한 소스의 엔드포인트만 훑는 일이 불가능해진다.
  'DATALAB', 'GTRENDS', 'NATE', 'WIKI', 'ADKEYWORD', 'SEARCHTREND', 'YOUTUBE', 'GSEARCH',
]);

// 식별자를 다는 소스 파일만 스캔한다.
const isTarget = (p) =>
  p.endsWith('.controller.ts') ||
  (p.replace(/\\/g, '/').includes('/adapters/inbound/http/') && p.endsWith('router.py'));

const STRICT = /\[([A-Z]+)-(\d{3})\]/g;               // 정상 식별자
const LOOSE = /\[([A-Za-z]+)-(\d{1,})\]/g;            // "ID 처럼 생긴" 토큰(오타 탐지용)

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.venv' || name === 'dist') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (isTarget(full)) out.push(full);
  }
  return out;
}

const ids = [];        // { id, prefix, num, file, line, text }
const malformed = [];  // { token, file, line }

for (const file of walk(SCAN_ROOT)) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    // 정상 식별자 수집(+ 뒤따르는 요약 텍스트 캡처).
    for (const m of line.matchAll(STRICT)) {
      const after = line.slice(m.index + m[0].length).replace(/^\s*/, '');
      const text = (after.match(/^([^'"]*)/)?.[1] ?? '').trim();
      ids.push({ id: `${m[1]}-${m[2]}`, prefix: m[1], num: m[2], file: rel, line: i + 1, text });
    }
    // 느슨하게 잡되 strict 에 안 맞는 토큰 = 형식 오류(소문자/자릿수).
    for (const m of line.matchAll(LOOSE)) {
      if (!/^[A-Z]+-\d{3}$/.test(`${m[1]}-${m[2]}`)) {
        malformed.push({ token: m[0], file: rel, line: i + 1 });
      }
    }
  });
}

if (process.argv.includes('--list')) {
  const byPrefix = {};
  for (const e of ids) (byPrefix[e.prefix] ??= []).push(e);
  for (const prefix of [...Object.keys(byPrefix)].sort()) {
    console.log(`\n${prefix} (${byPrefix[prefix].length})`);
    for (const e of byPrefix[prefix].sort((a, b) => a.num.localeCompare(b.num))) {
      console.log(`  ${e.id}  ${e.text}   (${e.file}:${e.line})`);
    }
  }
  console.log(`\n총 ${ids.length}개 식별자 / ${Object.keys(byPrefix).length}개 접두사`);
  process.exit(0);
}

const errors = [];

// 1) 중복
const seen = new Map();
for (const e of ids) {
  if (seen.has(e.id)) {
    errors.push(`중복 식별자 [${e.id}]: ${seen.get(e.id).file}:${seen.get(e.id).line} ↔ ${e.file}:${e.line}`);
  } else seen.set(e.id, e);
}
// 2) 미허용 접두사
for (const prefix of new Set(ids.map((e) => e.prefix))) {
  if (!ALLOWED_PREFIXES.has(prefix)) {
    const ex = ids.find((e) => e.prefix === prefix);
    errors.push(`미허용 접두사 "${prefix}" (${ex.file}:${ex.line}). SSOT 화이트리스트에 추가하거나 오타 수정`);
  }
}
// 3) 형식 오류
for (const m of malformed) {
  errors.push(`형식 오류 ${m.token} (${m.file}:${m.line}). [대문자-3자리] 규격 위반`);
}

// 접두사별 카운트 요약
const counts = {};
for (const e of ids) counts[e.prefix] = (counts[e.prefix] ?? 0) + 1;
const summary = [...ALLOWED_PREFIXES]
  .filter((p) => counts[p])
  .map((p) => `${p}:${counts[p]}`)
  .join(' ');

if (errors.length) {
  console.error('엔드포인트 식별자 검사 실패\n');
  for (const e of errors) console.error(`  - ${e}`);
  console.error(`\n(수집 ${ids.length}개: ${summary})`);
  process.exit(1);
}

console.log(`엔드포인트 식별자 검사 통과: ${ids.length}개, 중복 0, 접두사 ${Object.keys(counts).length}개`);
console.log(`  ${summary}`);
