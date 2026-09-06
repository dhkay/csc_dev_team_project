#!/usr/bin/env node
/**
 * 백엔드가 필수로 받는 쿼리 파라미터를 웹 서버 호출부가 빠뜨렸는지 검사한다.
 *
 * 왜 이 게이트가 있는가: 채널을 개인 소유로 내리면서 `GET /channels` 가 `ownerUserId` 를 필수로
 * 받게 됐는데, 활동 로그 로더만 갱신되지 않았다. 백엔드는 400 을 돌려줬고 로더의 `catch` 가 그것을
 * 삼켜 빈 배열로 떨어졌다. 그 결과 원장의 채널 컬럼이 나흘간 전부 "삭제된 채널" 로 보였다.
 * 타입이 잡지 못하는 어긋남이다. URL 이 문자열이고 실패가 폴백에 흡수되기 때문이다.
 *
 * 무엇을 비교하나:
 *   계약  = NestJS 컨트롤러의 `@Query('x', SomePipe) x: T` (파이프가 있고 optional 이 아니면 필수)
 *   호출  = 웹의 `server*Client()/auth*Client(event).GET('/path?a=1&b=2')`
 * 호출 경로가 어느 계약과 맞는지 찾고, 그 계약의 필수 파라미터가 쿼리에 없으면 실패한다.
 *
 * 오탐을 만들지 않으려고 보수적으로 판정한다:
 *   - 리터럴 세그먼트는 리터럴끼리만 맞춘다(그래야 한 경로의 리터럴/파라미터 라우트가 섞이지 않는다).
 *   - 쿼리를 변수로 넘기는 패턴(`?${searchParams}`)은 판정을 건너뛴다(무엇이 들어갈지 모른다).
 *   - 계약을 못 찾은 호출은 침묵한다(이 게이트의 일이 아니다. 경로 오타는 통합 테스트가 본다).
 *   - 그래도 남는 모호함은 필수가 가장 적은 계약으로 접는다.
 *
 * 통과 메시지에 판정 건수와 미판정 사유를 함께 적는다. "위반 0" 만 적으면 깨끗한 것과 아무것도
 * 판정하지 못한 것이 구분되지 않는다. FastAPI 백엔드는 컨트롤러 파서가 없어 검사 범위 밖이고,
 * 그 사실도 그 줄에 드러난다. 호출별 사유는 `--report` 로 본다.
 *
 * `--selftest` 는 검사기 자신을 검증한다. 파서가 읽은 핸들러/필수 파라미터 수를 줄 단위 독립
 * 카운트와 대조하고(조용히 덜 읽으면 실패), 과거에 실제로 놓쳤던 호출들을 다시 넣어 잡는지 본다.
 * 정규식 파서라 조용히 망가질 수 있고, 그때 "위반 0" 은 곧 "검사기가 죽었음" 을 뜻하기 때문이다.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').replace(/\\/g, '/');
const SKIP = new Set(['node_modules', '.svelte-kit', 'dist', 'build', '.turbo', 'coverage']);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP.has(e)) continue;
    const p = join(dir, e);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|svelte)$/.test(e)) out.push(p.replace(/\\/g, '/'));
  }
  return out;
}

/**
 * 주석을 공백으로 지운다(줄 구조는 유지). 지우지 않으면 주석 안의 `@Get(':id')` 같은 설명 문장이
 * 핸들러로 잡혀 유령 엔드포인트가 생긴다. 그게 실제 경로의 후보로 끼어들면 아래 매칭이 엉뚱한
 * 계약을 골라 진짜 위반을 가릴 수 있다(실제로 video-final 컨트롤러에서 한 건 발생했다).
 * `://` 를 살리려고 앞 문자가 콜론인 경우는 건드리지 않는다.
 */
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

// 계약 수집: 컨트롤러에서 (메서드, 경로, 필수 쿼리)
const endpoints = [];
for (const file of walk(join(ROOT, 'apps/api/nestjs')).filter((f) => f.endsWith('.controller.ts'))) {
  const src = stripComments(readFileSync(file, 'utf8'));
  const ctrl = src.match(/@Controller\(\s*[`'"]?([^`'")]*)/);
  if (!ctrl) continue;
  // 버전 프리픽스는 상수로 들어온다. 경로 비교를 위해 세그먼트 모양으로 되돌린다.
  const prefix = ctrl[1].replace(/\$\{TOOL_VERSION_ROUTE\}/g, 'v/:version').replace(/^\/+|\/+$/g, '');

  const handler = /@(Get|Post|Patch|Put|Delete)\(\s*[`'"]?([^`'")]*)[`'"]?\s*\)\s*([\s\S]*?)\n\s*\}/g;
  let h;
  while ((h = handler.exec(src)) !== null) {
    const [, method, sub, signature] = h;
    const required = [];
    // @Query('name', Pipe) name: T   ← 파이프가 있고 `?` 가 없으면 필수
    const query = /@Query\(\s*'([^']+)'\s*(,\s*[^)]*)?\)\s*[A-Za-z_$][\w$]*\s*(\??)\s*:/g;
    let q;
    while ((q = query.exec(signature)) !== null) {
      const [, name, pipe, optional] = q;
      if (pipe && !optional) required.push(name);
    }
    const path = `/${prefix}${sub ? '/' + sub.replace(/^\/+/, '') : ''}`.replace(/\/+/g, '/');
    endpoints.push({ file: file.replace(`${ROOT}/`, ''), method: method.toUpperCase(), path, required });
  }
}

// 호출부 수집: 웹 서버 코드가 백엔드를 직접 부르는 지점
const CALL =
  /(?:server|auth)([A-Z][A-Za-z]*)Client\([^)]*\)\s*\.\s*(GET|POST|PATCH|PUT|DELETE)\s*(?:<[^(]*?>)?\s*\(\s*([`'"])([^`'"]*)\3/g;
const calls = [];
for (const file of walk(join(ROOT, 'apps/web'))) {
  const src = readFileSync(file, 'utf8');
  CALL.lastIndex = 0;
  let m;
  while ((m = CALL.exec(src)) !== null) {
    calls.push({ file: file.replace(`${ROOT}/`, ''), method: m[2], url: m[4] });
  }
}

/**
 * 호출 URL 을 (경로, 보낸 쿼리 파라미터, 쿼리를 아는지) 로 분해한다.
 *
 * 템플릿 홀의 위치가 중요하다. 세그먼트 하나가 통째로 홀이면(`/uploads/${id}/confirm`) 경로
 * 파라미터라 `:p` 로 두면 된다. 그런데 세그먼트에 붙어 있으면(`/asset-sets${query}`) 그 뒤가
 * 경로인지 쿼리인지 알 수 없다. 그것을 `:p` 로 이어 붙이면 `asset-sets:p` 라는 없는 세그먼트가
 * 되어 경로 매칭이 조용히 실패한다(계약을 못 찾은 것으로 집계되어 갭이 갭으로 안 보인다).
 * 그래서 그 지점에서 경로를 끊고 "쿼리는 모른다" 로 표시한다.
 */
function dissect(url) {
  const glued = /(?<![/(])\$\{/.exec(url); // 세그먼트 시작(`/`)이 아닌 곳에서 시작하는 홀
  if (glued && !url.slice(0, glued.index).includes('?')) {
    const head = url.slice(0, glued.index);
    return { path: normalizePath(head), sent: [], queryKnown: false };
  }
  const [rawPath, rawQuery = ''] = url.split('?');
  const sent = [...rawQuery.matchAll(/(?:^|&)([A-Za-z_][\w]*)=/g)].map((m) => m[1]);
  // 쿼리에 홀만 있고 이름이 하나도 안 보이면 통째로 넘긴 것이다.
  const queryKnown = !(sent.length === 0 && /\$\{[^}]*\}/.test(rawQuery));
  return { path: normalizePath(rawPath), sent, queryKnown };
}
const normalizePath = (p) =>
  p.replace(/\$\{[^}]*\}/g, ':p').replace(/\/+$/, '').replace(/\/+/g, '/');
/**
 * 경로 매칭. 규칙을 좁게 잡는 것이 중요하다.
 *   계약이 파라미터(`:id`)면  호출의 어떤 세그먼트와도 맞는다.
 *   계약이 리터럴(`archive`)이면 호출도 같은 리터럴이어야 한다.
 *
 * 호출의 템플릿 홀(`${id}` → `:p`)을 리터럴에도 맞춰 주면 안 된다. 그러면 한 경로에 리터럴
 * 라우트와 파라미터 라우트가 함께 있을 때(`/video-finals/archive` 와 `/video-finals/:id`)
 * `${id}` 호출이 두 계약에 모두 걸리고, 필수가 적은 리터럴 쪽이 선택되어 누락이 가려진다.
 * 좁게 잡아서 못 맞추면 그 호출은 침묵할 뿐이라(안전한 방향) 좁은 쪽이 옳다.
 */
const pathMatches = (callPath, epPath) => {
  const a = callPath.split('/').filter(Boolean);
  const b = epPath.split('/').filter(Boolean);
  return a.length === b.length && a.every((seg, i) => (b[i].startsWith(':') ? true : seg === b[i]));
};

/**
 * 한 호출의 판정: 누락된 필수 파라미터 목록(판정 불가면 null).
 * `trace` 를 넘기면 왜 판정하지 못했는지 사유를 담는다(`--report` 진단용).
 */
function judge(call, trace) {
  const { path: cp, sent, queryKnown } = dissect(call.url);
  const candidates = endpoints.filter((e) => e.method === call.method && pathMatches(cp, e.path));
  if (candidates.length === 0) {
    if (trace) trace.reason = '맞는 계약 없음';
    return null;
  }
  // 그래도 남는 모호함(같은 경로 모양의 계약이 둘 이상)은 필수가 적은 쪽으로 접는다.
  //   오탐을 만들지 않는 방향이다. 위 매칭 규칙이 리터럴/파라미터 혼동을 이미 걷어냈다.
  const ep = candidates.slice().sort((x, y) => x.required.length - y.required.length)[0];
  if (ep.required.length === 0) {
    if (trace) trace.reason = '계약에 필수 쿼리가 없음(검사 대상 아님)';
    return null;
  }
  // 쿼리를 변수로 넘기는 패턴은 무엇이 들어갈지 알 수 없다.
  if (!queryKnown) {
    if (trace) trace.reason = '쿼리를 변수로 전달(판정 불가)';
    return null;
  }
  if (trace) trace.reason = '판정';
  return { ep, missing: ep.required.filter((r) => !sent.includes(r)) };
}

/** 진단: 호출별로 왜 판정됐는지/안 됐는지 보여준다. "위반 0" 이 커버리지 부족인지 가리기 위한 것. */
if (process.argv.includes('--report')) {
  const groups = new Map();
  for (const call of calls) {
    const trace = {};
    judge(call, trace);
    const key = trace.reason ?? '알 수 없음';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(call);
  }
  for (const [reason, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${reason}: ${list.length}건`);
    // '맞는 계약 없음' 은 커버리지 갭 지표라 전부 보여준다(자르면 갭이 안 보인다).
    const limit = reason === '맞는 계약 없음' ? list.length : 6;
    if (reason !== '판정') {
      for (const c of list.slice(0, limit)) console.log(`    ${c.method} ${c.url}`);
      if (list.length > limit) console.log(`    ... ${list.length - limit}건 더`);
    }
  }
  process.exit(0);
}

const errors = [];
const tally = { 판정: 0 };
for (const call of calls) {
  const trace = {};
  const verdict = judge(call, trace);
  tally[trace.reason ?? '알 수 없음'] = (tally[trace.reason ?? '알 수 없음'] ?? 0) + 1;
  if (!verdict || verdict.missing.length === 0) continue;
  errors.push(
    `${call.file}\n      호출 ${call.method} ${call.url}\n` +
      `      계약 ${verdict.ep.path} (${verdict.ep.file})\n` +
      `      필수 [${verdict.ep.required.join(', ')}] 중 누락 [${verdict.missing.join(', ')}]`,
  );
}

if (process.argv.includes('--selftest')) {
  const problems = [];

  // 1) 파서 커버리지. 정규식으로 계약을 읽으므로, 파서가 조용히 덜 읽으면 "위반 0" 이 곧
  //    "검사기가 죽었음" 을 뜻한다. 줄 단위 독립 카운트와 대조해 그 상태를 실패로 만든다.
  let lineHandlers = 0;
  let linePipeQueries = 0;
  for (const file of walk(join(ROOT, 'apps/api/nestjs')).filter((f) => f.endsWith('.controller.ts'))) {
    for (const line of stripComments(readFileSync(file, 'utf8')).split('\n')) {
      if (/^\s*@(Get|Post|Patch|Put|Delete)\(/.test(line)) lineHandlers++;
      if (/@Query\(\s*'[^']+'\s*,\s*[A-Za-z]+Pipe\s*\)/.test(line)) linePipeQueries++;
    }
  }
  const parsedRequired = endpoints.reduce((n, e) => n + e.required.length, 0);
  console.log(`자기검증 파서 커버리지`);
  console.log(`  핸들러      파싱 ${endpoints.length} / 독립 ${lineHandlers}`);
  console.log(`  필수 쿼리   파싱 ${parsedRequired} / 독립 ${linePipeQueries}`);
  if (endpoints.length !== lineHandlers) {
    problems.push(`핸들러 수 불일치 (파싱 ${endpoints.length}, 독립 ${lineHandlers})`);
  }
  if (parsedRequired !== linePipeQueries) {
    problems.push(`필수 쿼리 수 불일치 (파싱 ${parsedRequired}, 독립 ${linePipeQueries})`);
  }

  // 2) 회귀 사례. 각각 "이런 걸 놓쳐서 게이트를 만들었다" 는 기록이다.
  const cases = [
    {
      why: '채널을 개인 소유로 내리며 필수가 된 ownerUserId 를 로그 로더가 안 보냈다',
      method: 'GET',
      url: '/channels?organizationId=12',
      expect: ['ownerUserId'],
    },
    {
      why: '한 경로에 리터럴(archive)과 파라미터(:id) 라우트가 함께 있어 누락이 가려질 수 있다',
      method: 'GET',
      url: '/v/${version}/video-finals/${id}?organizationId=12',
      expect: ['ownerUserId'],
    },
  ];
  for (const c of cases) {
    const verdict = judge(c);
    const missing = verdict?.missing ?? [];
    const ok = c.expect.every((e) => missing.includes(e));
    console.log(`자기검증 회귀 사례 ${c.method} ${c.url}`);
    console.log(`  이유: ${c.why}`);
    console.log(`  계약: ${verdict ? verdict.ep.path + ' 필수=[' + verdict.ep.required.join(', ') + ']' : '매칭 실패'}`);
    console.log(`  결과: ${missing.length ? '누락 [' + missing.join(', ') + '] 탐지' : '탐지 실패'}`);
    if (!ok) problems.push(`회귀 사례 미탐지: ${c.method} ${c.url} (기대 [${c.expect.join(', ')}])`);
  }

  if (problems.length) {
    console.error('\n자기검증 실패: 검사기를 신뢰할 수 없는 상태다.\n');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log('');
}

const withRequired = endpoints.filter((e) => e.required.length > 0).length;

if (errors.length) {
  console.error('백엔드 필수 쿼리 파라미터 검사 실패\n');
  for (const e of errors) console.error(`  - ${e}\n`);
  console.error('  호출부에 파라미터를 추가하거나, 계약이 바뀐 것이라면 양쪽을 함께 고칩니다.');
  process.exit(1);
}

// 판정 건수와 판정하지 못한 이유를 함께 적는다. "위반 0" 만 적으면 깨끗한 것과 아무것도
//   판정하지 못한 것이 구분되지 않고, 매칭을 조일 때 조용히 후자가 된다. 검사 범위는 드러나야 한다.
//   (`--report` 로 호출별 사유를 본다. FastAPI 백엔드는 컨트롤러 파서가 없어 여기 포함되지 않는다.)
const breakdown = Object.entries(tally)
  .filter(([k]) => k !== '판정')
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${v}`)
  .join(', ');
console.log(
  `백엔드 필수 쿼리 파라미터 검사 통과: 계약 ${endpoints.length}개(필수 ${withRequired}개) × ` +
    `호출 ${calls.length}개 중 ${tally['판정']}개 판정, 위반 0` +
    (breakdown ? `\n  미판정: ${breakdown}` : ''),
);